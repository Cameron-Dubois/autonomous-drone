idf_component_register(SRCS "main.c"
                       REQUIRES esp_driver_ledc esp_driver_gpio esp_driver_uart
                       PRIV_REQUIRES spi_flash
                       INCLUDE_DIRS "")
