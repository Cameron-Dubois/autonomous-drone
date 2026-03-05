# Autonomous Drone – Firmware Connectivity & Command Test Plan

## 1. Purpose

This document defines the connectivity, reliability, and initial command-layer test plan for the ESP32-C3 firmware.
The goal of this phase is to validate:

- BLE connectivity
- WiFi SoftAP connectivity
- Basic reliability (reconnect + stability)
- A structured BLE command layer for arming, per‑motor throttle, and emergency stop, including ACKs with timestamps

---

## 2. Test Environment

### Hardware
- ESP32-C3 Development Board
- USB connection to laptop (for serial monitor)

### Software
- ESP-IDF Version: v5.5-dev-3062-ge9bdd39599 (dirty)
- Firmware Branch: main
- iPhone Model: iPhone 15 Pro
- iOS Version: 18.6.2

### Tools
- Serial Monitor (`idf.py monitor`)
- iPhone app called nRF connect for ble connection
- iPhone WiFi Settings

---

## 3. Test Cases

---

### BLE-01 — BLE Scan + Connect

**Purpose:**
Verify that the ESP32 advertises correctly and accepts connections.

**Setup:**
- Flash `drone_ble`
- Reset board
- Open serial monitor

**Steps:**
1. On iPhone, open nRF connect.
2. Scan for BLE devices.
3. Verify device name appears.
4. Connect to device.

**Pass Criteria:**
- Device appears within 10 seconds.
- Connection succeeds within 10 seconds.
- Serial monitor logs show GAP connect event.

**Evidence to Capture:**
#### iPhone Connected View
![BLE Connected](images/ble-scan-connected.png)

#### Attribute Table View
![BLE Attribute Table](images/ble_attribute_table.png)

### Serial Log Snippet Showing Connection Event.
    - I (23318) NimBLE: connection established; status=0
    - I (23318) NimBLE: handle=1...
    - I (23348) NimBLE:  conn_itvl=24 conn_latency=0 supervision_timeout=72 encrypted=0 authenticated=0 bonded=0

---

### BLE-02 — BLE Reconnect Reliability

**Purpose:**
Verify stability across repeated connect/disconnect cycles.

**Setup:**
- Device powered and advertising.
- Serial monitor open.

**Steps:**
1. Connect to device.
2. Disconnect from iPhone.
3. Reconnect.
4. Repeat 5 times.

**Pass Criteria:**
- At least 5/5 successful reconnect attempts.
- No firmware crashes or resets.
- Advertising resumes after disconnect.

**Results:**
- Attempts: 5
- Success: 5/5
- Advertising resumed after each disconnect: Yes
- Time-to-reconnect: ~instant (<1s, perceived)
- Crashes/resets: None observed
- Disconnect lines:
    - I (8928) NimBLE: disconnect; reason=531
    - I (36668) NimBLE: connection established; status=0
    - these repeated 5 times



---

### WIFI-01 — SoftAP Join + DHCP

**Purpose:**
Verify SoftAP initialization and DHCP functionality.

**Setup:**
- Flash `drone_wifi/softAP`
- Reset board
- Serial monitor open

**Steps:**
1. On iPhone, open WiFi settings.
2. Select SoftAP SSID.
3. Enter password if required.
4. Confirm connection.

**Pass Criteria:**
- Connection succeeds within 15 seconds.
- IP address assigned (192.168.4.x).
- Serial monitor logs show station join event and DHCP started.

**Evidence to Capture:**
- Screenshot of WiFi settings with assigned IP (inside the images folder).
- Serial log:
    - I (492) wifi:mode : softAP (40:4c:ca:89:af:09)
    - I (178902) wifi:station: 5a:a4:48:d9:87:40 join, AID=1
    - I (180112) esp_netif_lwip: DHCP server assigned IP to a client, IP is: 192.168.4.2

**Result**
- Successful
- Notes: Connected <15s, IP 192.168.4.2 assigned, no resets observed.


---

### WIFI-02 — SoftAP Stability (2-Minute Hold)

**Purpose:**
Verify connection stability under idle conditions.

**Setup:**
- Connected to SoftAP via IPhone.

**Steps:**
1. Remain connected for 2 minutes.
2. Observe serial logs for disconnect events.

**Pass Criteria:**
- No unexpected disconnect.
- No firmware reset.
- No DHCP restart events.

**Results:**
- Duration: >2 minutes (observed)
- Unexpected disconnects: None observed
- Firmware resets: None observed
- DHCP restart events: None observed
- Validation method: Successful search `http://192.168.4.1/` after >2 minutes (page returned: "esp32 c3 test alive")

