// Samsung Galaxy Buds (Buds, Buds+, Live, Pro, Buds2, Buds2 Pro, FE, Core, Buds3 / 3 Pro / 3 FE ...).
// Windows does not show a battery level for them, so they are asked directly: the earbuds accept
// an RFCOMM connection on Samsung's SPP service and push a status frame with the left, right and
// case levels as soon as it opens (frame format in galaxy_buds_protocol.h). Nothing is sent to them.
//   Buds2 and later:     service {2e73a4ad-332d-41fc-90e2-16bef06523f2}
//   Buds+, Live, Pro:    standard SPP {00001101-0000-1000-8000-00805f9b34fb}
//   original Buds:       {00001102-0000-1000-8000-00805f9b34fd}, legacy framing
// Service UUIDs from GalaxyBudsClient (Model/Constants.cs and the per-model DeviceSpec files).
// Only paired devices that Windows reports as connected and whose name contains "Buds" are tried.
// If the Galaxy Buds app (or GalaxyBudsClient) holds the connection, the earbuds are skipped.
#include <winsock2.h>
#include <ws2bth.h>

#include "drivers.h"
#include "galaxy_buds_protocol.h"

#include <setupapi.h>
#include <initguid.h>
#include <devpkey.h>

#include <cwchar>
#include <cwctype>

namespace {

// {2e73a4ad-332d-41fc-90e2-16bef06523f2}
const GUID kSppNew = { 0x2e73a4ad, 0x332d, 0x41fc, { 0x90, 0xe2, 0x16, 0xbe, 0xf0, 0x65, 0x23, 0xf2 } };
// {00001101-0000-1000-8000-00805f9b34fb}
const GUID kSppStandard = { 0x00001101, 0x0000, 0x1000, { 0x80, 0x00, 0x00, 0x80, 0x5f, 0x9b, 0x34, 0xfb } };
// {00001102-0000-1000-8000-00805f9b34fd}
const GUID kSppLegacy = { 0x00001102, 0x0000, 0x1000, { 0x80, 0x00, 0x00, 0x80, 0x5f, 0x9b, 0x34, 0xfd } };

const DEVPROPKEY kIsConnected = { { 0x83DA6326, 0x97A6, 0x4088, { 0x94, 0x53, 0xA1, 0x92, 0x3F, 0x57, 0x3B, 0x29 } }, 15 };

struct Buds { std::wstring name; std::wstring addrText; ULONGLONG addr; };

bool LooksLikeBuds(const std::wstring& name) {
    std::wstring n = name;
    for (auto& ch : n) ch = towlower(ch);
    return n.find(L"buds") != std::wstring::npos;
}

std::vector<Buds> FindConnectedBuds() {
    std::vector<Buds> out;
    HDEVINFO di = SetupDiGetClassDevsW(nullptr, L"BTHENUM", nullptr, DIGCF_ALLCLASSES | DIGCF_PRESENT);
    if (di == INVALID_HANDLE_VALUE) return out;
    SP_DEVINFO_DATA dd{ sizeof(dd) };
    for (DWORD i = 0; SetupDiEnumDeviceInfo(di, i, &dd); i++) {
        wchar_t inst[512];
        if (!SetupDiGetDeviceInstanceIdW(di, &dd, inst, 512, nullptr)) continue;
        // The device node itself: BTHENUM\DEV_<12 hex digits address>\...
        if (_wcsnicmp(inst, L"BTHENUM\\DEV_", 12) != 0) continue;
        std::wstring hex(inst + 12, wcsnlen(inst + 12, 12));
        if (hex.size() != 12) continue;
        wchar_t* end = nullptr;
        ULONGLONG addr = wcstoull(hex.c_str(), &end, 16);
        if (!addr || *end) continue;

        DEVPROPTYPE t;
        DEVPROP_BOOLEAN conn = DEVPROP_FALSE;
        if (!SetupDiGetDevicePropertyW(di, &dd, &kIsConnected, &t, (PBYTE)&conn, sizeof(conn), nullptr, 0) ||
            t != DEVPROP_TYPE_BOOLEAN || conn == DEVPROP_FALSE)
            continue;  // never page a device that is not connected (it would only time out)
        wchar_t name[256] = {};
        if (!SetupDiGetDevicePropertyW(di, &dd, &DEVPKEY_Device_FriendlyName, &t, (PBYTE)name, sizeof(name) - sizeof(wchar_t),
                                       nullptr, 0) ||
            t != DEVPROP_TYPE_STRING)
            continue;
        if (!LooksLikeBuds(name)) continue;
        out.push_back({ name, hex, addr });
    }
    SetupDiDestroyDeviceInfoList(di);
    return out;
}

bool StartWinsock() {
    static bool ok = [] {
        WSADATA wsa;
        return WSAStartup(MAKEWORD(2, 2), &wsa) == 0;
    }();
    return ok;
}

// Waits until `s` is readable (read) or connected (write). Returns false on timeout or error.
bool WaitSocket(SOCKET s, bool forWrite, int timeoutMs) {
    fd_set set, err;
    FD_ZERO(&set);
    FD_ZERO(&err);
    FD_SET(s, &set);
    FD_SET(s, &err);
    timeval tv{ timeoutMs / 1000, (timeoutMs % 1000) * 1000 };
    int r = select(0, forWrite ? nullptr : &set, forWrite ? &set : nullptr, &err, &tv);
    return r > 0 && FD_ISSET(s, &set) && !FD_ISSET(s, &err);
}

// Opens the RFCOMM service and listens for the status frame the earbuds send on connect.
bool ReadStatus(ULONGLONG addr, const GUID& service, bool legacy, GalaxyBuds::Status& st) {
    SOCKET s = socket(AF_BTH, SOCK_STREAM, BTHPROTO_RFCOMM);
    if (s == INVALID_SOCKET) return false;
    u_long nonBlocking = 1;
    ioctlsocket(s, FIONBIO, &nonBlocking);
    SOCKADDR_BTH sa{};
    sa.addressFamily = AF_BTH;
    sa.btAddr = addr;
    sa.serviceClassId = service;  // Windows looks the RFCOMM channel up over SDP
    sa.port = 0;
    bool found = false;
    if (connect(s, (sockaddr*)&sa, sizeof(sa)) == 0 || (WSAGetLastError() == WSAEWOULDBLOCK && WaitSocket(s, true, 4000))) {
        std::vector<std::uint8_t> buf;
        ULONGLONG deadline = GetTickCount64() + 3000;
        while (!found && buf.size() < 8192) {
            ULONGLONG now = GetTickCount64();
            if (now >= deadline || !WaitSocket(s, false, (int)(deadline - now))) break;
            char chunk[512];
            int n = recv(s, chunk, sizeof(chunk), 0);
            if (n <= 0) break;
            buf.insert(buf.end(), chunk, chunk + n);
            found = GalaxyBuds::FindStatus(buf.data(), buf.size(), legacy, st);
        }
    }
    closesocket(s);
    return found;
}

std::wstring Pct(int v) { return v >= 0 ? std::to_wstring(v) + L"%" : L"-"; }

}  // namespace

