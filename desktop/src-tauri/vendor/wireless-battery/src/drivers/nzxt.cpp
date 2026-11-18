// NZXT Lift Elite Wireless on its dongle (1E71:2101) or USB cable (1E71:2129), without NZXT CAM.
// Ported from HaloBattery (github.com/HeyOkay/HaloBattery, providers/nzxt.py, MIT; confirmed there on the
// reporter's mouse), which decoded it from USB captures of NZXT CAM 4.76.5.
// 64-byte reports on the vendor collection FFCA:0001:
//   request: 4E 02 81 00 B0 00 ...   (02 = the mouse, 81 = read a property, B0 = telemetry)
//   reply:   4E 02 97 ...; bytes 17-18 = percent (little endian), bytes 8-9 = cell mV (big endian),
//            byte 22 bit 0 = on the charging cable. The dongle first acks with 4E E5, which is skipped.
// Only this read is sent. While NZXT CAM is open the dongle stops answering; the last value is kept.
#include "drivers.h"

namespace {

constexpr USHORT kVid = 0x1E71, kReceiver = 0x2101, kCable = 0x2129;

bool ReadTelemetry(const HidColl& c, int& percent, int& mv, bool& charging) {
    HidDev d;
    if (!d.Open(c)) return false;
    d.Flush();
    std::vector<BYTE> req(65, 0);  // report id 0, then the 64-byte packet
    req[1] = 0x4E;
    req[2] = 0x02;
    req[3] = 0x81;
    req[5] = 0xB0;
    if (!d.Write(req)) return false;
    std::vector<BYTE> r;
    for (int i = 0; i < 10; i++) {
        int n = d.Read(r, 150);
        if (n < 0) return false;
        if (n < 27 || r[0] != 0x4E) continue;
        if (r[1] == 0xE5) continue;  // the dongle's acknowledgement
        if (r[1] != 0x02 || r[2] != 0x97) continue;
        int level = r[17] | (r[18] << 8);
        if (level > 100) return false;  // not a percentage: refuse rather than show it
        percent = level;
        mv = (r[8] << 8) | r[9];
        charging = (r[22] & 0x01) != 0;
        return true;
    }
    return false;
}

}  // namespace

void PollNzxt(PollContext& ctx) {
    // One entry for the mouse on both ids; the cable reading wins when both answer (it is the one charging).
    bool any = false, have = false;
    int percent = -1, mv = 0;
    bool charging = false;
    for (USHORT pid : { kCable, kReceiver }) {
        if (ctx.IsClaimed(kVid, pid)) continue;
        auto colls = ctx.Find(kVid, pid, [](const HidColl& c) { return c.page() == 0xFFCA && c.usage() == 0x0001; });
        if (colls.empty()) continue;
        any = true;
        ctx.Claim(kVid, pid);
        for (const HidColl* c : colls) {
            int p = -1, v = 0;
            bool ch = false;
            if (have || !ReadTelemetry(*c, p, v, ch)) continue;
            percent = p;
            mv = v;
            charging = ch;
            have = true;
        }
    }
    if (!any) return;
    DeviceStatus s;
    s.key = L"nzxt:2101";
    s.name = L"NZXT Lift Elite";
    s.kind = DeviceKind::Mouse;
    s.via = L"2.4 GHz receiver";
    s.graceSec = 1800;
    if (have) {
        s.percent = percent;
        s.charging = charging;
        if (mv >= 3000 && mv <= 4500) s.millivolts = mv;
    } else {
        s.asleep = true;  // mouse off, or NZXT CAM holds the dongle: keep the last value
    }
    ctx.out.push_back(s);
}
