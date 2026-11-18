// Endgame Gear XM2we on its original 2.4 GHz receiver (3367:1961), not the newer 4K dongle (endgame.cpp).
// Ported from HaloBattery (github.com/HeyOkay/HaloBattery, providers/endgame_we.py, MIT; verified there on
// hardware), itself from github.com/okms/xm2we-linux (PROTOCOL.md: framing, battery).
//   Request: 17-byte feature report 08 on FF02:0002: [08][op][00 x14][checksum], sum of all 17 bytes = 0x55.
//   Reply:   17-byte input report 09 on FF01:0000 of the same receiver: [09][op][00 00 00][size][payload].
//   op 04 = battery: payload [percent][charging 0/1]; op 03 = radio link: payload [1 = mouse linked].
// Only these two status queries are sent; no configuration or EEPROM writes.
#include "drivers.h"

#include <cwctype>

namespace {

constexpr USHORT kVid = 0x3367, kPid = 0x1961;
constexpr BYTE kBattery = 0x04, kLink = 0x03;

std::vector<BYTE> Frame(BYTE op) {
    std::vector<BYTE> d(17, 0);
    d[0] = 0x08;
    d[1] = op;
    unsigned sum = 0;
    for (int i = 0; i < 16; i++) sum += d[i];
    d[16] = (BYTE)(0x55 - sum);
    return d;
}

bool Payload(const std::vector<BYTE>& r, int n, BYTE op, std::vector<BYTE>& out) {
    if (n < 17 || r.size() < 17 || r[0] != 0x09 || r[1] != op || r[2] || r[3] || r[4]) return false;
    unsigned sum = 0;
    for (int i = 0; i < 17; i++) sum += r[i];
    if ((sum & 0xFF) != 0x55) return false;
    int size = r[5];
    if (size < 1 || size > 10) return false;
    out.assign(r.begin() + 6, r.begin() + 6 + size);
    return true;
}

bool Query(HidDev& feat, HidDev& in, BYTE op, std::vector<BYTE>& out) {
    in.Flush();
    if (!feat.SetFeature(Frame(op))) return false;
    ULONGLONG end = GetTickCount64() + 400;
    std::vector<BYTE> r;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0) return false;
        int n = in.Read(r, left);
        if (n < 0) return false;
        if (Payload(r, n, op, out)) return true;
    }
}

// The receiver part of a collection path: the two collections of one receiver differ only in "&colNN"
// and the last "&NNNN" of the instance part.
std::wstring ReceiverKey(const std::wstring& path) {
    std::wstring p = path;
    for (auto& ch : p) ch = (wchar_t)towlower(ch);
    size_t a = p.find(L'#'), b = a == std::wstring::npos ? a : p.find(L'#', a + 1);
    size_t e = b == std::wstring::npos ? b : p.find(L'#', b + 1);
    if (e == std::wstring::npos) return p;
    std::wstring hw = p.substr(a + 1, b - a - 1), inst = p.substr(b + 1, e - b - 1);
    size_t col = hw.find(L"&col");
    if (col != std::wstring::npos) hw.erase(col, 6);
    size_t amp = inst.rfind(L'&');
    if (amp != std::wstring::npos) inst.erase(amp);
    return hw + L"#" + inst;
}

}  // namespace

void PollEndgameWe(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kPid)) return;
    auto ins = ctx.Find(kVid, kPid, [](const HidColl& c) { return c.page() == 0xFF01 && c.usage() == 0x0000 && c.inLen() >= 17; });
    for (const HidColl* f : ctx.Find(kVid, kPid, [](const HidColl& c) { return c.page() == 0xFF02 && c.usage() == 0x0002 && c.featLen() >= 17; })) {
        const HidColl* inColl = nullptr;
        for (const HidColl* i : ins)
            if (ReceiverKey(i->path) == ReceiverKey(f->path)) inColl = i;
        if (!inColl) continue;  // without the reply collection nothing is sent
        HidDev feat, in;
        if (!feat.OpenFeatureOnly(*f) || !in.Open(*inColl)) continue;
        std::vector<BYTE> battery, link;
        bool gotBattery = Query(feat, in, kBattery, battery);  // battery first: the link can drop as the charger goes in
        bool gotLink = Query(feat, in, kLink, link);
        if (!gotBattery || battery[0] > 100) continue;
        DeviceStatus s;
        s.key = L"endgame:1961";
        s.name = L"Endgame Gear XM2we";
        s.kind = DeviceKind::Mouse;
        s.via = L"2.4 GHz receiver";
        s.graceSec = 1800;
        bool charging = battery.size() > 1 && battery[1] == 1;
        if (charging || (gotLink && link[0] == 1)) {
            s.percent = battery[0];
            s.charging = charging;
        } else {
            s.asleep = true;  // the receiver answered, the mouse is not linked: keep the last value
        }
        ctx.Add(s, kVid, kPid);
        return;
    }
}
