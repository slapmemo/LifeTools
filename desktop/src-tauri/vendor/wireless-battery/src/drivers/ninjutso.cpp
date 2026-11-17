// Ninjutso Sora V2 1K receiver. Protocol from NinjaForce's bundled
// out/renderer/assets/createSoraV2-DL6g5ddD.js, createSorav2.readState().
// Feature report 05, command 15: [9] battery (0 means 100%), [10] charging,
// [12] online. Indices include the report ID, as in WebHID's returned DataView.
#include "drivers.h"

void PollNinjutso(PollContext& ctx) {
    constexpr USHORT vid = 0x1915, pid = 0xAE1C;
    if (ctx.IsClaimed(vid, pid)) return;
    for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
             return c.page() == 0xFFA0 && c.usage() == 1 && c.featLen() >= 32;
         })) {
        HidDev d;
        if (!d.OpenFeatureOnly(*c)) continue;
        std::vector<BYTE> req(32, 0);
        req[0] = 0x05;
        req[1] = 0x15;
        req[4] = 1;
        DeviceStatus s;
        bool answered = false;
        for (int attempt = 0; attempt < 4; ++attempt) {
            if (attempt) Sleep(90);
            if (!d.SetFeature(req)) break;
            Sleep(15);
            std::vector<BYTE> r;
            if (!d.GetFeature(0x05, r) || r.size() < 13 || r[0] != 0x05 || r[1] != 0x15 || r[9] > 100) continue;
            answered = true;
            s.connected = r[12] != 0;
            s.percent = s.connected ? (r[9] == 0 ? 100 : r[9]) : -1;
            s.charging = s.connected && r[10] != 0;
            if (s.connected) break;
        }
        if (!answered) continue;
        s.key = L"ninjutso:" + Hex4(vid) + L":" + Hex4(pid);
        s.name = L"Ninjutso Sora V2";
        s.kind = DeviceKind::Mouse;
        s.via = L"2.4 GHz receiver";
        ctx.Add(s, vid, pid);
        break;
    }
}
