#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool valid;
    double lat_deg;
    double lon_deg;
    int fix_quality;
    int satellites;
    float hdop;
} gps_fix_t;

void gps_uart_init(void);

/** Call often from a task: drains UART and updates last GGA fix snapshot. */
void gps_uart_poll(void);

void gps_get_fix(gps_fix_t *out);

/** Monotonic RX byte count + number of GGA sentences parsed (for bring-up debug). */
typedef struct {
    uint32_t rx_bytes_total;
    uint32_t gga_parsed_count;
} gps_stats_t;

void gps_get_stats(gps_stats_t *out);
