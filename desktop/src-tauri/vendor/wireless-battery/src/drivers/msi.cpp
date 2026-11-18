// MSI VERSA 300 ELITE WIRELESS on its 2.4 GHz dongle (0DB0:9E22), vendor collection FF0D:00B0
// (interface 1, 65-byte input/output reports).
// Protocol taken from MSI Center's own Gaming Gear module (Class_Mouse_VERSA300Elite, dongle
// branch of GetBattery) and checked against a real mouse:
//   Output report (report ID 0, 64-byte payload zero-padded): [00][0F 20 00 ...]
//   Input reply (after stripping the leading 0 report ID):
//     [0] = 0F, [1] = 20, [14] = battery: bit 7 = charging, bits 0..6 = percent (0..100)
// A level of 0 while not charging is treated as "asleep" and the last known value is kept: MSI
// Center's log shows readings of 0 between normal ones, most likely while the mouse is off or asleep.
// MSI Center also sends 41 80 ("remote control") first. That switches the mouse into a software
// control mode, so it is deliberately not sent here: the 0F 20 query is enough.
#include "drivers.h"

namespace {

constexpr USHORT kMsiVid = 0x0DB0;
constexpr USHORT kVersa300EliteDonglePid = 0x9E22;

bool QueryVersa300Elite(const HidColl& c, int& percent, bool& charging) {
    HidDev d;
    if (!d.Open(c)) return false;
    d.Flush();
    if (!d.Write({ 0x00, 0x0F, 0x20 })) return false;

    std::vector<BYTE> r;
    ULONGLONG end = GetTickCount64() + 1000;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        int n = d.Read(r, left);
        if (n < 0) break;
        if (n >= 15 && r[0] == 0x0F && r[1] == 0x20) {
            int level = r[14] & 0x7F;
            if (level > 100) return false;
            percent = level;
            charging = (r[14] & 0x80) != 0;
            return true;
        }
    }
    return false;
}

}  // namespace

void PollMsi(PollContext& ctx) {
    if (ctx.IsClaimed(kMsiVid, kVersa300EliteDonglePid)) return;
    for (const HidColl* c : ctx.Find(kMsiVid, kVersa300EliteDonglePid, [](const HidColl& c) {
             return c.iface == 1 && c.page() == 0xFF0D && c.usage() == 0x00B0 && c.outLen() >= 65 && c.inLen() >= 65;
         })) {
        int pct = -1;
        bool chg = false;
        if (!QueryVersa300Elite(*c, pct, chg)) continue;

        DeviceStatus s;
        s.key = L"msi:" + Hex4(kVersa300EliteDonglePid);
        s.name = HidProduct(*c);
        if (s.name.empty()) s.name = L"MSI VERSA 300 ELITE WIRELESS";
        s.kind = DeviceKind::Mouse;
        s.via = L"2.4 GHz receiver";
        if (pct == 0 && !chg) {
            s.asleep = true;
        } else {
            s.percent = pct;
            s.charging = chg;
        }
        s.graceSec = 1800;
        ctx.Add(s, kMsiVid, kVersa300EliteDonglePid);
        break;
    }
}
