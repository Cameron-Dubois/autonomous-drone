# ESP32-C3 Drone Motor Test Suite

## Hardware
- ESP32-C3 DevKitC
- 4x Brushed DC Motors (DRV8833 driver)
- Pinout: M1(4,3) M2(1,5) M3(2,0) M4(18,19)

## Quick Start
1. Install **PlatformIO** (VS Code extension)
2. Open folder in VS Code
3. `pio run --target upload`
4. `pio device monitor` (115200 baud)

## Test Sequence
1. **test1_individual_motors.ino** - Each motor spins individually
2. **test2_direction_test.ino** - Verify CW/CCW props  
3. **test3_speed_sweep.ino** - 0-100% throttle test
4. **test4_hover_balance.ino** - All motors equal throttle
5. **test5_serial_control.ino** - Serial commands (1,2,3,4,0)
6. **test6_ramp_test.ino** - Smooth acceleration/deceleration
7. **test7_emergency_stop.ino** - Type 'x' for instant emergency stop
8. **test8_bluetooth_ready.ino** - Bluetooth app commands (M1ON, STOP)
