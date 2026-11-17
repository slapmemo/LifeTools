// Glorious, Hitscan, G-Wolves and WLMouse wireless mice using the same
// supplier protocol (G-Wolves calls it "XVI"; its other models use the Kysona protocol instead):
// Request: 64-byte feature report (id 0), bytes [3]=02 [4]=02 [6]=83.
// Reply:   [1]=status, [4]=02, [6]=83, [7]=charging (1), [8]=percent.
// Status A1 = awake, A4 = asleep, A0 = waking up, others = unreachable.
// Protocol: github.com/ikajdan/glorious-indicator, github.com/louis4craft/glorious-ctl,
// Hitscan's web configurator (control.hitscan.com) and G-Wolves' (mouse.xyz, Config/env-models.json).
// WLMouse's YING IDs: https://gm.wlmouse.gg/Config/env-models.json. The 1K dongle is shared
// with other models; only the YING 8K receiver and its battery collection are matched here.
#include "drivers.h"

// Model names and cable product ids from G-Wolves' own device list (mouse.xyz/Config/env-models.json).
// 33E4:3854 is a dongle shared by many models, so it has no specific name.
const wchar_t* GWolvesModelName(USHORT pid) {
    switch (pid) {
        case 0x3808: case 0x3817: return L"G-Wolves HTM Plus";
        case 0x6808: case 0x6817: return L"G-Wolves HSK Pro 2.0";
        case 0x5608: case 0x5617: case 0x5618: case 0x5619: return L"G-Wolves HTXU";
        case 0x3608: case 0x3617: case 0x3619: return L"G-Wolves Fenrir Pro";
        case 0x3908: case 0x3917: return L"G-Wolves VUK";
        case 0x7904: case 0x7913: return L"G-Wolves HT-S2";
        case 0x3708: case 0x3717: return L"G-Wolves Fenrir Max";
        case 0x5308: case 0x5317: return L"G-Wolves HTS Ultra";
        case 0x7704: case 0x7713: return L"G-Wolves HTR";
        case 0x3508: case 0x3517: return L"G-Wolves Fenrir";
        case 0x7908: case 0x7917: return L"G-Wolves HT-S2 Pro";
        case 0x5808: case 0x5817: return L"G-Wolves HSK Pro";
        case 0x2708: case 0x2717: case 0x2719: return L"G-Wolves HTX Mini";
        case 0x5408: case 0x5417: case 0x5418: case 0x5419: return L"G-Wolves HTS Plus";
        case 0x5708: case 0x5717: return L"G-Wolves HTX";
        case 0x5908: case 0x5917: return L"G-Wolves HSK Plus";
        case 0x7204: case 0x7203: return L"G-Wolves HSK Lite";
        case 0x7708: case 0x7717: return L"G-Wolves HTR Pro";
        case 0x5804: case 0x5803: return L"G-Wolves HSK Pro ACE";
        case 0x5404: case 0x5403: return L"G-Wolves HTS Plus ACE";
        case 0x5704: case 0x5703: return L"G-Wolves HTX ACE";
        case 0x5904: case 0x5903: return L"G-Wolves HSK Plus ACE";
        case 0x4718: case 0x4719: return L"G-Wolves Lycan";
        case 0x4219: return L"G-Wolves WARG";
        case 0x5219: return L"G-Wolves HTS Plus Pro";
        case 0x3519: return L"G-Wolves Fenrir Asym";
        case 0x2619: return L"G-Wolves HTX Mini Asym";
        case 0x1619: return L"G-Wolves Fenrir Max Asym";
        case 0x2119: return L"G-Wolves VUK Mini";
        default: return L"G-Wolves wireless mouse";
    }
}

bool GWolvesIsCable(USHORT pid) {
    static const USHORT wired[] = { 0x1619, 0x2119, 0x2619, 0x2708, 0x2719, 0x3508, 0x3519, 0x3608, 0x3619, 0x3708, 0x3808, 0x3908,
                                    0x4219, 0x4718, 0x4719, 0x5219, 0x5308, 0x5404, 0x5408, 0x5418, 0x5419, 0x5608, 0x5618, 0x5619,
                                    0x5704, 0x5708, 0x5804, 0x5808, 0x5904, 0x5908, 0x6808, 0x7204, 0x7704, 0x7708, 0x7904, 0x7908 };
    for (USHORT w : wired)
        if (w == pid) return true;
    return false;
}

