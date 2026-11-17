// Jabra headsets behind a Jabra Link 380 / 390 dongle: Jabra's GNP protocol on the vendor collection
// with usage page FF00 (report 05, 64 bytes).
//   query: [05][dst][src 00][seq][40|len][class][op][payload]     len = bytes after the report id
//   reply: [05][dst 00][src][seq][C0|len][class][op][payload]     class FE = NAK
// Addresses: 01 = the dongle itself, 04 = the headset behind it.
// Battery = class 12 / op 02 (STATUS__HS_BATTERY), reply payload [flags][level]; flags bit 0 = charging,
// bit 7 = per-unit levels follow (earbuds), the level byte is then the combined value.
// Name = class 02 / op 00, reply payload [n][n bytes UTF-8].
// A switched-off headset gets a NAK (or no reply) while the dongle stays present.
// Protocol from github.com/Watchdog0x/jabridge (cmd/jabridge/jabraApi.go); verified on a
// Link 390 (0B0E:2E51) with an Evolve3 75.
#include "drivers.h"

#include <map>

namespace {

constexpr USHORT kJabra = 0x0B0E;
constexpr BYTE kHeadset = 0x04;

enum class Reply { Ok, Nak, None };

Reply Query(HidDev& d, BYTE dst, BYTE cls, BYTE op, std::vector<BYTE>& payload, int timeoutMs) {
    static BYTE seq = 0x20;
    BYTE s = seq++;
    d.Flush();
    if (!d.Write({ 0x05, dst, 0x00, s, 0x46, cls, op }, 300)) return Reply::None;
    ULONGLONG end = GetTickCount64() + timeoutMs;
    std::vector<BYTE> r;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        int n = d.Read(r, left);
        if (n < 0) return Reply::None;
        if (n < 6) continue;  // unrelated short report
        if (r[0] != 0x05 || r[1] != 0x00 || r[2] != dst || r[3] != s || (r[4] & 0xC0) != 0xC0) continue;
        if (r[5] == 0xFE) return Reply::Nak;
        int len = r[4] & 0x3F;  // counts from r[1]
        if (r.size() < 7 || r[5] != cls || r[6] != op || len < 6 || len + 1 > (int)r.size()) continue;
        payload.assign(r.begin() + 7, r.begin() + len + 1);
        return Reply::Ok;
    }
    return Reply::None;
}

std::wstring HeadsetName(HidDev& d) {
    std::vector<BYTE> p;
    if (Query(d, kHeadset, 0x02, 0x00, p, 400) != Reply::Ok || p.empty() || p[0] == 0 || p[0] + 1u > p.size()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, (const char*)&p[1], p[0], nullptr, 0);
    if (n <= 0) return {};
    std::wstring w(n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, (const char*)&p[1], p[0], &w[0], n);
    return w;
}

}  // namespace

void PollJabra(PollContext& ctx) {
    // Headset name per dongle: asked once while connected (a failed ask caches the generic name),
    // forgotten when the headset goes offline so a newly paired headset is picked up.
    static std::map<USHORT, std::wstring> names;
    // Link 380a / 380c and 390 USB-A / USB-C, UC and MS variants (product ids from Jabra Direct's
    // DeviceInfo.xml; all share the dongle at GNP address 1 and the same firmware generation).
    for (USHORT pid : { 0x24C7, 0x24C8, 0x24C9, 0x24CA, 0x24E9, 0x2E50, 0x2E51, 0x2E56, 0x2E57 }) {
        if (ctx.IsClaimed(kJabra, pid)) continue;
        for (const HidColl* c : ctx.Find(kJabra, pid, [](const HidColl& c) {
                 return c.page() == 0xFF00 && c.outLen() >= 64 && c.inLen() >= 64;
             })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            std::vector<BYTE> p;
            Reply rep = Query(d, kHeadset, 0x12, 0x02, p, 700);
            if (rep == Reply::None || (rep == Reply::Ok && p.size() < 2)) continue;
            DeviceStatus s;
            s.key = L"jabra:" + Hex4(pid);
            s.kind = DeviceKind::Headset;
            s.via = L"Jabra Link dongle";
            if (rep == Reply::Ok) {
                s.percent = p[1] <= 100 ? p[1] : -1;
                s.charging = (p[0] & 0x01) != 0;
                if (!names.count(pid)) {
                    std::wstring n = HeadsetName(d);
                    names[pid] = n.empty() ? L"Jabra headset" : n;
                }
                s.name = names[pid];
            } else {
                s.connected = false;  // NAK: dongle present, headset off or out of range
                auto it = names.find(pid);
                s.name = it != names.end() ? it->second : L"Jabra headset";
                names.erase(pid);
            }
            ctx.Add(s, kJabra, pid);
            break;
        }
    }
}
