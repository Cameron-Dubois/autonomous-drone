/*
 * wifi_link.h - SoftAP + UDP control link
 *
 * Wire format (little-endian, 16 bytes total):
 *   uint8_t  magic[2]   = {'D','C'}   // "Drone Control"
 *   uint8_t  version    = 1
 *   uint8_t  flags      // bit0 = arm
 *   int16_t  throttle   //  0 .. 1000   (per-mil)
 *   int16_t  roll       // -500 .. 500  (per-mil of stick)
 *   int16_t  pitch      // -500 .. 500
 *   int16_t  yaw        // -500 .. 500
 *   uint32_t seq        // monotonic counter
 *
 * If you add fields, bump version and keep the magic header so old
 * ground stations are rejected cleanly.
 */
#ifndef WIFI_LINK_H_
#define WIFI_LINK_H_

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

typedef struct {
    bool  armed;
    float throttle;     /* [0, 1]   */
    float roll;         /* [-1, 1]  */
    float pitch;        /* [-1, 1]  */
    float yaw;          /* [-1, 1]  */
    uint32_t seq;
    int64_t  ts_us;     /* esp_timer_get_time() at receipt */
} ctrl_input_t;

esp_err_t wifi_link_init(void);

/* Returns the most recent control input.  Output is zeroed (and armed=false)
 * if no packet has arrived for CTRL_TIMEOUT_MS -- treat that as failsafe. */
void wifi_link_get_latest(ctrl_input_t *out);

/* Returns true iff we've heard from the ground station within the
 * failsafe window. */
bool wifi_link_is_alive(void);

/* Send a small telemetry blob back to whichever client most recently
 * sent us a control packet.  Safe to call from the flight task. */
void wifi_link_send_telemetry(float roll_deg, float pitch_deg, float yaw_deg,
                              float throttle, bool armed, uint32_t loop_us);

#endif /* WIFI_LINK_H_ */
