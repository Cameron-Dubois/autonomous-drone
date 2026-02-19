# Autonomous Drone — Test Plan

**Project:** Autonomous Drone  
**Version:** 1.0  
**Date:** 2026-02-19  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Test Environment](#2-test-environment)
3. [Mobile App Testing](#3-mobile-app-testing)
4. [Drone Hardware Testing](#4-drone-hardware-testing)

---

## 1. Introduction

This document outlines the test cases, edge cases, and end-to-end scenarios for the autonomous drone mobile app and hardware. The mobile app (Expo / React Native) connects to an ESP32 board via Bluetooth and WiFi to control the drone and display live telemetry.

---

## 2. Test Environment

| Item | Details |
|---|---|
| Mobile OS | iOS 16+, Android 13+ |
| Framework | Expo (React Native), Expo Router |
| Hardware | ESP32 (drone_ble / drone_wifi firmware) |
| BT Protocol | BLE |
| WiFi Protocol | 2.4 GHz 802.11n |
| Test Method | Manual QA on physical device |
| Offline Mocking | `src/comms/mock.ts` — `createMockComms()` |
| Network Inspection | Wireshark (WiFi), nRF Connect (BLE) |

---

## 3. Mobile App Testing

### 3.1 Bluetooth Connectivity

| ID | Test Case | Expected Result |
|---|---|---|
| BT-01 | Scan for devices with drone powered on | `Drone-ABC123` appears in device list within 10 s |
| BT-02 | Connect to drone via BT | Badge → `CONNECTED`; Home tab LinkStatus → `SECURE_LINK` |
| BT-03 | Disconnect BT | Badge → `DISCONNECTED`; no further commands sent |
| BT-04 | Rescan after disconnect | Fresh scan returns updated device list |
| BT-05 | Attempt scan with phone BT off | App prompts user to enable Bluetooth; no crash |
| BT-06 | BT permission denied (iOS/Android) | Permission-denied message shown with settings instructions |

---

### 3.2 WiFi Connectivity

| ID | Test Case | Expected Result |
|---|---|---|
| WIFI-01 | Scan for drone WiFi AP | `Drone-Network-5G` appears in network list within 10 s |
| WIFI-02 | Connect to drone AP | Badge → `CONNECTED`; video stream and telemetry available |
| WIFI-03 | Disconnect WiFi | Badge → `DISCONNECTED`; video feed stops gracefully |
| WIFI-04 | BT + WiFi connected simultaneously | Both sections show `CONNECTED`; control and streaming work concurrently |
| WIFI-05 | Wrong WiFi password | Auth failure shown; badge stays `DISCONNECTED`; user can retry |
| WIFI-06 | Walk out of WiFi range | App detects loss; badge reverts to `DISCONNECTED`; warns user |

---

### 3.3 Drone Power — Startup & Shutdown

| ID | Test Case | Expected Result |
|---|---|---|
| PWR-01 | Turn on / arm drone from app | LinkStatus: `DISCONNECTED` → `CONNECTING` → `SECURE_LINK`; telemetry streams |
| PWR-02 | Controlled shutdown from app | Shutdown command sent; motors disarm; LinkStatus → `DISCONNECTED` |
| PWR-03 | Attempt shutdown while airborne | App blocks or shows warning ("Land before disconnecting"); motors not cut mid-flight |
| PWR-04 | Reconnect after unexpected ESP32 reboot | App detects lost link within 5 s; reconnect flow works cleanly |

---

### 3.4 Flight Controls

| ID | Test Case | Expected Result |
|---|---|---|
| CTRL-01 | Tap Ascend | `ASCEND` command sent; `altM` increases on Home tab within 2 s |
| CTRL-02 | Tap Descend | `DESCEND` command sent; `altM` decreases; never goes below 0 |
| CTRL-03 | Descend at 0 m altitude | `altM` stays at 0; no negative values |
| CTRL-04 | Ascend at 500 m altitude | `altM` capped at 500 m; further taps have no effect |
| CTRL-05 | Toggle Auto-Follow ON | `FOLLOW_TOGGLE` sent; button label updates to `Auto-Follow Mode: ON` |
| CTRL-06 | Toggle Auto-Follow OFF | `FOLLOW_TOGGLE` sent; label switches back to `OFF` |
| CTRL-07 | Send commands while disconnected | Commands blocked; UI indicates controls are inactive; no crash |

---

### 3.5 Telemetry Display

| ID | Test Case | Expected Result |
|---|---|---|
| TEL-01 | Battery percentage shown | Displays 0–100%; updates every telemetry cycle (≤ 2 s) |
| TEL-02 | Battery minutes remaining shown | Non-negative value; decreases as battery drains |
| TEL-03 | Low battery warning (< 20%) | Visual or haptic alert triggered; does not spam user |
| TEL-04 | Critical battery (< 5%) | Auto-land or ESTOP sent automatically; user alerted |
| TEL-05 | Ground speed display | 0–80 KM/H; updates in real time |
| TEL-06 | Altitude display | 0–500 m; updates within 2 s of actual change |
| TEL-07 | RSSI signal bars | 0–4 bars reflect `rssiBars` telemetry field; no flicker |
| TEL-08 | Telemetry stops on disconnect | Values freeze/reset; no stale data displayed |

---

### 3.6 Manual Control Screen

| ID | Test Case | Expected Result |
|---|---|---|
| MAN-01 | Tap Takeoff | Drone arms and lifts off; `altM` begins increasing |
| MAN-02 | Tap Land | Drone descends and lands; `altM` → 0; motors disarm |
| MAN-03 | Tap Hover | Drone holds altitude ± 1 m for 10 s |
| MAN-04 | Tap Return Home | Drone navigates to launch point and lands within 2 m |
| MAN-05 | Emergency Stop on Control tab | `ESTOP` sent; `speedKmh` → 0; `followMode` → false |

---

### 3.7 Video Feed

| ID | Test Case | Expected Result |
|---|---|---|
| VID-01 | Open Video tab with WiFi connected | Live feed renders within 3 s; ≥ 15 fps |
| VID-02 | Open Video tab without WiFi | "No signal" placeholder shown; user directed to Connect tab |
| VID-03 | WiFi interrupted then restored | Feed auto-resumes within 5 s; no app restart needed |
| VID-04 | Video latency | Glass-to-glass latency ≤ 300 ms at close range (< 30 m) |

---

### 3.8 Emergency Stop (E-STOP)

| ID | Test Case | Expected Result |
|---|---|---|
| ESTOP-01 | E-STOP from Home tab | `ESTOP` dispatched within 200 ms; speed → 0; follow mode → false |
| ESTOP-02 | E-STOP from Control tab | Same behavior as ESTOP-01 |
| ESTOP-03 | Reconnect after E-STOP | Drone stays disarmed; no auto-arm on reconnect |
| ESTOP-04 | E-STOP button always reachable | Button never obscured by scroll, keyboard, or other UI elements |

---

### 3.9 State & Session Management

| ID | Test Case | Expected Result |
|---|---|---|
| STATE-01 | App backgrounded during flight | Connection maintained; telemetry resumes on foreground within 3 s |
| STATE-02 | App force-quit during flight | ESP32 detects timeout; drone hovers or RTH; app resets on relaunch |
| STATE-03 | Incoming phone call during flight | BT link maintained; telemetry pauses/resumes without crash |
| STATE-04 | Switch between tabs rapidly | Global connection state preserved; no reconnection on tab change |

---

### 3.10 Edge Cases

| ID | Scenario | Expected Result |
|---|---|---|
| EDGE-01 | Two phones try to connect simultaneously | Only first connection accepted; second gets rejection or timeout |
| EDGE-02 | BT signal lost mid-flight | App shows warning; drone hovers or RTH via failsafe |
| EDGE-03 | Rapid repeated Ascend/Descend taps | Commands debounced or queued; altitude stays within 0–500 m |
| EDGE-04 | Malformed telemetry packet from ESP32 | Packet ignored/logged; no crash, no garbage displayed |
| EDGE-05 | Phone battery dies during flight | ESP32 detects connection loss; failsafe hover or RTH triggered |
| EDGE-06 | WiFi interference degrades signal | `rssiBars` reflects degradation; BT control still routes correctly |
| EDGE-07 | Drone battery hits 0% | Emergency landing initiated; app shows critical alert |
| EDGE-08 | E-STOP pressed while Follow Mode active | ESTOP takes priority; follow mode disabled immediately |
| EDGE-09 | App opened before drone is powered | Empty device list shown; "No devices found" state displayed |

---

### 3.11 End-to-End Scenarios

#### E2E-01 — Full Bluetooth Flight Session
1. Power on ESP32 → Open app → Connect tab → Scan → Connect to `Drone-ABC123`
2. Home tab: confirm telemetry live → Enable Auto-Follow → Ascend × 5 → Descend × 3
3. Control tab: Hover → return to Home → Emergency Stop
4. Disconnect → Power off drone

**Pass:** Every step completes without crash; telemetry reflects each action within 2 s.

---

#### E2E-02 — WiFi FPV Session
1. Power on ESP32 in AP mode → Connect tab → Scan → Connect to `Drone-Network-5G`
2. Video tab: confirm live feed within 3 s
3. Control tab: Takeoff → observe `altM` rising → Hover → Land
4. Connect tab: Disconnect

**Pass:** Video continuous; no drop > 3 s; landing clean.

---

#### E2E-03 — Connection Failure & Recovery
1. Launch app with drone off → Scan → no devices found
2. Power on drone → Rescan → Connect
3. Walk to edge of BT range → observe `rssiBars` drop → return → bars recover
4. Disconnect gracefully

**Pass:** All intermediate states handled cleanly; no stuck spinners or crashes.

---

#### E2E-04 — Emergency Stop Under Load
1. Connect via BT → Ascend × 10 rapidly → Enable Auto-Follow
2. While telemetry is updating, tap Emergency Stop immediately
3. Confirm: `speedKmh` = 0, `followMode` = false within 500 ms

**Pass:** E-STOP overrides all in-flight state with no race condition.

---

#### E2E-05 — Dual Transport (BT + WiFi)
1. Connect BT → Connect WiFi → open Video tab (stream active)
2. Control tab: Takeoff → Home tab: Ascend / Descend while video runs
3. Confirm video uninterrupted during control commands → ESTOP → Disconnect WiFi → Disconnect BT

**Pass:** Both transports work concurrently; all controls responsive; no interference.

---

## 4. Drone Hardware Testing

>add your drone test cases here,i've just put some example sections feel free to add/delete them
### 4.1 Motors & ESCs
### 4.2 Frame & Propellers
### 4.3 ESP32 Firmware
### 4.4 BLE / WiFi Range Tests
### 4.5 Flight Stability
### 4.6 Failsafe & Return-to-Home
### 4.7 Battery & Power Management
