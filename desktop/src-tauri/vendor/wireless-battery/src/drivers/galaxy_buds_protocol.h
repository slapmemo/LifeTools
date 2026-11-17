#pragma once
// Samsung Galaxy Buds status frames, as sent over the Bluetooth RFCOMM (SPP) link.
// Kept independent of Win32 so captured frames can be checked without the earbuds.
//
// Frame (Buds+ and later):  FD [size lo][size hi | flags] [id] [payload...] [crc lo][crc hi] DD
// Frame (original Buds):    FE [type] [size] [id] [payload...] [crc lo][crc hi] EE
//   size  = id + payload + crc (low 10 bits of the 16-bit header); header bit 0x2000 = fragment
//   crc   = CRC-16/XMODEM (poly 0x1021, init 0) over id + payload, little-endian
// Messages carrying the battery levels (pushed by the earbuds, nothing has to be sent):
//   0x60 STATUS_UPDATED           payload[1] = left %, [2] = right %, [6] = case % (not on the original Buds)
//   0x61 EXTENDED_STATUS_UPDATED  payload[2] = left %, [3] = right %, [7] = case % (not on the original Buds)
// A level of 0 means that part is not connected (earbud out of range, case closed / unknown);
// the Buds+ report 101 for an unknown case level.
// Source: GalaxyBudsClient (timschneeb/GalaxyBudsClient), Message/SppMessage.cs, Utils/Crc16.cs,
// Message/Decoder/StatusUpdateDecoder.cs and ExtendedStatusUpdateDecoder.cs.
#include <cstddef>
#include <cstdint>

namespace GalaxyBuds {

constexpr std::uint8_t kStatusUpdated = 0x60;
constexpr std::uint8_t kExtendedStatusUpdated = 0x61;

struct Status {
    int left = -1;       // -1 = not reported / not connected
    int right = -1;
    int caseLevel = -1;
};

inline std::uint16_t Crc16(const std::uint8_t* data, std::size_t size) {
    std::uint16_t crc = 0;
    for (std::size_t i = 0; i < size; i++) {
        crc ^= (std::uint16_t)(data[i] << 8);
        for (int b = 0; b < 8; b++) crc = (crc & 0x8000) ? (std::uint16_t)((crc << 1) ^ 0x1021) : (std::uint16_t)(crc << 1);
    }
    return crc;
}

inline int Level(std::uint8_t v) { return v >= 1 && v <= 100 ? v : -1; }

// Scans a received byte stream for status frames and keeps the levels of the last valid one.
// `legacy` selects the original Galaxy Buds framing. Returns true when a status frame was found.
inline bool FindStatus(const std::uint8_t* data, std::size_t size, bool legacy, Status& out) {
    const std::uint8_t som = legacy ? 0xFE : 0xFD, eom = legacy ? 0xEE : 0xDD;
    bool found = false;
    for (std::size_t i = 0; data && i + 6 <= size; i++) {
        if (data[i] != som) continue;
        std::size_t len;
        if (legacy) {
            len = data[i + 2];
        } else {
            unsigned header = data[i + 1] | (data[i + 2] << 8);
            if (header & 0x2000) continue;  // fragments only carry firmware data
            len = header & 0x3FF;
        }
        if (len < 3 || i + 3 + len >= size || data[i + 3 + len] != eom) continue;
        const std::uint8_t* body = data + i + 3;  // id, payload, crc
        std::uint16_t crc = (std::uint16_t)(body[len - 2] | (body[len - 1] << 8));
        if (Crc16(body, len - 2) != crc) continue;
        const std::uint8_t id = body[0];
        const std::uint8_t* p = body + 1;
        const std::size_t plen = len - 3;
        Status s;
        if (id == kExtendedStatusUpdated && plen >= 4) {
            s.left = Level(p[2]);
            s.right = Level(p[3]);
            if (!legacy && plen >= 8) s.caseLevel = Level(p[7]);
        } else if (id == kStatusUpdated && plen >= 3) {
            s.left = Level(p[1]);
            s.right = Level(p[2]);
            if (!legacy && plen >= 7) s.caseLevel = Level(p[6]);
        } else {
            continue;
        }
        out = s;
        found = true;
        i += 3 + len;  // skip past this frame's EOM
    }
    return found;
}

}  // namespace GalaxyBuds
