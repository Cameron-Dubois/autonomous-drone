## 20 minutes:

- ~2 minutes per person for 12-14 minutes total
- ~5 minutes for questions
- ~1 minute buffer time

### Person 1 — Problem, goal, and what you are demonstrating

- short intro: what the project is and why it matters (need and goal statement)
- State the feature being demoed: the mobile app connects to the drone via Bluetooth and
  sends commands that make the motors spin.
- Say clearly this is a functional prototype milestone, not full autonomous flight yet.

### Person 2 — High-level system architecture

- Walk through the schematic slide.
- Explain the path: phone app → BLE link → microcontroller→ motor outputs → physical
  response.

### Person 3 — Mobile app side

- Explain what the app does in the demo: scan, discover the device, connect, and send
  commands.
- Mention that the app uses Expo/React Native and react-native-ble-plx.
- Go over the UI flow: connect screen, then control screen.

### Person 4 — BLE communication layer

- Explain how the phone and ESP32 talk
- the drone advertises over BLE, the app connects, then commands are written to the
  matching service/characteristic.
- Mention reliability evidence (ie reconnect testing succeeded 5 out of 5 times with no
  crashes).

### Person 5 — Embedded / hardware control

- Explain what happens once the ESP32 receives a command.
- Show that the firmware maps incoming commands to motor actuation and that each
  motor can be activated correctly.
- Mention the physical prototype: ESP32, quad frame, motors, power system.
- each motor was actuated correctly and the command mapping was verified.

### Person 6 — Live demo narration, testing evidence, and limitations/next steps

- Narrate the actual live sequence while it happens:
  - app scans
  - drone appears
  - connection succeeds
  - command is sent
  - motor spins

- Then close with test evidence and limitations:
  - BLE connect works
  - reconnect works
  - motor control works
  - full flight autonomy, telemetry, and video are next phases

- prioritized Bluetooth and basic motor control