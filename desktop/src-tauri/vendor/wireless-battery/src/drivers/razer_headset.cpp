// Razer BlackShark headsets with their own vendor protocol (not the 90-byte Razer feature report).
//
// BlackShark V3 / V3 Pro (1532:0576/0577 V3 Pro, 0579/057A V3), interface 5; V3 X further down.
// 64-byte output report 02: [02][00][60][00 00][00][size][00 00][dir][class][sub][argc][args]..
// [62] = XOR of bytes 0..61. GET battery = class 21 -> reply args [level %][charging].
// The headset drops its 2.4 GHz link if the battery is queried every few seconds, so it is asked at
// most once every 5 minutes and the last reading is reused in between.
// Protocol from OpenRazer PR #2794 (docs/v3_pro_protocol.md) and github.com/ReedME/omarchy-blackshark-v3.
//
// BlackShark V2 Pro (2020), 2.4 GHz receiver 1532:0528, uses feature report FF on FF00:0001.
// Request from https://github.com/openrazer/openrazer/issues/1280#issuecomment-1094116217.
// Reply and power states documented in https://github.com/HeyOkay/HaloBattery/blob/main/providers/blackshark2020.py.
//
// BlackShark V2 Pro (2023), HyperSpeed dongle 1532:0555, vendor collection (usage page FF00).
// 64-byte output report 02, "PA" envelope: [02][80][8+len][00 00]['P']['A'][08][00][type][cmd][flag][len].
// Remote mode on/off = [02][80][07][00 00]['P']['A'][0E][00][02][E1][1/0]; Synapse asserts it around
// every query, and the first frame after ~0.3 s idle only wakes the link, so one extra remote-on is
// sent first. Query type 03: cmd 21 = battery 0-100, cmd 2A = charging (0 = on battery).
// Reply: [02].. [12]=cmd echo [13]=01 ACK [14]=len [15..]=data.
// Protocol from OpenRazer PR #2862 (driver/razerblackshark_driver.c, from a capture of 1532:0555)
// and HaloBattery providers/blackshark.py.
//
// Barracuda X (2022), YS-Tech 2.4 GHz receiver 1532:0550, vendor collection FF00:0001, report id 02.
// The receiver bridges USB HID to the headset's Airoha chip. Output report (64 bytes):
// [02][80][len][crc lo][crc hi][payload..], crc = CRC-16/XMODEM over the whole report with the crc bytes zero.
// After each write the bridge answers a GetInputReport(02) with [02]['O'] (taken) or [02]['F'] (busy).
// Input reports are [02][len][stream..]; the stream carries frames [50 49][group][..][len lo][len hi]..
// (10-byte header, payload length in bytes 8-9). Airoha command = [50 41][group][seq][body..].
// Remote mode (group 0E, body 02 E1 01/00) makes the receiver forward commands to the headset; it is switched
// on for one query and off again afterwards, like the BlackShark V2 Pro. The headset does not answer when it
// is off, out of range or in Bluetooth mode. Customer data GET (group 08, body 03 <cmd> 00 00), reply op 01:
// cmd 21 = battery 0-100, cmd 2A = cable (00 / 01).
// Protocol from github.com/mehdibouchami/razer-barracuda-x-battery (YS-Tech framing) and
// github.com/nightdevx/barracuda-x-battery (checked on a 1532:0550 receiver).
#include "drivers.h"

#include <algorithm>
#include <iterator>
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

// ---- BlackShark V2 HyperSpeed: MediaTek vendor HID (NOT V2 Pro PA protocol) ----------------------
// Based on justik13/razer-blackshark-v2-hyperspeed-webhid (MIT).
// Dongle 1532:0565, vendor collection usage page FF14 (FF00 fallback), usually interface 3.
// HID report: [02][00][60|seq][00 00 00][04][00][00][80][cmd][00][00]...[xor][00].
// Only GET 0x21 (battery) and GET 0x2A (charging) are issued; no settings are modified.

BYTE NextHsSeq() {
    static BYTE seq = 0;
    return static_cast<BYTE>(0x60 | ((seq++) & 0x1F));
}

std::vector<BYTE> HsQueryFrame(BYTE cmd, BYTE seq) {
    std::vector<BYTE> b(64, 0);
    b[0] = 0x02; // report ID, excluded from WebHID payload, included in Win32 Write
    b[2] = seq;
    b[6] = 0x04; // GET request length
    b[9] = 0x80; // route from RF dongle to headset
    b[10] = cmd;
    BYTE checksum = 0;
    for (int i = 0; i < 62; ++i) checksum ^= b[i];
    b[62] = checksum;
    return b;
}

