"""
bridge.py — 6-DOF Quadcopter physics simulator + ESP32 HIL bridge

Full rigid-body simulation with quadratic thrust, battery voltage sag,
wind/gust disturbances, gyroscopic precession, and ground contact.
Sends simulated accel/gyro to the ESP32 over serial, receives motor
commands back, steps the physics, and displays a real-time matplotlib plot.

Usage:
    pip install pyserial matplotlib numpy
    python bridge.py --port COM5
    python bridge.py --port COM5 --profile full --wind 1.5

Controls (click the plot window first so it has focus):
    Space  — pause / resume
    R      — reset to start
    P      — kick +10 deg pitch
    O      — kick -10 deg pitch
    L      — kick +10 deg roll
    K      — kick -10 deg roll
    Y      — kick +30 deg/s yaw
    W      — toggle wind on/off
    G      — one-shot gust impulse
    D      — drop (kill motors for 0.5 s)
    1 / 2 / 3 — switch profile: 60 g micro / 110 g / 600 g brushless (3S)

The ESP32 must be flashed with the flight_sim firmware.
"""

import argparse
import struct
import time
import sys
import threading

import numpy as np
import serial
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.widgets import Button

# ---------------------------------------------------------------------------
# Protocol constants (must match hil_link.h)
# ---------------------------------------------------------------------------
SYNC_BYTE          = 0xAA
TYPE_SENSOR        = 0x01
TYPE_MOTOR         = 0x02
SENSOR_PAYLOAD_LEN = 24
MOTOR_PAYLOAD_LEN  = 16
MOTOR_PKT_LEN      = 2 + MOTOR_PAYLOAD_LEN + 1

# ---------------------------------------------------------------------------
# Physics constants
# ---------------------------------------------------------------------------
G       = 9.81
RHO_AIR = 1.225
DT      = 0.01

ACCEL_NOISE_G  = 0.08   # default IMU vibration (micro brushed); profiles may override
GYRO_NOISE_DPS = 2.0

MOTOR_TAU = 0.015       # default motor+ESC time constant (s); brushless often faster

# Legacy globals — superseded by per-profile v_nominal / r_pack_ohm / i_max_per_motor in PROFILES
V_NOMINAL       = 3.7
R_INTERNAL      = 0.1
I_MAX_PER_MOTOR = 1.0

# Gyroscopic precession (RPM scale comes from profile prop_max_rpm in QuadSim.step)
J_PROP = 1.0e-7

# Wind / aero
GUST_REVERSION = 0.5
GUST_INTENSITY = 0.3
CP_OFFSET_Z    = 0.005

# Ground
GROUND_FRICTION   = 10.0
CRASH_SPEED       = 2.0    # m/s impact velocity that destroys the drone
CRASH_ANGLE_DEG   = 60.0   # tilt at ground contact that counts as a crash

# ---------------------------------------------------------------------------
# Mass / geometry profiles
# ---------------------------------------------------------------------------
PROFILES = {
    "minimal": {
        "mass":            0.060,
        "arm_length":      0.065,
        "max_thrust":      0.275,
        "Ixx_k":           0.30,
        "Iyy_k":           0.30,
        "Izz_k":           0.60,
        "rot_drag":        0.002,
        "yaw_torque_k":    0.01,
        "frontal_area":    0.008,
        "Cd":              1.0,
        "label":           "60 g  (C3 + DRV8833 + 4x8520 + 1S LiPo + frame)",
        "v_nominal":       3.7,
        "v_min_clip":      2.5,
        "r_pack_ohm":      0.10,
        "i_max_per_motor": 1.0,
        "motor_tau":       0.015,
        "accel_noise_g":   0.08,
        "gyro_noise_dps":  2.0,
        "prop_max_rpm":    30000.0,
    },
    "full": {
        "mass":            0.110,
        "arm_length":      0.065,
        "max_thrust":      0.275,
        "Ixx_k":           0.40,
        "Iyy_k":           0.40,
        "Izz_k":           0.80,
        "rot_drag":        0.003,
        "yaw_torque_k":    0.01,
        "frontal_area":    0.012,
        "Cd":              1.1,
        "label":           "110 g (full build + S3 + GPS + baro + 2S parallel + shell)",
        "v_nominal":       3.7,
        "v_min_clip":      2.5,
        "r_pack_ohm":      0.05,
        "i_max_per_motor": 1.0,
        "motor_tau":       0.015,
        "accel_noise_g":   0.08,
        "gyro_noise_dps":  2.0,
        "prop_max_rpm":    30000.0,
    },
    # 5\" class brushless: ~600 g AUW, 3S 1300 mAh, 200 mm left–right / 150 mm front–back motor spacing
    # Props: Ethix S5 GR PC (HQProp 5×4×3 tri-blade, polycarbonate — matches 5\" area/drag assumptions)
    # max_thrust per motor is still a tuning knob (motor KV + ESC endpoints); ~4.5 N → ~3:1 thrust:weight
    "brushless_600g": {
        "mass":            0.600,
        "arm_roll_m":      0.100,
        "arm_pitch_m":     0.075,
        "arm_length":      0.125,
        "max_thrust":      4.5,
        "Ixx_k":           0.38,
        "Iyy_k":           0.38,
        "Izz_k":           0.52,
        "rot_drag":        0.014,
        "yaw_torque_k":    0.018,
        "frontal_area":    0.048,
        "Cd":              1.15,
        "label":           "600 g brushless — Ethix S5 GR PC (5×4×3), 3S 1300mAh, 200×150 mm",
        "v_nominal":       11.1,
        "v_min_clip":      9.0,
        "r_pack_ohm":      0.075,
        "i_max_per_motor": 12.0,
        "motor_tau":       0.008,
        "accel_noise_g":   0.05,
        "gyro_noise_dps":  1.5,
        "prop_max_rpm":    24000.0,
    },
}

