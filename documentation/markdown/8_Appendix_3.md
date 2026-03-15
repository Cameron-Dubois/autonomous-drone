### Appendix 3 – Manufacturing Test Plan & Results

This section defines a generic manufacturing and verification test plan for future engineers who build or maintain production versions of the autonomous drone.

---

## 1. Scope & Administrative Details

### Scope

- **System under test:** Fully assembled production drones and subassemblies (flight controller PCB, power system, motors).
- **Goal of testing:** Verify that manufactured product meets the project's functional and safety objectives before being accepted for use (mechanical integrity, power behavior, electronics health, communications, motor mapping, and basic flight/failsafe behavior).
- **Parameters and justification:** Tests focus on parameters that directly impact safety and reliability.
- **Expectations (hypothesis):** Units built to the documented design and assembly process will pass all six manufacturing tests without rework.

### Administrative Details

- **Date and location of testing:** To be filled in per production run
- **Client or organization:** Future owner of the autonomous drone design
- **Conducting the test:** Manufacturing / Quality Assurance engineers or technicians following this plan.

---

## 2. Manufacturing Test Definitions

### TEST ID: MECH-01 — Visual Mechanical & Assembly Inspection

**Scope & goal**

- **System under test**: Fully assembled autonomous drone.
- **Goal**: Confirm each assembled drone matches mechanical drawings and is safe to power.

**Test design (variables, sampling, apparatus)**

- **Type**: Qualitative inspection (yes/no, acceptable/unacceptable).
- **Independent variable**: Individual production unit.
- **Dependent variables**: Pass/fail for each checklist item.
- **Sampling**: Every unit (100% inspection); performed before the unit is powered on for the first time.
- **Apparatus**: Mechanical drawings, good lighting.

**Procedure (outline)**

1. Place powered-off unit on inspection bench and compare it to the latest mechanical drawing.
2. Verify they are the same.
3. Confirm each propeller is installed in the correct position and orientation; rotate slowly by hand to check for interference.
4. Inspect wiring for pinched insulation, unsecured leads, and exposed conductors; verify connectors are fully seated.
5. Record pass/fail against the checklist; photograph any defects.

**Safety & external factors**

- No power applied; battery disconnected during inspection.
- Be cautious of sharp edges on printed parts.
- Note any unusual lighting or visibility conditions that could affect inspection quality.

**Data collection**

- Complete a digital or paper checklist per unit.
- Attach photographs of any defects or borderline conditions.

**Pass criteria**

- 0 cracked, warped, or obviously damaged structural parts.
- 0 mis-oriented or rubbing propellers.
- 0 exposed conductors or unsafe wiring.

---

### TEST ID: PWR-01 — Power-On & Idle Current Verification

**Scope & goal**

- **System under test**: Complete drone with production power electronics and firmware.
- **Goal**: Verify power rails, boot behavior, and idle current are within specification.

**Test design (variables, sampling, apparatus)**

- **Type**: Quantitative electrical test.
- **Independent variable**: Input supply (battery vs. bench supply).
- **Dependent variables**: Boot success, peak inrush current, steady-state idle current, supply voltage.
- **Sampling**: Every unit or defined batch sampling.
- **Apparatus**: Bench supply or production battery, inline current measurement, voltmeter, safe test stand/mat.

**Procedure (outline)**

1. Connect drone to bench supply (with current limit) or a known-good production battery.
2. Measure and record input voltage and current limit settings.
3. Power on the drone and observe peak inrush current and steady-state idle current once boot is complete.
4. Confirm status indicators or telemetry show that firmware booted successfully (no repeating resets).

**Safety & external factors**

- Use current limits on bench supply; keep flammable materials away.
- Ensure adequate ventilation; monitor for abnormal heating or smell.
- Record ambient temperature if it may affect current draw.

**Data collection**

- Log input voltage, current limit, peak inrush current, and steady-state idle current for each unit.
- Record pass/fail plus any anomalies in a shared spreadsheet or database.

**Pass criteria**

- Drone boots from power-on to ready state.
- Peak inrush current and idle current fall within defined allowable ranges.
- No abnormal heating, smell, or cycling resets during the observation period.

---

### TEST ID: PCB-01 — Electronics Self-Test & Sensor Sanity Check

**Scope & goal**

- **System under test**: Assembled flight controller PCB with production firmware.
- **Goal**: Confirm that the microcontroller and critical sensors (e.g., IMU, barometer, magnetometer) are present and functional.

**Test design (variables, sampling, apparatus)**

- **Type**: Mixed qualitative/quantitative functional test.
- **Independent variable**: Unit under test.
- **Dependent variables**: Self-test result code, sensor responsiveness, and basic value ranges.
- **Sampling**: 100 % of PCBs before integration into airframes.
- **Apparatus**: Test jig or debug interface, host PC/machine, self-test script or tool.

**Procedure (outline)**

1. Connect PCB or fully assembled drone to the test jig or debug port.
2. Trigger the firmware self-test routine and read back the summary status.
3. Query each required sensor at rest and record a short window of data for each.
4. Check that values are within plausible ranges.

**Safety & external factors**

- Follow Electrostatic Discharge precautions when handling bare PCBs.
- Ensure board is mechanically supported to avoid stressing solder joints.
- Write down the room temperature and local pressure if they change the sensor readings.

