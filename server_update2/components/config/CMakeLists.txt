# Header-only component: shared hardware/control configuration.
# Other components REQUIRE this to pick up app_config.h.
idf_component_register(
    INCLUDE_DIRS "include"
)