PROFILE_BTN_LABELS = {
    "minimal": "60g",
    "full": "110g",
    "brushless_600g": "600g",
}


def compute_hover_duty(prof, thrust_expo):
    """PWM duty (0–1023) for approximate hover including battery sag (matches QuadSim.step)."""
    weight = prof["mass"] * G
    max_t = prof["max_thrust"]
    v_nom = float(prof.get("v_nominal", V_NOMINAL))
    r_pack = float(prof.get("r_pack_ohm", R_INTERNAL))
    i_max = float(prof.get("i_max_per_motor", I_MAX_PER_MOTOR))
    v_min = float(prof.get("v_min_clip", 2.5))
    hover_duty = 1
    for _ in range(1023):
        norm = hover_duty / 1023.0
        t_no_sag = 4.0 * max_t * (norm ** thrust_expo)
        load_frac = t_no_sag / max(4.0 * max_t, 1e-9)
        total_I = load_frac * 4.0 * i_max
        v_batt = max(v_nom - total_I * r_pack, v_min)
        v_scale = (v_batt / v_nom) ** 2
        effective = t_no_sag * v_scale
        if effective < weight:
            hover_duty += 1
        else:
            break
    return min(hover_duty, 1023)


# ---------------------------------------------------------------------------
# Packet helpers
# ---------------------------------------------------------------------------
def calc_checksum(pkt_type, payload):
    cs = pkt_type
    for b in payload:
        cs ^= b
    return cs & 0xFF

def build_sensor_packet(ax, ay, az, gx, gy, gz):
    payload = struct.pack("<6f", ax, ay, az, gx, gy, gz)
    cs = calc_checksum(TYPE_SENSOR, payload)
    return bytes([SYNC_BYTE, TYPE_SENSOR]) + payload + bytes([cs])

def parse_motor_packet(data):
    if len(data) < MOTOR_PKT_LEN:
        return None
    if data[0] != SYNC_BYTE or data[1] != TYPE_MOTOR:
        return None
    payload = data[2:2 + MOTOR_PAYLOAD_LEN]
    cs = data[2 + MOTOR_PAYLOAD_LEN]
    if cs != calc_checksum(TYPE_MOTOR, payload):
        return None
    duty = struct.unpack_from("<4H", payload, 0)
    pitch, roll = struct.unpack_from("<2f", payload, 8)
    return duty, pitch, roll

# ---------------------------------------------------------------------------
# Rotation matrix
# ---------------------------------------------------------------------------
def euler_to_R(phi, theta, psi):
    """ZYX Euler body-to-world rotation matrix."""
    cp, sp = np.cos(phi), np.sin(phi)
    ct, st = np.cos(theta), np.sin(theta)
    cy, sy = np.cos(psi), np.sin(psi)
    return np.array([
        [cy*ct,  cy*st*sp - sy*cp,  cy*st*cp + sy*sp],
        [sy*ct,  sy*st*sp + cy*cp,  sy*st*cp - cy*sp],
        [  -st,            ct*sp,             ct*cp  ],
    ])

