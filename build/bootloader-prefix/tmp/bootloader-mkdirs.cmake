# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file Copyright.txt or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION 3.5)

file(MAKE_DIRECTORY
  "/home/stephenwb/esp/esp-idf/components/bootloader/subproject"
  "/home/stephenwb/Projects/autonomous-drone/build/bootloader"
  "/home/stephenwb/Projects/autonomous-drone/build/bootloader-prefix"
  "/home/stephenwb/Projects/autonomous-drone/build/bootloader-prefix/tmp"
  "/home/stephenwb/Projects/autonomous-drone/build/bootloader-prefix/src/bootloader-stamp"
  "/home/stephenwb/Projects/autonomous-drone/build/bootloader-prefix/src"
  "/home/stephenwb/Projects/autonomous-drone/build/bootloader-prefix/src/bootloader-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "/home/stephenwb/Projects/autonomous-drone/build/bootloader-prefix/src/bootloader-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "/home/stephenwb/Projects/autonomous-drone/build/bootloader-prefix/src/bootloader-stamp${cfgdir}") # cfgdir has leading slash
endif()
