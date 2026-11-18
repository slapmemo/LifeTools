// Ninjutso mice:
//  * Sora V2, on its 1K receiver (1915:AE1C) or the USB cable (1915:AE11): NinjaForce bundled
//    out/renderer/assets/createSoraV2-DL6g5ddD.js, createSorav2.readState(). Feature report 05,
//    command 15: [9] battery (0 means 100%), [10] charging, [12] online. Indices include the report ID,
//    as in WebHID's returned DataView. On the cable the same query answers with [12] = 0 (tested on a
//    Sora V2), so the mouse counts as connected there, as with the Sprime PM1 (see sprime.cpp).
//    The "0 means 100%" rule is applied on the cable too; a full battery on the cable has not been captured yet.
//  * Ten / Ten Air (093A:EB01 receiver, 093A:E020 USB cable): NinjaForce (https://www.ninjaforce.co/)
//    and https://github.com/DrStopor/ninjutso-battery-tray. Feature report 06 (16 bytes) on
//    FF01:0001; commands 0x13 (online), 0x12 (battery %), 0x11 (charging), value at byte 8.
//    Verified on Ninjutso Ten Air (093A:EB01 and 093A:E020).
#include "drivers.h"

namespace {

bool QueryTen(HidDev& d, BYTE cmd, BYTE& value) {
    std::vector<BYTE> q(16, 0), r;
    q[0] = 0x06;
    q[1] = cmd;
    q[4] = 1;
    if (!d.SetFeature(q)) return false;
    for (int attempt = 0; attempt < 3; ++attempt) {
        Sleep(30);
        if (d.GetFeature(0x06, r) && r.size() == 16 && r[0] == 0x06 && r[1] == cmd) {
            value = r[8];
            return true;
        }
    }
    return false;
}

void PollTen(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x093A)) {
        if (pid != 0xEB01 && pid != 0xE020) continue;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.page() == 0xFF01 && c.usage() == 1 && c.featLen() == 16;
             })) {
            HidDev d;
            if (!d.OpenFeatureOnly(*c)) continue;
            BYTE online = 0, percent = 0, charging = 0;
            if (!QueryTen(d, 0x13, online) || online != 1 || !QueryTen(d, 0x12, percent) || percent > 100 ||
                !QueryTen(d, 0x11, charging))
                continue;
            DeviceStatus s;
            s.key = L"ninjutso-ten:" + Hex4(pid);
            s.name = HidProduct(*c);
            if (s.name.empty()) s.name = L"Ninjutso Ten / Ten Air";
            s.kind = DeviceKind::Mouse;
            s.via = pid == 0xE020 ? L"USB cable" : L"2.4 GHz receiver";
            s.percent = percent;
            s.charging = charging != 0;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}

}  // namespace

void PollNinjutso(PollContext& ctx) {
    constexpr USHORT vid = 0x1915, receiverPid = 0xAE1C, cablePid = 0xAE11;
    for (USHORT pid : { receiverPid, cablePid }) {
        if (ctx.IsClaimed(vid, pid)) continue;
        bool cable = pid == cablePid;
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
                s.connected = cable || r[12] != 0;
                s.percent = s.connected ? (r[9] == 0 ? 100 : r[9]) : -1;
                s.charging = s.connected && r[10] != 0;
                if (s.connected) break;
            }
            if (!answered) continue;
            s.key = L"ninjutso:" + Hex4(vid) + L":" + Hex4(pid);
            s.name = L"Ninjutso Sora V2";
            s.kind = DeviceKind::Mouse;
            s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
            ctx.Add(s, vid, pid);
            break;
        }
    }
    PollTen(ctx);
}
