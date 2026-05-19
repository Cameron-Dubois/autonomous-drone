#pragma once

/** Start onboard motor ramp (up then down). No-op if already running. */
void demo_takeoff_start(void);

/** Abort an in-progress ramp and zero motors. */
void demo_takeoff_abort(void);
