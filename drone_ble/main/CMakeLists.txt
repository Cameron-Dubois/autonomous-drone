set(srcs "main.c"
         "gatt_svr.c"
         "motor.c")

idf_component_register(SRCS "${srcs}"
                       INCLUDE_DIRS "."
                       REQUIRES esp_driver_ledc esp_driver_gpio nvs_flash bt)
