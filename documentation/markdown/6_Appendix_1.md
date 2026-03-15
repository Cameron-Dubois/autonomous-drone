## Appendix 1 – Problem Formulation

### 1. Conceptualisations

**System concept**

The product is conceived as an **autonomous filming drone**: a quadcopter that captures video without requiring the user to pilot it. The user defines what they want to film (e.g. "follow me", "orbit this area", "cover this event"). The drone then flies and films autonomously. Control and monitoring are done via a mobile application over a wireless link. The system is designed so that filming and flying do not depend on drone piloting skills, making it suitable for content creators, sports filming, and event coverage where the focus is on the shot, not on stick control.

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
- An IMU was assumed necessary and expected to be available on the custom PCB.
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
