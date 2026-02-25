# Autonomous Drone – Firmware Connectivity Test Plan

## 1. Purpose

This document defines the initial connectivity and reliability test plan for the ESP32-C3 firmware.
The goal of this phase is to validate communication stability before implementing command/control logic or motor integration.

This test plan focuses on:

- BLE connectivity
- WiFi SoftAP connectivity
- Basic reliability (reconnect + stability)

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


## 4. Known Limitations (Current Phase)

- No command/control characteristic implemented yet.
- No encryption/bonding testing performed.
- No latency measurement implemented yet.
- No motor hardware integrated.

---

## 5. Next Phase Testing (Planned)

- BLE command write characteristic
- ACK via notify
- Latency measurement (timestamp + sequence ID)
- Packet loss measurement
- Failure mode behavior (BLE drop mid-command)

---

## 6. Conclusion

This test plan establishes a verified communication baseline for the autonomous drone firmware.
All future command and motor control functionality will be built on top of this validated transport layer.
The immediate next step is implementing BLE-03, which adds a structured command layer on top of what has already been verified. This involves defining a packet structure that organizes each command with a sequence ID, command ID, and payload. For every command the drone receives, it will send back an ACK packet confirming receipt.
