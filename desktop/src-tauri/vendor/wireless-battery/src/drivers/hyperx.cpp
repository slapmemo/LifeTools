// HyperX wireless headsets and Pulsefire Haste 2 mice (HP VID 03F0, older Kingston VID 0951).
// Protocols: Pulsefire Haste 2 Core Wireless verified on hardware (03F0:0AB5), see HasteWireless;
// Cloud III Wireless verified on hardware (03F0:0C9D) and github.com/Medprj/HyperXWM;
// Cloud III S from github.com/LennardKittner/HyperHeadset; Cloud Stinger Core from
// github.com/davidsantanaalves/HyperBatteryMonitor; the others follow github.com/Sapd/HeadsetControl.
#include "drivers.h"

#include <cmath>

namespace {

// Writes `req` and returns the first input report accepted by `match` within `timeoutMs`.
template <class Match>
bool Query(HidDev& d, const std::vector<BYTE>& req, std::vector<BYTE>& resp, int timeoutMs, Match match) {
    if (!d.Write(req)) return false;
    ULONGLONG end = GetTickCount64() + timeoutMs;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0 || d.Read(resp, left) < 0) return false;
        if (match(resp)) return true;
    }
}

DeviceStatus Base(USHORT pid, const wchar_t* name) {
    DeviceStatus s;
    s.key = L"hyperx:" + Hex4(pid);
    s.name = name;
    s.kind = DeviceKind::Headset;
    s.via = L"2.4 GHz receiver";
    return s;
}

// Cloud III Wireless: report 66 <cmd>; 82 -> [2] connected, 8A -> [2] charging, 89 -> [2..3] mV, [4] %.
bool Cloud3(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    auto q = [&](BYTE cmd, std::vector<BYTE>& r) {
        return Query(d, { 0x66, cmd }, r, 800, [cmd](const std::vector<BYTE>& r) { return r.size() >= 5 && r[0] == 0x66 && r[1] == cmd; });
    };
    std::vector<BYTE> r;
    if (!q(0x82, r)) return false;
    s = Base(c.pid, (c.pid == 0x069F || c.pid == 0x0995) ? L"HyperX Cloud II Core Wireless" : L"HyperX Cloud III Wireless");
    s.connected = r[2] != 0;
    if (s.connected) {
        if (q(0x8A, r)) s.charging = r[2] == 1;
        if (q(0x89, r) && r[4] <= 100) { s.percent = r[4]; s.millivolts = (r[2] << 8) | r[3]; }
    }
    return true;
}

// Cloud II Wireless (HP): report 06 FF BB <cmd>; 02 -> [7] %, 03 -> [4] charging.
bool Cloud2(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    auto q = [&](BYTE cmd, std::vector<BYTE>& r) {
        return Query(d, { 0x06, 0xFF, 0xBB, cmd }, r, 1000,
                     [cmd](const std::vector<BYTE>& r) { return r.size() >= 8 && r[0] == 0x06 && r[1] == 0xFF && r[2] == 0xBB && r[3] == cmd; });
    };
    std::vector<BYTE> r;
    if (!q(0x02, r) || r[7] > 100) return false;
    s = Base(c.pid, L"HyperX Cloud II Wireless");
    s.percent = r[7];
    s.millivolts = (r[5] << 8) | r[6];
    if (q(0x03, r)) s.charging = r[4] == 1;
    return true;
}

// Cloud II Wireless (Kingston 0951:1718): fixed 62-byte frame, reply 0B 00 BB <cmd>.
bool Cloud2Kingston(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    auto q = [&](BYTE cmd, std::vector<BYTE>& r) {
        std::vector<BYTE> req = { 0x06, 0x00, 0x02, 0x00, 0x9A, 0x00, 0x00, 0x68, 0x4A, 0x8E, 0x0A, 0x00, 0x00, 0x00, 0xBB, cmd, 0x00 };
        return Query(d, req, r, 1000, [cmd](const std::vector<BYTE>& r) { return r.size() >= 8 && r[0] == 0x0B && r[2] == 0xBB && r[3] == cmd; });
    };
    std::vector<BYTE> r;
    if (!q(0x02, r) || r[7] > 100) return false;
    s = Base(c.pid, L"HyperX Cloud II Wireless");
    s.percent = r[7];
    if (q(0x03, r)) s.charging = r[4] == 1;
    return true;
}

