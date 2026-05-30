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

void wifi_link_get_latest(ctrl_input_t *out);

bool wifi_link_is_alive(void);

void wifi_link_send_telemetry(float roll_deg, float pitch_deg, float yaw_deg,
                              float throttle, bool armed, uint32_t loop_us);

#endif /* WIFI_LINK_H_ */