// The Win32 HID layer returns the report ID in r[0] for numbered reports.
// WebHID's payload offsets are therefore shifted by one here.
bool ParseHsReply(const std::vector<BYTE>& r, BYTE cmd, BYTE seq, int& value) {
    if (r.size() < 64 || r[0] != 0x02 || r[2] != seq || r[10] != cmd || r[12] < 1) return false;
    BYTE checksum = 0;
    for (int i = 1; i < 62; ++i) checksum ^= r[i];
    if (checksum != r[62]) return false;
    value = r[13];
    return true;
}

int HsQuery(HidDev& d, BYTE cmd) {
    const BYTE seq = NextHsSeq();
    d.Flush();
    if (!d.Write(HsQueryFrame(cmd, seq))) return -1;
    const ULONGLONG end = GetTickCount64() + 650;
    std::vector<BYTE> r;
    while (GetTickCount64() < end) {
        int remaining = static_cast<int>(end - GetTickCount64());
        if (d.Read(r, remaining) < 0) break;
        int value = -1;
        if (ParseHsReply(r, cmd, seq, value)) return value;
    }
    return -1;
}

void PollBlackSharkV2HyperSpeed(PollContext& ctx) {
    constexpr USHORT pid = 0x0565; // 2.4 GHz dongle, not the wired 056E variant
    if (ctx.IsClaimed(0x1532, pid)) return;
    auto colls = ctx.Find(0x1532, pid, [](const HidColl& c) {
        return (c.page() == 0xFF14 || c.page() == 0xFF00) &&
               c.usage() == 0x01 && c.outLen() >= 64 && c.inLen() >= 64;
    });
    // Prefer the specific vendor control interface so audio/telephony endpoints are not touched.
    for (const HidColl* c : colls) {
        if (c->page() != 0xFF14) continue;
        HidDev d;
        if (!d.Open(*c)) continue;
        const int level = HsQuery(d, 0x21);
        if (level < 0 || level > 100) continue;
        const int charging = HsQuery(d, 0x2A);
        DeviceStatus s;
        s.key = L"blackshark:" + Hex4(pid);
        s.name = L"Razer BlackShark V2 HyperSpeed";
        s.kind = DeviceKind::Headset;
        s.via = L"2.4 GHz receiver";
        s.percent = level;
        s.charging = charging > 0;
        ctx.Add(s, 0x1532, pid);
        return;
    }
    // Fallback for firmware exposing the control collection on FF00.
    for (const HidColl* c : colls) {
        if (c->page() != 0xFF00) continue;
        HidDev d;
        if (!d.Open(*c)) continue;
        const int level = HsQuery(d, 0x21);
        if (level < 0 || level > 100) continue;
        const int charging = HsQuery(d, 0x2A);
        DeviceStatus s;
        s.key = L"blackshark:" + Hex4(pid);
        s.name = L"Razer BlackShark V2 HyperSpeed";
        s.kind = DeviceKind::Headset;
        s.via = L"2.4 GHz receiver";
        s.percent = level;
        s.charging = charging > 0;
        ctx.Add(s, 0x1532, pid);
        return;
    }
}

void PollBlackSharkV2Pro2020(PollContext& ctx) {
    constexpr USHORT vid = 0x1532, pid = 0x0528;
    constexpr int reportLen = 64, maxReads = 5;
    constexpr BYTE reply[] = { 0xFF, 0x0F, 0x05, 0xFE, 0x12, 0x04, 0x1F, 0x08, 0x05 };
    constexpr BYTE stale[] = { 0xFF, 0x01, 0x00, 0xFE, 0x12, 0x04, 0x1F, 0x08, 0x05 };
    if (ctx.IsClaimed(vid, pid)) return;
    auto colls = ctx.Find(vid, pid, [](const HidColl& c) {
        return c.iface == 3 && c.page() == 0xFF00 && c.usage() == 0x0001 && c.featLen() == reportLen;
    });
    for (const HidColl* c : colls) {
        HidDev d;
        if (!d.OpenFeatureOnly(*c)) continue;
        if (!d.SetFeature({ 0xFF, 0x0A, 0x00, 0xFD, 0x04, 0x12, 0xF1, 0x02, 0x05 })) continue;

        std::vector<BYTE> r;
        for (int read = 0; read < maxReads; ++read) {
            Sleep(100);  // Synapse waits about 100 ms for the receiver to fetch headset status.
            if (!d.GetFeature(0xFF, r) || r.size() != reportLen) continue;
            const bool fresh = std::equal(std::begin(reply), std::end(reply), r.begin());
            // Give an in-flight request time to replace the old payload before reporting offline.
            const bool offline = read == maxReads - 1 && std::equal(std::begin(stale), std::end(stale), r.begin());
            if (!fresh && !offline) continue;

            DeviceStatus s;
            s.key = L"blackshark:" + Hex4(pid);
            s.name = L"Razer BlackShark V2 Pro (2020)";
            s.kind = DeviceKind::Headset;
            s.via = L"2.4 GHz receiver";
            s.millivolts = fresh ? (r[12] << 8) | r[13] : 0;
            s.connected = s.millivolts != 0;
            if (s.connected) {
                s.charging = r[11] == 0x09;
                // The receiver can jump to 80% as soon as charging starts, even from 10%.
                if (!s.charging && r[14] <= 100) s.percent = r[14];
            }
            ctx.Add(s, vid, pid);
            return;
        }
    }
}

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

