#source files for the main component
#
# Active app entry: main.c (full PID + IMU + BLE flight controller).
# Bring-up entries (swap one for "main.c" temporarily for hardware checks):
#   main_motor_test.c — spin each ESC channel, verify wiring/direction.
#   main_imu_test.c   — print IMU stream, verify sensor.
set(srcs "main.c"
         "icm42670p.c"
         "pid.c"
         "motor.c"
         "ble_command.c")

#register this component and declare its dependencies
#esp_driver_i2c   - IMU
#esp_driver_gpio  - BOOT button + pin config
#esp_driver_ledc  - brushless ESC PWM
#bt + nvs_flash   - NimBLE BLE command server (ble_command.c)
idf_component_register(SRCS "${srcs}"
                       INCLUDE_DIRS "."
                       REQUIRES esp_driver_i2c esp_driver_gpio esp_driver_ledc
                                bt nvs_flash
                       PRIV_REQUIRES esp_timer)
