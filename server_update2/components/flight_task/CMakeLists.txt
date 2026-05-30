idf_component_register(
    SRCS "flight_task.c"
    INCLUDE_DIRS "include"
    REQUIRES imu attitude motors pid mixer wifi_link esp_timer config esp_system
    PRIV_REQUIRES esp_common
)