// Cloud Alpha Wireless: 21 BB <cmd>; 03 -> [3]==1 offline, 0C -> [3]==1 charging, 0B -> [3] %.
bool CloudAlpha(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    auto q = [&](BYTE cmd, std::vector<BYTE>& r) {
        return Query(d, { 0x21, 0xBB, cmd }, r, 1000, [cmd](const std::vector<BYTE>& r) { return r.size() >= 4 && r[0] == 0x21 && r[2] == cmd; });
    };
    std::vector<BYTE> r;
    if (!q(0x03, r)) return false;
    s = Base(c.pid, L"HyperX Cloud Alpha Wireless");
    s.connected = r[3] != 0x01;
    if (!s.connected) return true;
    if (q(0x0C, r)) s.charging = r[3] == 0x01;
    if (q(0x0B, r) && r[3] <= 100) s.percent = r[3];
    return true;
}

// Cloud Alpha 2 Wireless: [cmd][sub]; reply [cmd+1][sub]...; 52 01 -> [2] connected, 50 02 -> [2] %, [3] charging.
bool CloudAlpha2(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    auto q = [&](BYTE cmd, BYTE sub, std::vector<BYTE>& r) {
        return Query(d, { cmd, sub }, r, 1000, [cmd, sub](const std::vector<BYTE>& r) { return r.size() >= 8 && r[0] == cmd + 1 && r[1] == sub; });
    };
    std::vector<BYTE> r;
    if (!q(0x52, 0x01, r)) return false;
    s = Base(c.pid, L"HyperX Cloud Alpha 2 Wireless");
    s.connected = r[2] != 0;
    if (s.connected && q(0x50, 0x02, r) && r[2] <= 100) {
        s.percent = r[2];
        s.charging = r[3] == 0x01;
        s.millivolts = r[6] | (r[7] << 8);
    }
    return true;
}

// Pulsefire Haste 2 (Core) Wireless: NGENUITY's read-only battery query, the same 52 01 / 50 02 pair as
// Cloud Alpha 2, on the dongle's vendor collection (interface 2). 64-byte reports.
// From github.com/PMarinov1994/ngenuity-linux-cli (Haste 2 Wireless). Verified on a Core Wireless (03F0:0AB5);
// the Haste 2 Wireless dongles (0D97, 0F98) are untested.
bool HasteWireless(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    auto q = [&](BYTE cmd, BYTE sub, std::vector<BYTE>& r) {
        return Query(d, { cmd, sub }, r, 1000, [cmd, sub](const std::vector<BYTE>& r) { return r.size() >= 8 && r[0] == cmd + 1 && r[1] == sub; });
    };
    std::vector<BYTE> r;
    // After a reconnect the dongle floods the channel with unrelated reports (44 xx, 45 xx, FB xx) and the
    // link reply can miss the time limit, so a missing link reply is not an error: the battery query decides.
    bool linkKnown = q(0x52, 0x01, r);
    bool linked = !linkKnown || r[2] != 0;
    bool gotBattery = linked && q(0x50, 0x02, r) && r[2] <= 100;
    if (!linkKnown && !gotBattery) return false;

    // For about 5 s after it powers on the mouse reports 40% instead of its real level (measured 2026-11-17 on
    // a Core Wireless: 40% for 2-5 s, then 70%). A reading inside that settle window is not trusted. The first
    // poll after the app starts assumes the mouse has been on for a while.
    static ULONGLONG linkUpAt = 0;
    static bool polled = false;
    const ULONGLONG kSettleMs = 6000;
    ULONGLONG now = GetTickCount64();
    if (!linked) linkUpAt = 0;
    else if (linkUpAt == 0) linkUpAt = polled ? now : now - kSettleMs;
    polled = true;
    bool settled = now - linkUpAt >= kSettleMs;

    s = Base(c.pid, c.pid == 0x0AB5 ? L"HyperX Pulsefire Haste 2 Core Wireless" : L"HyperX Pulsefire Haste 2 Wireless");
    s.kind = DeviceKind::Mouse;
    s.connected = linked;
    if (gotBattery && settled) {  // an unsettled reading stays unknown, so the tray keeps the last value dimmed
        s.percent = r[2];
        s.charging = r[3] == 0x01 || r[3] == 0x02;
        s.millivolts = r[6] | (r[7] << 8);
    }
    return true;
}

