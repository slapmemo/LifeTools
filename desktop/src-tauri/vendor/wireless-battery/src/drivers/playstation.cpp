// Sony DualShock 4 / DualSense / DualSense Edge (VID 054C), USB or Bluetooth.
// The battery is part of the regular input report:
//   DualShock 4: USB report 01 byte 30, Bluetooth report 11 byte 32: bits 0-3 level, bit 4 cable
//   DualSense:   USB report 01 byte 53, Bluetooth report 31 byte 54: bits 0-3 level (0-10), bits 4-7 state
// Over Bluetooth both controllers send a reduced report until a feature report is read, so we read
// the calibration report (05) once, which is what games do too.
// Layout reference: Linux drivers/hid/hid-playstation.c.
#include "drivers.h"

namespace {

bool IsDs4(USHORT pid) { return pid == 0x05C4 || pid == 0x09CC || pid == 0x0BA0; }
bool IsDualSense(USHORT pid) { return pid == 0x0CE6 || pid == 0x0DF2; }

}  // namespace

void PollPlayStation(PollContext& ctx) {
    for (const auto& c : ctx.colls) {
        if (c.vid != 0x054C || !(IsDs4(c.pid) || IsDualSense(c.pid))) continue;
        if (c.page() != 0x01 || c.usage() != 0x05) continue;  // the gamepad collection
        HidDev d;
        if (!d.Open(c)) continue;
        bool bt = c.inLen() > 64;
        if (bt) {
            std::vector<BYTE> f;
            d.GetFeature(0x05, f);  // switches the controller to full reports
        }
        std::vector<BYTE> r;
        int pct = -1;
        bool charging = false, found = false;
        ULONGLONG end = GetTickCount64() + 500;
        while (!found && (LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
            if (d.Read(r, 100) < 10) continue;
            if (IsDs4(c.pid)) {
                size_t at = r[0] == 0x01 ? 30 : r[0] == 0x11 ? 32 : 0;
                if (!at || r.size() <= at || (r[0] == 0x01 && bt)) continue;
                int level = r[at] & 0x0F;
                bool cable = (r[at] & 0x10) != 0;
                if (c.pid == 0x0BA0 && r[at] == 0) break;  // wireless adapter without a controller
                pct = cable ? (level >= 11 ? 100 : Clamp100(level * 10)) : Clamp100(level * 10 + 5);
                charging = cable && level < 11;
                found = true;
            } else {
                size_t at = r[0] == 0x01 ? 53 : r[0] == 0x31 ? 54 : 0;
                if (!at || r.size() <= at || (r[0] == 0x01 && bt)) continue;
                int level = r[at] & 0x0F, state = r[at] >> 4;
                pct = Clamp100(level * 10 + 5);
                charging = state == 0x1;
                if (state == 0x2) { pct = 100; charging = true; }
                found = true;
            }
        }
        if (!found) continue;
        DeviceStatus s;
        UINT h = 2166136261u;
        for (wchar_t ch : c.path) { h ^= ch; h *= 16777619u; }
        s.key = L"ps:" + Hex4(c.pid) + L":" + std::to_wstring(h);
        s.name = IsDs4(c.pid) ? L"DualShock 4" : c.pid == 0x0DF2 ? L"DualSense Edge" : L"DualSense";
        s.kind = DeviceKind::Gamepad;
        s.via = bt ? L"Bluetooth" : (c.pid == 0x0BA0 ? L"Wireless adapter" : L"USB cable");
        s.percent = pct;
        s.charging = charging;
        ctx.out.push_back(s);
        ctx.Claim(c.vid, c.pid);
    }
}
