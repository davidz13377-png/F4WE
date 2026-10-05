cmake_minimum_required(VERSION 3.22.1)

project(f4we_discord_presence LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(discord_partner_sdk REQUIRED CONFIG)
find_library(log-lib log)

add_library(f4we_discord_presence SHARED discord_presence.cpp)

target_link_libraries(
  f4we_discord_presence
  discord_partner_sdk::discord_partner_sdk
  ${log-lib}
)