# ---------------------------------------------------------------------------
# 6-DOF Quadcopter physics
# ---------------------------------------------------------------------------
class QuadSim:

    def __init__(self, profile_name="brushless_600g", thrust_expo=2.0):
        self.thrust_expo = thrust_expo
        self._load_profile(profile_name)
        self.reset()

    def _load_profile(self, name):
        p = PROFILES[name]
        self.profile_name = name
        self.mass       = p["mass"]
        self.arm_roll   = float(p.get("arm_roll_m", p.get("arm_length", 0.065)))
        self.arm_pitch  = float(p.get("arm_pitch_m", p.get("arm_length", 0.065)))
        self.max_thrust = p["max_thrust"]
        iyy_k = float(p.get("Iyy_k", p["Ixx_k"]))
        # Roll about body X — lever along lateral span; pitch about body Y — along longitudinal span
        self.Ixx = self.mass * (self.arm_roll ** 2) * p["Ixx_k"]
        self.Iyy = self.mass * (self.arm_pitch ** 2) * iyy_k
        arm_yaw = np.sqrt((self.arm_roll ** 2 + self.arm_pitch ** 2) / 2.0)
        self.Izz = self.mass * (arm_yaw ** 2) * p["Izz_k"]
        self.rot_drag  = p["rot_drag"]
        self.yaw_k     = p["yaw_torque_k"]
        self.area      = p["frontal_area"]
        self.Cd        = p["Cd"]
        self.v_nominal = float(p.get("v_nominal", V_NOMINAL))
        self.v_min_clip = float(p.get("v_min_clip", 2.5))
        self.r_pack_ohm = float(p.get("r_pack_ohm", R_INTERNAL))
        self.i_max_per_motor = float(p.get("i_max_per_motor", I_MAX_PER_MOTOR))
        self.motor_tau = float(p.get("motor_tau", MOTOR_TAU))
        self.accel_noise = float(p.get("accel_noise_g", ACCEL_NOISE_G))
        self.gyro_noise = float(p.get("gyro_noise_dps", GYRO_NOISE_DPS))
        self.prop_max_rpm = float(p.get("prop_max_rpm", 30000.0))

    def set_profile(self, name):
        self._load_profile(name)
        self.battery_v = self.v_nominal

    def reset(self):
        self.phi   = 0.0
        self.theta = 0.0
        self.psi   = 0.0
        self.p     = 0.0
        self.q     = 0.0
        self.r     = 0.0
        self.pos   = np.zeros(3)
        self.vel   = np.zeros(3)
        self.thrust_actual = np.zeros(4)
        self.battery_v     = self.v_nominal
        self.wind_on       = False
        self.wind_base     = np.zeros(3)
        self.wind_gust     = np.zeros(3)
        self.accel_world   = np.zeros(3)
        self.crashed       = False
        self.was_airborne  = False

    def set_initial_tilt(self, pitch_deg, roll_deg):
        self.theta = np.radians(pitch_deg)
        self.phi   = np.radians(roll_deg)

    def set_initial_alt(self, alt_m):
        self.pos[2] = alt_m

    def kick_pitch(self, deg):
        self.theta = np.clip(self.theta + np.radians(deg), -np.pi/2, np.pi/2)

    def kick_roll(self, deg):
        self.phi = np.clip(self.phi + np.radians(deg), -np.pi/2, np.pi/2)

    def kick_yaw_rate(self, dps):
        self.r += np.radians(dps)

    def kick_gust(self, strength=2.0):
        angle = np.random.uniform(0, 2 * np.pi)
        self.vel[0] += strength * 0.3 * np.cos(angle)
        self.vel[1] += strength * 0.3 * np.sin(angle)
        self.p += np.random.normal(0, 0.5)
        self.q += np.random.normal(0, 0.5)

    def toggle_wind(self, base_speed=1.5):
        self.wind_on = not self.wind_on
        if self.wind_on:
            self.wind_base = np.array([base_speed, base_speed * 0.3, 0.0])
        else:
            self.wind_base = np.zeros(3)
            self.wind_gust = np.zeros(3)

    # ------------------------------------------------------------------
    def step(self, duty, dt):
        if self.crashed:
            return

        # ---- battery voltage sag (previous-step current estimate) ----
        load_frac = np.sum(self.thrust_actual) / max(4.0 * self.max_thrust, 1e-9)
        total_I   = load_frac * 4.0 * self.i_max_per_motor
        self.battery_v = np.clip(
            self.v_nominal - total_I * self.r_pack_ohm,
            self.v_min_clip,
            self.v_nominal,
        )
        v_scale = (self.battery_v / self.v_nominal) ** 2

        # ---- thrust with motor lag ----
        norm   = np.array(duty, dtype=float) / 1023.0
        target = self.max_thrust * np.power(norm, self.thrust_expo) * v_scale
        alpha  = dt / (self.motor_tau + dt)
        self.thrust_actual += alpha * (target - self.thrust_actual)
        self.thrust_actual  = np.clip(self.thrust_actual, 0.0, None)
        t = self.thrust_actual

        # ---- rotation matrix (pre-update, used for everything this step) ----
        R = euler_to_R(self.phi, self.theta, self.psi)

        # ---- torques ----
        tau_roll  = self.arm_roll * (t[0] + t[2] - t[1] - t[3])
        tau_pitch = self.arm_pitch * (t[0] + t[1] - t[2] - t[3])
        tau_yaw   = self.yaw_k * (t[1] + t[2] - t[0] - t[3])

        # gyroscopic precession: props 0,3 CW (-H), props 1,2 CCW (+H)
        max_prop_rad_s = self.prop_max_rpm * 2.0 * np.pi / 60.0
        max_t_eff = max(self.max_thrust * v_scale, 1e-9)
        rpm_norm  = np.sqrt(np.clip(self.thrust_actual / max_t_eff, 0.0, 1.0))
        H_net = J_PROP * max_prop_rad_s * (
            -rpm_norm[0] + rpm_norm[1] + rpm_norm[2] - rpm_norm[3]
        )
        tau_roll  +=  self.q * H_net
        tau_pitch += -self.p * H_net

        # ---- wind / aero ----
        wind_world = np.zeros(3)
        if self.wind_on:
            self.wind_gust += (
                -GUST_REVERSION * self.wind_gust * dt
                + GUST_INTENSITY * np.sqrt(dt) * np.random.randn(3)
            )
            wind_world = self.wind_base + self.wind_gust

        v_rel     = self.vel - wind_world
        v_rel_mag = np.linalg.norm(v_rel)
        F_aero    = np.zeros(3)
        if v_rel_mag > 1e-6:
            F_aero = -0.5 * RHO_AIR * self.Cd * self.area * v_rel_mag * v_rel

            F_aero_body = R.T @ F_aero
            tau_roll  += CP_OFFSET_Z * F_aero_body[1]
            tau_pitch -= CP_OFFSET_Z * F_aero_body[0]

        # ---- rotational dynamics ----
        self.p += ((tau_roll  - self.rot_drag * self.p) / self.Ixx) * dt
        self.q += ((tau_pitch - self.rot_drag * self.q) / self.Iyy) * dt
        self.r += ((tau_yaw   - self.rot_drag * self.r) / self.Izz) * dt

        self.phi   = np.clip(self.phi   + self.p * dt, -np.pi/2, np.pi/2)
        self.theta = np.clip(self.theta + self.q * dt, -np.pi/2, np.pi/2)
        self.psi  += self.r * dt

        # ---- translational dynamics ----
        T_body   = np.array([0.0, 0.0, np.sum(t)])
        F_thrust = R @ T_body
        F_grav   = np.array([0.0, 0.0, -self.mass * G])

        self.accel_world = (F_thrust + F_grav + F_aero) / self.mass
        self.vel += self.accel_world * dt
        self.pos += self.vel * dt

        # track whether the drone has been meaningfully airborne
        if self.pos[2] > 0.1:
            self.was_airborne = True

        # ---- crash detection (mid-air) ----
        tilt_deg = np.degrees(max(abs(self.phi), abs(self.theta)))
        if not self.crashed and tilt_deg > CRASH_ANGLE_DEG and self.vel[2] < -0.5:
            time_to_ground = self.pos[2] / max(-self.vel[2], 0.01)
            time_to_recover = np.radians(tilt_deg) / 5.0
            if time_to_ground < time_to_recover * 2.0:
                self.crashed = True

        # ---- ground contact ----
        if self.pos[2] <= 0.0:
            impact_speed = -self.vel[2] if self.vel[2] < 0.0 else 0.0

            if not self.crashed and (
                impact_speed > CRASH_SPEED
                or tilt_deg > CRASH_ANGLE_DEG
                or (self.was_airborne and impact_speed > 0.3)
            ):
                self.crashed = True

            self.pos[2] = 0.0
            if self.vel[2] < 0.0:
                self.vel[2] = 0.0
            if self.accel_world[2] < 0.0:
                self.accel_world[2] = 0.0

            if self.crashed:
                self.vel[:] = 0.0
                self.p = self.q = self.r = 0.0
                self.thrust_actual[:] = 0.0
            else:
                decay = np.exp(-GROUND_FRICTION * dt)
                self.vel[0] *= decay
                self.vel[1] *= decay

        if self.crashed:
            self.pos[2] = 0.0
            self.vel[:] = 0.0
            self.p = self.q = self.r = 0.0
            self.thrust_actual[:] = 0.0

    # ------------------------------------------------------------------
    def get_sensor_data(self):
        """Simulated IMU in the ICM-42670-P axis convention."""
        R = euler_to_R(self.phi, self.theta, self.psi)

        # accelerometer measures specific force in body frame
        sf_world = self.accel_world + np.array([0.0, 0.0, G])
        sf_body  = R.T @ sf_world
        sf_g     = sf_body / G

        # ICM-42670-P on ESP32-C3-DevKit-RUST-1: ax=body_Y, ay=body_X, az=body_Z
        ax = sf_g[1] + np.random.normal(0, self.accel_noise)
        ay = sf_g[0] + np.random.normal(0, self.accel_noise)
        az = sf_g[2] + np.random.normal(0, self.accel_noise)

        gx = np.degrees(self.p) + np.random.normal(0, self.gyro_noise)
        gy = np.degrees(self.q) + np.random.normal(0, self.gyro_noise)
        gz = np.degrees(self.r) + np.random.normal(0, self.gyro_noise)
        return ax, ay, az, gx, gy, gz

