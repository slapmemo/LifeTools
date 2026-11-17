// Sony INZONE H9 II (054C:0FA8) and H5 (054C:0EBF) headsets and the INZONE Buds dongle (054C:0EC2):
// a Sony command layer tunnelled through HID (report 02, 64 bytes) on the vendor collection with
// usage page FF04.
//   command: [02][len][01][00 FC][8+n][96 C3][addr][event][type][tid lo][tid hi][payload][sum]
//   event:   [02][len][04][FF][..][00][96 C3][addr][event][type][tid lo][tid hi][payload][sum]
// Battery = event 04, type 01 (GET) to the headset (addr 0x41). Both directions carry a checksum
// and a transaction id.
//   Headsets: reply payload [charging][percent], percent FF = headset off.
//   Buds:     reply payload [status][percent] for the left bud, right bud, then case; percent FF =
//             bud is in the case. With both buds in the case the dongle does not respond. No
//             charging flag.
// Protocol from github.com/Sapd/HeadsetControl (sony_inzone_protocol.hpp, sony_inzone_buds.hpp).
// Buds reply layout and left-first order from github.com/kinako19/inzone-buds-battery-tray and
// github.com/takamachi66/inzone-buds-battery-tray (docs/protocol*.md).
#include "drivers.h"
#include <algorithm>

namespace {

struct Event { BYTE id, type; USHORT tid; std::vector<BYTE> payload; };

bool ParseEvent(const std::vector<BYTE>& b, Event& e) {
    if (b.size() < 15 || b[0] != 0x02) return false;
    int len = b[1];
    if (len < 12 || len > 62 || (int)b.size() < len + 2) return false;
    if (b[2] != 0x04 || b[3] != 0xFF || b[5] != 0x00 || b[6] != 0x96 || b[7] != 0xC3) return false;
    if ((b[8] >> 4) != 0x1) return false;  // must be addressed to the PC
    unsigned sum = 0;
    for (int i = 5; i <= len; i++) sum += b[i];
    if ((BYTE)sum != b[len + 1]) return false;
    e.id = b[9];
    e.type = b[10];
    e.tid = (USHORT)(b[11] | (b[12] << 8));
    e.payload.assign(b.begin() + 13, b.begin() + len + 1);
    return true;
}

enum class Reply { Ok, NoReply, Failed };

// NoReply/Failed are identical for headset
// For buds, NoReply can imply both buds are in the case
Reply GetBattery(HidDev& d, size_t minPayload, std::vector<BYTE>& payload) {
    static USHORT tid = 1;
    if (++tid <= 1) tid = 2;  // tid 1 is used by the dongle's own notifications
    std::vector<BYTE> req(64, 0);
    req[0] = 0x02;
    req[1] = 12;     // HCI byte count (no payload)
    req[2] = 0x01;   // HCI command
    req[3] = 0x00;
    req[4] = 0xFC;   // vendor opcode 0xFC00
    req[5] = 8;
    req[6] = 0x96;
    req[7] = 0xC3;
    req[8] = 0x41;   // PC -> headset
    req[9] = 0x04;   // battery info
    req[10] = 0x01;  // GET
    req[11] = (BYTE)tid;
    req[12] = (BYTE)(tid >> 8);
    unsigned sum = 0;
    for (int i = 6; i <= 12; i++) sum += req[i];
    req[13] = (BYTE)sum;
    d.Flush();
    if (!d.Write(req)) return Reply::Failed;
    ULONGLONG end = GetTickCount64() + 1500;
    std::vector<BYTE> r;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (d.Read(r, left) < 15) return Reply::NoReply;
        Event e;
        if (!ParseEvent(r, e) || e.id != 0x04 || e.tid != tid || e.payload.size() < minPayload) continue;
        if (e.type != 0x10 && e.type != 0xA0) continue;  // RET or active notification
        payload = std::move(e.payload);
        return Reply::Ok;
    }
    return Reply::NoReply;
}

// Lowest bud charge percent, or -1 when both are docked. FF = docked
// Values > 100 are invalid and skipped.
int LowestBudOut(const std::vector<BYTE>& p) {
    int lvl = -1;
    for (int i : { 1, 3 }) {
        if (p[i] > 100) continue;
        lvl = lvl < 0 ? p[i] : std::min<int>(lvl, p[i]);
    }
    return lvl;
}

}  // namespace

void PollSonyInzone(PollContext& ctx) {
    // minPayload: headsets reply [charging][percent];
    // buds reply 3x [status][percent] for both buds + case.
    struct Model { USHORT pid; const wchar_t* name; bool buds; size_t minPayload; };
    for (const Model& m : { Model{ 0x0FA8, L"Sony INZONE H9 II", false, 2 },
                            Model{ 0x0EBF, L"Sony INZONE H5", false, 2 },
                            Model{ 0x0EC2, L"Sony INZONE Buds", true, 6 } }) {
        if (ctx.IsClaimed(0x054C, m.pid)) continue;
        auto status = [&] {
            DeviceStatus s;
            s.key = L"inzone:" + Hex4(m.pid);
            s.name = m.name;
            s.kind = DeviceKind::Headset;
            s.via = L"2.4 GHz receiver";
            return s;
        };
        bool added = false, noReply = false;
        auto filter = [](const HidColl& c) { return c.page() == 0xFF04 && c.outLen() >= 64; };
        for (const HidColl* c : ctx.Find(0x054C, m.pid, filter)) {
            HidDev d;
            if (!d.Open(*c)) continue;
            std::vector<BYTE> p;
            Reply reply = GetBattery(d, m.minPayload, p);
            if (reply == Reply::NoReply) noReply = true;
            if (reply != Reply::Ok) continue;
            DeviceStatus s = status();
            if (m.buds) {
                int lvl = LowestBudOut(p);
                s.connected = lvl >= 0;
                s.percent = lvl;
            } else {
                bool offline = p[1] == 0xFF;
                s.connected = !offline;
                s.percent = offline ? -1 : (p[1] <= 100 ? p[1] : -1);
                s.charging = p[0] != 0;
            }
            ctx.Add(s, 0x054C, m.pid);
            added = true;
            break;
        }
        // Buds: the dongle took the request but no collection answered, which is what it does with both
        // buds in the case. Add them as not connected (hidden) rather than treating the dongle as missing.
        if (m.buds && noReply && !added) {
            DeviceStatus s = status();
            s.connected = false;
            ctx.Add(s, 0x054C, m.pid);
        }
    }
}