// Cloud Flight: 21 FF 05 -> [3..4] mV (above 0x100B means charging).
bool CloudFlight(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    std::vector<BYTE> r;
    if (!Query(d, { 0x21, 0xFF, 0x05 }, r, 1000, [](const std::vector<BYTE>& r) { return r.size() >= 5; })) return false;
    int mv = (r[3] << 8) | r[4];
    s = Base(c.pid, L"HyperX Cloud Flight");
    s.millivolts = mv;
    if (mv > 0x100B) {
        s.charging = true;
    } else if (mv <= 3648) {
        s.percent = Clamp100((int)(0.00125 * mv));
    } else if (mv > 3975) {
        s.percent = 100;
    } else {
        double v = mv;
        s.percent = Clamp100((int)std::lround(0.00000002547505 * std::pow(v, 4) - 0.0003900299 * std::pow(v, 3) +
                                              2.238321 * v * v - 5706.256 * v + 5452299.0));
    }
    return true;
}

// Cloud III S Wireless: report 0C [02 03 01 00 <cmd>]; reply [5] = cmd, [6] = value (FF = invalid).
//   02 -> [6] == 2 connected, 06 -> [6] %, 48 -> [6] 0 discharging / 1 charging / 2 full.
// From github.com/LennardKittner/HyperHeadset (cloud_iii_s_wireless.rs).
bool Cloud3S(const HidColl& c, DeviceStatus& s) {
    HidDev d;
    if (!d.Open(c)) return false;
    auto q = [&](BYTE cmd, std::vector<BYTE>& r) {
        return Query(d, { 0x0C, 0x02, 0x03, 0x01, 0x00, cmd }, r, 1000,
                     [cmd](const std::vector<BYTE>& r) { return r.size() >= 7 && r[0] == 0x0C && r[5] == cmd && r[6] != 0xFF; });
    };
    std::vector<BYTE> r;
    if (!q(0x02, r)) return false;
    s = Base(c.pid, L"HyperX Cloud III S Wireless");
    s.connected = r[6] == 2;
    if (!s.connected) return true;
    if (q(0x06, r) && r[6] <= 100) s.percent = r[6];
    if (q(0x48, r)) s.charging = r[6] == 1 || r[6] == 2;
    return true;
}

// Cloud Stinger Core Wireless (+ 7.1): feature report FF on the FF00:0001 collection (MI_03 Col03).
// From github.com/davidsantanaalves/HyperBatteryMonitor (Devices/CloudStingerCoreWirelessDevice.cs, MIT);
// the PlayStation receiver 03F0:0A93 was verified on hardware there (PR #6: 52 queries, codes 03/05/06).
// SetFeature(command), wait 20 ms, GetFeature(FF):
//   connection: reply [11] == 1 means the headset is on.
//   battery:    reply [9] = 03 discharging / 05 charging / 06 full, [11..12] = battery mV (little endian).
// The PlayStation receivers (03F0:0A93, 0951:1713) can first hand back the previous report (FF 01 00 ...);
// their battery reply is FF 12 05, so on them the reply is read again (up to 10 x 20 ms) until it looks right.
// 0951:1713 (Kingston PlayStation receiver, same MI_03 layout as 0A93) was verified on hardware.
bool StingerCore(const HidColl& c, DeviceStatus& s) {
    static const std::vector<BYTE> kConnection = { 0xFF, 0x07, 0x00, 0xFD, 0x04, 0x00, 0x00, 0x02, 0x82, 0x03,
                                                   0x05, 0x29, 0x0F, 0x00, 0x00, 0x03, 0x68, 0x10, 0x00, 0x00 };
    static const std::vector<BYTE> kBattery = { 0xFF, 0x07, 0x00, 0xFD, 0x04, 0x0C, 0xF1, 0x02, 0x01, 0x04, 0xF0, 0x0C };
    // mV -> % in 10% steps, from the same source (separate curves while charging and on battery).
    static const int kPct[] = { 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0 };
    static const int kChargingMv[] = { 4130, 4090, 4050, 4000, 3967, 3946, 3930, 3916, 3871, 3831, 3400 };
    static const int kDischargingMv[] = { 4121, 4042, 3954, 3905, 3838, 3785, 3763, 3738, 3700, 3651, 3517 };

    HidDev d;
    if (!d.Open(c)) return false;
    const bool ps = c.pid == 0x0A93 || c.pid == 0x1713;
    auto exchange = [&](const std::vector<BYTE>& cmd, std::vector<BYTE>& r, bool (*good)(const std::vector<BYTE>&)) {
        if (!d.SetFeature(cmd)) return false;
        for (int i = 0; i < (ps ? 10 : 1); i++) {
            Sleep(20);
            if (!d.GetFeature(0xFF, r) || r.size() < 13) return false;
            if (!ps || good(r)) return true;
        }
        return false;
    };
    auto fresh = [](const std::vector<BYTE>& r) { return !(r[1] == 0x01 && r[2] == 0x00); };
    auto battery = [](const std::vector<BYTE>& r) { return r[0] == 0xFF && r[1] == 0x12 && r[2] == 0x05; };

    std::vector<BYTE> r;
    // The connection reply's header isn't documented, so after 10 stale-looking reads the last one is used.
    if (!exchange(kConnection, r, fresh) && !(ps && r.size() >= 13 && !fresh(r))) return false;
    s = Base(c.pid, L"HyperX Cloud Stinger Core Wireless");
    s.connected = r[11] == 0x01;
    if (!s.connected || !exchange(kBattery, r, battery)) return true;
    BYTE code = r[9];
    if (code != 0x03 && code != 0x05 && code != 0x06) return true;
    s.millivolts = r[11] | (r[12] << 8);
    s.charging = code == 0x05;
    s.percent = code == 0x06 ? 100 : Interpolate(s.millivolts, code == 0x05 ? kChargingMv : kDischargingMv, kPct, 11);
    return true;
}

