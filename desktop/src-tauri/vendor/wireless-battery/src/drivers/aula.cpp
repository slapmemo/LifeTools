// AULA F75 / F87 Pro / F99 wireless keyboards on the Compx 2.4 GHz receiver (VID 3554, PID FA09).
// The receiver exposes a 20-byte vendor collection on usage page FF02 / usage 02. Battery is a
// 20-byte output report 0x13 carrying command 0x4A and a trailing sum checksum. The reply is
// another 0x13 frame whose command byte, with its top bit masked, is 0x4A. Its payload starts at
// byte 5: the level (1..100), then the state byte (0x01 on battery, 0x10 with the cable in).
// The receiver also pushes unrelated 0x13 frames (a 0x0A status among them), so the report id
// alone does not identify the reply.
// A keyboard that is dozing or has just switched to 2.4 GHz leaves the first request unanswered
// (one F75 capture timed out at exactly 1 s), so the request is resent every ~1.3 s within one
// 4-second deadline, the documented exception for slow links. Byte 2 alternates between 00 (PyFlat,
// sanshoku captures on the F75) and 01 (the "packet count" the Womier L65 tool sends on the same
// receiver); the reply is identified by command and checksum either way.
// From github.com/PyFlat/Device-Battery-Info (PR 6), github.com/deepan-alve/womier-l65-linux
// (windows/l65w.ps1) and github.com/ushineko/sanshoku issue 36.
#include "drivers.h"

#include <algorithm>

namespace {

BYTE Sum(const std::vector<BYTE>& b, size_t n) {
    unsigned s = 0;
    for (size_t i = 0; i < n; i++) s += b[i];
    return (BYTE)(s & 0xFF);
}

bool SendRequest(HidDev& d, BYTE packets) {
    std::vector<BYTE> req(20, 0);
    req[0] = 0x13;
    req[1] = 0x4A;
    req[2] = packets;
    req[19] = Sum(req, 19);
    return d.Write(req);
}

bool QueryBattery(HidDev& d, std::vector<BYTE>& r) {
    const ULONGLONG start = GetTickCount64(), end = start + 4000;  // single absolute deadline
    const int kResendMs = 1300;
    int sent = 0;
    d.Flush();
    for (;;) {
        LONGLONG now = (LONGLONG)GetTickCount64();
        if (now >= (LONGLONG)end) return false;
        if (now >= (LONGLONG)start + (LONGLONG)sent * kResendMs) {
            if (!SendRequest(d, (BYTE)(sent & 1))) return false;
            ++sent;
        }
        LONGLONG nextSend = (LONGLONG)start + (LONGLONG)sent * kResendMs;
        int wait = (int)(std::min<LONGLONG>(nextSend, (LONGLONG)end) - now);
        if (wait < 1) wait = 1;
        ULONGLONG before = GetTickCount64();
        int n = d.Read(r, wait);
        // A read that fails at once is an I/O error (receiver unplugged), not a timeout: stop.
        if (n < 0 && (int)(GetTickCount64() - before) + 20 < wait) return false;
        if (n < 20) continue;  // timeout (resend or give up above) or a short unrelated report
        if (r[0] != 0x13) continue;
        if ((r[1] & 0x7F) != 0x4A) continue;  // the receiver also pushes unrelated 0x13 frames
        if (r[19] != Sum(r, 19)) continue;
        return true;
    }
}

}  // namespace

void PollAula(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x3554)) {
        if (pid != 0xFA09) continue;  // other 3554 products are mice on a different protocol
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.page() == 0xFF02 && c.usage() == 0x0002 && c.outLen() >= 20 && c.inLen() >= 20;
             })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            std::vector<BYTE> r;
            if (!QueryBattery(d, r)) continue;
            int level = r[5];
            if (level < 1 || level > 100) continue;
            DeviceStatus s;
            s.key = L"aula:" + Hex4(vid) + L":" + Hex4(pid);
            s.name = L"AULA wireless keyboard";
            s.kind = DeviceKind::Keyboard;
            s.via = L"2.4 GHz receiver";
            s.percent = level;
            s.charging = r[6] == 0x10;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}
