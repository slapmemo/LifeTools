// MCHOSE wireless mice on the 2.4 GHz receiver or USB cable (VID 5253): L7 / L7 Pro / L7 Ultra,
// M7 / M7 Ultra, A7 / A7 Ultra, K7 (the receiver PID is 1020 for several of them, so the model is
// not told apart by PID; the product string is used for the name). The same protocol also runs on
// the Realtek ODM dongles with VID 3837 (A5 V2 Ultra receiver 3837:100C verified on real hardware;
// the A7 V2 Ultra+ receiver 3837:100B is requested in issue 227, and 1001 / 100A / 1012 appear as
// MCHOSE products in the protocol projects). Other 3837 products (the G3 V2, keyboards) use other
// protocols and are deliberately not probed here.
//   request: 65-byte feature report on the vendor collection FF01:0001, report id 0x12, payload
//            [06 00 00 ...] with EVERY payload byte inverted (^ 0xFF), padding included
//   reply:   the same report read back: [12][F9 = 06 ^ FF][payload, inverted]
//            payload = vid:u16 (5253; 41E4 or 3837 on the 3837 dongles), model:u16, firmware:u32,
//            flags:u8 (09 on the receiver, 00 on the cable), level:u8, charging:u8
// The receiver only has a value while the mouse itself is awake: asleep, it still echoes the
// command but with an all-zero payload, so that is reported as "asleep" (the last value is kept).
// The request must be sent again for every read attempt; reading again without asking returns
// the request itself.
// Protocol: github.com/alexfrih/mchose-linux (PROTOCOL.md, recovered from MCHOSE's M HUB driver),
// confirmed on a real MCHOSE L7 Ultra (5253:1020, receiver) and MCHOSE A5 V2 Ultra (3837:100C,
// receiver, level verified against the vendor software).
#include "drivers.h"

namespace {

const USHORT kVid = 0x5253;
const USHORT kVidRealtek = 0x3837;
// 3837 dongle PIDs seen in the wild; kept explicit so keyboards and the G3 V2 on the same vendor
// id are never probed with this protocol.
const USHORT kRealtekPids[] = { 0x100C, 0x100B, 0x100A, 0x1001, 0x1012 };
const BYTE kReport = 0x12;
const BYTE kCmdStatus = 0x06;

// Returns 1 for a status reply, 0 for a valid echo with an empty payload (mouse asleep), -1 otherwise.
int ParseStatus(const std::vector<BYTE>& r, USHORT vidField, USHORT altVidField, int& level, int& charging, int& flags) {
    if (r.size() < 13 || r[0] != kReport || r[1] != (kCmdStatus ^ 0xFF)) return -1;
    BYTE p[11];
    for (int i = 0; i < 11; i++) p[i] = r[2 + i] ^ 0xFF;
    bool allZero = true;
    for (BYTE b : p)
        if (b) allZero = false;
    if (allZero) return 0;
    USHORT field = (USHORT)(p[0] | (p[1] << 8));
    if (field != vidField && field != altVidField) return -1;
    level = p[9];
    charging = p[10];
    flags = p[8];
    return level <= 100 ? 1 : -1;
}

void PollProduct(PollContext& ctx, USHORT vid, USHORT pid, USHORT vidField, USHORT altVidField) {
    for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) { return c.page() == 0xFF01 && c.usage() == 0x0001 && c.featLen() >= 65; })) {
        HidDev d;
        if (!d.OpenFeatureOnly(*c)) continue;
        std::vector<BYTE> req(c->featLen(), 0xFF);  // inverted zero padding
        req[0] = kReport;
        req[1] = kCmdStatus ^ 0xFF;
        int state = -1, level = 0, charging = 0, flags = 0;
        for (int attempt = 0; attempt < 5 && state != 1; attempt++) {
            if (attempt) Sleep(100);
            std::vector<BYTE> r;
            if (!d.SetFeature(req)) break;
            Sleep(120);
            if (!d.GetFeature(kReport, r)) continue;
            int st = ParseStatus(r, vidField, altVidField, level, charging, flags);
            if (st > state) state = st;
        }
        if (state < 0) continue;  // not answering this protocol
        DeviceStatus s;
        s.key = L"mchose:" + Hex4(pid);
        s.name = HidProduct(*c);
        if (s.name.empty()) s.name = L"MCHOSE mouse";
        s.kind = DeviceKind::Mouse;
        if (state == 1) {
            s.percent = Clamp100(level);
            s.charging = charging != 0;
            s.via = flags == 0 && charging ? L"USB cable" : L"2.4 GHz receiver";
        } else {
            s.asleep = true;
            s.via = L"2.4 GHz receiver";
        }
        ctx.Add(s, vid, pid);
        break;
    }
}

}  // namespace

void PollMchose(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(kVid)) {
        PollProduct(ctx, vid, pid, kVid, kVid);
    }
    for (USHORT pid : kRealtekPids) {
        if (ctx.IsClaimed(kVidRealtek, pid)) continue;
        // The vid field differs between 3837 dongles: 41E4 on the A5 V2 Ultra (100C), 3837 on the
        // K7 Ultra (1001).
        PollProduct(ctx, kVidRealtek, pid, 0x41E4, kVidRealtek);
    }
}