void PollGalaxyBuds(PollContext& ctx) {
    std::vector<Buds> list = FindConnectedBuds();
    if (list.empty() || !StartWinsock()) return;
    for (const Buds& b : list) {
        GalaxyBuds::Status st;
        bool ok = ReadStatus(b.addr, kSppNew, false, st) || ReadStatus(b.addr, kSppStandard, false, st) ||
                  ReadStatus(b.addr, kSppLegacy, true, st);
        if (!ok) continue;
        DeviceStatus s;
        s.key = L"galaxybuds:" + b.addrText;
        s.name = b.name;  // the same name the Bluetooth fallback uses, so it skips these earbuds
        s.via = L"Bluetooth";
        s.kind = DeviceKind::Headset;
        // The tray shows the lower of the two earbuds; the tooltip lists all three parts.
        if (st.left >= 0 && st.right >= 0) s.percent = st.left < st.right ? st.left : st.right;
        else s.percent = st.left >= 0 ? st.left : st.right;
        s.detail = L"L " + Pct(st.left) + L", R " + Pct(st.right);
        if (st.caseLevel >= 0) s.detail += L", case " + Pct(st.caseLevel);
        s.graceSec = 180;  // a busy link (Galaxy Buds app open) should not make them flicker
        ctx.out.push_back(s);
    }
}
