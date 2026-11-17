// Cooler Master wireless mice (VID 2516): MM712 (cable 0169) and MM731 (cable 0167). Both pair with
// the same "Cooler Master Mice Dongle" (01B7). Vendor interface 3, usage page FF0A, no report id;
// 32-byte reports on the dongle, 64-byte reports over the cable.
//   Request: [46][81][00] -> status report [47][81][model] ... [10] percent, [11] charging (0 = no),
//            [12] link (0 cable, 1 dongle). The mouse also sends it on its own when the level changes.
//   [2] tells the models apart on the shared dongle: 50 = MM712; 70 seen in an MM731 status report.
//   A sleeping or switched-off mouse does not answer; the last value is kept (graceSec).
// MM712 verified on hardware (2516:01B7). MM731: same protocol family per MM731-Controller; its battery
// bytes and model byte are not verified.
// Protocol: github.com/syntactic-spice/coolermaster-usb-protocol (docs/PROTOCOL.md) and
// github.com/riVFerd/MM731-Controller.
#include "drivers.h"

namespace {

const USHORT kDongle = 0x01B7;
const USHORT kMM712Cable = 0x0169;
const USHORT kMM731Cable = 0x0167;

const wchar_t* ModelName(USHORT pid, BYTE model) {
    if (pid == kMM712Cable || (pid == kDongle && model == 0x50)) return L"Cooler Master MM712";
    if (pid == kMM731Cable || (pid == kDongle && model == 0x70)) return L"Cooler Master MM731";
    return L"Cooler Master wireless mouse";
}

// Sends the status request and waits for the 47 81 reply.
bool QueryStatus(HidDev& d, std::vector<BYTE>& r) {
    d.Flush();
    if (!d.Write({ 0x00, 0x46, 0x81, 0x00 })) return false;
    ULONGLONG end = GetTickCount64() + 500;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0 || d.Read(r, left) < 13) return false;
        if (r[0] == 0x47 && r[1] == 0x81) return true;
    }
}

}  // namespace

void PollCoolerMaster(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x2516)) {  // sorted: the cable ids come before the dongle
        if (pid != kDongle && pid != kMM712Cable && pid != kMM731Cable) continue;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) { return c.iface == 3 && c.page() == 0xFF0A; })) {
            HidDev d;
            std::vector<BYTE> r;
            if (!d.Open(*c) || !QueryStatus(d, r)) continue;
            DeviceStatus s;
            s.key = L"coolermaster:" + Hex4(pid);
            s.name = ModelName(pid, r[2]);
            s.kind = DeviceKind::Mouse;
            s.via = r[12] == 0 ? L"USB cable" : L"2.4 GHz receiver";
            if (r[10] >= 1 && r[10] <= 100) s.percent = r[10];
            s.charging = r[11] != 0;
            s.graceSec = 1800;
            // With the cable and the dongle both plugged in the mouse shows up twice; keep one.
            bool dup = false;
            for (auto& o : ctx.out) {
                if (o.name != s.name) continue;
                dup = true;
                o.charging |= s.charging;
            }
            if (dup) ctx.Claim(vid, pid);
            else ctx.Add(s, vid, pid);
            break;
        }
    }
}
