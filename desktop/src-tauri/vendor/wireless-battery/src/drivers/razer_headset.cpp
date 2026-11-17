// Razer BlackShark headsets with their own vendor protocol (not the 90-byte Razer feature report).
//
// BlackShark V3 / V3 Pro (1532:0576/0577 V3 Pro, 0579/057A V3), interface 5.
// 64-byte output report 02: [02][00][60][00 00][00][size][00 00][dir][class][sub][argc][args]..
// [62] = XOR of bytes 0..61. GET battery = class 21 -> reply args [level %][charging].
// The headset drops its 2.4 GHz link if the battery is queried every few seconds, so it is asked at
// most once every 5 minutes and the last reading is reused in between.
// Protocol from OpenRazer PR #2794 (docs/v3_pro_protocol.md) and github.com/ReedME/omarchy-blackshark-v3.
//
// BlackShark V2 Pro (2023), HyperSpeed dongle 1532:0555, vendor collection (usage page FF00).
// 64-byte output report 02, "PA" envelope: [02][80][8+len][00 00]['P']['A'][08][00][type][cmd][flag][len].
// Remote mode on/off = [02][80][07][00 00]['P']['A'][0E][00][02][E1][1/0]; Synapse asserts it around
// every query, and the first frame after ~0.3 s idle only wakes the link, so one extra remote-on is
// sent first. Query type 03: cmd 21 = battery 0-100, cmd 2A = charging (0 = on battery).
// Reply: [02].. [12]=cmd echo [13]=01 ACK [14]=len [15..]=data.
// Protocol from OpenRazer PR #2862 (driver/razerblackshark_driver.c, from a capture of 1532:0555)
// and HaloBattery providers/blackshark.py.
#include "drivers.h"

#include <map>

namespace {

constexpr ULONGLONG kMinIntervalMs = 5 * 60 * 1000;

std::vector<BYTE> Packet(BYTE dir, BYTE cls) {
    std::vector<BYTE> b(64, 0);
    b[0] = 0x02;
    b[2] = 0x60;
    b[6] = 0x04;  // data size: dir, class, sub, argc
    b[9] = dir;
    b[10] = cls;
    BYTE crc = 0;
    for (int i = 0; i < 62; i++) crc ^= b[i];
    b[62] = crc;
    return b;
}

bool Get(HidDev& d, BYTE cls, std::vector<BYTE>& reply) {
    if (!d.Write(Packet(0x80, cls))) return false;
    ULONGLONG end = GetTickCount64() + 600;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (d.Read(reply, left) < 15) return false;
        if (reply[0] == 0x02 && reply[2] == 0x60 && reply[10] == cls) return true;
    }
    return false;
}

struct Cached { ULONGLONG at = 0; DeviceStatus status; bool valid = false; };
std::map<USHORT, Cached> g_cache;

const wchar_t* Name(USHORT pid) { return (pid == 0x0576 || pid == 0x0577) ? L"Razer BlackShark V3 Pro" : L"Razer BlackShark V3"; }

// ---- BlackShark V2 Pro (2023): "PA" envelope ----------------------------------------------------

std::vector<BYTE> PaFrame(BYTE totalLen, BYTE innerLen, BYTE type, BYTE cmd, BYTE flag) {
    std::vector<BYTE> b(64, 0);
    b[0] = 0x02;
    b[1] = 0x80;
    b[2] = totalLen;
    b[5] = 'P';
    b[6] = 'A';
    b[7] = innerLen;
    b[9] = type;
    b[10] = cmd;
    b[11] = flag;
    return b;
}

bool PaRemote(HidDev& d, bool on) {
    bool ok = d.Write(PaFrame(0x07, 0x0E, 0x02, 0xE1, on ? 1 : 0));
    Sleep(35);
    return ok;
}

// Query one value; returns the first payload byte, or -1 when the headset does not answer.
int PaQuery(HidDev& d, BYTE cmd) {
    d.Flush();
    PaRemote(d, true);  // sacrificial: wakes a dozing link
    int value = -1;
    for (int attempt = 0; attempt < 3 && value < 0; attempt++) {
        PaRemote(d, true);
        if (!d.Write(PaFrame(0x08, 0x08, 0x03, cmd, 0))) break;
        ULONGLONG end = GetTickCount64() + 150;
        std::vector<BYTE> r;
        while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
            int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
            if (d.Read(r, left) < 16) break;
            if (r[0] == 0x02 && r[12] == cmd && r[13] == 0x01 && r[14] >= 1) { value = r[15]; break; }
        }
    }
    PaRemote(d, false);
    return value;
}

void PollBlackSharkV2Pro2023(PollContext& ctx) {
    const USHORT pid = 0x0555;
    if (ctx.IsClaimed(0x1532, pid)) return;
    auto colls = ctx.Find(0x1532, pid, [](const HidColl& c) { return c.page() == 0xFF00 && c.outLen() >= 64 && c.inLen() >= 16; });
    for (const HidColl* c : colls) {
        HidDev d;
        if (!d.Open(*c)) continue;
        int level = PaQuery(d, 0x21);
        if (level < 0 || level > 100) continue;
        int charging = PaQuery(d, 0x2A);
        DeviceStatus s;
        s.key = L"blackshark:" + Hex4(pid);
        s.name = L"Razer BlackShark V2 Pro (2023)";
        s.kind = DeviceKind::Headset;
        s.via = L"2.4 GHz receiver";
        s.percent = level;
        s.charging = charging > 0;
        ctx.Add(s, 0x1532, pid);
        return;
    }
}

}  // namespace

void PollRazerHeadsets(PollContext& ctx) {
    PollBlackSharkV2Pro2023(ctx);
    for (USHORT pid : { (USHORT)0x0576, (USHORT)0x0577, (USHORT)0x0579, (USHORT)0x057A }) {
        if (ctx.IsClaimed(0x1532, pid)) continue;
        auto colls = ctx.Find(0x1532, pid, [](const HidColl& c) { return c.iface == 5 && c.outLen() >= 64 && c.inLen() >= 15; });
        if (colls.empty()) continue;
        Cached& cache = g_cache[pid];
        if (cache.valid && GetTickCount64() - cache.at < kMinIntervalMs) {
            ctx.Add(cache.status, 0x1532, pid);
            continue;
        }
        HidDev d;
        if (!d.Open(*colls[0])) continue;
        // Handshake the headset expects before reads (init, charging state on both links).
        d.Write(Packet(0x00, 0x02));
        d.Write(Packet(0x00, 0x2A));
        d.Write(Packet(0x80, 0x2A));
        Sleep(250);
        d.Flush();
        std::vector<BYTE> r;
        if (!Get(d, 0x21, r) || r[13] > 100) continue;
        DeviceStatus s;
        s.key = L"blackshark:" + Hex4(pid);
        s.name = Name(pid);
        s.kind = DeviceKind::Headset;
        s.via = L"2.4 GHz receiver";
        s.percent = r[13];
        s.charging = r[14] != 0;
        cache = { GetTickCount64(), s, true };
        ctx.Add(s, 0x1532, pid);
    }
}
