// Pulsar X2 V3 / X2 V3 eS and other Sonix-based Pulsar mice on vendor id 3710:
//   X2 V3:    USB cable 3402 ("X2 v3"), 1K dongle 5402 (confirmed by a user's --dump, issue #54)
//   X2 V3 eS: USB cable 3406, 8K dongle 5403
// Both dongles are shared with other Pulsar mice (Xlite V4, X3), so on a dongle the mouse gets a
// generic name. These do not speak the 17-byte report 08 protocol of the Kysona driver.
// Protocol from github.com/darthsoup/PulsarBattery (Sonix64Protocol.cs / Sonix64Backend.cs) and
// github.com/bluesceada/pulsar-mouse-linux (drivers/xlite_v4_wireless.py, verified on 5402 with an X3):
//   Feature report 0, 64-byte packet: [00][category][register][sub][00 ...][sum lo][sum hi],
//   sum = 16-bit sum of packet bytes 0..61 (little endian in bytes 62..63).
//   Battery read = 08 81 01. SET_FEATURE, then GET_FEATURE every ~50 ms until the reply echoes the
//   command: [status][08][81][01][..][..][percent] (packet byte 6, FF = no reading).
//   Status 01 = answered, 02 = still pending. 05 means "mouse not linked / asleep" in
//   pulsar-mouse-linux but "pending" in PulsarBattery, so we keep polling on 05 and only treat it as
//   "mouse off" if it is still the last answer when we give up.
//   The vendor collection (FFFF:0001) is on interfaces 2 and 3; interface 2 rejects SET_FEATURE, so
//   higher interfaces are tried first.
//   No reliable charging register: on the cable the mouse is charging; 0% from a dongle means the
//   mouse is off or out of range.
#include "drivers.h"

#include <algorithm>

namespace {

const USHORT kVid = 0x3710;

struct Product { USHORT pid; bool cable; const wchar_t* name; };
const Product kProducts[] = {
    { 0x3402, true, L"Pulsar X2 V3" },
    { 0x3406, true, L"Pulsar X2 V3 eS" },
    { 0x5402, false, nullptr },  // 1K dongle
    { 0x5403, false, nullptr },  // 8K dongle
};

enum class Reply { Battery, Offline, None };

// Reads the battery percent into `pct`. Offline = the dongle answered that the mouse is not linked.
Reply ReadBattery(HidDev& d, int& pct) {
    std::vector<BYTE> req(65, 0);  // [0] = report id 0, then the 64-byte packet
    BYTE* p = req.data() + 1;
    p[1] = 0x08;
    p[2] = 0x81;
    p[3] = 0x01;
    unsigned sum = 0;
    for (int i = 0; i < 62; i++) sum += p[i];
    p[62] = (BYTE)(sum & 0xFF);
    p[63] = (BYTE)(sum >> 8);
    bool sawOffline = false;
    for (int attempt = 0; attempt < 3; ++attempt) {
        if (!d.SetFeature(req)) return Reply::None;
        for (int read = 0; read < 6; ++read) {
            Sleep(50);
            std::vector<BYTE> r;
            if (!d.GetFeature(0x00, r) || r.size() < 65) return Reply::None;
            const BYTE* w = r.data() + 1;
            if (w[1] != 0x08 || w[2] != 0x81 || w[3] != 0x01) continue;  // not our reply (yet)
            if (w[0] == 0x01) {
                if (w[6] > 100) return Reply::None;  // FF = no reading
                pct = w[6];
                return Reply::Battery;
            }
            sawOffline = w[0] == 0x05;  // 02 (or 05) = pending: keep polling
        }
    }
    return sawOffline ? Reply::Offline : Reply::None;
}

}  // namespace

void PollPulsar(PollContext& ctx) {
    for (const Product& prod : kProducts) {
        if (ctx.IsClaimed(kVid, prod.pid)) continue;
        auto colls = ctx.Find(kVid, prod.pid, [](const HidColl& c) { return c.featLen() >= 65; });
        std::sort(colls.begin(), colls.end(), [](const HidColl* a, const HidColl* b) { return a->iface > b->iface; });
        for (const HidColl* c : colls) {
            HidDev d;
            if (!d.OpenFeatureOnly(*c)) continue;
            int pct = -1;
            Reply rep = ReadBattery(d, pct);
            if (rep == Reply::None) continue;
            DeviceStatus s;
            s.key = L"pulsar:" + Hex4(prod.pid);
            s.kind = DeviceKind::Mouse;
            if (prod.cable) {
                s.name = prod.name;
                s.via = L"USB cable";
                s.charging = true;
            } else {
                std::wstring n = HidProduct(*c);
                bool generic = n.empty() || n.find(L"Dongle") != std::wstring::npos ||
                               n.find(L"Receiver") != std::wstring::npos;
                s.name = generic ? L"Pulsar wireless mouse" : n;  // the dongles are shared by several models
                s.via = L"2.4 GHz receiver";
                s.connected = rep == Reply::Battery && pct > 0;
            }
            if (rep == Reply::Battery && (pct > 0 || prod.cable)) s.percent = pct;
            ctx.Add(s, kVid, prod.pid);
            break;
        }
    }
}
