// SteelSeries Arctis Nova Elite (base station 1038:2244), without SteelSeries GG. A different exchange from
// the Nova 7 / Nova Pro family in steelseries.cpp, so it lives here and that driver stays as it is.
// Ported from HaloBattery (github.com/HeyOkay/HaloBattery, providers/steelseries_elite.py, MIT; the level and
// charging were confirmed there against SteelSeries GG on a real station), from elegos/Linux-Arctis-Manager
// and loteran/Arctis-Sound-Manager (nova_elite.yaml, made from a USB capture of SteelSeries GG).
//   request: 64-byte output report 01 B0 00 ... to an interface-3 vendor collection (FFC0 first)
//   direct reply 01 B0: [6] headset level, [14] power (01 headset off, 02 on the cable), [15] charging (02)
//   or pushed frames 07 B7 <level> <spare> <charging 02> and 07 B5 <?> <bt> <power>, on either collection.
// Only the status request is sent.
#include "drivers.h"

#include <algorithm>
#include <memory>

namespace {

constexpr USHORT kVid = 0x1038, kPid = 0x2244;

}  // namespace

void PollSteelSeriesElite(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kPid)) return;
    auto colls = ctx.Find(kVid, kPid, [](const HidColl& c) { return c.iface == 3 && (c.inLen() > 0 || c.outLen() > 0); });
    if (colls.empty()) return;
    // FFC0 first, then other vendor pages (the station splits interface 3 into two collections).
    std::stable_sort(colls.begin(), colls.end(), [](const HidColl* a, const HidColl* b) {
        auto rank = [](const HidColl* c) { return c->page() == 0xFFC0 ? 0 : c->page() >= 0xFF00 ? 1 : 2; };
        return rank(a) < rank(b);
    });
    std::vector<std::unique_ptr<HidDev>> handles;
    for (const HidColl* c : colls) {
        auto d = std::make_unique<HidDev>();
        if (d->Open(*c)) {
            d->Flush();
            handles.push_back(std::move(d));
        }
    }
    bool sent = false;
    for (auto& d : handles)
        if (d->coll().page() >= 0xFF00 && d->coll().outLen() > 0) {
            std::vector<BYTE> req(64, 0);
            req[0] = 0x01;
            req[1] = 0xB0;
            if (d->Write(req)) { sent = true; break; }  // a collection without report 01 refuses it
        }
    if (!sent) return;
    int level = -1, power = -1;
    bool charging = false;
    ULONGLONG end = GetTickCount64() + 1000;
    std::vector<BYTE> r;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0 && (level < 0 || power < 0)) {
        for (auto& d : handles) {
            int n = d->Read(r, 30);
            if (n < 5) continue;
            if (r[0] == 0x01 && r[1] == 0xB0 && n > 15) {  // the direct reply
                if (r[6] <= 100) level = r[6];
                charging = r[15] == 0x02;
                power = r[14];
            } else if (r[0] == 0x07 && r[1] == 0xB7 && r[2] <= 100) {
                level = r[2];
                charging = r[4] == 0x02;
            } else if (r[0] == 0x07 && r[1] == 0xB5) {
                power = r[4];
            }
        }
        if (power == 0x01) break;  // headset off
    }
    if (power == 0x01 || level < 0) return;
    DeviceStatus s;
    s.key = L"steelseries:2244";
    s.name = L"SteelSeries Arctis Nova Elite";
    s.kind = DeviceKind::Headset;
    s.via = L"Base station";
    s.percent = level;
    s.charging = charging || power == 0x02;
    ctx.Add(s, kVid, kPid);
}
