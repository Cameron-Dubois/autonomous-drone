idf_component_register(SRCS "main.c" "motor.c"
                       REQUIRES esp_driver_gpio esp_timer esp_hw_support esp_rom freertos
                       INCLUDE_DIRS ".")
