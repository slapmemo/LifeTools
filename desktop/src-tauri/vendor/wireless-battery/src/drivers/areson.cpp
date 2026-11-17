// Redragon wireless mice on Areson/CompX 2.4 GHz receivers (vendor 25A7), e.g. M913 Impact Elite
// and M915RGB-WL. The battery is not pushed; it has to be asked for with a read-only "GetPower"
// command, so nothing is ever written to the mouse (no LED, DPI or configuration report):
//   request  SET_FEATURE on the FF02:0002 collection of interface 1, 17 bytes:
//            [08][04][00 ...][checksum]  checksum = 0x55 - sum(bytes 0..15)
//   reply    input report on the FF01:0000 collection of interface 1:
//            [09][04][00][..][..][..][level][charging][00 ...][checksum]
//            the whole frame sums to 0x55 (mod 256); level is 0..10 -> 0..100%
//            (the official software showed 80% for level 8); charging is any non-zero byte.
// Sources:
//  * https://github.com/Qehbr/m913-ctl (M913 Linux driver: 17-byte frames, 0x55 checksum)
//  * https://github.com/Doomguy-BFG9000/redragon-m913-battery-tray (M913 battery reader)
//  * own capture of the official Redragon software against an M915RGB-WL on the 25A7:FA07
//    receiver, which is what pinned down the two collections and the reply layout above.
// Only the FA07/FA08 product ids are handled: the FA7B/FA7C family reports the level on a
// different scale, and reporting it here would show a wrong percentage.
#include "drivers.h"

namespace {

// One GetPower exchange. percent is 0..100, or -1 when the mouse never answered.
struct Power {
    int percent = -1;
    bool charging = false;
};

bool QueryPower(HidDev& cmd, HidDev& reply, Power& out) {
    std::vector<BYTE> req(17, 0);
    req[0] = 0x08;  // report id
    req[1] = 0x04;  // GetPower
    int sum = 0;
    for (int i = 0; i < 16; i++) sum += req[i];
    req[16] = (BYTE)(0x55 - sum);
    for (int attempt = 0; attempt < 2; attempt++) {
        if (attempt) Sleep(200);
        reply.Flush();  // a report queued before the request would be mistaken for the answer
        if (!cmd.SetFeature(req)) return false;  // receiver gone; retrying will not help
        std::vector<BYTE> r;
        if (reply.Read(r, 1800) < 17) continue;  // asleep or out of range
        unsigned total = 0;
        for (BYTE b : r) total += b;
        if ((total & 0xFF) != 0x55 || r[0] != 0x09 || r[1] != 0x04 || r[2] != 0x00 || r[6] > 10) continue;
        out.percent = Clamp100(r[6] * 10);
        out.charging = r[7] != 0;
        return true;
    }
    return false;
}

// Appends the mouse behind one receiver. Returns false (claiming nothing) when it does not answer,
// so a sleeping mouse simply keeps its last reading instead of clearing it.
bool Probe(PollContext& ctx, const HidColl& cmdColl, const HidColl& replyColl, USHORT vid, USHORT pid) {
    HidDev cmd;
    if (!cmd.OpenFeatureOnly(cmdColl)) return false;  // zero access is enough for feature reports
    HidDev reply;
    if (!reply.Open(replyColl)) return false;
    Power p;
    if (!QueryPower(cmd, reply, p)) return false;

    DeviceStatus s;
    s.key = L"areson:" + Hex4(vid) + L":" + Hex4(pid);
    s.name = L"Redragon wireless mouse";
    s.kind = DeviceKind::Mouse;
    s.via = L"2.4 GHz receiver";
    s.percent = p.percent;
    s.charging = p.charging;
    s.graceSec = 1800;  // existing UI keeps the last reading, dimmed, while the mouse sleeps
    ctx.Add(s, vid, pid);
    return true;
}

}  // namespace

void PollAreson(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x25A7)) {
        if (pid != 0xFA07 && pid != 0xFA08) continue;  // FA7B/FA7C report the level on another scale
        bool done = false;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.iface == 1 && c.page() == 0xFF02 && c.usage() == 0x0002 && c.featLen() >= 17;
             })) {
            for (const HidColl* i : ctx.Find(vid, pid, [](const HidColl& c) {
                     return c.iface == 1 && c.page() == 0xFF01 && c.usage() == 0x0000 && c.inLen() >= 17;
                 })) {
                if (Probe(ctx, *c, *i, vid, pid)) done = true;
                if (done) break;
            }
            if (done) break;
        }
    }
}
