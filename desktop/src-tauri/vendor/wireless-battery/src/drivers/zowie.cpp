// BenQ ZOWIE wireless mice (VID 04A5). Zowie ships no software; these vendor commands were
// reverse-engineered by the community. Only the read-only battery commands below are ever sent
// (other EC-CW commands reboot the receiver and unpair the mouse).
//  * EC-CW series (EC1/EC2/EC3-CW): receiver 8006, cable 8005. Unnumbered 64-byte output report
//    [A5 03]; reply [mV lo][mV hi][percent]... mV = 0 when the mouse is not linked.
//    From github.com/yleshchuk/zowie-battery.
//  * DW series (U2-DW, S2-DW ...): receiver 800A. Output report 08 [B4 15] on usage page FF03,
//    reply input report 09 on usage page FF04: mV = ([1] * 256 + [2]) * 10, [4] == C8.
//    From github.com/IgnacioBarb/zowie-battery-tray (MIT).
//  * U2: receiver 8008 (product string "BenQ ZOWIE Gaming Mouse"), same FF03 / FF04 layout and
//    commands as the DW series.
// On the charging dock the mouse charges over contacts, so nothing new shows up on USB; over radio
// only the voltage arrives. Charging is therefore inferred from how the voltage moves (same rules
// as zowie-battery-tray): a rise of 50 mV above the lowest reading means it went on the dock, a
// drop of 20 mV below the highest means it came off. The receiver only passes on a new voltage
// when the mouse sends one, so readings change in steps.
#include <algorithm>
#include <map>

#include "drivers.h"

namespace {

// Voltage -> % anchored on the mouse's own LED thresholds (10 / 25 / 50 %).
int ZowiePercent(int mv) {
    static const int v[] = { 4200, 4000, 3890, 3760, 3680, 3500 };
    static const int p[] = { 100, 75, 50, 25, 10, 0 };
    return Interpolate(mv, v, p, 6);
}

// Charging guess from the voltage trend of one receiver. Only touched by the polling thread.
struct ChargeTrend {
    bool has = false, charging = false;
    int peak = 0, trough = 0;

    bool Update(int mv) {
        if (!has) {
            has = true;
            charging = mv >= 4250;  // a resting Li-ion cell never sits above ~4.2 V
            peak = trough = mv;
        } else if (charging) {
            peak = std::max(peak, mv);
            if (mv <= peak - 20) { charging = false; trough = mv; }
        } else {
            trough = std::min(trough, mv);
            if (mv >= trough + 50) { charging = true; peak = mv; }
        }
        return charging;
    }
};
std::map<USHORT, ChargeTrend> g_trend;

bool PollCw(PollContext& ctx, USHORT pid) {
    for (const HidColl* c : ctx.Find(0x04A5, pid, [](const HidColl& c) { return c.page() >= 0xFF00 && c.outLen() == 65; })) {
        HidDev d;
        if (!d.Open(*c)) continue;
        d.Flush();
        if (!d.Write({ 0x00, 0xA5, 0x03 })) continue;
        std::vector<BYTE> r;
        if (d.Read(r, 1000) < 3) continue;
        int mv = r[0] | (r[1] << 8);
        if (mv != 0 && (mv < 3000 || mv > 4500)) continue;  // not a battery reply
        DeviceStatus s;
        s.key = L"zowie:" + Hex4(pid);
        s.name = L"ZOWIE EC-CW";
        s.kind = DeviceKind::Mouse;
        s.via = pid == 0x8005 ? L"USB cable" : L"2.4 GHz receiver";
        s.charging = pid == 0x8005;
        if (mv == 0) {
            s.connected = false;
        } else {
            s.millivolts = mv;
            s.percent = (r[2] >= 1 && r[2] <= 100) ? r[2] : ZowiePercent(mv);
        }
        ctx.Add(s, 0x04A5, pid);
        return true;
    }
    return false;
}

bool PollDw(PollContext& ctx, USHORT pid) {
    auto cmd = ctx.Find(0x04A5, pid, [](const HidColl& c) { return c.page() == 0xFF03 && c.outLen() == 16; });
    auto rep = ctx.Find(0x04A5, pid, [](const HidColl& c) { return c.page() == 0xFF04 && c.inLen() == 16; });
    if (cmd.empty() || rep.empty()) return false;
    HidDev in, out;
    if (!in.Open(*rep[0]) || !out.Open(*cmd[0])) return false;  // open the reply channel first
    in.Flush();
    if (!out.Write({ 0x08, 0xB4, 0x15 })) return false;
    std::vector<BYTE> r;
    ULONGLONG end = GetTickCount64() + 1500;
    bool ok = false;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (in.Read(r, left) < 5) break;
        if (r[0] == 0x09) { ok = true; break; }
    }
    if (!ok || r[1] == 0xE6 || r[4] != 0xC8) return false;
    int mv = (r[1] * 256 + r[2]) * 10;
    bool cable = pid != 0x800A && pid != 0x8008;  // 800A: DW receiver, 8008: U2 receiver
    DeviceStatus s;
    s.key = L"zowie:" + Hex4(pid);
    s.name = HidProduct(*cmd[0]);
    if (pid == 0x8008) s.name = L"ZOWIE U2";  // its receiver only reports "BenQ ZOWIE Gaming Mouse"
    else if (s.name.empty() || s.name.find(L"Receiver") != std::wstring::npos) s.name = L"ZOWIE DW mouse";
    s.kind = DeviceKind::Mouse;
    s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
    if (mv == 0) {
        s.connected = false;
    } else {
        s.millivolts = mv;
        s.percent = ZowiePercent(mv);
        s.charging = cable || g_trend[pid].Update(mv);
    }
    ctx.Add(s, 0x04A5, pid);
    return true;
}

}  // namespace

void PollZowie(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x04A5)) {
        if (pid == 0x8005 || pid == 0x8006) PollCw(ctx, pid);
        else PollDw(ctx, pid);  // only acts on devices with the DW command/reply collections
    }
}