// ---- Barracuda X (2022), YS-Tech receiver 1532:0550 ---------------------------------------------

USHORT Crc16Xmodem(const std::vector<BYTE>& data) {
    USHORT crc = 0;
    for (BYTE b : data) {
        crc ^= (USHORT)(b << 8);
        for (int i = 0; i < 8; i++) crc = (crc & 0x8000) ? (USHORT)((crc << 1) ^ 0x1021) : (USHORT)(crc << 1);
    }
    return crc;
}

class BarracudaLink {
public:
    bool Open(const HidColl& c) { return dev_.Open(c); }

    // Sends one Airoha command [50 41][group][seq][body..]; the sequence number is kept in seq_.
    bool Command(BYTE group, std::initializer_list<BYTE> body) {
        seq_ = (BYTE)(seq_ % 127 + 1);
        std::vector<BYTE> payload = { 0x50, 0x41, group, seq_ };
        payload.insert(payload.end(), body);
        std::vector<BYTE> f(64, 0);
        f[0] = 0x02;
        f[1] = 0x80;
        f[2] = (BYTE)payload.size();
        std::copy(payload.begin(), payload.end(), f.begin() + 5);
        USHORT crc = Crc16Xmodem(f);
        f[3] = (BYTE)(crc & 0xFF);
        f[4] = (BYTE)(crc >> 8);
        for (int attempt = 0; attempt < 5; attempt++) {
            if (attempt) Sleep(50);
            std::vector<BYTE> status;
            if (!dev_.Write(f) || !dev_.GetInputReport(0x02, status) || status.size() < 2) return false;
            if (status[1] == 'O') return true;
            if (status[1] != 'F') return false;  // anything but "taken" / "busy" means the bridge refused it
        }
        return false;
    }

    // Waits for the first reply frame accepted by `match`; unrelated frames (events, other replies) are skipped.
    template <class Match>
    bool Await(Match match, int timeoutMs, std::vector<BYTE>& frame) {
        ULONGLONG end = GetTickCount64() + timeoutMs;
        for (;;) {
            while (stream_.size() >= 2) {
                auto start = std::search(stream_.begin(), stream_.end(), kMagic, kMagic + 2);
                stream_.erase(stream_.begin(), start);
                if (stream_.size() < 10) break;
                size_t len = 10 + (stream_[8] | (stream_[9] << 8));
                if (stream_.size() < len) break;
                frame.assign(stream_.begin(), stream_.begin() + len);
                stream_.erase(stream_.begin(), stream_.begin() + len);
                if (match(frame)) return true;
            }
            int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
            std::vector<BYTE> r;
            if (left <= 0 || dev_.Read(r, left) < 2) return false;
            if (r[0] == 0x02 && (size_t)r[1] + 2 <= r.size()) stream_.insert(stream_.end(), r.begin() + 2, r.begin() + 2 + r[1]);
        }
    }

    // Remote mode on/off. Returns true when the headset acknowledged it (status 0).
    bool RemoteMode(bool on) {
        std::vector<BYTE> f;
        if (!Command(0x0E, { 0x02, 0xE1, (BYTE)(on ? 1 : 0) })) return false;
        BYTE seq = seq_;
        return Await([seq](const std::vector<BYTE>& r) { return r.size() >= 13 && r[10] == 0x0E && r[11] == (BYTE)(0x80 | seq); }, 800, f) &&
               f[12] == 0;
    }

