// Machenike L7 Arctic / L7 Mix. Read-state protocol from the official L7 Mix
// app 1.0.0.8 (DeviceDriver.exe), verified on an L7 Arctic over receiver and cable.
// See docs/machenike.md for attribution, captured replies and field semantics.
// Feature report 51, command 06, 21 bytes: [10] mode/link, [11] %, [12] charging.
#include "drivers.h"

namespace {
constexpr USHORT kVendor = 0x248A, kReceiver = 0xFF4C, kCable = 0xFF4E;
constexpr USHORT kStatusLength = 21;

bool IsStatusCollection(const HidColl& c, bool cable) {
    return c.iface == (cable ? 2 : 1) && c.page() == 0x008C && c.usage() == 1 &&
           c.inLen() == 33 && c.outLen() == 33 && c.featLen() == 1001;
}

bool DecodeStatus(const std::vector<BYTE>& r, bool cable, DeviceStatus& s) {
    if (r.size() != kStatusLength || r[0] != 0x51 || r[1] != 0x06 ||
        r[4] != 0x8A || r[5] != 0x24 || r[6] != 0x4E || r[7] != 0xFF ||
        (r[10] & 7) != (cable ? 0 : 1)) return false;
    // The wireless link bit is clear on the cable too; the USB connection itself is authoritative there.
    bool connected = cable || (r[10] & 8) != 0;
    if (connected && (r[11] > 100 || r[12] > 1)) return false;
    s.connected = connected;
    s.percent = connected ? r[11] : -1;  // 0% is valid, not an offline sentinel
    s.charging = connected && r[12] == 1;
    return true;
}

bool QueryStatus(HidDev& d, bool cable, DeviceStatus& s) {
    std::vector<BYTE> request(kStatusLength, 0);
    request[0] = 0x51;
    request[1] = 0x06;
    ULONGLONG deadline = GetTickCount64() + 200;
    if (!d.SetFeature(request)) return false;
    // Allow the reply to replace the receiver's previous feature response. An open vendor app
    // can leave unrelated replies here, so accept only this command's validated status frame.
    do {
        Sleep(10);
        std::vector<BYTE> r;
        if (d.GetFeature(0x51, r) && DecodeStatus(r, cable, s)) return true;
    } while (GetTickCount64() < deadline);
    return false;
}
}  // namespace

void PollMachenike(PollContext& ctx) {
    bool haveCable = false;
    // A live cable reading takes precedence over the dongle's cached/disconnected mouse state.
    for (USHORT pid : { kCable, kReceiver }) {
        if (ctx.IsClaimed(kVendor, pid)) continue;
        bool cable = pid == kCable;
        for (const HidColl* c : ctx.Find(kVendor, pid, [cable](const HidColl& c) { return IsStatusCollection(c, cable); })) {
            if (HidProduct(*c) != L"L7 Mix") continue;
            // Reserve even on I/O failure: the later Ajazz poller shares VID 248A and would
            // otherwise send its different command to the L7's cable collection.
            ctx.Claim(kVendor, pid);
            if (haveCable) break;
            HidColl status = *c;
            // 1001 is the largest report on this collection (macro data). Report 51 is 21 bytes;
            // use its exact length in the common HID layer, as the official application does.
            status.caps.FeatureReportByteLength = kStatusLength;
            HidDev d;
            if (!d.OpenFeatureOnly(status)) break;
            DeviceStatus s;
            if (!QueryStatus(d, cable, s)) break;
            s.key = L"machenike:l7";  // keep the same tray entry when switching cable/receiver
            s.name = L"Machenike L7 Arctic / L7 Mix";
            s.kind = DeviceKind::Mouse;
            s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
            s.graceSec = cable ? 0 : 1800;
            haveCable = cable;
            ctx.Add(s, kVendor, pid);
            break;  // one exact status collection and one bounded query per product
        }
    }
}
