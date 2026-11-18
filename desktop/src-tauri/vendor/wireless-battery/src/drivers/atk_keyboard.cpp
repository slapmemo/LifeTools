// ATK V75X keyboard on its 2.4 GHz receiver (320F:5088) or its USB cable (320F:5055).
// Ported from HaloBattery (github.com/HeyOkay/HaloBattery, providers/atk_keyboard.py, MIT; confirmed there by
// its author on both), from ATK HUB 3.2.29's Evision keyboard driver (keyboard-info.util-*.js).
//   Output report 04 on FF1C:0092, 31 payload bytes: [04][seq lo][seq hi][1A][00 ...]
//   Input report 04: [04][seq lo][seq hi][1A][..][00 00][..][percent][state: 0 on battery, 1/2 charging]
// These ids are shared with other Evision keyboards, so the product name is checked as well.
// HaloBattery only asks over the receiver while the keyboard is being typed on, so a sleeping keyboard is
// not woken. This app does not watch keyboard input, so it asks at most every 10 minutes over the receiver
// instead (every poll on the cable, which powers the keyboard anyway).
#include "drivers.h"

#include <map>

namespace {

constexpr USHORT kVid = 0x320F, kReceiver = 0x5088, kCable = 0x5055;
constexpr ULONGLONG kReceiverIntervalMs = 10 * 60 * 1000;

bool ReadBattery(const HidColl& c, int& percent, bool& charging) {
    static USHORT seq = 0;
    seq = (USHORT)(seq % 0xFFFF + 1);
    HidDev d;
    if (!d.Open(c)) return false;
    d.Flush();
    std::vector<BYTE> req(32, 0);
    req[0] = 0x04;
    req[1] = (BYTE)(seq & 0xFF);
    req[2] = (BYTE)(seq >> 8);
    req[3] = 0x1A;
    if (!d.Write(req)) return false;
    ULONGLONG end = GetTickCount64() + 1000;
    std::vector<BYTE> r;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int n = d.Read(r, 100);
        if (n < 10 || r[0] != 0x04 || r[1] != (BYTE)(seq & 0xFF) || r[2] != (BYTE)(seq >> 8) || r[3] != 0x1A || r[5] || r[6])
            continue;
        if (r[8] > 100 || r[9] > 2) return false;
        percent = r[8];
        charging = r[9] == 1 || r[9] == 2;
        return true;
    }
    return false;
}

}  // namespace

void PollAtkKeyboard(PollContext& ctx) {
    static ULONGLONG lastAsk = 0;
    static int lastPercent = -1;
    static bool lastCharging = false;
    for (USHORT pid : { kCable, kReceiver }) {  // the cable wins when both are connected
        if (ctx.IsClaimed(kVid, pid)) continue;
        bool cable = pid == kCable;
        const wchar_t* product = cable ? L"ATK V75X" : L"ATK V75X 2.4G Dongle";
        for (const HidColl* c : ctx.Find(kVid, pid, [](const HidColl& c) { return c.page() == 0xFF1C && c.usage() == 0x0092; })) {
            std::wstring name = HidProduct(*c);
            while (!name.empty() && name.back() == L' ') name.pop_back();
            if (_wcsicmp(name.c_str(), product) != 0) continue;
            DeviceStatus s;
            s.key = L"atk_keyboard:5088";  // one entry for the keyboard on either connection
            s.name = L"ATK V75X";
            s.kind = DeviceKind::Keyboard;
            s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
            s.graceSec = 1800;
            ULONGLONG now = GetTickCount64();
            bool ask = cable || !lastAsk || now - lastAsk >= kReceiverIntervalMs;
            int percent = -1;
            bool charging = false;
            if (ask) {
                lastAsk = now;
                if (ReadBattery(*c, percent, charging)) {
                    lastPercent = percent;
                    lastCharging = charging;
                }
            }
            if (ask && percent < 0) {
                s.asleep = true;  // no reply: asleep, off or busy; keep the last value
            } else {
                s.percent = ask ? percent : lastPercent;
                s.charging = ask ? charging : lastCharging;
                if (s.percent < 0) s.asleep = true;
            }
            ctx.Add(s, kVid, pid);
            if (cable) ctx.Claim(kVid, kReceiver);
            return;
        }
    }
}
