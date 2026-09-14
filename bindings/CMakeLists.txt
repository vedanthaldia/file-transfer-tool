add_executable(engine WasmBindings.cpp)

target_link_libraries(engine PRIVATE libtransfer)

target_compile_options(engine PRIVATE -O3)

target_link_options(engine PRIVATE
    "-lembind"
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-sEXPORT_NAME=createEngineModule"
    "-sALLOW_MEMORY_GROWTH=1"
    "-O3"
)

set_target_properties(engine PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/web"
    SUFFIX ".js"
)
