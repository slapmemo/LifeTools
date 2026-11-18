// Razer Barracuda Pro on its 2.4 GHz receiver (1532:053A): the Razer "PA" protocol family, with the layout
// read off a USB capture of Razer Synapse refreshing the battery page.
// Ported from HaloBattery (github.com/HeyOkay/HaloBattery, providers/barracuda.py, MIT; tested there on a real
// Barracuda Pro). The Barracuda X (2022) and BlackShark headsets are in razer_headset.cpp.
//   query:  [01][80][08]['P']['A'][08][08][03][cmd]            (64 bytes, report id 01)
//   remote: [01][80][07]['P']['A'][0E][08][02][E1][1 on / 0 off] - switched on for one query and off again,
//           as Synapse does; it is not stored on the headset
//   reply:  [01][80][len]['P']['I'][08][..][13] = command echo, [14] = 01/02, [15] = length, [16..] = data
//   cmd 21 = battery percent, cmd 2A = charging.
#include "drivers.h"

#include <algorithm>

namespace {

constexpr USHORT kVid = 0x1532, kPid = 0x053A;

std::vector<BYTE> Query(BYTE cmd) {
    std::vector<BYTE> b(64, 0);
    BYTE head[] = { 0x01, 0x80, 0x08, 0x50, 0x41, 0x08, 0x08, 0x03, cmd };
    std::copy(std::begin(head), std::end(head), b.begin());
    return b;
}

std::vector<BYTE> Remote(bool on) {
    std::vector<BYTE> b(64, 0);
    BYTE head[] = { 0x01, 0x80, 0x07, 0x50, 0x41, 0x0E, 0x08, 0x02, 0xE1, (BYTE)(on ? 1 : 0) };
    std::copy(std::begin(head), std::end(head), b.begin());
    return b;
}

void Drain(HidDev& d) {
    std::vector<BYTE> r;
    for (int i = 0; i < 8 && d.Read(r, 20) > 0; i++) {}
}

// The first data byte of the reply to `cmd`, or -1.
int Ask(HidDev& d, BYTE cmd) {
    for (int attempt = 0; attempt < 4; attempt++) {
        Drain(d);
        if (!d.Write(Query(cmd))) return -1;
        std::vector<BYTE> r;
        for (int i = 0; i < 6; i++) {
            int n = d.Read(r, 150);
            if (n < 17) continue;
            if (r[13] == cmd && (r[14] == 0x01 || r[14] == 0x02) && r[15] > 0 && r[15] <= 32) return r[16];
        }
    }
    return -1;
}

}  // namespace

void PollBarracudaPro(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kPid)) return;
    auto colls = ctx.Find(kVid, kPid, [](const HidColl& c) { return c.page() == 0xFF00 && c.outLen() >= 64; });
    if (colls.empty()) return;
    HidDev d;
    if (!d.Open(*colls[0])) return;
    DeviceStatus s;
    s.key = L"barracuda:053A";
    s.name = L"Razer Barracuda Pro";
    s.kind = DeviceKind::Headset;
    s.via = L"2.4 GHz receiver";
    bool remote = false;
    for (int attempt = 0; attempt < 3 && !remote; attempt++) {
        Drain(d);
        remote = d.Write(Remote(true));
        if (!remote) Sleep(150 * (attempt + 1));
    }
    int level = -1, charging = -1;
    if (remote) {
        Sleep(50);
        level = Ask(d, 0x21);
        if (level >= 0) charging = Ask(d, 0x2A);
        Drain(d);
        d.Write(Remote(false));
    }
    if (level < 0 || level > 100) {
        s.connected = false;  // receiver present, headset off or out of range
    } else {
        s.percent = level;
        s.charging = charging > 0;
    }
    ctx.Add(s, kVid, kPid);
}
