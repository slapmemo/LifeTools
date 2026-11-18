// Darmoshark M3 over its Telink receiver. Protocol reference:
// https://github.com/Barba2k2/darmoshark-m3-configurator/blob/main/PROTOCOL.md
#include "drivers.h"

#include <algorithm>

namespace {
constexpr USHORT kVid = 0x248A;
constexpr USHORT kReceiver = 0xFF30;
constexpr USHORT kMouse = 0xFF12;
constexpr BYTE kFeature = 0x51;
constexpr BYTE kBond = 0x03;
constexpr BYTE kIdentify = 0x06;
constexpr ULONGLONG kReceiverTimeoutMs = 1000;
constexpr ULONGLONG kFirstAttemptMs = 300;
constexpr ULONGLONG kQueryTimeoutMs = 500;

USHORT ReadId(const std::vector<BYTE>& reply, size_t offset) {
    return static_cast<USHORT>(reply[offset] | (reply[offset + 1] << 8));
}

bool Query(HidDev& device, BYTE opcode, std::vector<BYTE>& reply, ULONGLONG receiverDeadline) {
    const auto start = GetTickCount64();
    if (start >= receiverDeadline) return false;
    const auto deadline = (std::min)(receiverDeadline, start + kQueryTimeoutMs);

    device.Flush();
    if (GetTickCount64() >= deadline || !device.SetFeature({kFeature, opcode})) return false;

    std::vector<BYTE> input;
    for (auto now = GetTickCount64(); now < deadline; now = GetTickCount64()) {
        const auto waitMs = static_cast<int>((std::min)(20ULL, deadline - now));
        if (device.Read(input, waitMs) >= 3 &&
            input[0] == 0x54 && input[1] == 0xE4 && input[2] == 2) return false;
        if (GetTickCount64() >= deadline) return false;
        if (device.GetFeature(kFeature, reply) && reply.size() >= 12 &&
            reply[0] == kFeature && reply[1] == opcode) return GetTickCount64() < deadline;
    }
    return false;
}

int ReadBattery(HidDev& device, ULONGLONG deadline) {
    // The bond query replaces any previous battery reply in the receiver's
    // feature buffer before we request another one.
    std::vector<BYTE> reply;
    if (!Query(device, kBond, reply, deadline) ||
        ReadId(reply, 3) != kVid || ReadId(reply, 5) != kMouse || !reply[7]) return -1;
    if (!Query(device, kIdentify, reply, deadline) || reply[2] != 1 ||
        ReadId(reply, 4) != kVid || ReadId(reply, 6) != kMouse || reply[11] > 100) return -1;
    return reply[11];
}
}  // namespace

void PollDarmoshark(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kReceiver)) return;
    for (const HidColl* coll : ctx.Find(kVid, kReceiver, [](const HidColl& c) {
             return c.iface == 1 && c.page() == 0x008C && c.usage() == 1 &&
                    c.inLen() == 33 && c.outLen() == 33 && c.featLen() == 1001;
         })) {
        const auto deadline = GetTickCount64() + kReceiverTimeoutMs;
        HidDev device;
        if (!device.Open(*coll)) continue;

        // Leave time to reread the bond and retry if the first battery request goes unanswered.
        const auto firstDeadline = (std::min)(deadline, GetTickCount64() + kFirstAttemptMs);
        int percent = ReadBattery(device, firstDeadline);
        if (percent < 0 && GetTickCount64() < deadline) percent = ReadBattery(device, deadline);
        if (percent < 0) continue;

        DeviceStatus status;
        status.key = L"darmoshark:" + coll->path;
        status.name = L"Darmoshark M3";
        status.kind = DeviceKind::Mouse;
        status.via = L"2.4 GHz receiver";
        status.percent = percent;
        ctx.Add(status, kVid, kReceiver);
        return;
    }
}
