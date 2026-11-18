// Royal Kludge (RK) MG6 Pro wireless mouse, vendor id 2E3C.
// Protocol from RK's web driver (drive.rkgaming.com, assets/index-*.js): the MG6 Pro entries use
// protocolType "QiWang", whose getDeviceBattery() builds an unencrypted 64-byte frame and sends it as
// output report 0 on the vendor collection:
//   [0] msg type 1 (TYPE_CFG_REMOTE_PARAM: forwarded to the mouse)
//   [1] main cfg type 1 (CFG_MAIN_TYPE_SYS_CTRL), data length 0 in the high nibble
//   [2] sub cfg type 2 (CFG_SYS_CTRL_GET_BATTER_VOL)
//   [3] property byte, bit 0 = access READ
// The reply has the same first three bytes; [3] bit 4 is access_res (1 = the mouse answered),
// [4..5] voltage (mV, little endian), [6..7] percent, [8..9] temperature, [10] USB plugged in.
// The web driver ignores replies with access_res 0; here they are shown as "asleep" (the receiver
// answered for a mouse that did not).
// Product ids from the same file: 00A6 / 00E6 = 2.4 GHz dongle (vendor page FF00:0001),
// 00A5 / 00E5 = USB cable (vendor page FFF2:0001).
#include "drivers.h"

namespace {

bool IsCable(USHORT pid) { return pid == 0x00A5 || pid == 0x00E5; }

bool PollMg6(PollContext& ctx, USHORT vid, USHORT pid) {
    const USHORT page = IsCable(pid) ? 0xFFF2 : 0xFF00;
    for (const HidColl* c : ctx.Find(vid, pid, [page](const HidColl& c) {
             return c.page() == page && c.usage() == 1 && c.outLen() == 65 && c.inLen() == 65;
         })) {
        HidDev d;
        if (!d.Open(*c)) continue;
        bool answered = false, online = false;
        int percent = -1, mv = 0;
        bool plugged = false;
        for (int attempt = 0; attempt < 3 && !online; ++attempt) {
            if (attempt) Sleep(100);
            d.Flush();
            if (!d.Write({ 0x00, 0x01, 0x01, 0x02, 0x01 })) break;
            // The receiver also pushes other notifications on this collection; skip until the battery reply.
            ULONGLONG end = GetTickCount64() + 600;
            std::vector<BYTE> r;
            while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
                int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
                if (d.Read(r, left) < 11) break;
                if ((r[0] & 0x1F) != 0x01 || (r[1] & 0x0F) != 0x01 || r[2] != 0x02) continue;
                answered = true;
                if (!((r[3] >> 4) & 1)) break;  // access_res 0: mouse did not answer
                int p = r[6] | (r[7] << 8);
                if (p > 100) break;
                online = true;
                percent = p;
                mv = r[4] | (r[5] << 8);
                plugged = r[10] != 0;
                break;
            }
        }
        if (!answered) continue;
        DeviceStatus s;
        s.key = L"rk:" + Hex4(vid) + L":" + Hex4(pid);
        s.name = L"RK MG6 Pro";
        s.kind = DeviceKind::Mouse;
        s.via = IsCable(pid) ? L"USB cable" : L"2.4 GHz receiver";
        if (online) {
            s.percent = percent;
            if (mv >= 3000 && mv <= 4500) s.millivolts = mv;
            s.charging = plugged || IsCable(pid);
        } else {
            s.asleep = true;  // receiver answered, mouse did not: asleep or off, keep the last value
        }
        ctx.Add(s, vid, pid);
        return true;
    }
    return false;
}

}  // namespace

void PollRoyalKludge(PollContext& ctx) {
    constexpr USHORT vid = 0x2E3C;
    for (auto [v, pid] : ctx.Products(vid)) {
        if (pid == 0x00A5 || pid == 0x00A6 || pid == 0x00E5 || pid == 0x00E6) PollMg6(ctx, v, pid);
    }
}
