#ifndef FLIGHT_TASK_H_
#define FLIGHT_TASK_H_
#include "esp_err.h"

/* Spawn the high-priority flight task.  Call after imu_init,
 * motors_init, and wifi_link_init have returned ESP_OK. */
esp_err_t flight_task_start(void);

#endif /* FLIGHT_TASK_H_ */
