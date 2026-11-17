// Kysona, Pulsar and ATK / VXE wireless mice (VID 3554, ATK dongles 373B), G-Wolves models on this protocol
// (VID 33E4, e.g. Fenrir Asym) and the original Hitscan
// Hyperlight (VID 3770, verified on the 1K receiver 3770:0200), Pulsar's newer XS-1 generation
// (VID 3710, verified on the 8K Dongle 3710:5406) and Redragon's Compx-based mice (M916 Pro 1K,
// M913 tri-mode, G49: receiver 3554:F55D / F5D5, cable F55E; verified on an M916 Pro 1K through
// the F55D receiver). They share one protocol:
// 17-byte output/input report id 08: [08][cmd][0 x14][checksum], checksum = 0x55 - sum(bytes 0..15).
//   cmd 03 = online status -> reply [6] = 1 when the mouse is connected to the dongle
//   cmd 04 = battery       -> reply [6] = percent, [7] = charging, [8..9] = millivolts
// ATK VXE Dragonfly R1 family (receivers 3554:F58A / F58E / F505, cables F58C / F58F / F506) uses the same
// protocol on vendor collection FF02:0002; its receivers expose several other 17-byte vendor collections
// (FF03..FF06), so FF02:0002 is tried first. IDs and protocol from github.com/S1berla/vxe-r1-pro-max-battery,
// github.com/orcunturkol/BatteryTray (PR #1) and HeyOkay/HaloBattery issue #273 (verified on F505).
// Reference: Linux drivers/hid/hid-kysona.c (Lode Willems) and the hid-pulsar patch discussion;
// Redragon ids from github.com/EliottV17/redragon-battery-omarchy and github.com/pingpingjinping/g49-web-control.
//
// The older dual-mode Redragon M913 Impact Elite (16000 DPI, Areson receiver 25A7:FA07, cable FA08)
// speaks an earlier form of the same protocol: the request is feature report 08 (same frame and
// checksum), the reply comes back as input report 09, and the battery byte [6] counts tens of
// percent (0..10). Source: github.com/dokutan/mouse_m908 (include/m913/readers.cpp, data.cpp,
// documentation/M913.md; raw 09 03 / 09 04 replies in issues #15 and #29).
#include "drivers.h"

#include <algorithm>

namespace {

// Redragon uses Compx's own ids, and its receiver only calls itself "2.4G Wireless Receiver".
bool IsRedragon(USHORT vid, USHORT pid) { return vid == 0x3554 && (pid == 0xF55D || pid == 0xF5D5 || pid == 0xF55E); }

bool IsVxeR1(USHORT vid, USHORT pid) {
    return vid == 0x3554 &&
           (pid == 0xF58A || pid == 0xF58C || pid == 0xF58E || pid == 0xF58F || pid == 0xF505 || pid == 0xF506);
}

bool IsCable(USHORT vid, USHORT pid) {
    bool hecate_cable = vid == 0x35BB && (pid == 0xD3FA || pid == 0xD3FC || pid == 0xD3FD);
    return (vid == 0x33E4 && GWolvesIsCable(pid)) || hecate_cable || (vid == 0x25A7 && pid == 0xFA08) ||
           (vid == 0x3554 && (pid == 0xF55E || pid == 0xF58C || pid == 0xF58F || pid == 0xF506));
}

// Dual-mode M913 (Areson ids, shared with the UtechSmart Venus Pro RGB on the same platform).
bool IsAresonM913(USHORT vid, USHORT pid) { return vid == 0x25A7 && (pid == 0xFA07 || pid == 0xFA08); }

BYTE Checksum(const BYTE* b) {
    unsigned sum = 0;
    for (int i = 0; i < 16; i++) sum += b[i];
    return (BYTE)(0x55 - sum);
}

// Sends `cmd` and waits for its checksummed reply. The Areson M913 takes the request as a feature
// report and answers with report id 09; everything else uses output/input report 08.
bool Query(HidDev& d, BYTE cmd, std::vector<BYTE>& r, bool areson = false) {
    std::vector<BYTE> req(17, 0);
    req[0] = 0x08;
    req[1] = cmd;
    req[16] = Checksum(req.data());
    d.Flush();
    if (!(areson ? d.SetFeature(req) : d.Write(req))) return false;
    BYTE replyId = areson ? 0x09 : 0x08;
    ULONGLONG end = GetTickCount64() + 500;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0 || d.Read(r, left) < 17) return false;
        if (r[0] == replyId && r[1] == cmd && r[16] == Checksum(r.data())) return true;
    }
}

