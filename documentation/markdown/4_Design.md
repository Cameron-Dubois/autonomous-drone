### Design

**Aesthetic Prototype**
![Drone cad](../images/cad.png)
![Drone](../images/drone.png)

**Design for Manufacture, Assembly, Maintenance**

The drone frame is designed with manufacturability and assembly in mind. The structure uses a lightweight 3D-printed frame that can be produced quickly using common additive manufacturing equipment. The design separates the frame into simple components so that damaged parts, such as propeller arms or mounts, can be replaced individually without rebuilding the entire structure. Standard fasteners and mounting holes are used to attach motors, electronics, and the battery to ensure compatibility with commonly available hardware.

Assembly focuses on a modular approach where each subsystem—power, flight control, propulsion, and camera—can be installed independently. This modularity simplifies both initial construction and troubleshooting during development. Wiring is routed through the frame to reduce interference with the propellers and to keep the system organized and accessible.

Maintenance was also considered during the design process. Key components such as the battery, propellers, and flight-controller PCB are easily accessible so they can be replaced or serviced when needed. Because drones experience mechanical stress during flight, the design allows quick replacement of high-wear parts, helping extend the lifespan of the system and reduce downtime during operation.

**Block Diagrams**
![Block Diagram](../images/block_diagram.png)

**Wiring Diagrams**
![Wiring Diagram](../images/wiring_diagram.png)

**State Transition Diagrams**
![State Transition Diagram](../images/state_transition_diagram.png)

**Technology**

The finished product centers on a **custom flight-controller PCB** as the computing platform. The board integrates wireless communication (Bluetooth Low Energy and Wi‑Fi), sufficient processing for sensor fusion and flight control, and GPIO interfaces for motor drivers and peripherals. Integrated BLE enables low-latency command and status exchange with the mobile app; integrated Wi‑Fi provides a local soft access point for high-bandwidth telemetry and video without requiring internet connectivity.

The propulsion system consists of four brushless motors with propellers in a quadcopter configuration. Each motor is driven independently through electronic speed control, allowing differential thrust for lift, attitude, and translation. A rechargeable lithium-polymer battery supplies power with separate rails for logic and motor current as required by the PCB design.

**Onboard sensing (product)**

| Sensor | Role |
|--------|------|
| IMU | Attitude estimation and closed-loop flight control |
| GNSS | Outdoor position for navigation and follow-me |
| Magnetometer | Heading for yaw alignment during follow |
| Barometer | Altitude hold and vertical state (product firmware) |

A fixed camera module is part of the product concept for autonomous filming; the mobile app includes a video tab prepared for an MJPEG or similar stream served over the drone’s local Wi‑Fi link.

**User interface**

A **React Native mobile application** (four tabs: Home, Connect, Control, Video) is the sole operator interface. The user’s smartphone provides GNSS for follow-me geometry, displays combined phone and drone position, and sends commands over a **dual wireless link**: secure Wi‑Fi for telemetry (and future video) and BLE for low-latency flight commands. This removes the need for a dedicated radio controller.

**Autonomous follow-me (product behavior)**

The product goal is hands-off filming: the user walks; the drone maintains a safe offset using **phone GNSS** (subject) and **drone GNSS + compass** (aircraft state). The mobile app computes navigation intent (distance, bearing, arrival) and maps it to a documented binary command set (`NAV_*` opcodes). The flight controller enforces speed limits, geofencing, and failsafes on board—control logic is not safety-critical on the phone alone.

**Simulations**

Before and alongside flight testing, control and sensor algorithms are validated in **hardware-in-the-loop (HIL)** simulation: the same PID and motor-mixing logic runs against a software plant so tuning and regressions do not always require a tethered airframe. Physical prototypes remain essential for comms, wiring, and integration, but HIL reduces risk when extending autonomous modes.

> **Note on current prototypes:** Bench and demo units may use interim microcontroller modules and split firmware images while the custom PCB and unified production image are finalized. Behavior described in Sections 10–12 reflects the **intended product protocol and app architecture**, which the prototype app and firmware already implement at the protocol level.
