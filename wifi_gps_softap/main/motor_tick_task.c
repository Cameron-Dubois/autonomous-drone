#include "motor.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static void motor_tick_task(void *arg)
{
    (void)arg;
    while (1) {
        motors_tick();
        esp_rom_delay_us(300);
    }
}

void motors_start_background_tick(void)
{
    xTaskCreate(motor_tick_task, "dshot_tick", 2048, NULL, 3, NULL);
}
