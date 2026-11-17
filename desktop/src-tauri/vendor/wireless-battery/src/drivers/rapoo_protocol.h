#pragma once
// Passive Rapoo status reports, including the report ID (hidapi/Win32 convention).
// Kept independent of Win32 so captured frames can be checked without a mouse.
#include <cstddef>
#include <cstdint>

namespace Rapoo {

enum class Connection { Unknown, Receiver, Bluetooth, Cable };
enum class Profile { Nordic54L, LegacyVT3Pro };

struct Battery {
    int percent = -1;
    bool charging = false;
    Connection connection = Connection::Unknown;
    std::uint16_t mousePid = 0;
};

inline bool DecodeBattery(const std::uint8_t* data, std::size_t size, Battery& out,
                          Profile profile = Profile::Nordic54L) {
    if (!data || !size) return false;
    Battery result;
    unsigned state = 0, percent = 0;
    if (profile == Profile::Nordic54L && data[0] == 0x07) {
        // Nordic 54L: mode, DPI gear, X/Y DPI, battery state, percentage.
        if (size < 9 || (data[1] & 0x0F) > 2) return false;
        switch (data[1] & 0x0F) {
        case 0: result.connection = Connection::Receiver; break;
        case 1: result.connection = Connection::Bluetooth; break;
        case 2: result.connection = Connection::Cable; break;
        }
        state = data[7];
        percent = data[8];
        if (size >= 15) result.mousePid = (std::uint16_t)(data[13] | (data[14] << 8));
    } else if (profile == Profile::LegacyVT3Pro && data[0] == 0xBB) {
        // VT3 Pro firmware: BB B0 mode DPI-lo DPI-hi battery-state percentage.
        if (size < 7 || data[1] != 0xB0) return false;
        state = data[5];
        percent = data[6];
    } else {
        return false;
    }
    // 0 = invalid/transition. Some older firmware uses 7F instead of a level while charging.
    if (state != 1 && state != 2) return false;
    if (percent > 100 && !(profile == Profile::LegacyVT3Pro && state == 2 && percent == 0x7F)) return false;
    result.charging = state == 2;
    if (percent <= 100) result.percent = (int)percent;
    out = result;
    return true;
}

}  // namespace Rapoo
