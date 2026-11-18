// 8BitDo Ultimate 2 Wireless (VID 2DC8) in D-input mode: 2.4 GHz dongle, USB cable or Bluetooth,
// all as 2DC8:6012. Firmware 1.03 and later send a 34-byte gamepad input report 01 that carries
// the battery in byte 14: bits 0-6 = percent, bit 7 = charging. Nothing is sent to the pad.
// Layout reference: SDL, src/joystick/hidapi/SDL_hidapi_8bitdo.c (HandleStatePacket). Confirmed on
// a real pad on the dongle, on battery at 99%: "01 0F 7F 7F 7F 7F 00 .. 00 63 E0 FD ..." (byte 14 = 63).
//
// In X-input mode (dongle 2DC8:310B) the dongle tells XInput the pad is wired and full, and its
// vendor collection (FF7A) stays silent, so no level is available there: the pad has to be switched
// to D-input mode (hold B while turning it on) to be shown.
#include "drivers.h"

namespace {

const USHORT kVid = 0x2DC8;
const int kReportLen = 34;  // v1.02 firmware sends 12-byte reports without the battery byte

bool IsUltimate2(USHORT pid) { return pid == 0x6012; }

}  // namespace

void Poll8BitDo(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(kVid)) {
        if (!IsUltimate2(pid)) continue;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.page() == 0x01 && c.usage() == 0x05 && c.inLen() >= kReportLen;
             })) {
            HidDev d;
            if (!d.OpenReadOnly(*c)) continue;  // games keep the gamepad open; reading alongside them is fine
            std::vector<BYTE> r;
            bool found = false;
            ULONGLONG end = GetTickCount64() + 600;  // the pad streams reports every few ms while linked
            while (!found && (LONGLONG)end - (LONGLONG)GetTickCount64() > 0)
                found = d.Read(r, 100) >= kReportLen && r[0] == 0x01 && (r[14] & 0x7F) <= 100;
            if (!found) continue;
            DeviceStatus s;
            s.key = L"8bitdo:" + Hex4(pid);
            s.name = L"8BitDo Ultimate 2";
            s.kind = DeviceKind::Gamepad;
            // Bluetooth HID paths carry the HID service class id 00001124-...
            s.via = c->path.find(L"00001124") != std::wstring::npos ? L"Bluetooth" : L"2.4 GHz dongle or USB";
            s.percent = r[14] & 0x7F;
            s.charging = (r[14] & 0x80) != 0 && s.percent < 100;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}