**Data collection**

- Store self-test status codes and raw sensor snapshots with unit serial numbers.
- Keep logs or CSV exports from the test jig software for later analysis.

**Pass criteria**

- Self-test completes with an "OK" or equivalent status code.
- All required sensors respond without communication errors.
- All measured values fall within predefined acceptable ranges for a unit at rest.

---

### TEST ID: COMMS-01 — Control Link & Protocol Verification

**Scope & goal**

- **System under test**: Communication link between ground station (app/controller) and drone, including command/ACK protocol.
- **Goal**: Verify that control commands are correctly received, acknowledged, and constrained by safety rules.

**Test design (variables, sampling, apparatus)**

- **Type**: Functional communications test.
- **Independent variables**: Command type (e.g., ARM, DISARM, ESTOP, basic movement or throttle commands).
- **Dependent variables**: ACK success/failure codes, internal state transitions, latency.
- **Sampling**: 100 % of units.
- **Apparatus**: Ground station or scripted test client, log capture, safe bench or fixture.

**Procedure (outline)**

1. Establish a control link between the ground station and the drone on a bench or fixture.
2. Send a scripted sequence of commands including ARM, small thrust changes, ESTOP, DISARM, and at least one "illegal" command (such as thrust while disarmed).
3. Capture command/ACK logs at both ends and record any internal state reported by telemetry.

**Safety & external factors**

- Perform on a secured bench or fixture; do not allow free-flight for this test.
- Either remove props or limit motor outputs to low test values.
- Minimize radio-frequency interference sources nearby when evaluating latency behavior.

**Data collection**

- Save timestamped command and ACK logs from both ground station and drone.
- Record any protocol errors, timeouts, and observed latencies per command type.

**Pass criteria**

- Every test command receives an ACK with matching ID and correct success/error status.
- Illegal commands (e.g., motor command while disarmed) are rejected and do not change motor state.
- ESTOP forces all motor outputs to a safe value within the specified time and requires a deliberate re-arm before further motion.

---

### TEST ID: SYS-01 — Motor Mapping & Spin-Up Test (Tethered / No Lift-Off)

**Scope & goal**

- **System under test**: Fully assembled drone with motors and ESCs, on a tether or fixture.
- **Goal**: Ensure each logical motor drives the correct physical motor, in the correct direction, with smooth low-power response.

**Test design (variables, sampling, apparatus)**

- **Type**: Functional system-level test.
- **Independent variables**: Commanded motor channel and throttle level.
- **Dependent variables**: Observed motor spin, direction, and current draw.
- **Sampling**: Every unit before first free-flight.
- **Apparatus**: Mechanical fixture or tether, propellers, eye and hearing protection.

**Procedure (outline)**

1. Secure the drone in a test fixture or tether so it cannot lift off.
2. ensure propellers command each motor individually to low and then medium test speeds.
3. Observe which physical motor spins and confirm rotation direction; listen and feel for abnormal vibration or noise.
4. Record current draw per motor channel if available.

**Safety & external factors**

- Always secure the drone in a fixture and keep hands clear of rotating parts.
- Use eye and hearing protection when motors are spinning (if needed).
- Note any unusual ambient vibration or mechanical noise in the test area.

**Data collection**

- Record pass/fail for motor ID and direction per channel.
- Log current draw and any abnormal observations for units that need rework.

**Pass criteria**

- Logical motor IDs match the correct physical motors for all channels.
- All motors spin in the intended direction with no abnormal vibration or noise.
- Measured current per motor lies within expected limits for the test speeds.

---

### TEST ID: FLT-01 — Production Acceptance Hover & Failsafe Test (Sample Units)

**Scope & goal**

- **System under test**: Representative production drones in a safe test environment.
- **Goal**: Confirm that units can maintain a stable hover and execute basic failsafe behavior (e.g., link loss response) as specified.

**Test design (variables, sampling, apparatus)**

- **Type**: System-level flight test.
- **Independent variables**: Unit sample, commanded altitude, control link state.
- **Dependent variables**: Position/altitude deviation during hover, behavior when link is lost or degraded.
- **Sampling**: Any unit that passes the previous tests moves onto this one.
- **Apparatus**: Safe test area or netted flight cage, ground station, means to log telemetry and link state.

**Procedure (outline)**

1. In a designated test area, take off and climb to a fixed test altitude (for example, 2–3 m above ground).
2. Command a hover and maintain it for a defined time window while recording position and altitude deviations.
3. Intentionally drop or degrade the control link according to the documented failsafe scenario and observe behavior until landing or timeout.

**Safety & external factors**

- Conduct tests only in a safe, controlled area (e.g., netted flight cage or open test range) with observers briefed on emergency procedures.
- Comply with all relevant safety and airspace regulations.
- Record environmental conditions such as wind speed, temperature, and lighting.

**Data collection**

- Log telemetry (position, altitude, link status) for the full duration of the test.
- Capture notes or video for any unexpected behaviors during hover or failsafe response.

**Pass criteria**

- During hover, position and altitude remain within defined tolerances/ranges for the duration of the test.
- When the link is lost or degraded, the drone follows the documented failsafe policy (e.g., hover then land, or return-to-home then land) and does not exhibit uncontrolled motion or fly-away behavior.
