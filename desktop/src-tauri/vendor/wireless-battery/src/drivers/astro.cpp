#include "drivers.h"

void PollAstro(PollContext& ctx) {
    for (const auto& c : ctx.colls) {
        if (c.vid != 0x046D || (c.pid != 0x0B0B && c.pid != 0x0B1C) ||
            ctx.IsClaimed(c.vid, c.pid) || c.page() != 0xFF32 || c.usage() != 0x0074 ||
            c.inLen() != 64 || c.outLen() != 64) continue;
        HidDev d;
        if (!d.Open(c)) continue;
        d.Flush();
        // No payload: read battery only; never change audio or headset settings.
        std::vector<BYTE> request(64, 0);
        request[0] = 0x02;
        request[1] = 0x0C;
        request[2] = 3;
        request[4] = 0x06;
        request[5] = 0x0C;
        if (!d.Write(request)) continue;
        const auto deadline = GetTickCount64() + 1000;
        for (int attempt = 0; attempt < 8; ++attempt) {
            const auto now = GetTickCount64();
            if (now >= deadline) break;
            std::vector<BYTE> reply;
            int n = d.Read(reply, (int)(deadline - now));
            if (n < 0) break;
            // Ignore unsolicited volume/mix events and malformed or partial frames.
            if (n < 9 || reply.size() < 9 || reply[0] != 0x02 || reply[1] != 0x0C ||
                reply[2] < 6 || (size_t)reply[2] + 3 > reply.size() ||
                (int)reply[2] + 3 > n || reply[3] != 0 || reply[4] != 0x06 ||
                (reply[5] != 0 && reply[5] != 0x0C) || reply[6] > 100) continue;
            DeviceStatus s;
            s.key = L"astro:" + c.path;
            s.name = c.pid == 0x0B0B ? L"ASTRO A50 X" : L"ASTRO A50 Gen 5";
            s.kind = DeviceKind::Headset;
            s.via = L"USB base station";
            s.percent = reply[6];
            s.charging = reply[8] != 0;
            ctx.Add(s, c.vid, c.pid);
            break;
        }
    }
}
