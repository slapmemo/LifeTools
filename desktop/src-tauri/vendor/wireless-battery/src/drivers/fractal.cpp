// Fractal Design Scape headset (VID 36BC): 2.4 GHz dongle (PID 0001) or the headset itself on its
// USB-C cable (PID 2001). Both expose a 64-byte vendor collection on usage page FF00 / usage 01.
//
// Requests are output report 0x02: [0x02][device type][command]. The reply is an input report 0x02
// echoing the device type and command, followed by the payload.
//   GET_DEVICE_STATE = 0x21, sent to device type 0x11 (dongle) or 0xF1 (headset).
//   Dongle reply:  payload byte 3 = 1 when the headset is linked to it.
//   Headset reply: payload byte 14 = battery level in percent. Through the dongle the request is
//                  relayed to the headset over the air; on the cable it is answered directly.
// Byte offsets count from the device type (WebHID's DataView, which excludes the report id), so the
// hidapi-style buffer below is shifted by one.
//
// Source: Fractal's own WebHID configurator, Adjust Pro (adjust.fractal-design.com): classes
// BTDongle / Headset, getUpdatedDeviceState(), constants P911.REPORT_ID = 2,
// DEVICE_TYPE_FACTORY_DONGLE = 17, DEVICE_TYPE_FACTORY_HEADSET = 241, GET_DEVICE_STATE_CMD = 33.
// Adjust Pro does not read a charging flag. Payload byte 22 reads 1 with the headset on its USB cable
// and 0 over the air (checked on a Scape, firmware as shipped in 2026); it is used as the charging bit.
// The headset unlinks from the dongle while it sits on its charging stand, so it then shows as off.
#include "drivers.h"

namespace {

constexpr BYTE kReportId = 0x02;
constexpr BYTE kTypeDongle = 0x11;
constexpr BYTE kTypeHeadset = 0xF1;
constexpr BYTE kGetDeviceState = 0x21;

// Sends GET_DEVICE_STATE to `type` and waits for its reply (one absolute 1 s deadline).
bool GetState(HidDev& d, BYTE type, std::vector<BYTE>& r) {
    d.Flush();
    if (!d.Write({ kReportId, type, kGetDeviceState })) return false;
    ULONGLONG end = GetTickCount64() + 1000;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0) return false;
        int n = d.Read(r, left);
        if (n < 0) return false;
        if (n >= 24 && r[0] == kReportId && r[1] == type && r[2] == kGetDeviceState) return true;
    }
}

}  // namespace

void PollFractal(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x36BC)) {
        if (pid != 0x0001 && pid != 0x2001) continue;
        bool cable = pid == 0x2001;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.page() == 0xFF00 && c.usage() == 0x0001 && c.outLen() >= 4 && c.inLen() >= 24;
             })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            DeviceStatus s;
            s.key = L"fractal:scape";  // same entry on the dongle and on the cable
            s.name = L"Fractal Scape";
            s.kind = DeviceKind::Headset;
            s.via = cable ? L"USB cable" : L"2.4 GHz dongle";
            std::vector<BYTE> r;
            if (!cable) {
                if (!GetState(d, kTypeDongle, r)) continue;
                if (r[4] != 1) {  // dongle answers, headset off, out of range or on its stand
                    s.connected = false;
                    ctx.Add(s, vid, pid);
                    break;
                }
            }
            if (!GetState(d, kTypeHeadset, r) || r[15] > 100) continue;
            s.percent = r[15];
            s.charging = r[23] == 1;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}
