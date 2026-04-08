#source files for the main component
set(srcs "main.c"
         "icm42670p.c")

#register this component and declare its dependencies
#esp_driver_i2c: needed for talking to the IMU over I2C
#esp_driver_gpio: needed for pin configuration
idf_component_register(SRCS "${srcs}"
                       INCLUDE_DIRS "."
                       REQUIRES esp_driver_i2c esp_driver_gpio)
