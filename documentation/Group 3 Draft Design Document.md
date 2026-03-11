Group 3 Draft Design Document

### Executive Summary {#executive-summary}

### Table of Contents {#table-of-contents}

[Executive Summary](#executive-summary)

[Table of Contents](#table-of-contents)

[Introduction](#introduction)

[Design](#design)

[Evaluation](#evaluation)

[Appendix 1 – Problem Formulation](#appendix-1---problem-formulation)

[Appendix 2 – Planning](#appendix-2---planning)

[Appendix 3 – Test Plan & Results](#appendix-3---test-plan-&-results)

[Appendix 4 – Review](#appendix-4---review)

### Introduction {#introduction}

**Need & Goal Statements**

**Need Statement**

Many independent content creators need dynamic video footage but do not have access to a second person to operate a camera or drone. For example, a travel vlogger walking through a city or a fitness instructor recording an outdoor workout often needs moving shots or aerial perspectives to make their videos more engaging. Current recording setups such as tripods provide only fixed camera angles, while most drones require a dedicated controller and experienced operator. As a result, individuals working alone struggle to capture professional-looking footage. There is a need for a drone system that can be easily controlled by a smartphone, allowing a single user to move the drone and record video simultaneously without requiring additional personnel.

**Goal Statement**

The goal of this project is to design a drone that can be controlled directly from a smartphone using a simple directional interface. When a user presses a direction on the phone, the drone will move in the corresponding direction while capturing video.
Key goals include:
Enabling smartphone-based directional control of the drone.
Allowing users to record video while controlling the drone.
Creating an intuitive control interface that requires minimal training.
Providing a system that allows individual content creators to record themselves without a second operator.

**Personas**

**Persona 1: YouTuber**

Name: Alex

Age: 25

Occupation: YouTube Content Creator

Alex produces travel and lifestyle videos for YouTube and often films alone while visiting new locations. Alex wants to include moving shots and aerial perspectives to make videos more engaging, but using a tripod limits the ability to capture dynamic footage. A smartphone-controlled drone would allow Alex to move the camera while appearing in the video, making it easier to create professional-looking content without needing another person to operate the camera.

**Persona 2: Musician**

Name: Maya

Age: 28

Occupation: Independent Musician

Maya records live performances and music videos for social media platforms. Most recordings are done independently with limited equipment, which restricts camera movement and creative angles. With a drone controlled through a smartphone, Maya could capture overhead shots or move the camera during performances to create more visually engaging music videos.

**Persona 3: Movie Producer**

Name: Daniel

Age: 34

Occupation: Independent Film Producer

Daniel works on small independent film projects with a limited production crew. Capturing aerial or moving shots often requires additional equipment or specialized drone operators, which increases production costs. A smartphone-controlled drone would allow Daniel to capture establishing shots and dynamic camera movement more easily, providing greater flexibility during filming without requiring extra personnel.

**Research into existing designs**

Several existing drone and camera systems provide aerial recording capabilities, but many are not optimized for simple smartphone-based operation by a single individual.

**DJI Mini Series**
The DJI Mini 3 and Mini 4 drones are popular consumer drones that offer high-quality cameras and stable flight systems. These drones are capable of recording high-resolution video and include automated flight modes such as tracking and waypoint navigation. However, DJI drones typically require a dedicated remote controller for reliable operation. While some smartphone control options exist, the systems are designed primarily for users with some experience flying drones. The learning curve and controller hardware may discourage casual users who only need a simple filming solution.

**HoverAir X1**
The HoverAir X1 is a compact drone designed specifically for quick personal recording. It can automatically follow a subject and capture video without requiring manual control. This product is aimed at casual users who want simple aerial footage. While this system simplifies filming, it relies heavily on automated tracking modes rather than manual directional control. Users have limited ability to control precise drone movement or adjust camera position in real time.

**Ryze Tello**
The Ryze Tello drone is a small drone that can be controlled through a smartphone app using Wi-Fi communication. The app includes on-screen controls that allow users to move the drone in different directions. Although Tello demonstrates the feasibility of smartphone-based drone control, it is primarily designed as an educational or beginner drone. The camera quality and control responsiveness are limited compared to higher-end recording systems.

**Sustainability Statement**

The proposed drone system considers sustainability through efficient energy use, reusable components, and minimizing unnecessary hardware.

The drone will operate using rechargeable batteries, allowing repeated use without generating disposable waste. Efficient electronic components and lightweight materials will help reduce power consumption and extend flight time. The design will also emphasize repairability and replaceable components, such as propellers, batteries, and camera modules. This approach extends the lifespan of the device and reduces electronic waste. Additionally, the system uses the user's existing smartphone as the control interface, eliminating the need for a separate controller and reducing additional hardware production.

Through these design considerations, the system aims to provide a functional product while reducing environmental impact and encouraging long-term usability.

### Design {#design}

**Aesthetic Prototype**
![Drone cad](images/cad.png)
![Drone](images/drone.png)
**Design for Manufacture, Assembly, Maintenance**
The drone frame is designed with manufacturability and assembly in mind. The structure uses a lightweight 3D-printed frame that can be produced quickly using common additive manufacturing equipment. The design separates the frame into simple components so that damaged parts, such as propeller arms or mounts, can be replaced individually without rebuilding the entire structure. Standard fasteners and mounting holes are used to attach motors, electronics, and the battery to ensure compatibility with commonly available hardware.

Assembly focuses on a modular approach where each subsystem—power, flight control, propulsion, and camera—can be installed independently. This modularity simplifies both initial construction and troubleshooting during development. Wiring is routed through the frame to reduce interference with the propellers and to keep the system organized and accessible.

Maintenance was also considered during the design process. Key components such as the battery, propellers, and microcontroller are easily accessible so they can be replaced or serviced when needed. Because drones experience mechanical stress during flight, the design allows quick replacement of high-wear parts, helping extend the lifespan of the system and reduce downtime during testing or future operation.

**Block Diagrams**
![Block Diagram](images/block_diagram.png)

**Wiring Diagrams**
![Wiring Diagram](images/wiring_diagram.png)
**State Transition Diagrams**
![alt text](images/state_transition_diagram.png)
**Technology**

The prototype system is built using an ESP32 microcontroller as the central computing platform. The ESP32 was selected because it integrates wireless communication capabilities, sufficient processing performance, and flexible GPIO interfaces for controlling external hardware. Its built-in Bluetooth functionality enables direct communication with the mobile application without requiring additional wireless modules.

The propulsion system consists of four motors with propellers arranged in a quadcopter configuration. Each motor can be controlled independently, allowing the system to generate lift and directional movement through differential thrust. The drone is powered by a rechargeable lithium-polymer battery that provides a lightweight energy source suitable for aerial applications.

A mobile application serves as the primary user interface. The app manages Bluetooth connections, provides directional controls, and displays system status. This approach leverages the user’s existing smartphone hardware, reducing the need for additional controllers and simplifying the user experience.

**Simulations**

At this stage of development, the focus has been on validating communication and hardware integration through physical prototyping rather than extensive simulation. Initial testing was performed directly on the hardware to verify Bluetooth connectivity and motor activation through the mobile application.

Future development may incorporate simulation tools to model flight dynamics and control algorithms before implementing them on the physical drone. Simulations could allow the team to test autonomous behaviors, sensor integration, and control stability in a controlled virtual environment before deploying those features on the hardware platform. This approach would reduce development risk and improve system reliability as more advanced functionality is added.

### Evaluation {#evaluation}

Our current prototype demonstrates that the core communication and motor control functions for the autonomous drone are functional. The mobile application successfully connects to the ESP32 controller via Bluetooth and enables the selective activation of individual propellers. These results, validated through structured testing, confirm that the basic design architecture is practical and provides a reliable foundation for future development.

**Functional Prototype**

The functional prototype consists of an ESP32-based flight controller mounted on a quadcopter 3D-printed frame with four brushless motors and propellers powered by a LiPo battery system. The ESP32 serves as the central microcontroller, providing integrated Bluetooth connectivity and sufficient processing capability for current control functions and future autonomy features. Each motor is connected directly to a dedicated PWM-capable GPIO pin on the ESP32, with shared ground connections and separate power rails for logic and motor operation.

The ESP32 firmware initializes Bluetooth advertising and accepts connections from mobile devices, as verified in our firmware test plan. The mobile application scans for the ESP32, establishes a Bluetooth connection, and provides controls for individual motors. Our testing successfully demonstrated stable Bluetooth connectivity, including device discovery and reliable reconnection across multiple connect/disconnect cycles.

Photographs of the prototype:

**App Screenshots**

### Connect Screen

![Connect screen](./images/app_connect.png)

### Home Screen

![Home screen](./images/app_home.png)

### Manual Control

![Control screen](./images/app_control.png)

### Live Video Feed

![Video screen](./images/app_video.png)

## Prototype Photos

![Drone 1](./images/drone1.png)
![Drone 2](./images/drone2.png)
![Drone 3](./images/drone3.png)

**Testing**

Testing focused on verifying end-to-end functionality from mobile app input to physical motor response, following procedures outlined in our test plans.

1. Bluetooth Connectivity Tests
   Executed firmware connectivity tests BLE-01 and BLE-02, confirming the ESP32 advertises correctly and accepts connections within 10 seconds. Completed 5 connect/disconnect cycles with 100 % success rate and no firmware crashes. Mobile app tests BT-01 and BT-02 verified device discovery, connection status updates, and clean disconnection handling.

2. Motor Control Verification
   Established a Bluetooth connection and sequentially activated each motor via the app interface. Each selection correctly actuated the corresponding physical motor, confirming proper wiring and command mapping. Response time from app input to motor activation was imperceptible, demonstrating adequate communication latency.

3. Test Plan Implementation
   Testing followed two documented plans: a comprehensive system-level plan covering mobile app and drone hardware integration, and a firmware-specific connectivity validation plan. This prototype phase prioritized Bluetooth connectivity and the validation of basic motor control. Subsequent phases will implement the remaining test cases, including flight control, telemetry display, and video streaming.

All executed tests met success criteria, confirming reliable Bluetooth communication between the mobile application and ESP32 controller, and accurate motor actuation from app commands. These results validate the prototype's core functionality and establish a tested foundation for autonomous flight development.

## Appendix 1 – Problem Formulation {#appendix-1---problem-formulation}

### 1. Conceptualisations

**System concept**

The product is conceived as an **autonomous filming drone**: a quadcopter that captures video without requiring the user to pilot it. The user defines what they want to film (e.g. “follow me”, “orbit this area”, “cover this event”). The drone then flies and films autonomously. Control and monitoring are done via a mobile application over a wireless link. The system is designed so that filming and flying do not depend on drone piloting skills, making it suitable for content creators, sports filming, and event coverage where the focus is on the shot, not on stick control.

**Stakeholders and users**

- **Content creator / filmmaker.** The primary user is someone who wants to self-document or capture footage without learning to pilot. Examples include solo YouTubers filming themselves (vlogs, activities, tutorials), crews or individuals filming athletes in sports, and event producers using single drones or **larger fleets** to document large events (e.g. sporting events, concerts) from multiple angles.
- **Development and maintenance.** The team (or future maintainers) who develop and update firmware and the mobile app, and who assemble or repair the hardware.
- **Subjects and bystanders.** People being filmed or in the operating environment. Safety and predictable autonomous behaviour matter in shared or crowded spaces.

**Main functions (concept level)**

1. **Communicate.** Reliable two-way link between user and drone (commands, status, telemetry, and video stream).
2. **Actuate.** Drive the four propellers to achieve lift, orientation, and motion (manual control validated, autonomous flight planned).
3. **Film.** Capture video (and optionally stream it) for self-documentation, sports, or event coverage.
4. **Sense.** Perceive the environment and drone state to support autonomous framing, following, and safety.
5. **Navigate autonomously.** Execute filming behaviours (e.g. follow, orbit, waypoints) and avoid obstacles without manual piloting.
6. **Scale to fleets.** Support multiple drones documenting one event from several angles, coordinated from a single or small number of operators.

**Context and scenario**

Use spans **solo creators** (e.g. YouTubers filming themselves), **sports** (filming athletes from the air), and **large events** (sporting events, concerts) where one or many drones provide multi-angle coverage without a pilot per drone. The system is intended for environments where autonomous flight is acceptable and where the value is in hands-free filming rather than manual piloting. This conceptualisation describes what the system is and does at a high level, without committing to low-level implementation details.

---

### 2. Brainstorming

Brainstorming centred on a few key concepts: the drone should not require piloting skill, it should support self-documentation (e.g. solo creators filming themselves), and it should work without internet. Almost every aspect of the system became a "how do we?" question. The team had limited prior experience in drone flight, mobile app development, and sending data between a phone and embedded hardware, so idea generation focused on identifying options and unknowns rather than assuming solutions. The following themes and ideas came out of those discussions.

**1. No piloting skill and self-documentation**

- User chooses a high-level goal (e.g. "follow me", "orbit", "record this") rather than flying manually.
- Preset behaviours (follow, orbit, hover) so the user does not need to learn to pilot.
- Self-documentation as the main use case: one person filming themselves without a second operator.
- Operation that works without internet so it is usable in the field or in places with poor connectivity.

**2. How do we connect the user to the drone and send data?**

- Bluetooth only at first. The team explored BLE for control and pairing with a phone.
- Discovery that BLE alone would not be enough to stream recorded video led to considering alternatives (e.g. WiFi for higher bandwidth when streaming is needed).
- Need to support both control commands and video (or at least video metadata) while keeping "works without internet" in mind.
- Phone app as the primary interface, with only one team member having prior mobile app experience, so app design and communication protocols were open questions.

**3. How do we track the subject or know where to fly?**

- Computer vision on the drone or on the phone to follow a person or target.
- GPS plus magnetometer for position and orientation (outdoor, where GPS is available).
- The team is still unsure which approach to adopt: computer vision vs GPS and magnetometer, or a combination depending on context.

**4. What sensors and parts do we actually need?**

- At first the need for many extra parts was not obvious.
- An IMU was assumed necessary and expected to be available on the ESP32-based board.
- Brainstorming raised the need for a barometer, magnetometer, and possibly a GPS unit.
- Sensors became a major open question: what is strictly necessary for a first version vs what is needed for reliable autonomous behaviour and safety.

---

### 3. Decision Tables

Several important design choices were clarified during the early stages of the project. The following decision tables present these choices in a structured way, focusing on communication methods, camera inclusion, and subject tracking approaches.

#### 1. Communication method for prototype and future streaming

| Criterion                 | BLE only (prototype)       | WiFi only                     | Hybrid BLE + WiFi (future)    | Cellular or long range      |
| ------------------------- | -------------------------- | ----------------------------- | ----------------------------- | --------------------------- |
| Supports control commands | Yes                        | Yes                           | Yes                           | Yes                         |
| Supports video streaming  | No (not enough bandwidth)  | Yes                           | Yes                           | Yes                         |
| Works without internet    | Yes                        | Yes                           | Yes                           | Often needs network backend |
| Power and complexity      | Low power and simple       | Higher power and more complex | Higher power and more complex | Highest complexity          |
| Fit for first prototype   | Chosen for first prototype | Not used yet                  | Planned for later streaming   | Not planned                 |

**Decision**

Initially we chose BLE only because it was simple, low power, and enough for basic control. Through brainstorming and early research we concluded that BLE would not be enough for video streaming. For future versions we intend to move toward a hybrid BLE and WiFi approach so that BLE can handle control while WiFi handles higher bandwidth video when needed.

#### 2. Camera inclusion

| Criterion                           | No camera           | Simple fixed camera (chosen)   | Stabilised or advanced camera   |
| ----------------------------------- | ------------------- | ------------------------------ | ------------------------------- |
| Supports self documentation         | No                  | Yes                            | Yes                             |
| Hardware and integration complexity | Lowest              | Moderate                       | Highest                         |
| Data bandwidth requirements         | Very low            | Moderate                       | High                            |
| Matches goal of autonomous filming  | Does not match goal | Matches goal for first version | Best match but not required yet |
| Cost                                | Lowest              | Moderate                       | Highest                         |

**Decision**

We considered leaving the camera out to reduce complexity, cost, and data rate. After discussion we decided that a camera is essential because the main purpose of the system is autonomous filming and self documentation. We therefore treat a simple fixed camera as required for the first version. More advanced camera systems can be added in later iterations.

#### 3. Subject tracking approach (still under evaluation)

| Criterion                           | Computer vision tracking     | GPS plus magnetometer tracking | Manual framing only       |
| ----------------------------------- | ---------------------------- | ------------------------------ | ------------------------- |
| Works indoors                       | Yes if lighting is good      | No or limited                  | Yes                       |
| Works outdoors                      | Yes                          | Yes                            | Yes                       |
| Extra hardware required             | Camera and enough processing | GPS and magnetometer           | None beyond basic control |
| Algorithm and implementation effort | High                         | Moderate                       | Low                       |
| Dependence on internet              | Can work offline             | Works offline                  | Works offline             |
| Team experience level               | Limited                      | Limited                        | Feels most achievable now |

**Decision**

We have not finalised a tracking approach yet. Brainstorming focused on two main options, computer vision and GPS with magnetometer. At this stage we expect to start with manual framing and simple behaviours, then introduce tracking using either computer vision, GPS with magnetometer, or a combination once we understand the hardware and software constraints better.

---

### 3. Morphological Charts

To be added soon

### Appendix 2 – Planning {#appendix-2---planning}

#### Basic Plan / Gantt Chart

![Gantt Chart](./images/autonomous_drone_2026-03-05_10.24am.png)

#### Division of Labor During Prototyping Phase

The table below summarizes each team member's primary areas of contribution during the prototyping phase. Work was tracked and assigned through Jira across five sprints.

| Team Member | Primary Contributions |
| --- | --- |
| **Ethan Liu** | Worked on mobile app development, including fixing BLE implementation bugs, restructuring the project for expo-router, fixing layout bugs and memory leaks, and setting up WiFi permissions and testing. Also contributed to hardware by 3D-printing the first drone frame. On the documentation side, drafted the systems architecture, set up Jira, created the project wiki, converted the design document to markdown, and researched cloud deployment options. |
| **Cameron Dubois** | Designed the initial Figma mockups for the mobile app and set up the mobile project environment. Implemented Bluetooth connectivity on the mobile side and fixed display issues. |
| **Darin Rahm** | Focused on drone firmware, including testing ESP32 Bluetooth and WiFi connectivity and implementing BLE commands for motor control. Also authored the test plan and created demonstration tests. |
| **Stephen WB** | Worked across firmware and hardware — wrote the motor on/off and speed control functions, and integrated the ESP32 with new hardware components and the camera module. Set up the GitHub repository, created the initial LaTeX documents, and produced the digital system diagrams. |
| **Winnie Wong** | Handled parts research and acquisition, documented component sizes for the final design, and researched campus drone flight guidelines. Designed a custom PCB schematic and created test cases. |
| **Aya Galap** | Designed the updated CAD model for the drone shell and integrated mobile controls with the ESP32 hardware. Continously improving on drone CAD model and releasing new iterations with every change. |

---

#### Collaboration

We used the following tools and processes to coordinate work:

- **Jira** – We used Jira with Kanban boards and Scrum to manage sprints, bugs, and tasks. Epics and stories were broken down into sprint-sized work, and we tracked progress through columns (e.g., To Do, In Progress, In Review, Done). Sprint planning were held regularly at our first meeting of the week.
- **GitHub** – The repository was used for all code, documentation, and design files.
- **Discord** – Discord served as the main channel for day-to-day messaging, quick questions, meeting coordination, and sharing updates between synchronous meetings.

### Appendix 3 – Manufacturing Test Plan & Results {#appendix-3---test-plan-&-results}

This section defines a generic manufacturing and verification test plan for future engineers who build or maintain production versions of the autonomous drone.

---

## 1. Scope & Administrative Details

### Scope

- **System under test:** Fully assembled production drones and subassemblies (flight controller PCB, power system, motors).
- **Goal of testing:** Verify that manufactured product meets the project’s functional and safety objectives before being accepted for use (mechanical integrity, power behavior, electronics health, communications, motor mapping, and basic flight/failsafe behavior).
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

- Self-test completes with an “OK” or equivalent status code.
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
2. Send a scripted sequence of commands including ARM, small thrust changes, ESTOP, DISARM, and at least one “illegal” command (such as thrust while disarmed).
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

---
### Appendix 4 – Review {#appendix-4---review}

**One paragraph from each team member**
