cmake_minimum_required(VERSION 3.22.1)

project(appmodules LANGUAGES CXX)

# Keep React Native's New Architecture entry point and every autolinked
# TurboModule/Fabric component. Replacing this setup makes core modules such as
# PlatformConstants disappear at runtime even though the APK still compiles.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

find_package(discord_partner_sdk REQUIRED CONFIG)
find_library(log-lib log)

add_library(
  f4we_discord_presence
  SHARED
  ../cpp/discord_presence.cpp
)

target_link_libraries(
  f4we_discord_presence
  discord_partner_sdk::discord_partner_sdk
  ${log-lib}
)
