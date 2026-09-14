cmake_minimum_required(VERSION 3.15)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

project(WasmTransferEngine)

set(CMAKE_CXX_STANDARD 17)

add_subdirectory(core)
add_subdirectory(bindings)
