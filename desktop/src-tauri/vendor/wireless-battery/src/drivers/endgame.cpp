// Endgame Gear 4K wireless mice (OP1w 4k v1/v2, XM2w 4k v1/v2) on the shared 4K dongle 3367:1970.
// Protocol from github.com/johanneszab/vole (re/PROTOCOL.md, verified on OP1w 4k v1 and v2 with
// dongle FW 1.01) and github.com/Janlhin/Endgame_Gear_Web_Configurator (src/session.ts, transport.ts):
//   Config channel = vendor collection FF01:0002, feature report A1 (64 bytes, no checksum):
//     [A1][cmd][target][payload len][00 ...], payload from byte 16.
//   SET_FEATURE the request, wait ~150 ms, GET_FEATURE report A1. Reply byte 1 is the status:
//     01 ok, 03 busy (read again), 08 / 11 mouse asleep or out of range.
//   B4 (battery):    reply[16] = percent. No charging flag is decoded for this family.
//   0E (mouse info): reply[16..17] = 67 33 (VID), reply[18..19] = mouse PID, little endian.
//   0F (probe):      after a failed command the dongle stays silent until a 0F gets through, so we
//                    send it only on failure (sending it every poll keeps the mouse from sleeping).
// Only these read commands are used; the write / reset / re-pair commands are never sent.
// The older XM2we / OP1we "WE" family uses a different 17-byte protocol and is not handled here.
#include "drivers.h"

#include <map>
#include <string>

namespace {

const USHORT kVid = 0x3367;
const USHORT kDongle4K = 0x1970;

const wchar_t* MouseName(USHORT pid) {
    switch (pid) {
        case 0x1972: return L"Endgame Gear OP1w 4k";
        case 0x1984: return L"Endgame Gear OP1w 4k v2";
        case 0x1968: return L"Endgame Gear XM2w 4k";
        case 0x1982: return L"Endgame Gear XM2w 4k v2";
        default: return nullptr;
    }
}

// Sends one command and returns the reply (out[0] = A1). Returns the status byte, or -1 on I/O error.
int Command(HidDev& d, BYTE cmd, BYTE target, std::vector<BYTE>& r) {
    std::vector<BYTE> req(64, 0);
    req[0] = 0xA1;
    req[1] = cmd;
    req[2] = target;
    if (!d.SetFeature(req)) return -1;
    for (int attempt = 0; attempt < 3; ++attempt) {
        Sleep(150 + attempt * 100);
        if (!d.GetFeature(0xA1, r) || r.size() < 20 || r[0] != 0xA1) return -1;
        if (r[1] != 0x03) return r[1];  // 03 = busy, read again
    }
    return 0x03;
}

}  // namespace

void PollEndgame(PollContext& ctx) {
    static std::map<std::wstring, const wchar_t*> lastName;  // by dongle path: the mouse only identifies itself while awake
    if (ctx.IsClaimed(kVid, kDongle4K)) return;
    for (const HidColl* c : ctx.Find(kVid, kDongle4K, [](const HidColl& c) { return c.page() == 0xFF01 && c.usage() == 0x0002 && c.featLen() >= 64; })) {
        HidDev d;
        if (!d.OpenFeatureOnly(*c)) continue;
        std::vector<BYTE> r;
        int st = Command(d, 0xB4, 0x00, r);
        if (st != 0x01 && st != 0x08 && st != 0x11) {
            // Unexpected status or no answer: probe the dongle and the mouse once, then retry.
            std::vector<BYTE> p;
            Command(d, 0x0F, 0x01, p);
            Command(d, 0x0F, 0x0F, p);
            st = Command(d, 0xB4, 0x00, r);
        }
        bool awake = st == 0x01 && r[16] <= 100;
        bool asleep = st == 0x08 || st == 0x11;
        if (!awake && !asleep) continue;

        DeviceStatus s;
        s.key = L"endgame:" + Hex4(kDongle4K);
        s.kind = DeviceKind::Mouse;
        s.via = L"2.4 GHz receiver";
        s.asleep = asleep;  // 08 / 11: the mouse sleeps or is off; shown dimmed with the last known value
        if (awake) {
            s.percent = r[16];
            std::vector<BYTE> info;
            if (Command(d, 0x0E, 0x00, info) == 0x01 && info[16] == 0x67 && info[17] == 0x33) {
                const wchar_t* n = MouseName((USHORT)(info[18] | (info[19] << 8)));
                if (n) lastName[c->path] = n;
            }
        }
        auto it = lastName.find(c->path);
        s.name = it != lastName.end() ? it->second : L"Endgame Gear 4k wireless mouse";
        ctx.Add(s, kVid, kDongle4K);
        break;
    }
}
