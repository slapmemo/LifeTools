// Plantronics / Poly headsets (Voyager 8200 UC) behind the BT600 USB Bluetooth adapter (047F:02EE / 02F7).
// Ported from HaloBattery (github.com/HeyOkay/HaloBattery, providers/plantronics.py, MIT; confirmed there on
// hardware), itself from HeadsetControl's plantronics_bt600.hpp.
// Report 07 on the vendor collection FFA2:0003, 64 bytes, zero-padded:
//   07 01 01 10 <len> <addr> 00 00 <op> <grp> <item> <value...>
//   addr 00 = the adapter, 20 = the headset; replies carry 00 (adapter) / 02 (headset).
// The adapter needs the attach sequence first (output report 06 01, a HELLO to the adapter, a HELLO to the
// headset). Then GET group 0A item 1A: <level> <level count> <charging> <minutes hi> <minutes lo>, and the
// percentage is level * 100 / (count - 1). Only the battery is read; no setting is written.
#include "drivers.h"

#include <algorithm>

namespace {

constexpr USHORT kVid = 0x047F;
constexpr BYTE kReport = 0x07;
constexpr BYTE kAddrDongle = 0x00, kAddrHeadset = 0x20, kReplyDongle = 0x00, kReplyHeadset = 0x02;
constexpr BYTE kOpHello = 0x01, kOpGet = 0x02, kOpHelloAck = 0x08, kOpGetReply = 0x03;
constexpr BYTE kGrpHello = 0x01, kItemHello = 0x02, kGrpBattery = 0x0A, kItemBattery = 0x1A;

std::vector<BYTE> Frame(BYTE op, BYTE grp, BYTE item, BYTE addr) {
    std::vector<BYTE> f(64, 0);
    BYTE head[] = { kReport, 0x01, 0x01, 0x10, (BYTE)(op == kOpGet ? 0x06 : 0x07), addr, 0x00, 0x00, op, grp, item };
    std::copy(std::begin(head), std::end(head), f.begin());
    return f;
}

bool IsReply(const std::vector<BYTE>& r, int n, BYTE op, BYTE grp, BYTE item, BYTE addr) {
    return n > 10 && r[0] == kReport && r[1] == 0x01 && r[2] == 0x01 && r[3] == 0x10 && r[5] == addr && r[9] == grp &&
           r[10] == item && r[8] == op;
}

// Waits for the reply to (op, grp, item), skipping events; false after 16 reports or a 1 s silence.
bool Await(HidDev& d, BYTE op, BYTE grp, BYTE item, BYTE addr, std::vector<BYTE>& r) {
    for (int i = 0; i < 16; i++) {
        int n = d.Read(r, 1000);
        if (n <= 0) return false;
        if (IsReply(r, n, op, grp, item, addr)) return true;
    }
    return false;
}

bool ReadBattery(const HidColl& c, int& percent, bool& charging) {
    HidDev d;
    if (!d.Open(c)) return false;
    d.Flush();
    d.Write({ 0x06, 0x01 });  // the adapter's attach nudge; harmless if it is already attached
    std::vector<BYTE> r;
    d.Write(Frame(kOpHello, kGrpHello, kItemHello, kAddrDongle));
    Await(d, kOpHelloAck, kGrpHello, kItemHello, kReplyDongle, r);
    if (!d.Write(Frame(kOpHello, kGrpHello, kItemHello, kAddrHeadset)) ||
        !Await(d, kOpHelloAck, kGrpHello, kItemHello, kReplyHeadset, r))
        return false;  // headset off, out of range or not paired with the adapter
    if (!d.Write(Frame(kOpGet, kGrpBattery, kItemBattery, kAddrHeadset)) ||
        !Await(d, kOpGetReply, kGrpBattery, kItemBattery, kReplyHeadset, r) || r.size() < 14)
        return false;
    int level = r[11], count = r[12];
    if (count < 2 || level >= count) return false;  // not the adapter's own scale
    percent = level * 100 / (count - 1);
    charging = r[13] != 0;
    return true;
}

}  // namespace

void PollPlantronics(PollContext& ctx) {
    for (USHORT pid : { (USHORT)0x02EE, (USHORT)0x02F7 }) {
        if (ctx.IsClaimed(kVid, pid)) continue;
        for (const HidColl* c : ctx.Find(kVid, pid, [](const HidColl& c) { return c.page() == 0xFFA2 && c.usage() == 0x0003; })) {
            int percent = -1;
            bool charging = false;
            if (!ReadBattery(*c, percent, charging)) continue;
            DeviceStatus s;
            s.key = L"plantronics:" + Hex4(pid);
            s.name = L"Poly / Plantronics headset";
            s.kind = DeviceKind::Headset;
            s.via = L"BT600 adapter";
            s.percent = Clamp100(percent);
            s.charging = charging;
            ctx.Add(s, kVid, pid);
            break;
        }
    }
}
