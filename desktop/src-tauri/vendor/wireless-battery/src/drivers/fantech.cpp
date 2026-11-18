// Fantech Helios Go XD5 wireless gaming mouse (Areson / SinoWealth MCU, PixArt PAW3370 sensor).
// VID 25A7, wired USB-C pid FA7B, 2.4 GHz dongle pid FA7C. The vendor configuration interface
// uses 17-byte feature reports with report id 0x08:
//   [08][cmd][0 x14][checksum], where the sum of all 17 bytes is 0x55 mod 256.
//   cmd 04 = get battery -> reply [6] = percent, [7] = charging.
// No handshake or configuration command is needed; the mouse answers a plain cmd 04.
// The feature report and the reply are on different HID collections of interface 1, so the
// command is written to one handle and all input collections are watched for the answer.
// A sleeping or switched-off mouse does not answer; the last value is kept (graceSec).
// Reply layout confirmed on hardware (dongle 25A7:FA7C) and against the captures in
// github.com/libratbag/libratbag issue #1893: [6] = percent, [7] = 1 when charging.
// Protocol: github.com/jarjut/xd5-go-web (docs/PROTOCOL_SPECIFICATION.md and src/core/protocol.ts),
// reverse engineered from Fantech's OemDrv.exe.
#include "drivers.h"

#include <algorithm>
#include <memory>

namespace {

const USHORT kVid = 0x25A7;
const USHORT kPidWired = 0xFA7B;
const USHORT kPidDongle = 0xFA7C;

constexpr BYTE kReportId = 0x08;
constexpr size_t kPacketLen = 17;

std::vector<BYTE> MakePacket(BYTE cmd) {
    std::vector<BYTE> p(kPacketLen, 0);
    p[0] = kReportId;
    p[1] = cmd;
    unsigned sum = 0;
    for (size_t i = 0; i < kPacketLen - 1; i++) sum += p[i];
    p[16] = (BYTE)(0x55 - sum);
    return p;
}

struct BatteryReply {
    int pct = -1;
    bool charging = false;
    bool checksumOk = false;
};

// The reply comes back as an input report. Whether the HID stack keeps the report id in
// the buffer varies, so accept the command byte at index 0 or 1. The two offsets under
// cmd 0 cover the WebHID layouts documented by the project we took the protocol from.
bool ParseBattery(const std::vector<BYTE>& r, BatteryReply& out) {
    unsigned sum = 0;
    for (size_t i = 0; i < r.size() && i < kPacketLen; i++) sum += r[i];
    bool chk = r.size() >= kPacketLen && (sum & 0xFF) == 0x55;

    auto plausible = [&](size_t power, size_t charge) {
        if (r.size() <= charge) return false;
        int p = r[power], c = r[charge];
        if (p < 1 || p > 100 || c > 1) return false;
        out = { p, c != 0, chk };
        return true;
    };

    if (r.size() >= 7 && r[0] == 0x04) {
        if (plausible(5, 6)) return true;
        if (plausible(4, 5)) return true;
    }
    if (r.size() >= 8 && r[1] == 0x04) return plausible(6, 7);
    return false;
}

void Remember(const BatteryReply& c, BatteryReply& found) {
    if (found.pct < 0 || (c.checksumOk && !found.checksumOk)) found = c;
}

// Sends the read-only cmd 0x04 on `cmd`, then watches `readers` for the reply.
bool QueryBattery(HidDev& cmd, const std::vector<HidDev*>& readers, int& pct, bool& charging) {
    std::vector<BYTE> req = MakePacket(0x04);
    cmd.Flush();
    if (!cmd.SetFeature(req)) return false;

    BatteryReply found;
    std::vector<BYTE> r;
    ULONGLONG end = GetTickCount64() + 500;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        for (HidDev* d : readers) {
            int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
            if (left <= 0 || d->Read(r, std::min(left, 40)) < 6) continue;
            BatteryReply c;
            if (ParseBattery(r, c)) Remember(c, found);
        }
        if (found.checksumOk) break;
    }

    // Some firmware answers with the feature report instead of an input report.
    std::vector<BYTE> f;
    if (cmd.GetFeature(kReportId, f)) {
        BatteryReply c;
        if (ParseBattery(f, c)) Remember(c, found);
    }

    if (found.pct < 0) return false;
    pct = found.pct;
    charging = found.charging;
    return true;
}

}  // namespace

void PollFantech(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(kVid)) {
        if (pid != kPidWired && pid != kPidDongle) continue;

        std::vector<const HidColl*> all = ctx.Find(vid, pid, [](const HidColl&) { return true; });
        const HidColl* feat = nullptr;
        for (const HidColl* c : all)
            if (c->featLen() >= kPacketLen) { feat = c; break; }
        if (!feat) continue;

        HidDev cmd;
        if (!cmd.Open(*feat) && !cmd.OpenFeatureOnly(*feat)) continue;

        // The vendor driver reads input report 08 on a different collection than the one it
        // writes feature report 08 to, so listen on every input collection of the device.
        std::vector<std::unique_ptr<HidDev>> opened;
        std::vector<HidDev*> readers;
        if (feat->inLen() >= 6) readers.push_back(&cmd);
        for (const HidColl* c : all) {
            if (c == feat || c->inLen() < 6) continue;
            auto d = std::make_unique<HidDev>();
            if (d->Open(*c)) {
                opened.push_back(std::move(d));
                readers.push_back(opened.back().get());
            }
        }

        int pct = -1;
        bool charging = false;
        if (!QueryBattery(cmd, readers, pct, charging)) continue;

        DeviceStatus s;
        s.key = L"fantech:" + Hex4(pid);
        s.name = L"Fantech Helios Go XD5";
        s.kind = DeviceKind::Mouse;
        s.via = pid == kPidWired ? L"USB cable" : L"2.4 GHz receiver";
        s.percent = pct;
        s.charging = charging;
        s.graceSec = 1800;
        ctx.Add(s, vid, pid);
        break;
    }
}