**Serial Logs**
- I (542) esp_netif_lwip: DHCP server started on interface WIFI_AP_DEF with IP: 192.168.4.1
- I (9702) esp_netif_lwip: DHCP server assigned IP to a client, IP is: 192.168.4.2

---

### BLE-03 — Command Layer: ARM / Motor / E-STOP

**Purpose:**
Verify the structured BLE command protocol, ACK behavior, and basic safety rules (ARM required before motor commands, E-STOP zeros all motors).

**Command Packet Format (App → ESP32):**

- Byte 0: `seq` — sequence number (0–255)
- Byte 1: `cmd` — command ID
  - `0x01` = `DRONE_CMD_ARM`
  - `0x02` = `DRONE_CMD_DISARM`
  - `0x03` = `DRONE_CMD_ESTOP`
  - `0x10` = `DRONE_CMD_SET_MOTOR_1`
- Byte 2: `payload_len` — number of payload bytes
- Bytes 3..N: `payload` — command-specific

**ACK Packet Format (ESP32 → App, via Notify):**

- Byte 0: `seq` — copied from command
- Byte 1: `cmd` — copied from command
- Byte 2: `status` — `0x00 = OK`, non‑zero = error
- Bytes 3–6: `drone_ms` — `uint32_t` ms since boot (little-endian)

**Setup:**
- Firmware branch: `ble-command-layer`
- Flash `drone_ble` (this project) with the BLE command layer implemented.
- Open `idf.py monitor` to watch serial logs.
- On iPhone, open **nRF Connect**, connect to `DroneBLE`, and enable **Notify** on the custom characteristic (handle 29 in current logs).

**Steps & Expected Results:**

1. **ARM — `seq=1, cmd=ARM`**
   - Write hex: `01 01 00`
   - Serial:
     - `DRONE_CMD_ARM seq=1`
     - `motor_state armed=1 m1=0 m2=0 m3=0 m4=0`
   - App receives 7-byte ACK with:
     - Byte 0 = `0x01`, Byte 1 = `0x01`, Byte 2 = `0x00` (status OK).

2. **Set Motor 1 Throttle While Armed — `seq=2, cmd=SET_MOTOR_1`**
   - Write hex: `02 10 01 80` (throttle = `0x80` / 128)
   - Serial:
     - `DRONE_CMD_SET_MOTOR (id=0x10) seq=2 throttle=128`
     - `motor_state armed=1 m1=128 m2=0 m3=0 m4=0`
   - ACK status byte remains `0x00`.

3. **Emergency Stop — `seq=3, cmd=ESTOP`**
   - Write hex: `03 03 00`
   - Serial:
     - `DRONE_CMD_ESTOP seq=3`
     - `motor_state armed=0 m1=0 m2=0 m3=0 m4=0`
   - ACK status byte = `0x00`.

4. **Set Motor While Disarmed (Safety Check) — `seq=4, cmd=SET_MOTOR_1`**
   - Write hex: `04 10 01 40`
   - Serial:
     - `SET_MOTOR ignored while disarmed (id=0x10 seq=4)`
   - ACK status byte is **non‑zero** (error).

**Pass Criteria:**

- All four commands produce the expected serial logs above.
- ACKs are received for each write with correct `seq` and `cmd`.
- `SET_MOTOR_1` only changes `m1` when the system is armed (after ARM and before E-STOP/DISARM).
- After E-STOP, all motors stay at 0 even if additional `SET_MOTOR_1` commands are sent.


---


## 4. Known Limitations (Current Phase)

- Command layer currently exposes ARM/DISARM/ESTOP and a single-motor throttle API; high‑level flight modes (ASCEND/DESCEND/FOLLOW_TOGGLE) are not implemented yet.
- No encryption/bonding testing performed.
- No automated latency or packet‑loss measurement implemented yet (timestamp is present in ACKs for future tooling).
- No motor hardware integrated; tests are validated via logs and in‑memory throttle state only.

---

## 5. Next Phase Testing (Planned)

- Extend command set to cover high-level flight modes (ASCEND, DESCEND, FOLLOW_TOGGLE) that map to the app-level test plan (section 3.4 in `test-plan.md`).
- Latency measurement (timestamp + sequence ID) across multiple packets.
- Packet loss measurement under noisy conditions.
- Failure mode behavior (BLE drop mid-command, app crash, or phone battery loss).

---

## 6. Conclusion

This test plan establishes a verified communication and command baseline for the autonomous drone firmware.
All future high-level motor control and autonomous behaviors will be built on top of this validated transport and BLE command layer, and will connect to the mobile-app scenarios defined in `test-plan.md` (e.g., E-STOP, ARM/DISARM flows, and future ASCEND/DESCEND/FOLLOW_TOGGLE behaviors).
