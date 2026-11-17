// Valve Steam Controller battery input reports. Layout reference: Linux hid-steam.
#include "drivers.h"

namespace {

const wchar_t* SteamControllerTransport(USHORT pid) {
    switch (pid) {
        case 0x1142: return L"Wireless adapter";  // 2015 receiver
        case 0x1302: return L"USB cable";
        case 0x1303: return L"Bluetooth";
        case 0x1304:                             // 2026 puck
        case 0x1305: return L"Wireless adapter";  // internal receiver
        default: return nullptr;
    }
}

bool ReadSteamBattery(HidDev& dev, bool legacy, bool puck, DeviceStatus& status) {
    std::vector<BYTE> report;
    // The puck exposes four slots even when fewer controllers are connected.
    bool receivedInput = false;
    const ULONGLONG deadline = GetTickCount64() + 5000;
    while (GetTickCount64() < deadline) {
        // Windows pads numbered input reports to the collection's maximum size.
        const int size = dev.Read(report, puck && !receivedInput ? 250 : 100);
        if (size < 0 && puck && !receivedInput) return false;
        if (size > 0) receivedInput = true;
        if (size < 15) continue;
        if (legacy) {
            if (report[0] != 0x01 || report[1] != 0x00 || report[2] != 0x04 ||
                report[3] != 11 || report[14] > 100)
                continue;
            status.percent = report[14];
        } else {
            if (report[0] != 0x43 || report[2] > 100) continue;
            status.percent = report[2];
            status.charging = report[1] == 2;
        }
        return true;
    }
    return false;
}

}  // namespace

void PollSteamController(PollContext& ctx) {
    for (const auto& c : ctx.colls) {
        if (c.vid != 0x28DE || c.page() != 0xFF00 || c.inLen() < 15) continue;
        const wchar_t* transport = SteamControllerTransport(c.pid);
        if (!transport) continue;
        const bool puck = c.pid == 0x1304;
        if (puck && c.usage() != 0x01) continue;  // skip the charging contacts collection

        HidDev dev;
        if (!dev.Open(c)) continue;
        DeviceStatus status;
        const bool legacy = c.pid == 0x1142;
        if (!ReadSteamBattery(dev, legacy, puck, status)) continue;

        UINT hash = 2166136261u;
        for (wchar_t ch : c.path) { hash ^= ch; hash *= 16777619u; }
        status.key = L"steam:" + Hex4(c.pid) + L":" + std::to_wstring(hash);
        status.name = HidProduct(c);
        if (legacy || puck || c.pid == 0x1305 || status.name.empty())
            status.name = L"Steam Controller";
        status.kind = DeviceKind::Gamepad;
        status.via = transport;
        ctx.Add(status, c.vid, c.pid);
    }
}
