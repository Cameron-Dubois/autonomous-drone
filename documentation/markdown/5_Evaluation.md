### Evaluation

This section separates **what the finished product is designed to do** from **what the current bench prototype has demonstrated**. The design targets a custom PCB, dual wireless links, and autonomous follow-me; prototype work validates communication, sensing, and partial motor control ahead of full flight integration.

**Design validation (product intent)**

The architecture is judged viable because:

- A mobile app can maintain a **secure local link** to the drone (Wi‑Fi telemetry plus BLE commands) without cloud or internet dependency.
- A **shared command and telemetry protocol** (binary commands, JSON/`TEL` telemetry) is implemented end-to-end between app and firmware.
- **Phone and drone GNSS** can be shown together and fed into follow-to-phone navigation logic on the handset.
- **Manufacturing tests** (Appendix 3) define pass/fail criteria for assembly, power-on, comms, motor mapping, and tethered flight before shipment.

**Prototype demonstrations (current quarter)**

The bench prototype has shown:

| Capability | Status |
|------------|--------|
| BLE discovery, connect, reconnect | Demonstrated |
| Wi‑Fi join, TLS telemetry (`/gps`, WSS) | Demonstrated |
| Hybrid app: WSS link state + BLE-first commands | Demonstrated |
| Drone GNSS + compass in telemetry | Demonstrated (outdoor fix dependent) |
| Phone-side follow navigation + intent → `NAV_*` commands | Demonstrated (app → firmware path) |
| Closed-loop autonomous follow flight | **Not yet** — flight controller does not fully execute `NAV_*` on prototype firmware |
| Per-motor manual throttle over BLE in unified demo build | Limited — high-level bench demo uses scripted takeoff opcode |
| Live camera stream | **Not yet** — video endpoint is a placeholder stream |
| Custom PCB in loop | In progress — some demos use interim dev hardware |

These results support the design without claiming every product feature is flight-ready.

**Functional prototype (physical)**

The physical prototype consists of a **3D-printed quadcopter frame**, four brushless motors with propellers, a LiPo power system, and a **flight-controller assembly** (custom PCB where available, otherwise interim modules wired to the same logical interfaces). Motors are driven through ESC hardware appropriate to the PCB revision (product design: independent channels per arm).

**App screenshots**

Screens reflect the four-tab app: connection management, telemetry and follow UI on Home, manual Control, and Video (stream when firmware provides it).

### Connect Screen

![Connect screen](../images/app_connect.png)

### Home Screen

![Home screen](../images/app_home.png)

### Manual Control

![Control screen](../images/app_control.png)

### Live Video Feed

![Video screen](../images/app_video.png)

## Prototype Photos

![Drone 1](../images/drone1.png)
![Drone 2](../images/drone2.png)
![Drone 3](../images/drone3.png)

**Testing**

The manufacturing test plan in Appendix 3 defines how a fully assembled production drone will be evaluated before it leaves manufacturing. Six tests (MECH-01 through FLT-01) cover visual mechanical inspection, safe power-on and idle current behavior, PCB and sensor self-tests, verification of the control link and command protocol, tethered motor mapping and spin-up checks, and a sample hover/failsafe flight test. Together, these tests are designed to catch structural, electrical, and control issues early and to show that each unit can power on safely, communicate correctly, spin the correct motors in the correct directions, and maintain stable hover under the documented failsafe policy.
