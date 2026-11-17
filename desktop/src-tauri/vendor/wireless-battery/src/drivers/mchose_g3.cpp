// MCHOSE wireless mice (VID 3837). Currently supports the MCHOSE G3 V2 (2.4 GHz receiver
// 3837:4245 and USB cable 3837:418C) on vendor collection FF01:0010 (65-byte input/output reports).
// Protocol from github.com/Jstdi001/MCHOSE-Monitor (MIT), verified on MCHOSE G3 V2:
//   Output report (report ID 0, 64-byte payload zero-padded):
//     [00][55 30 A5 0B 2E 01 01 01 00 00 ...]
//   Input reply (after stripping leading 0 report ID):
//     [0] = AA, [1] = 30, [8] = percent (1..100), [9] = charging (1 = charging)
#include "drivers.h"

namespace {

constexpr USHORT kMchoseVid = 0x3837;
constexpr USHORT kG3V2WiredPid = 0x418C;
constexpr USHORT kG3V2WirelessPid = 0x4245;

bool QueryG3V2(const HidColl& c, int& percent, bool& charging) {
    HidDev d;
    if (!d.Open(c)) return false;
    d.Flush();
    if (!d.Write({ 0x00, 0x55, 0x30, 0xA5, 0x0B, 0x2E, 0x01, 0x01, 0x01, 0x00, 0x00 })) return false;

    std::vector<BYTE> r;
    ULONGLONG end = GetTickCount64() + 1000;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        int n = d.Read(r, left);
        if (n < 0) break;
        if (n >= 10 && r[0] == 0xAA && r[1] == 0x30) {
            if (r[8] < 1 || r[8] > 100) return false;
            percent = r[8];
            charging = r[9] == 1;
            return true;
        }
    }
    return false;
}

}  // namespace

void PollMchoseG3(PollContext& ctx) {
    // Prefer wired over 2.4 GHz when both are connected at the same time.
    bool found = false;
    for (USHORT pid : { kG3V2WiredPid, kG3V2WirelessPid }) {
        if (ctx.IsClaimed(kMchoseVid, pid)) continue;
        for (const HidColl* c : ctx.Find(kMchoseVid, pid, [](const HidColl& c) {
                 return c.page() == 0xFF01 && c.usage() == 0x0010 && c.outLen() >= 65 && c.inLen() >= 65;
             })) {
            if (found) {
                ctx.Claim(kMchoseVid, pid);
                break;
            }
            int pct = -1;
            bool chg = false;
            if (!QueryG3V2(*c, pct, chg)) continue;

            DeviceStatus s;
            s.key = L"mchose:g3v2";
            s.name = HidProduct(*c);
            if (s.name.empty()) s.name = L"MCHOSE G3 V2";
            s.kind = DeviceKind::Mouse;
            s.via = pid == kG3V2WiredPid ? L"USB cable" : L"2.4 GHz receiver";
            s.percent = pct;
            s.charging = chg;
            s.graceSec = 1800;
            ctx.Add(s, kMchoseVid, pid);
            found = true;
            break;
        }
    }
}