# ---------------------------------------------------------------------------
# Simulation + serial loop (background thread)
# ---------------------------------------------------------------------------
class SimRunner:

    def __init__(self, ser, sim, hover_duty=700):
        self.ser  = ser
        self.sim  = sim
        self.duty = [0, 0, 0, 0]
        self.rx_count   = 0
        self.step_count = 0
        self.lock    = threading.Lock()
        self.running = True
        self.paused  = False
        self.serial_buf = bytearray()
        self.drop_until = 0.0
        self.motors_active = False
        self.reset_until   = 0.0
        self.hover_duty    = hover_duty

        self.max_history = 500
        self._init_history()

    def _init_history(self):
        self.history_t     = []
        self.history_pitch = []
        self.history_roll  = []
        self.history_m1    = []
        self.history_m2    = []
        self.history_m3    = []
        self.history_m4    = []
        self.history_alt   = []
        self.history_drift = []
        self.history_vbatt = []

    _HIST_KEYS = [
        "history_t", "history_pitch", "history_roll",
        "history_m1", "history_m2", "history_m3", "history_m4",
        "history_alt", "history_drift", "history_vbatt",
    ]

    def clear_history(self):
        with self.lock:
            for k in self._HIST_KEYS:
                getattr(self, k).clear()
            self.step_count = 0

    def start_drop(self, duration=0.5):
        self.drop_until = time.time() + duration

    def run(self):
        try:
            self._loop()
        except Exception as e:
            print(f"\n*** SIM THREAD CRASHED: {e} ***", flush=True)
            import traceback
            traceback.print_exc()

    def _loop(self):
        t_last = time.time()

        while self.running:
            now = time.time()
            elapsed = now - t_last
            if elapsed < DT:
                time.sleep(DT - elapsed)
            t_last = time.time()

            if self.paused:
                time.sleep(0.05)
                continue

            # during reset: stay silent so ESP32 detects the gap and resets
            if time.time() < self.reset_until:
                time.sleep(0.05)
                continue

            ax, ay, az, gx, gy, gz = self.sim.get_sensor_data()
            pkt = build_sensor_packet(ax, ay, az, gx, gy, gz)
            try:
                self.ser.write(pkt)
            except Exception:
                continue

            self._read_response()

            # hold physics until throttle ramp reaches near-hover duty
            if not self.motors_active:
                with self.lock:
                    avg_duty = sum(self.duty) / 4.0
                    if avg_duty >= self.hover_duty * 0.98:
                        self.motors_active = True
                    else:
                        continue

            with self.lock:
                duty_copy = list(self.duty)

            if time.time() < self.drop_until:
                duty_copy = [0, 0, 0, 0]

            self.sim.step(duty_copy, DT)

            pitch_deg = np.degrees(self.sim.theta)
            roll_deg  = np.degrees(self.sim.phi)
            alt       = self.sim.pos[2]
            drift     = np.sqrt(self.sim.pos[0]**2 + self.sim.pos[1]**2)
            vbatt     = self.sim.battery_v

            with self.lock:
                t_now = self.step_count * DT
                self.history_t.append(t_now)
                self.history_pitch.append(pitch_deg)
                self.history_roll.append(roll_deg)
                self.history_m1.append(duty_copy[0])
                self.history_m2.append(duty_copy[1])
                self.history_m3.append(duty_copy[2])
                self.history_m4.append(duty_copy[3])
                self.history_alt.append(alt)
                self.history_drift.append(drift)
                self.history_vbatt.append(vbatt)

                if len(self.history_t) > self.max_history:
                    for k in self._HIST_KEYS:
                        setattr(self, k, getattr(self, k)[-self.max_history:])

            self.step_count += 1
            if self.step_count % 50 == 0:
                if self.sim.crashed:
                    print(
                        f"\r  [CRASHED] t={t_now:5.1f}s  "
                        f"P:{pitch_deg:+6.1f} R:{roll_deg:+6.1f}  "
                        f"— press R to reset                        ",
                        end="",
                    )
                else:
                    status = "CONNECTED" if self.rx_count > 0 else "WAITING FOR ESP32"
                    wind_s = "ON" if self.sim.wind_on else "OFF"
                    print(
                        f"\r  [{status}] t={t_now:5.1f}s  "
                        f"P:{pitch_deg:+6.1f} R:{roll_deg:+6.1f}  "
                        f"alt={alt:.2f}m  Vb={vbatt:.2f}V  wind={wind_s}  "
                        f"motors=[{duty_copy[0]:4d} {duty_copy[1]:4d} "
                        f"{duty_copy[2]:4d} {duty_copy[3]:4d}]  "
                        f"rx={self.rx_count}  ",
                        end="",
                    )
                sys.stdout.flush()

    def _read_response(self):
        try:
            avail = self.ser.in_waiting
            if avail:
                self.serial_buf.extend(self.ser.read(avail))
        except Exception:
            return

        while len(self.serial_buf) >= MOTOR_PKT_LEN:
            try:
                idx = self.serial_buf.index(SYNC_BYTE)
            except ValueError:
                self.serial_buf.clear()
                return
            if idx > 0:
                del self.serial_buf[:idx]
            if len(self.serial_buf) < MOTOR_PKT_LEN:
                return

            result = parse_motor_packet(bytes(self.serial_buf[:MOTOR_PKT_LEN]))
            del self.serial_buf[:MOTOR_PKT_LEN]
            if result is not None:
                with self.lock:
                    self.duty = list(result[0])
                    self.rx_count += 1
                return

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="6-DOF Quadcopter HIL Simulator",
    )
    parser.add_argument("--port", required=True,
                        help="ESP32 serial port (e.g. COM5)")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--profile", choices=PROFILES.keys(), default="brushless_600g",
                        help="Mass/geometry profile (default: 600 g brushless / 3S)")
    parser.add_argument("--pitch0", type=float, default=5.0,
                        help="Initial pitch disturbance (deg)")
    parser.add_argument("--roll0", type=float, default=3.0,
                        help="Initial roll disturbance (deg)")
    parser.add_argument("--alt0", type=float, default=0.5,
                        help="Starting altitude (m)")
    parser.add_argument("--wind", type=float, default=0.0,
                        help="Enable wind at startup with base speed (m/s)")
    parser.add_argument("--thrust-expo", type=float, default=2.0,
                        help="Thrust exponent: 1.0=linear  2.0=quadratic (default)")
    args = parser.parse_args()

    prof = PROFILES[args.profile]
    thrust_ratio = 4.0 * prof["max_thrust"] / (prof["mass"] * G)
    hover_duty = compute_hover_duty(prof, args.thrust_expo)

    print(f"Profile: {args.profile} — {prof['label']}")
    print(f"  mass          = {prof['mass']*1000:.0f} g")
    vn = prof.get("v_nominal", V_NOMINAL)
    print(f"  pack voltage  = {vn:.1f} V nominal (sim sag model)")
    print(f"  thrust/weight = {thrust_ratio:.2f}")
    print(f"  hover duty    ~ {hover_duty}  (tune firmware HOVER_THROTTLE to match your ESC)")
    if hover_duty > 900:
        print("  WARNING: hover duty very high — marginal lift at this weight / thrust model")

    print(f"\nConnecting to ESP32 on {args.port} @ {args.baud} ...")
    ser = serial.Serial(args.port, args.baud, timeout=0.002, write_timeout=0.1)
    time.sleep(1.0)
    ser.reset_input_buffer()
    print("Serial connected.\n")

    sim = QuadSim(args.profile, thrust_expo=args.thrust_expo)
    sim.set_initial_tilt(args.pitch0, args.roll0)
    sim.set_initial_alt(args.alt0)
    if args.wind > 0:
        sim.wind_on   = True
        sim.wind_base = np.array([args.wind, args.wind * 0.3, 0.0])

    runner = SimRunner(ser, sim, hover_duty=hover_duty)
    thread = threading.Thread(target=runner.run, daemon=True)
    thread.start()

    print(f"Initial: pitch={args.pitch0} deg  roll={args.roll0} deg  alt={args.alt0} m")
    print("Keys: Space=pause  R=reset  P/O=pitch  K/L=roll  Y=yaw")
    print("      W=wind  G=gust  D=drop  1=60g  2=110g  3=600g brushless")
    print("Close the plot window to stop.\n")

    # ================================================================
    #  Plot
    # ================================================================
    fig = plt.figure(figsize=(12, 9))
    fig.suptitle("Quadcopter HIL — 6-DOF Simulation", fontsize=13, y=0.995)

    ax_ang = fig.add_axes([0.07, 0.68, 0.86, 0.23])
    ax_mot = fig.add_axes([0.07, 0.44, 0.86, 0.21])
    ax_pos = fig.add_axes([0.07, 0.21, 0.86, 0.20])

    # -- angles --
    ax_ang.set_ylabel("Angle (deg)")
    ax_ang.set_ylim(-45, 45)
    ax_ang.axhline(0, color="gray", lw=0.5)
    ln_pitch, = ax_ang.plot([], [], label="Pitch")
    ln_roll,  = ax_ang.plot([], [], label="Roll")
    leg_ang = ax_ang.legend(loc="upper right")

    # -- motors --
    ax_mot.set_ylabel("Motor duty")
    ax_mot.set_ylim(0, 1100)
    ln_m1, = ax_mot.plot([], [], label="M1 (FL)")
    ln_m2, = ax_mot.plot([], [], label="M2 (FR)")
    ln_m3, = ax_mot.plot([], [], label="M3 (BL)")
    ln_m4, = ax_mot.plot([], [], label="M4 (BR)")
    leg_mot = ax_mot.legend(loc="upper right")

    # -- altitude / drift --
    ax_pos.set_ylabel("Metres")
    ax_pos.set_xlabel("Time (s)")
    ax_pos.set_ylim(-0.1, 2.0)
    ln_alt,   = ax_pos.plot([], [], label="Altitude")
    ln_drift, = ax_pos.plot([], [], ls="--", label="Drift")
    leg_pos = ax_pos.legend(loc="upper right")

    # battery voltage on right axis (ylim follows active profile pack voltage)
    ax_batt = ax_pos.twinx()
    ax_batt.set_ylabel("Vbatt (V)")
    _vn = float(prof.get("v_nominal", V_NOMINAL))
    _vm = float(prof.get("v_min_clip", 2.5))
    ax_batt.set_ylim(_vm - 0.5, _vn + 0.6)
    ln_vb, = ax_batt.plot([], [], color="tab:red", alpha=0.6, label="Vbatt")
    ax_batt.legend(loc="upper left")

    # clickable legends
    legend_map = {}
    for leg, lines in [
        (leg_ang, [ln_pitch, ln_roll]),
        (leg_mot, [ln_m1, ln_m2, ln_m3, ln_m4]),
        (leg_pos, [ln_alt, ln_drift]),
    ]:
        for ll, pl in zip(leg.get_lines(), lines):
            ll.set_picker(5)
            legend_map[ll] = pl

    def _on_pick(event):
        pl = legend_map.get(event.artist)
        if pl is None:
            return
        vis = not pl.get_visible()
        pl.set_visible(vis)
        event.artist.set_alpha(1.0 if vis else 0.3)
        fig.canvas.draw_idle()

    fig.canvas.mpl_connect("pick_event", _on_pick)

    status_text = fig.text(
        0.50, 0.965, "", ha="center", fontsize=9, fontfamily="monospace",
    )
    crash_text = fig.text(
        0.50, 0.50, "", ha="center", va="center",
        fontsize=36, fontweight="bold", color="red", alpha=0.0,
    )

    # ================================================================
    #  Buttons
    # ================================================================
    bw, bh, bg = 0.09, 0.038, 0.012
    y1, y2 = 0.105, 0.045
    x0 = 0.04

    def _bx(row, col):
        return [x0 + col * (bw + bg), row, bw, bh]

    # row 1
    btn_pause = Button(fig.add_axes(_bx(y1, 0)), "Pause")
    btn_reset = Button(fig.add_axes(_bx(y1, 1)), "Reset")
    btn_pp    = Button(fig.add_axes(_bx(y1, 2)), "Pitch+10")
    btn_pm    = Button(fig.add_axes(_bx(y1, 3)), "Pitch-10")
    btn_rp    = Button(fig.add_axes(_bx(y1, 4)), "Roll+10")
    btn_rm    = Button(fig.add_axes(_bx(y1, 5)), "Roll-10")
    btn_yaw   = Button(fig.add_axes(_bx(y1, 6)), "Yaw+30")

    # row 2
    btn_wind = Button(fig.add_axes(_bx(y2, 0)), "Wind")
    btn_gust = Button(fig.add_axes(_bx(y2, 1)), "Gust")
    btn_drop = Button(fig.add_axes(_bx(y2, 2)), "Drop")
    btn_prof = Button(
        fig.add_axes(_bx(y2, 3)),
        PROFILE_BTN_LABELS.get(args.profile, args.profile),
    )

    # ================================================================
    #  Callbacks
    # ================================================================
    def on_pause(_e=None):
        runner.paused = not runner.paused
        btn_pause.label.set_text("Resume" if runner.paused else "Pause")
        print(f"\n  [{'PAUSED' if runner.paused else 'RESUMED'}]", flush=True)

    def on_reset(_e=None):
        runner.reset_until = time.time() + 0.35
        runner.motors_active = False
        runner.sim.reset()
        runner.sim.set_initial_tilt(args.pitch0, args.roll0)
        runner.sim.set_initial_alt(args.alt0)
        if args.wind > 0:
            runner.sim.wind_on   = True
            runner.sim.wind_base = np.array([args.wind, args.wind * 0.3, 0.0])
        with runner.lock:
            runner.duty = [0, 0, 0, 0]
        runner.clear_history()
        runner.ser.reset_input_buffer()
        print("\n  [RESET — ESP32 re-syncing...]", flush=True)

    def on_pp(_e=None):
        runner.sim.kick_pitch(10);  print("\n  [pitch +10]", flush=True)
    def on_pm(_e=None):
        runner.sim.kick_pitch(-10); print("\n  [pitch -10]", flush=True)
    def on_rp(_e=None):
        runner.sim.kick_roll(10);   print("\n  [roll +10]", flush=True)
    def on_rm(_e=None):
        runner.sim.kick_roll(-10);  print("\n  [roll -10]", flush=True)
    def on_yaw(_e=None):
        runner.sim.kick_yaw_rate(30); print("\n  [yaw +30]", flush=True)

    def on_wind(_e=None):
        runner.sim.toggle_wind(1.5)
        s = "ON" if runner.sim.wind_on else "OFF"
        btn_wind.label.set_text(f"Wind:{s}")
        print(f"\n  [WIND {s}]", flush=True)

    def on_gust(_e=None):
        runner.sim.kick_gust(2.0); print("\n  [GUST]", flush=True)

    def on_drop(_e=None):
        runner.start_drop(0.5); print("\n  [DROP 0.5 s]", flush=True)

    def _set_profile(name):
        runner.sim.set_profile(name)
        runner.hover_duty = compute_hover_duty(PROFILES[name], args.thrust_expo)
        btn_prof.label.set_text(PROFILE_BTN_LABELS.get(name, name))
        p = PROFILES[name]
        vn = float(p.get("v_nominal", V_NOMINAL))
        vm = float(p.get("v_min_clip", 2.5))
        ax_batt.set_ylim(vm - 0.5, vn + 0.6)
        fig.canvas.draw_idle()
        print(f"\n  [PROFILE -> {name}  hover_duty~{runner.hover_duty}]", flush=True)

    def on_prof(_e=None):
        order = ("minimal", "full", "brushless_600g")
        try:
            i = order.index(runner.sim.profile_name)
        except ValueError:
            i = 0
        _set_profile(order[(i + 1) % len(order)])

    btn_pause.on_clicked(on_pause)
    btn_reset.on_clicked(on_reset)
    btn_pp.on_clicked(on_pp)
    btn_pm.on_clicked(on_pm)
    btn_rp.on_clicked(on_rp)
    btn_rm.on_clicked(on_rm)
    btn_yaw.on_clicked(on_yaw)
    btn_wind.on_clicked(on_wind)
    btn_gust.on_clicked(on_gust)
    btn_drop.on_clicked(on_drop)
    btn_prof.on_clicked(on_prof)

    def _on_key(event):
        key = event.key
        if   key == ' ': on_pause()
        elif key == 'r': on_reset()
        elif key == 'p': on_pp()
        elif key == 'o': on_pm()
        elif key == 'l': on_rp()
        elif key == 'k': on_rm()
        elif key == 'y': on_yaw()
        elif key == 'w': on_wind()
        elif key == 'g': on_gust()
        elif key == 'd': on_drop()
        elif key == '1': _set_profile("minimal")
        elif key == '2': _set_profile("full")
        elif key == '3': _set_profile("brushless_600g")

    fig.canvas.mpl_connect("key_press_event", _on_key)

    # ================================================================
    #  Animation
    # ================================================================
    def animate(_frame):
        with runner.lock:
            t     = list(runner.history_t)
            pitch = list(runner.history_pitch)
            roll  = list(runner.history_roll)
            m1    = list(runner.history_m1)
            m2    = list(runner.history_m2)
            m3    = list(runner.history_m3)
            m4    = list(runner.history_m4)
            alt   = list(runner.history_alt)
            drift = list(runner.history_drift)
            vbatt = list(runner.history_vbatt)

        if len(t) < 2:
            return

        ln_pitch.set_data(t, pitch)
        ln_roll.set_data(t, roll)
        ln_m1.set_data(t, m1)
        ln_m2.set_data(t, m2)
        ln_m3.set_data(t, m3)
        ln_m4.set_data(t, m4)
        ln_alt.set_data(t, alt)
        ln_drift.set_data(t, drift)
        ln_vb.set_data(t, vbatt)

        xlim = (t[0], t[-1] + 0.1)
        for a in (ax_ang, ax_mot, ax_pos, ax_batt):
            a.set_xlim(*xlim)

        alt_ceil = max(max(alt), max(drift), 0.5) * 1.3
        ax_pos.set_ylim(-0.05, alt_ceil)

        if runner.sim.crashed:
            status_text.set_text("CRASHED — press R to reset")
            status_text.set_color("red")
            crash_text.set_text("CRASHED")
            crash_text.set_alpha(0.85)
        else:
            state   = "PAUSED" if runner.paused else "RUNNING"
            wind_s  = "ON" if runner.sim.wind_on else "OFF"
            prof_s  = runner.sim.profile_name
            status_text.set_text(
                f"{state} [{prof_s}]  "
                f"P:{pitch[-1]:+5.1f} R:{roll[-1]:+5.1f}  "
                f"alt={alt[-1]:.2f}m  drift={drift[-1]:.2f}m  "
                f"Vb={vbatt[-1]:.2f}V  "
                f"wind:{wind_s}  "
                f"M:[{m1[-1]:4.0f} {m2[-1]:4.0f} {m3[-1]:4.0f} {m4[-1]:4.0f}]"
            )
            status_text.set_color("black")
            crash_text.set_alpha(0.0)

    _ani = FuncAnimation(fig, animate, interval=100, cache_frame_data=False)
    plt.show()

    runner.running = False
    thread.join(timeout=2)
    ser.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
