#top-level project file for FlightGear hardware-in-the-loop testing
#runs the same PID + mixer logic as flight_control but over UART instead of real hardware
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(flight-sim)
