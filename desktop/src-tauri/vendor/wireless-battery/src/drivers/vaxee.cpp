// VAXEE 4K and 8K receivers and ZYGEN NP-01S V2 USB cable. Protocol reference:
// https://github.com/stuffz/mouse-battery-monitor/blob/main/docs/VAXEE.md
// Only battery (0B) and charging (10) reads are sent; never configuration writes.
#include "drivers.h"
#include <map>

namespace {
constexpr USHORT kVid = 0x3057;
constexpr USHORT kReceiver = 0x1002;
constexpr USHORT kReceiver8K = 0x2002;
constexpr USHORT kCable = 0x1011;

bool Supported(USHORT pid) { return pid == kReceiver || pid == kReceiver8K || pid == kCable; }

bool Query(HidDev& d, BYTE command, BYTE& value) {
    std::vector<BYTE> request(64, 0);
    request[0] = 0x0E;
    request[1] = 0xA5;
    request[2] = command;
    request[3] = 0x01;  // READ, not WRITE (02)
    request[4] = 0x01;
    if (!d.SetFeature(request)) return false;
    Sleep(100);
    std::vector<BYTE> reply;
    if (!d.GetFeature(0x0E, reply) || reply.size() < 6 ||
        reply[0] != 0x0E || reply[1] != 0xA5 ||
        reply[2] != command || reply[4] != 1) return false;
    value = reply[5];
    return true;
}
}  // namespace

void PollVaxee(PollContext& ctx) {
    // End the UI's sleeping-device grace period immediately when the physical
    // USB device disappears (including moving the cable from receiver to mouse).
    static std::map<std::wstring, DeviceStatus> lastGood;
    for (auto it = lastGood.begin(); it != lastGood.end();) {
        bool present = false;
        for (const auto& c : ctx.colls)
            if (c.path == it->first) { present = true; break; }
        if (present) { ++it; continue; }
        DeviceStatus gone = it->second;
        gone.connected = false;
        gone.percent = -1;
        gone.charging = false;
        ctx.out.push_back(gone);
        it = lastGood.erase(it);
    }
    for (const auto& product : ctx.Products(kVid)) {
        const USHORT pid = product.second;
        if (!Supported(pid)) continue;
        for (const HidColl* c : ctx.Find(kVid, pid, [](const HidColl& c) {
                 return c.page() == 0xFF05 && c.usage() == 1 && c.featLen() == 64;
             })) {
            HidDev d;
            if (!d.OpenFeatureOnly(*c)) continue;
            BYTE battery = 0;
            bool valid = false;
            for (int attempt = 0; attempt < 2 && !valid; ++attempt)
                valid = Query(d, 0x0B, battery) && battery <= 20;
            if (!valid) continue;  // UI keeps the last reading dimmed during the grace period.
            DeviceStatus s;
            s.key = L"vaxee:" + c->path;
            s.name = pid == kCable        ? L"ZYGEN NP-01S V2 Wireless"
                     : pid == kReceiver8K ? L"VAXEE 8K Wireless"
                                          : L"VAXEE wireless mouse";
            s.kind = DeviceKind::Mouse;
            s.via = pid == kCable ? L"USB cable" : L"2.4 GHz receiver";
            s.percent = battery * 5;
            s.graceSec = 1800;
            BYTE charging = 0;
            if (Query(d, 0x10, charging)) s.charging = charging != 0;
            lastGood[c->path] = s;
            ctx.Add(s, kVid, pid);
            break;
        }
    }
}
