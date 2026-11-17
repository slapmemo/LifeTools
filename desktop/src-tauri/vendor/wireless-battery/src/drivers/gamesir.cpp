// GameSir Nova Lite / Nova 2 / Nova 2 Lite on the 2.4 GHz receiver (3537:1098) or a USB cable.
// XInput reports these as a wired pad, so the battery is read from the vendor collection
// (usage page FF7A, 64-byte reports, no report ID) with the "device info" query GameSir's own
// client uses:
//   Request: 01 01
//   Reply:   [0]=01, [1..5] receiver address, [10..11] receiver firmware, [18] battery:
//            0..100 percent, FF = charging (no percentage while on the cable)
// Unsolicited "F4 00" state frames arrive on the same collection and are skipped.
// Protocol reference: github.com/WWWyyy452/GamesirBatteryTray and
// github.com/AJAY0406/Gamesir-Nova-2-Lite-Battery-Detection (both MIT).
//
// Cyclone 2 (3537:100B, XInput mode, 2.4 GHz receiver or cable): XInput reports it as wired, so the
// battery is read from the vendor collection FFF0:0040 (64-byte reports, ids 0F out / 12 in):
//   Request: 0F 03 (read-only; it makes the pad stream state frames)
//   Reply:   input report 12: [35] = cable/charging flag, [36] = battery percent (0..100)
// Protocol reference: github.com/vdemonchy/cyclone2-linux (docs/protocol.md); confirmed on a real
// Cyclone 2 (the level was read while on battery).
#include "drivers.h"

namespace {

const USHORT kVid = 0x3537;

// 1098: receiver with a controller linked (it re-enumerates under another id when the pad is off).
// 100F: Nova 2 Lite on a cable.
bool IsNova(USHORT pid) { return pid == 0x1098 || pid == 0x100F || pid == 0x1040; }  // 1040: Nova Lite 2 receiver (issue #47, same FF7A collection; untested)
// 100B: Cyclone 2 with the controller linked or on a cable (the receiver is 0575 while no pad is on).
bool IsCyclone2(USHORT pid) { return pid == 0x100B; }

}  // namespace

void PollGameSir(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(kVid)) {
        if (!IsNova(pid)) continue;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) { return c.page() == 0xFF7A && c.outLen() >= 3; })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            d.Flush();
            if (!d.Write({ 0x00, 0x01, 0x01 })) continue;
            std::vector<BYTE> r;
            bool found = false;
            ULONGLONG end = GetTickCount64() + 800;
            while (!found && (LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
                if (d.Read(r, 200) < 19) continue;
                if (r[0] != 0x01) continue;  // state frame (F4 00 ...) or anything else
                found = true;
            }
            if (!found || (r[18] > 100 && r[18] != 0xFF)) continue;
            DeviceStatus s;
            s.key = L"gamesir:" + Hex4(pid);
            s.name = L"GameSir Nova";
            s.kind = DeviceKind::Gamepad;
            s.via = pid == 0x100F ? L"USB cable" : L"2.4 GHz receiver";
            if (r[18] == 0xFF) s.charging = true;  // percent stays -1: the last known value is kept
            else s.percent = r[18];
            ctx.Add(s, vid, pid);
            break;
        }
    }
}

void PollGameSirCyclone(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(kVid)) {
        if (!IsCyclone2(pid)) continue;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) { return c.page() == 0xFFF0 && c.usage() == 0x0040 && c.outLen() >= 3 && c.inLen() >= 37; })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            d.Flush();
            if (!d.Write({ 0x0F, 0x03 })) continue;
            std::vector<BYTE> r;
            bool found = false;
            ULONGLONG end = GetTickCount64() + 1500;
            while (!found && (LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
                if (d.Read(r, 200) < 37) continue;
                found = r[0] == 0x12 && r[36] <= 100;  // the 0x10 event reports carry no battery
            }
            if (!found) continue;
            DeviceStatus s;
            s.key = L"gamesir:" + Hex4(pid);
            s.name = L"GameSir Cyclone 2";
            s.kind = DeviceKind::Gamepad;
            s.via = L"2.4 GHz receiver or USB";
            s.percent = r[36];
            s.charging = r[35] == 1;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}
