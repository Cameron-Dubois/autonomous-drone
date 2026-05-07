# SoftAP + GPS UART + I2C compass (merged from drone_wifi/softAP and gps_bringup).
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(wifi_gps_softap)
