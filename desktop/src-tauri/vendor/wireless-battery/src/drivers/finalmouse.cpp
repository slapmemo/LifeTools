// Finalmouse UltralightX (ULX) and Starlight X (SLX) on their 2.4 GHz dongles (VID 361D).
// Protocol from xpanel, Finalmouse's web configurator, as ported by:
//  * OpenMouse mouse-protocol (src/finalmouse/index.ts, src/drivers/finalmouse/hid.ts):
//    https://github.com/OpenMouse-Project/mouse-protocol
//  * FinalmousePollingRateSwitcher (shared/FinalmouseHid.cs, used with a ULX dongle):
//    https://github.com/xBambooz/FinalmousePollingRateSwitcher
//
// Frames on the vendor collection (usage page FF00), zero-padded to the report length:
//   [report id][inner length = 2 + n][0x80 | command][n][n payload bytes]
// A write with an empty payload is a GET; replies come back as input reports with the plain command.
//  * ULX dongle 0100 (FF00:0001): output report 04, replies on input report 05.
//  * SLX dongles 0300 / 0301 (FF00, usage not pinned down): output report 01, replies on input 02.
//    OpenMouse inferred these report ids from xpanel; battery readings through them are confirmed on
//    Starlight X hardware, as on the UltralightX.
// Only GETs are sent: the read xpanel starts with (ULX lift-off 21, SLX profile roster 57), then
// wake/all (96), which makes the dongle push its status burst. From that burst:
//  * 5:  battery voltage, mV u16 LE, mapped with xpanel's calibration curve
//  * 38: state of charge [percent][mV u16 LE] (preferred when present)
//  * 37: charging state (1 = charging)
//  * 36: link state (0 = no link to the mouse; xpanel clears the RSSI then)
// The mouse on its own cable (361D:0102, 0310, 0311) is not covered: its report ids are not known.
#include "drivers.h"

#include <algorithm>
#include <cmath>

namespace {

constexpr USHORT kVid = 0x361D;
constexpr BYTE kVoltage = 5, kLink = 36, kCharging = 37, kStateOfCharge = 38, kWakeAll = 96;

struct Model {
    USHORT pid;
    const wchar_t* name;
    bool slx;
    BYTE outId, inId;  // vendor output / input report ids
    BYTE firstGet;     // the read xpanel sends before wake/all
};
const Model kModels[] = {
    { 0x0100, L"Finalmouse UltralightX", false, 0x04, 0x05, 21 },
    { 0x0300, L"Finalmouse Starlight X", true, 0x01, 0x02, 57 },
    { 0x0301, L"Finalmouse Starlight X", true, 0x01, 0x02, 57 },
};

// xpanel's voltage curve: linear between the calibration points, rounded to the nearest percent.
int PercentFromMillivolts(int mv) {
    static const int kMv[] = { 3000, 3620, 3660, 3740, 3880, 4170, 4380 };
    static const double kPct[] = { 0.2, 5, 10, 25, 50, 75, 100 };
    if (mv <= kMv[0]) return 0;
    for (size_t i = 1; i < sizeof(kMv) / sizeof(kMv[0]); ++i) {
        if (mv > kMv[i]) continue;
        double f = double(mv - kMv[i - 1]) / (kMv[i] - kMv[i - 1]);
        return (int)std::floor(kPct[i - 1] + (kPct[i] - kPct[i - 1]) * f + 0.5);
    }
    return 100;
}

struct Status {
    int soc = -1;       // state of charge, percent
    int mv = 0;         // battery voltage
    int charging = -1;  // -1 = not reported
    int link = -1;
};

bool ValidMillivolts(int mv) { return mv > 0 && mv < 5000; }

void Decode(const std::vector<BYTE>& r, BYTE inId, Status& st) {
    if (r.size() < 4 || r[0] != inId) return;
    size_t inner = std::min<size_t>(r[1], r.size() - 2);
    if (inner < 2) return;
    size_t n = std::min<size_t>(r[3], inner - 2);
    const BYTE* p = r.data() + 4;
    switch (r[2]) {
    case kVoltage:
        if (n >= 2 && ValidMillivolts(p[0] | p[1] << 8)) st.mv = p[0] | p[1] << 8;
        break;
    case kStateOfCharge:
        if (n >= 3 && p[0] <= 100) {
            st.soc = p[0];
            if (ValidMillivolts(p[1] | p[2] << 8)) st.mv = p[1] | p[2] << 8;
        }
        break;
    case kCharging:
        if (n >= 1) st.charging = p[0];
        break;
    case kLink:
        if (n >= 1) st.link = p[0];
        break;
    }
}

bool Get(HidDev& d, BYTE reportId, BYTE command) {
    return d.Write({ reportId, 2, (BYTE)(0x80 | command), 0 });
}

bool Query(HidDev& d, const Model& m, Status& st) {
    if (!Get(d, m.outId, m.firstGet) || !Get(d, m.outId, kWakeAll)) return false;
    // xpanel waits up to 1 s for the burst. Once the level is in, the charging state normally follows
    // within the same burst, so only wait briefly for it. The SLX's own percentage (38) is preferred
    // over its voltage, so keep waiting for it there.
    ULONGLONG end = GetTickCount64() + 1000;
    bool shortened = false;
    for (;;) {
        bool level = st.soc >= 0 || (!m.slx && st.mv > 0);
        if (level && st.charging >= 0) break;
        if (level && !shortened) {
            end = std::min(end, GetTickCount64() + 150);
            shortened = true;
        }
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        std::vector<BYTE> r;
        if (left <= 0 || d.Read(r, left) < 0) break;
        Decode(r, m.inId, st);
    }
    return true;
}

}  // namespace

void PollFinalmouse(PollContext& ctx) {
    for (const Model& m : kModels) {
        if (ctx.IsClaimed(kVid, m.pid)) continue;
        auto colls = ctx.Find(kVid, m.pid, [&m](const HidColl& c) {
            return c.page() == 0xFF00 && (m.slx || c.usage() == 1) && c.inLen() >= 4 && c.outLen() >= 4;
        });
        // The SLX vendor usage is not known; try usage 1 (the ULX one) first.
        std::stable_sort(colls.begin(), colls.end(), [](const HidColl* a, const HidColl* b) {
            return (a->usage() == 1) > (b->usage() == 1);
        });
        for (const HidColl* c : colls) {
            HidDev d;
            if (!d.Open(*c)) continue;
            Status st;
            if (!Query(d, m, st)) continue;
            DeviceStatus s;
            if (st.soc >= 0) {
                s.percent = st.soc;
            } else if (st.mv > 0) {
                s.percent = PercentFromMillivolts(st.mv);
            } else if (st.link == 0) {
                s.asleep = true;  // the dongle answered, the mouse is asleep or off: keep the last value
            } else {
                continue;  // no answer: the UI keeps the last reading dimmed during the grace period
            }
            s.millivolts = st.mv;
            s.charging = st.charging == 1;
            s.key = L"finalmouse:" + Hex4(m.pid);
            s.name = m.name;
            s.kind = DeviceKind::Mouse;
            s.via = L"2.4 GHz receiver";
            s.graceSec = 1800;
            ctx.Add(s, kVid, m.pid);
            break;
        }
    }
}
