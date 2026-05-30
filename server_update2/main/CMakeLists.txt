# main/ holds only boot orchestration.  Real work lives in components/.
idf_component_register(
    SRCS "app_main.c"
    INCLUDE_DIRS "."
    REQUIRES imu motors wifi_link flight_task
)
