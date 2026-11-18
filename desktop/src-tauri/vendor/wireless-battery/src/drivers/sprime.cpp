// Sprime PM1 wireless mouse (Nordic vendor id 1915), on its 2.4 GHz receiver or the USB cable.
// Protocol from Sprime's web driver (sprime.pro): the same feature report 05, command 15 status
// query as the Ninjutso Sora V2 (see ninjutso.cpp).
//   SET_FEATURE report 5, 31 payload bytes: [05][15][00][00][01][00 ...]
//   GET_FEATURE report 5: [05][15] .. [9] percent, [10] charging, [11] fully charged, [12] online.
//   Indices include the report ID, as in WebHID's returned DataView.
// Product ids from the web driver's WebHID filters: mouse on the cable AC11 (black) / AC12 (white) /
// AC13 (red); receivers AC1C and AD8C. The bootloader (AC0B) is never touched.
#include "drivers.h"

namespace {

bool IsCable(USHORT pid) { return pid == 0xAC11 || pid == 0xAC12 || pid == 0xAC13; }
bool IsReceiver(USHORT pid) { return pid == 0xAC1C || pid == 0xAD8C; }

}  // namespace

void PollSprime(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x1915)) {
        if (!IsCable(pid) && !IsReceiver(pid)) continue;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.page() == 0xFFA0 && c.usage() == 1 && c.featLen() >= 32;
             })) {
            HidDev d;
            if (!d.OpenFeatureOnly(*c)) continue;
            std::vector<BYTE> req(32, 0);
            req[0] = 0x05;  // report id
            req[1] = 0x15;  // status query
            req[4] = 0x01;
            bool cable = IsCable(pid);
            DeviceStatus s;
            bool answered = false;
            for (int attempt = 0; attempt < 4; ++attempt) {
                if (attempt) Sleep(90);
                if (!d.SetFeature(req)) break;
                Sleep(15);
                std::vector<BYTE> r;
                if (!d.GetFeature(0x05, r) || r.size() < 13 || r[0] != 0x05 || r[1] != 0x15 || r[9] > 100) continue;
                answered = true;
                bool full = r[11] != 0;
                s.connected = cable || r[12] != 0;  // receiver present, mouse off or out of range
                s.percent = !s.connected ? -1 : full ? 100 : r[9];
                s.charging = s.connected && r[10] != 0 && !full;
                if (s.connected) break;
            }
            if (!answered) continue;
            s.key = L"sprime:" + Hex4(vid) + L":" + Hex4(pid);
            s.name = L"Sprime PM1";
            s.kind = DeviceKind::Mouse;
            s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
            ctx.Add(s, vid, pid);
            break;
        }
    }
}
