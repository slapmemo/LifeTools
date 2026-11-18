// Audeze Maxwell headsets (VID 3329) on the USB dongle or the USB-C cable.
// Ported from HaloBattery (github.com/HeyOkay/HaloBattery, providers/audeze.py, MIT; the dongle 4B19 and the
// cable 4B1A were tested there on hardware), whose packets come from HeadsetControl
// (lib/devices/audeze_maxwell.hpp).
//   Vendor collection FF13:0001. Request: 62-byte output report 06; answer: 62-byte input report 07,
//   fetched with GetInputReport. The answer is a rolling buffer of recent replies, so it is scanned for the
//   battery marker D6 0C 00 00 <percent>.
// Only the single battery query (attribute 0x0CD6) is sent, which HaloBattery measured to be enough on the
// dongle and the cable. HaloBattery falls back to HeadsetControl's 14-packet initialisation, which contains
// one packet it could not confirm to be a pure read, so that fallback is deliberately left out here.
// With no headset linked the dongle names itself "... Dongle" and keeps answering with a stale value, so it
// is not asked then. There is no charging flag: a Maxwell always charges on its USB-C cable, so the cable
// answering means charging.
#include "drivers.h"

#include <cwctype>
#include <map>

namespace {

constexpr USHORT kVid = 0x3329;
struct Model { USHORT pid; bool cable; };
const Model kModels[] = { { 0x4B1A, true }, { 0x4B1E, true },  // cables first: the direct connection wins
                          { 0x4B19, false }, { 0x4B18, false }, { 0x4B29, false }, { 0x4B28, false } };

int FindLevel(const std::vector<BYTE>& b) {
    for (size_t i = 0; i + 4 < b.size(); i++)
        if (b[i] == 0xD6 && b[i + 1] == 0x0C && b[i + 2] == 0x00 && b[i + 3] == 0x00 && b[i + 4] <= 100) return b[i + 4];
    return -1;
}

int ReadLevel(const HidColl& c) {
    HidDev d;
    if (!d.Open(c)) return -1;
    std::vector<BYTE> req(62, 0);
    BYTE q[] = { 0x06, 0x07, 0x80, 0x05, 0x5A, 0x03, 0x00, 0xD6, 0x0C };
    std::copy(std::begin(q), std::end(q), req.begin());
    if (!d.Write(req)) return -1;
    int level = -1;
    for (int i = 0; i < 3; i++) {  // the answer can arrive a little later; the newest frame counts
        Sleep(60);
        std::vector<BYTE> r;
        if (!d.GetInputReport(0x07, r)) continue;
        int l = FindLevel(r);
        if (l >= 0) level = l;
    }
    return level;
}

}  // namespace

void PollAudeze(PollContext& ctx) {
    static std::map<USHORT, ULONGLONG> firstSeen;  // a headset reports 0% for a moment right after power-on
    for (const Model& m : kModels) {
        if (ctx.IsClaimed(kVid, m.pid)) continue;
        auto colls = ctx.Find(kVid, m.pid, [](const HidColl& c) { return c.page() == 0xFF13 && c.usage() == 0x0001 && c.inLen() > 0; });
        if (colls.empty()) {
            firstSeen.erase(m.pid);
            continue;
        }
        std::wstring product = HidProduct(*colls[0]);
        std::wstring lower = product;
        for (auto& ch : lower) ch = (wchar_t)towlower(ch);
        if (!m.cable && lower.size() >= 6 && lower.compare(lower.size() - 6, 6, L"dongle") == 0) {
            ctx.Claim(kVid, m.pid);  // no headset linked: nothing to read (and the stored value is stale)
            firstSeen.erase(m.pid);
            continue;
        }
        int level = ReadLevel(*colls[0]);
        ULONGLONG now = GetTickCount64();
        if (!firstSeen.count(m.pid)) firstSeen[m.pid] = now;
        DeviceStatus s;
        s.key = L"audeze:maxwell";  // dongle and cable are one headset
        s.name = L"Audeze Maxwell";
        s.kind = DeviceKind::Headset;
        s.via = m.cable ? L"USB cable" : L"2.4 GHz dongle";
        s.graceSec = 300;
        if (level < 0 || (level == 0 && now - firstSeen[m.pid] < 90000)) {
            s.asleep = true;  // no reading yet (or the power-on 0%): keep the last value
        } else {
            s.percent = level;
            s.charging = m.cable;
        }
        ctx.Add(s, kVid, m.pid);
        for (const Model& o : kModels) ctx.Claim(kVid, o.pid);  // one entry for the headset
        return;
    }
}