    // Customer-data GET: the first value byte, or -1 when the headset does not answer.
    int Get(BYTE cmd) {
        std::vector<BYTE> f;
        if (!Command(0x08, { 0x03, cmd, 0x00, 0x00 })) return -1;
        bool ok = Await([cmd](const std::vector<BYTE>& r) { return r.size() >= 13 && r[2] == 0x08 && r[10] == cmd && r[11] == 0x01; }, 1000, f);
        return (ok && f[12] >= 1 && f.size() >= 14) ? f[13] : -1;
    }

private:
    static constexpr BYTE kMagic[2] = { 0x50, 0x49 };
    HidDev dev_;
    std::vector<BYTE> stream_;
    BYTE seq_ = 0;
};

void PollBarracudaX(PollContext& ctx) {
    const USHORT pid = 0x0550;
    if (ctx.IsClaimed(0x1532, pid)) return;
    auto colls = ctx.Find(0x1532, pid, [](const HidColl& c) { return c.page() == 0xFF00 && c.usage() == 0x0001 && c.outLen() >= 64 && c.inLen() >= 64; });
    for (const HidColl* c : colls) {
        BarracudaLink link;
        if (!link.Open(*c)) continue;
        if (!link.RemoteMode(true)) continue;  // receiver without a connected headset (off, out of range, Bluetooth mode)
        int level = link.Get(0x21);
        int cable = level >= 0 ? link.Get(0x2A) : -1;
        link.RemoteMode(false);
        if (level < 0 || level > 100) continue;
        DeviceStatus s;
        s.key = L"barracuda:" + Hex4(pid);
        s.name = L"Razer Barracuda X (2022)";
        s.kind = DeviceKind::Headset;
        s.via = L"2.4 GHz receiver";
        s.percent = level;
        s.charging = cable == 1;
        ctx.Add(s, 0x1532, pid);
        return;
    }
}

// BlackShark V3 X (1532:057D HyperSpeed dongle, 057C cable): a different protocol on interface 0.
// 64-byte feature report 07: [07][status][txid][00 00 00][argc][class][cmd][args].. [62] = XOR of 3..60.
// Battery = class 07 cmd 80 -> args[1] is the level %; cmd 84 -> args[1] is charging.
// Status 02 = success, 01 = busy; anything else (e.g. headset off) is a failure.
// Protocol from OpenRazer PR #2899, verified on a 057D dongle.
bool V3xGet(HidDev& d, BYTE cmd, BYTE& value) {
    static BYTE txid = 0x40;
    for (int attempt = 0; attempt < 4; attempt++) {
        std::vector<BYTE> req(64, 0);
        req[0] = 0x07;
        req[2] = ++txid;
        req[6] = 0x02;
        req[7] = 0x07;
        req[8] = cmd;
        BYTE crc = 0;
        for (int i = 3; i <= 60; i++) crc ^= req[i];
        req[62] = crc;
        if (!d.SetFeature(req)) return false;
        Sleep(60);
        std::vector<BYTE> r;
        if (!d.GetFeature(0x07, r) || r.size() < 63) continue;
        if (r[2] != txid || r[7] != 0x07 || r[8] != cmd || r[6] < 2) continue;
        if (r[1] != 0x02 && r[1] != 0x01) return false;
        value = r[10];
        return true;
    }
    return false;
}

void PollBlackSharkV3X(PollContext& ctx) {
    for (USHORT pid : { (USHORT)0x057D, (USHORT)0x057C }) {
        if (ctx.IsClaimed(0x1532, pid)) continue;
        auto colls = ctx.Find(0x1532, pid, [](const HidColl& c) { return c.iface == 0 && c.featLen() >= 64; });
        if (colls.empty()) continue;
        Cached& cache = g_cache[pid];
        if (cache.valid && GetTickCount64() - cache.at < kMinIntervalMs) {
            ctx.Add(cache.status, 0x1532, pid);
            continue;
        }
        HidDev d;
        if (!d.OpenFeatureOnly(*colls[0])) continue;
        BYTE level = 0, charging = 0;
        if (!V3xGet(d, 0x80, level) || level > 100) continue;
        V3xGet(d, 0x84, charging);
        DeviceStatus s;
        s.key = L"blackshark:" + Hex4(pid);
        s.name = L"Razer BlackShark V3 X";
        s.kind = DeviceKind::Headset;
        s.via = pid == 0x057D ? L"2.4 GHz receiver" : L"USB cable";
        s.percent = level;
        s.charging = charging == 1;
        cache = { GetTickCount64(), s, true };
        ctx.Add(s, 0x1532, pid);
    }
}

}  // namespace

void PollRazerHeadsets(PollContext& ctx) {
    PollBlackSharkV2HyperSpeed(ctx);
    PollBarracudaX(ctx);
    PollBlackSharkV2Pro2020(ctx);
    PollBlackSharkV2Pro2023(ctx);
    PollBlackSharkV3X(ctx);
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
