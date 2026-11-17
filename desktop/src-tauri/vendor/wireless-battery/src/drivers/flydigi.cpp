// Flydigi Vader 5 Pro (37D7:2401), vendor collection FFA0:0001.
// Protocol reference: SDL/src/joystick/hidapi/SDL_hidapi_flydigi.c and
// https://github.com/HeyOkay/HaloBattery/issues/191 (Windows hardware traces).
// Only architecture/info queries are sent; no controller takeover or configuration writes.
#include "drivers.h"

namespace {
constexpr USHORT kVid = 0x37D7;
constexpr USHORT kPid = 0x2401;

bool Reply(HidDev& d, BYTE command, std::vector<BYTE>& reply) {
    const ULONGLONG end = GetTickCount64() + 800;
    while (GetTickCount64() < end) {
        const int remaining = (int)(end - GetTickCount64());
        if (remaining <= 0 || d.Read(reply, remaining) < 0) return false;
        // HidDev strips a zero report ID. Some firmware retains a numbered input ID.
        if (reply.size() >= 4 && reply[0] == 0x04 && reply[1] == 0x5A && reply[2] == 0xA5)
            reply.erase(reply.begin());
        if (reply.size() >= 5 && reply[0] == 0x5A && reply[1] == 0xA5 && reply[2] == command)
            return true;
    }
    return false;
}
}  // namespace

void PollFlydigi(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kPid)) return;
    for (const HidColl* c : ctx.Find(kVid, kPid, [](const HidColl& c) {
             return c.page() == 0xFFA0 && c.usage() == 1 && c.inLen() >= 12 && c.outLen() >= 6;
         })) {
        HidDev d;
        if (!d.Open(*c)) continue;
        d.Flush();
        std::vector<BYTE> r;
        // Vader 5 Pro uses an unnumbered output report, unlike Apex 5's report 03.
        if (!d.Write({ 0, 0x5A, 0xA5, 0x07, 0, 0 })) continue;
        bool modern = Reply(d, 0x07, r) && r[3] == 1 && r[4] == 0;
        if (!d.Write({ 0, 0x5A, 0xA5, 0x01, 2, 0 }) || !Reply(d, 0x01, r)) continue;
        if (r.size() < 12 || r[5] != 130) continue;  // confirmed Vader 5 Pro identity
        const int level = r[11] & 0x0F;
        const int state = r[11] >> 4;
        if (state > 2 || level > 5) continue;
        const int connection = r[6];
        if (modern ? (connection > 1) : (connection != 1 && connection != 2)) continue;
        DeviceStatus s;
        s.key = L"flydigi:" + c->path;
        s.name = L"Flydigi Vader 5 Pro";
        s.kind = DeviceKind::Gamepad;
        s.via = connection == (modern ? 1 : 2) ? L"2.4 GHz receiver" : L"USB cable";
        s.percent = state == 2 ? 100 : level * 20;
        s.charging = state == 1;
        ctx.Add(s, kVid, kPid);
    }
}
