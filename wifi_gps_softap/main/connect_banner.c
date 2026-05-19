#include "connect_banner.h"

#include "bleprph.h"

static uint8_t s_last_nav_banner = 0xFF;

/** Only autonomy / nav intents get the big banner (not motors, heartbeat, etc.). */
static bool drone_cmd_is_nav_banner(uint8_t cmd)
{
    switch (cmd) {
    case DRONE_CMD_NAV_ROTATE_CW:
    case DRONE_CMD_NAV_ROTATE_CCW:
    case DRONE_CMD_NAV_FORWARD:
    case DRONE_CMD_NAV_BACKWARD:
    case DRONE_CMD_NAV_HOLD:
    case DRONE_CMD_NAV_IDLE:
        return true;
    default:
        return false;
    }
}

static const char *drone_nav_banner_label(uint8_t cmd)
{
    switch (cmd) {
    case DRONE_CMD_NAV_ROTATE_CW:
        return "ROTATE";
    case DRONE_CMD_NAV_ROTATE_CCW:
        return "ROTATE";
    case DRONE_CMD_NAV_FORWARD:
        return "FORWARD";
    case DRONE_CMD_NAV_BACKWARD:
        return "RETREAT";
    case DRONE_CMD_NAV_HOLD:
        return "HOLD";
    case DRONE_CMD_NAV_IDLE:
        return "IDLE";
    default:
        return NULL;
    }
}

void drone_command_banner_reset(void)
{
    s_last_nav_banner = 0xFF;
}

void drone_command_banner_if_changed(uint8_t cmd)
{
    if (!drone_cmd_is_nav_banner(cmd)) {
        return;
    }

    /* CW vs CCW both display "ROTATE" — treat as one intent for dedup. */
    uint8_t dedup_key = cmd;
    if (cmd == DRONE_CMD_NAV_ROTATE_CW || cmd == DRONE_CMD_NAV_ROTATE_CCW) {
        dedup_key = DRONE_CMD_NAV_ROTATE_CW;
    }

    if (dedup_key == s_last_nav_banner) {
        return;
    }
    s_last_nav_banner = dedup_key;

    const char *label = drone_nav_banner_label(cmd);
    if (label == NULL) {
        return;
    }

    ESP_LOGI(CONN_BANNER_TAG,
             "\n" CONN_BANNER_BLUE
             "========================================\n"
             "  COMMAND: %-24s\n"
             "========================================\n" CONN_BANNER_RESET,
             label);
}
