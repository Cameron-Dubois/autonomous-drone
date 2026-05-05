idf_component_register(SRCS "main.c" "gps_nmea.c" "compass_mag.c"
                       REQUIRES esp_driver_gpio esp_driver_uart esp_driver_i2c freertos log
                       INCLUDE_DIRS ".")
