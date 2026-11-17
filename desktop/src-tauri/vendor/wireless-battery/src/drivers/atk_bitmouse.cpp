// ATK / VXE NearLink mice on the "NK mouse NANO dongle" 373B:1216 (VXE R1 NK and siblings). This dongle
// has no 17-byte report 08 collection for the Kysona protocol; it speaks ATK's BITMOUSE protocol on
// vendor collection FF05:0001 instead, so this driver runs before the Kysona driver claims vendor 373B.
//   Output report 08, 64 bytes: [08][checksum][72][02][00][01][cmd][01][00 ...],
//   checksum = sum(bytes 2..63) & 0xFF; target 01 = the mouse behind the dongle.
//   cmd 07 = battery level, cmd 0F = charging flag.
//   Reply on the same collection: [08][72][status][seq][00][cmd][01][value]...; status FF = error.
//   No reply = the mouse is asleep or switched off (moving it brings the reading back).
// From github.com/HeyOkay/HaloBattery PR #350 (providers/atk_bitmouse.py; verified by a VXE R1 owner on
// Windows: the level matches ATK's app, charging follows the cable) and github.com/qwr79/mouse-battery.
#include "drivers.h"

namespace {

const USHORT kVid = 0x373B;
const USHORT kNanoDongle = 0x1216;

// Sends command `cmd` and returns its one-byte payload, or -1 when there is no valid reply.
int Query(HidDev& d, BYTE cmd) {
    std::vector<BYTE> req(64, 0);
    req[0] = 0x08;
    req[2] = 0x72;
    req[3] = 0x02;  // request length
    req[5] = 0x01;  // target: the mouse
    req[6] = cmd;
    req[7] = 0x01;  // expected reply length
    unsigned sum = 0;
    for (size_t i = 2; i < req.size(); i++) sum += req[i];
    req[1] = (BYTE)(sum & 0xFF);
    d.Flush();
    if (!d.Write(req)) return -1;
    ULONGLONG end = GetTickCount64() + 700;
    std::vector<BYTE> r;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0) return -1;
        if (d.Read(r, left) < 0) return -1;
        if (r.size() < 8 || r[0] != 0x08 || r[1] != 0x72) continue;
        if (r[5] != cmd) continue;  // a reply to another request
        if (r[2] == 0xFF) return -1;
        return r[7];
    }
}

}  // namespace

void PollAtkBitmouse(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kNanoDongle)) return;
    for (const HidColl* c : ctx.Find(kVid, kNanoDongle, [](const HidColl& c) {
             return c.page() == 0xFF05 && c.usage() == 0x0001 && c.outLen() >= 64 && c.inLen() >= 8;
         })) {
        HidDev d;
        if (!d.Open(*c)) continue;
        int level = Query(d, 0x07);
        if (level < 1 || level > 100) continue;  // asleep / off, or no valid reading
        DeviceStatus s;
        s.key = L"atknk:" + Hex4(kNanoDongle);
        s.name = L"ATK / VXE NK mouse";  // the dongle is shared by several NearLink models
        s.kind = DeviceKind::Mouse;
        s.via = L"2.4 GHz receiver";
        s.graceSec = 1800;  // the dongle stops answering while the mouse sleeps: keep the last value
        s.percent = level;
        s.charging = Query(d, 0x0F) == 1;
        ctx.Add(s, kVid, kNanoDongle);
        break;
    }
}
