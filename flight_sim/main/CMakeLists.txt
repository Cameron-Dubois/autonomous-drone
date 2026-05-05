set(srcs "main.c"
         "pid.c"
         "hil_link.c")

idf_component_register(SRCS "${srcs}"
                       INCLUDE_DIRS "."
                       REQUIRES driver esp_driver_usb_serial_jtag
                       PRIV_REQUIRES esp_timer)
