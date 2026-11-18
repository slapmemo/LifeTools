#pragma once
// Pure (I/O-free) parts of the Logitech G435 protocol on the newer 046D:0ADF LIGHTSPEED dongle:
// CRC-16 framing of the 64-byte vendor reports, "PA" commands and the GET_BATTERY reply.
// Kept independent of Win32 so the framing and the parser can be tested without the headset.
// Protocol: github.com/portyporty/g435-battery-percentage (MIT), also used by
// github.com/deddroid/logitech-g435-battery.
#include <array>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <vector>

namespace G435Adf {

// CRC-16/XMODEM (poly 0x1021, init 0).
inline std::uint16_t Crc16(const std::uint8_t* data, std::size_t size) {
    std::uint16_t crc = 0;
    for (std::size_t i = 0; i < size; i++) {
        crc ^= (std::uint16_t)(data[i] << 8);
        for (int b = 0; b < 8; b++) crc = (crc & 0x8000) ? (std::uint16_t)((crc << 1) ^ 0x1021) : (std::uint16_t)(crc << 1);
    }
    return crc;
}

// 64-byte frame: <cmd> <body length> <crc lo> <crc hi> <body...>, zero-padded. The CRC covers the
// whole frame with the CRC field zeroed.
inline std::array<std::uint8_t, 64> Frame(std::uint8_t cmd, const std::vector<std::uint8_t>& body) {
    std::array<std::uint8_t, 64> f{};
    f[0] = cmd;
    f[1] = (std::uint8_t)body.size();
    for (std::size_t i = 0; i < body.size() && i + 4 < f.size(); i++) f[4 + i] = body[i];
    std::uint16_t crc = Crc16(f.data(), f.size());
    f[2] = (std::uint8_t)(crc & 0xFF);
    f[3] = (std::uint8_t)(crc >> 8);
    return f;
}

// "PA" command for the headset's radio SoC: 50 41 <category> <seq> <length field> <payload...>.
inline std::vector<std::uint8_t> Pa(std::uint8_t category, std::uint8_t seq, std::uint8_t len,
                                    std::initializer_list<std::uint8_t> payload) {
    std::vector<std::uint8_t> cmd = { 0x50, 0x41, category, seq, len };
    cmd.insert(cmd.end(), payload);
    return cmd;
}

// Battery voltage from the GET_BATTERY reply (pattern 00 07 00 06 <seq> 00 <mV lo> <mV hi>, as
// matched by portyporty). Returns -1 when absent or not a plausible Li-Po voltage.
inline int ParseMillivolts(const std::uint8_t* data, std::size_t size) {
    for (std::size_t i = 0; i + 8 <= size; i++) {
        if (data[i] == 0x00 && data[i + 1] == 0x07 && data[i + 2] == 0x00 && data[i + 3] == 0x06 && data[i + 5] == 0x00) {
            int mv = data[i + 6] | (data[i + 7] << 8);
            if (mv >= 2500 && mv <= 4500) return mv;
        }
    }
    return -1;
}

// Voltage -> % for the G435 Li-Po cell (portyporty's curve), piecewise-linear.
inline int Percent(int mv) {
    static const int v[] = { 4200, 4150, 4100, 4050, 4000, 3950, 3900, 3850, 3800, 3750, 3700, 3650, 3600, 3550, 3500, 3400 };
    static const int p[] = { 100, 95, 90, 85, 80, 75, 70, 62, 55, 45, 35, 25, 15, 10, 5, 0 };
    if (mv >= v[0]) return 100;
    for (int i = 1; i < 16; i++)
        if (mv >= v[i]) return p[i] + ((p[i - 1] - p[i]) * (mv - v[i]) + (v[i - 1] - v[i]) / 2) / (v[i - 1] - v[i]);
    return 0;
}

}  // namespace G435Adf
