// MOONDROP GM01 Pro wireless headset (35D8:0133, WalkPlay chipset).
//
// 2.4 GHz dongle: exposes the WalkPlay control channel on interface 3, a consumer-page collection
// with 64-byte input/output reports, report id 4B. Commands are [4B][dir][cmd][len][data...] with
// dir 80 = read, 01 = write; only reads are sent here. The dongle forwards most reads to the
// headset, so they go unanswered while the headset is not linked.
//   [4B][80][27][00] -> [4B][80][27][06][00][00][00][00][link][percent]
//     [8] link: 01 while the headset is on and paired; [9] percent: matched Moondrop Link (50%).
//   [4B][80][31][00] -> [4B][80][31][01][link]: answered by the dongle itself; 01 with the headset
//     linked, 00 once it switched to its USB cable.
//
// USB cable: the headset itself enumerates with the same 35D8:0133, but interface 3 then has a
// single consumer-control collection (no &colNN in the path) and no control channel, so there is
// no level to read. Plugged into the PC it is charging, so it is reported as charging and the app
// keeps showing the last level, dimmed. While on the cable it drops the 2.4 GHz link.
//
// Verified on hardware (35D8:0133, firmware 1.5.3): level over the dongle, cable detection, 31 = 00
// on the cable. Not seen yet: a charging flag while charging from a wall charger over 2.4 GHz.
// Protocol framing: github.com/jeromeof/devicePEQ (walkplayHidHandler.js); the battery command
// was found with a read-only scan of the READ command ids.
#include "drivers.h"

#include <cwctype>

namespace {

const USHORT kVid = 0x35D8;  // WalkPlay; shared by other DACs/dongles, so only known product ids
const USHORT kGM01Pro = 0x0133;
const BYTE kReport = 0x4B, kRead = 0x80, kCmdBattery = 0x27, kCmdLink = 0x31;

// Sends a READ for `cmd` and waits for its reply ([4B][80][cmd][len]...).
bool Query(HidDev& d, BYTE cmd, std::vector<BYTE>& r) {
    d.Flush();
    if (!d.Write({ kReport, kRead, cmd, 0x00 })) return false;
    ULONGLONG end = GetTickCount64() + 400;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0 || d.Read(r, left) < 5) return false;
        if (r[0] == kReport && r[1] == kRead && r[2] == cmd) return true;
    }
}

// Windows adds &colNN to the path only for devices with several top-level collections; the
// dongle has four on interface 3, the headset on its cable has one.
bool IsSingleCollection(const HidColl& c) {
    std::wstring p = c.path;
    for (auto& ch : p) ch = (wchar_t)towlower(ch);
    return p.find(L"&col") == std::wstring::npos;
}

}  // namespace

void PollMoondrop(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kGM01Pro)) return;
    DeviceStatus s;
    s.key = L"moondrop:" + Hex4(kGM01Pro);
    s.name = L"MOONDROP GM01 Pro";
    s.kind = DeviceKind::Headset;
    s.graceSec = 1800;

    bool found = false;      // a GM01 Pro (dongle or cable) is present
    bool dongleUnlinked = false;
    for (const HidColl* c : ctx.Find(kVid, kGM01Pro, [](const HidColl& c) { return c.iface == 3 && c.page() == 0x000C; })) {
        found = true;
        if (c->outLen() < 4 || c->inLen() < 10) continue;  // only the dongle's control channel
        HidDev d;
        std::vector<BYTE> r;
        if (!d.Open(*c)) continue;
        if (Query(d, kCmdBattery, r) && r.size() >= 10 && r[3] >= 6 && r[8] != 0 && r[9] <= 100) {
            s.via = L"2.4 GHz receiver";
            s.percent = r[9];
            ctx.Add(s, kVid, kGM01Pro);
            return;
        }
        if (Query(d, kCmdLink, r) && r[3] >= 1 && r[4] == 0) dongleUnlinked = true;
    }
    if (!found) return;

    bool onCable = false;
    for (const HidColl* c : ctx.Find(kVid, kGM01Pro, [](const HidColl& c) { return c.iface == 3; }))
        onCable |= IsSingleCollection(*c);
    if (onCable) {
        s.via = L"USB cable";
        s.charging = true;  // level unknown on the cable; the app keeps the last one, dimmed
        ctx.Add(s, kVid, kGM01Pro);
    } else if (dongleUnlinked) {
        s.via = L"2.4 GHz receiver";
        s.connected = false;  // headset switched off or out of range
        ctx.Add(s, kVid, kGM01Pro);
    } else {
        ctx.Claim(kVid, kGM01Pro);  // no answer: let the app keep the last value (graceSec)
    }
}