struct Model {
    USHORT vid;
    std::vector<USHORT> pids;
    bool (*accept)(const HidColl&);  // which collection carries the protocol
    bool (*poll)(const HidColl&, DeviceStatus&);
};

const Model kModels[] = {
    { 0x03F0, { 0x05B7, 0x0C9D }, [](const HidColl& c) { return c.outLen() == 62 && c.inLen() == 62; }, Cloud3 },
    // Cloud II Core Wireless: same 66 <cmd> protocol as Cloud III Wireless, 64-byte reports (HyperHeadset).
    { 0x03F0, { 0x069F, 0x0995 }, [](const HidColl& c) { return c.page() >= 0xFF00 && c.outLen() >= 62 && c.inLen() >= 62; }, Cloud3 },
    // Cloud III S: report 0C lives on the 64/64-byte collection, which Windows lists under usage page 01C0
    // (not a vendor page). The FF13 (62-byte) and FFC0 (32-byte) collections don't carry it.
    { 0x03F0, { 0x06BE, 0x02CC }, [](const HidColl& c) { return c.outLen() == 64 && c.inLen() == 64; }, Cloud3S },
    { 0x03F0, { 0x0696, 0x018B, 0x0D93 }, [](const HidColl& c) { return c.page() == 0xFF90 && c.usage() == 0x0303; }, Cloud2 },
    { 0x0951, { 0x1718 }, [](const HidColl& c) { return c.outLen() == 62; }, Cloud2Kingston },
    { 0x03F0, { 0x098D }, [](const HidColl& c) { return c.page() >= 0xFF00 && c.outLen() >= 3; }, CloudAlpha },
    { 0x03F0, { 0x08BE }, [](const HidColl& c) { return c.page() == 0xFF13 && c.usage() == 0xFF00; }, CloudAlpha2 },
    // Pulsefire Haste 2 Wireless (0D97, 0F98) and Haste 2 Core Wireless (0AB5) dongles.
    { 0x03F0, { 0x0AB5, 0x0D97, 0x0F98 }, [](const HidColl& c) { return c.page() >= 0xFF00 && c.outLen() >= 2 && c.inLen() >= 8; }, HasteWireless },
    { 0x0951, { 0x16C4, 0x1723, 0x1749 }, [](const HidColl& c) { return c.page() >= 0xFF00 && c.outLen() >= 3; }, CloudFlight },
    { 0x03F0, { 0x0E90 }, [](const HidColl& c) { return c.page() >= 0xFF00 && c.outLen() >= 3; }, CloudFlight },  // Cloud Flight (HP)
    // Cloud Stinger Core Wireless: PlayStation receivers (HP 0A93, Kingston 1713) and the original Kingston receiver.
    { 0x03F0, { 0x0A93 }, [](const HidColl& c) { return c.page() == 0xFF00 && c.usage() == 0x0001 && c.featLen() >= 32; }, StingerCore },
    { 0x0951, { 0x170B, 0x1713 }, [](const HidColl& c) { return c.page() == 0xFF00 && c.usage() == 0x0001 && c.featLen() >= 32; }, StingerCore },
};

}  // namespace

void PollHyperX(PollContext& ctx) {
    for (const auto& m : kModels) {
        for (USHORT pid : m.pids) {
            if (ctx.IsClaimed(m.vid, pid)) continue;
            for (const HidColl* c : ctx.Find(m.vid, pid, m.accept)) {
                DeviceStatus s;
                if (m.poll(*c, s)) { ctx.Add(s, m.vid, pid); break; }
            }
        }
    }
}
