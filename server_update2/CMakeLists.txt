# Top-level project CMakeLists.txt for ESP-IDF
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

# Target the ESP32-C3 (RISC-V single core)
set(IDF_TARGET "esp32c3")

project(esp32c3_drone)
