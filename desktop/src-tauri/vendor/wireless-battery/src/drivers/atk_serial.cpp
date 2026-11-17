// ATK N9 Pro (VID 373B: dongle 11CB, wired 11CA) and first-generation N9 Ultra (dongle 1204,
// wired 1203) headsets. Unlike other headsets they are not queried over HID but over a USB
// virtual COM port (9600 8N1), with 64-byte frames:
//   request [len = 2][cmd][sub][0...]        reply [len][cmd][sub][data...]
//   cmd 00 sub 04 = status  -> data[1] == 1 when the headset is connected to the dongle
//   cmd 00 sub 03 = battery -> data[1] = percent (bits 0-6), charging (bit 7)
// Protocol from ATK's own configuration software (ATK HUB, "n9-pro" model; ATK HUB 3.2.31 maps
// the N9 Ultra ids to the same model and serial settings, see
// github.com/wushuai0802/myfinder-device-battery engine/upstream-protocols.md). The N9 Ultra
// reports its level in 10 % steps. The newer N9 V2 headsets use a different (HID) protocol.
// If the ATK desktop app is running it holds the port and the headset is skipped.
#include "drivers.h"

#include <setupapi.h>
#include <initguid.h>
#include <devguid.h>

#include <cwctype>
#include <string>

namespace {

struct Model { USHORT pid; const wchar_t* name; bool wired; };

constexpr Model kModels[] = {
    { 0x11CB, L"ATK N9 Pro", false },
    { 0x11CA, L"ATK N9 Pro", true },
    { 0x1204, L"ATK N9 Ultra", false },
    { 0x1203, L"ATK N9 Ultra", true },
};

struct Port { std::wstring name; const Model* model; };

std::vector<Port> FindPorts() {
    std::vector<Port> out;
    HDEVINFO di = SetupDiGetClassDevsW(&GUID_DEVCLASS_PORTS, nullptr, nullptr, DIGCF_PRESENT);
    if (di == INVALID_HANDLE_VALUE) return out;
    SP_DEVINFO_DATA dd{ sizeof(dd) };
    for (DWORD i = 0; SetupDiEnumDeviceInfo(di, i, &dd); i++) {
        wchar_t inst[512];
        if (!SetupDiGetDeviceInstanceIdW(di, &dd, inst, 512, nullptr)) continue;
        std::wstring id = inst;
        for (auto& ch : id) ch = towupper(ch);
        const Model* model = nullptr;
        for (const Model& m : kModels)
            if (id.find(L"VID_373B&PID_" + Hex4(m.pid)) != std::wstring::npos) model = &m;
        if (!model) continue;
        HKEY k = SetupDiOpenDevRegKey(di, &dd, DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
        if (k == INVALID_HANDLE_VALUE) continue;
        wchar_t name[32] = {};
        DWORD sz = sizeof(name) - sizeof(wchar_t), type = 0;
        if (RegQueryValueExW(k, L"PortName", nullptr, &type, (BYTE*)name, &sz) == ERROR_SUCCESS && type == REG_SZ)
            out.push_back({ name, model });
        RegCloseKey(k);
    }
    SetupDiDestroyDeviceInfoList(di);
    return out;
}

class Serial {
public:
    explicit Serial(const std::wstring& port) {
        h_ = CreateFileW((L"\\\\.\\" + port).c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
        if (h_ == INVALID_HANDLE_VALUE) return;
        DCB dcb{ sizeof(dcb) };
        GetCommState(h_, &dcb);
        dcb.BaudRate = CBR_9600;
        dcb.ByteSize = 8;
        dcb.Parity = NOPARITY;
        dcb.StopBits = ONESTOPBIT;
        dcb.fBinary = TRUE;
        dcb.fOutxCtsFlow = dcb.fOutxDsrFlow = FALSE;
        dcb.fDtrControl = DTR_CONTROL_ENABLE;
        dcb.fRtsControl = RTS_CONTROL_ENABLE;
        dcb.fOutX = dcb.fInX = FALSE;
        COMMTIMEOUTS to{};
        to.ReadIntervalTimeout = 50;
        to.ReadTotalTimeoutConstant = 300;
        to.WriteTotalTimeoutConstant = 300;
        if (!SetCommState(h_, &dcb) || !SetCommTimeouts(h_, &to)) Close();
        else PurgeComm(h_, PURGE_RXCLEAR | PURGE_TXCLEAR);
    }
    ~Serial() { Close(); }
    bool ok() const { return h_ != INVALID_HANDLE_VALUE; }

    // Sends command (cmd, sub) and returns the data bytes of the matching 64-byte reply frame.
    bool Command(BYTE cmd, BYTE sub, std::vector<BYTE>& data) {
        BYTE frame[64] = { 2, cmd, sub };
        DWORD n = 0;
        if (!WriteFile(h_, frame, sizeof(frame), &n, nullptr) || n != sizeof(frame)) return false;
        std::vector<BYTE> buf;
        ULONGLONG end = GetTickCount64() + 800;
        while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
            BYTE chunk[128];
            if (!ReadFile(h_, chunk, sizeof(chunk), &n, nullptr)) return false;
            buf.insert(buf.end(), chunk, chunk + n);
            while (buf.size() >= 64) {  // the headset also pushes unsolicited frames; skip those
                if (buf[1] == cmd && buf[2] == sub) {
                    data.assign(buf.begin() + 3, buf.begin() + 64);
                    return true;
                }
                buf.erase(buf.begin(), buf.begin() + 64);
            }
        }
        return false;
    }

private:
    void Close() {
        if (h_ != INVALID_HANDLE_VALUE) CloseHandle(h_);
        h_ = INVALID_HANDLE_VALUE;
    }
    HANDLE h_ = INVALID_HANDLE_VALUE;
};

}  // namespace

void PollAtkSerial(PollContext& ctx) {
    for (const Port& p : FindPorts()) {
        USHORT pid = p.model->pid;
        if (ctx.IsClaimed(0x373B, pid)) continue;
        Serial port(p.name);
        if (!port.ok()) continue;  // in use (ATK app open) or not a working port
        std::vector<BYTE> data;
        if (!port.Command(0x00, 0x04, data)) continue;
        DeviceStatus s;
        s.key = L"atk-serial:" + Hex4(pid);
        s.name = p.model->name;
        s.kind = DeviceKind::Headset;
        s.via = p.model->wired ? L"USB cable" : L"2.4 GHz receiver";
        s.connected = data[1] == 1;
        if (s.connected && port.Command(0x00, 0x03, data)) {
            s.percent = Clamp100(data[1] & 0x7F);
            s.charging = (data[1] & 0x80) != 0;
        }
        ctx.Add(s, 0x373B, pid);
    }
}