namespace {

struct Vendor {
    USHORT vid;
    const wchar_t* keyPrefix;
    int replyDelayMs;
    const wchar_t* (*name)(USHORT pid);
    bool (*isCable)(USHORT pid);
    bool (*matches)(const HidColl&) = nullptr;
};

const wchar_t* GloriousName(USHORT pid) {
    switch (pid) {
        case 0x2022: case 0x2011: return L"Glorious Model O Wireless";
        case 0x2023: case 0x2012: return L"Glorious Model D Wireless";
        case 0x2024: case 0x2013: return L"Glorious Model O- Wireless";
        case 0x2025: case 0x2014: return L"Glorious Model D- Wireless";
        case 0x2033: return L"Glorious Model O 2 Wireless";
        case 0x2034: case 0x2036: case 0x201A: return L"Glorious Model D 2 PRO";
        default: return nullptr;  // another brand on the same Sinowealth chip (e.g. Redragon keyboards)
    }
}

// 258A is Sinowealth's vendor id, shared by many brands. For a product we do not know, use the
// device's own name and work out whether it is a keyboard or a mouse instead of assuming a mouse.
DeviceKind SinowealthKind(const std::vector<HidColl>& all, USHORT vid, USHORT pid, const std::wstring& name) {
    DeviceKind k = GuessKind(name);
    if (k != DeviceKind::Other) return k;
    int keyboards = 0;
    for (const auto& c : all)
        if (c.vid == vid && c.pid == pid && c.page() == 0x01 && c.usage() == 0x06) keyboards++;
    if (keyboards >= 2) return DeviceKind::Keyboard;  // keyboards expose boot + NKRO keyboard collections
    return KindFromCollections(all, vid, pid);
}
bool GloriousCable(USHORT pid) { return pid == 0x2011 || pid == 0x2012 || pid == 0x2013 || pid == 0x2014 || pid == 0x201A; }

const wchar_t* HitscanName(USHORT pid) {
    switch (pid) {
        case 0x0136: return L"Hitscan Hyperlight X";
        case 0x0194: return L"Hitscan Hyperlight N";
        default: return L"Hitscan Hyperlight";
    }
}
bool HitscanCable(USHORT pid) { return pid == 0x0136 || pid == 0x0194; }

const Vendor kVendors[] = {
    { 0x258A, L"glorious:", 50, GloriousName, GloriousCable },
    { 0x3770, L"hitscan:", 200, HitscanName, HitscanCable },
    { 0x33E4, L"gwolves:", 100, GWolvesModelName, GWolvesIsCable },
    { 0x36A7, L"wlmouse:", 100, [](USHORT) { return L"WLMouse YING"; }, [](USHORT) { return false; },
      [](const HidColl& c) { return c.pid == 0xA874 && c.page() == 0xFFFF && c.usage() == 0; } },
};

}  // namespace

void PollGlorious(PollContext& ctx) {
    for (const Vendor& v : kVendors) {
        for (auto [vid, pid] : ctx.Products(v.vid)) {
            for (const HidColl* c : ctx.Find(vid, pid, [&v](const HidColl& c) {
                     return c.featLen() == 65 && (!v.matches || v.matches(c));
                 })) {
                HidDev d;
                if (!d.OpenFeatureOnly(*c)) continue;
                std::vector<BYTE> r;
                bool ok = false;
                for (int attempt = 0; attempt < 2; attempt++) {
                    std::vector<BYTE> w(65, 0);
                    w[3] = 0x02; w[4] = 0x02; w[6] = 0x83;
                    if (!d.SetFeature(w)) break;
                    Sleep(v.replyDelayMs);
                    if (!d.GetFeature(0, r) || r.size() < 9) break;
                    if (r[6] != 0x83 || (r[1] & 0xF0) != 0xA0) break;  // not this protocol
                    if (r[1] == 0xA0 && attempt == 0) { Sleep(400); continue; }  // waking up: ask again
                    ok = true;
                    break;
                }
                if (!ok) continue;
                DeviceStatus s;
                s.key = v.keyPrefix + Hex4(pid);
                const wchar_t* known = v.name(pid);
                if (known) {
                    s.name = known;
                    s.kind = DeviceKind::Mouse;
                } else {
                    s.name = HidProduct(*c);
                    if (s.name.empty()) s.name = L"Wireless device";
                    s.kind = SinowealthKind(ctx.colls, vid, pid, s.name);
                }
                s.via = v.isCable(pid) ? L"USB cable" : L"2.4 GHz receiver";
                s.charging = v.isCable(pid) || r[7] == 0x01;
                if (r[1] == 0xA1 && r[8] <= 100) s.percent = Clamp100(r[8] ? r[8] : 1);
                else s.asleep = true;
                ctx.Add(s, vid, pid);
                break;
            }
        }
    }
}