std::wstring CleanName(std::wstring n, USHORT vid, USHORT pid) {
    if (vid == 0x33E4) return GWolvesModelName(pid);
    if (IsRedragon(vid, pid)) return L"Redragon wireless mouse";  // shared by several models
    if (IsVxeR1(vid, pid)) return L"VXE Dragonfly R1";  // the receivers call themselves "VXE NordicMouse 1K Dongle" etc.
    if (IsAresonM913(vid, pid)) return L"Redragon M913 Impact Elite";
    for (const wchar_t* suffix : { L" Dongle", L" Receiver", L" 2.4G", L" Wireless Receiver" }) {
        size_t l = wcslen(suffix);
        if (n.size() > l && n.compare(n.size() - l, l, suffix) == 0) n = n.substr(0, n.size() - l);
    }
    if (vid == 0x3770) return L"Hitscan Hyperlight";  // the receiver only calls itself "Hitscan USB Receiver"
    if (vid == 0x35BB) return L"HECATE mouse";
    if (n.empty()) n = vid == 0x373B ? L"ATK wireless mouse" : L"Wireless mouse";
    return n;
}

}  // namespace

void PollKysona(PollContext& ctx) {
    std::vector<std::wstring> seenNames;
    for (USHORT vendor : { (USHORT)0x3554, (USHORT)0x373B, (USHORT)0x3770, (USHORT)0x33E4, (USHORT)0x3710, (USHORT)0x35BB, (USHORT)0x25A7 }) {
        for (auto [vid, pid] : ctx.Products(vendor)) {
            // Only the two M913 ids on the Areson vendor id; other Areson mice use other protocols.
            bool areson = vid == 0x25A7;
            if (areson && !IsAresonM913(vid, pid)) continue;
            // ATK N9 Pro / N9 Ultra headsets speak a serial protocol (atk_serial.cpp); never send
            // them mouse frames, even when the ATK app holds their port and they stay unclaimed.
            if (vid == 0x373B && (pid == 0x11CA || pid == 0x11CB || pid == 0x1203 || pid == 0x1204)) continue;
            // Kysona exposes a dedicated 17-byte collection; ATK / VXE receivers put report 08 in a
            // vendor collection that also carries larger reports; the Areson M913 has a 17-byte
            // feature report. The checksummed reply filters out anything that does not speak this protocol.
            auto colls = ctx.Find(vid, pid, [areson](const HidColl& c) {
                if (areson) return c.featLen() >= 17 && c.inLen() >= 17;
                return (c.outLen() == 17 && c.inLen() == 17) || (c.page() >= 0xFF00 && c.outLen() >= 17 && c.inLen() >= 17);
            });
            // The battery channel is FF02:0002 where it exists; try it before the other vendor collections.
            std::stable_sort(colls.begin(), colls.end(), [](const HidColl* a, const HidColl* b) {
                return (a->page() == 0xFF02 && a->usage() == 0x0002) > (b->page() == 0xFF02 && b->usage() == 0x0002);
            });
            for (const HidColl* c : colls) {
                HidDev d;
                if (!d.Open(*c)) continue;
                std::vector<BYTE> r;
                DeviceStatus s;
                bool answered = false;
                if (Query(d, 0x03, r, areson)) {
                    answered = true;
                    s.connected = r[6] != 0;
                }
                if ((!answered || s.connected) && Query(d, 0x04, r, areson)) {
                    answered = true;
                    s.connected = true;
                    if (areson) {
                        // [6] = level in tens of percent; [7] looks like the charging flag (seen 0 and 1
                        // in mouse_m908 dumps, not decoded there), no voltage.
                        if (r[6] <= 10) s.percent = r[6] * 10;
                        s.charging = r[7] == 1;
                    } else {
                        if (r[6] <= 100) s.percent = r[6];
                        s.charging = r[7] != 0;
                        s.millivolts = (r[8] << 8) | r[9];
                    }
                } else if (answered && s.connected) {
                    s.asleep = true;  // the receiver says online but the mouse did not answer: keep the last value
                }
                if (!answered) continue;
                if (!s.connected) {
                    ctx.Claim(vid, pid);
                    break;
                }
                s.key = L"kysona:" + Hex4(vid) + L":" + Hex4(pid);
                s.name = CleanName(HidProduct(*c), vid, pid);
                s.kind = KindFromCollections(ctx.colls, vid, pid);
                if (s.kind == DeviceKind::Other) s.kind = DeviceKind::Mouse;
                s.via = IsCable(vid, pid) ? L"USB cable" : L"2.4 GHz receiver";
                s.graceSec = 1800;
                // A mouse plugged in for charging can show up twice (cable + dongle); keep one.
                bool dup = false;
                for (auto& n : seenNames) dup |= n == s.name;
                if (dup) {
                    ctx.Claim(vid, pid);
                    for (auto& o : ctx.out)
                        if (o.name == s.name && s.charging) o.charging = true;
                } else {
                    seenNames.push_back(s.name);
                    ctx.Add(s, vid, pid);
                }
                break;
            }
        }
    }
}
