// Apple AirPods / Beats (AirPods Pro 3 included) over Bluetooth.
//
// Windows does not read the battery of AirPods (they report it through Apple-specific HFP commands),
// so the Bluetooth fallback shows nothing for them. They do broadcast it in clear, several times a
// second, in the BLE "proximity pairing" message iPhones use for their battery popup: manufacturer
// data of company 0x004C (Apple), type 0x07, length 0x19:
//   [0] 07  [1] 19  [2] prefix  [3..4] model (LE, = Bluetooth PID, e.g. 0x2014 AirPods Pro 2)
//   [5] status: bit 5 set = the left bud is the one broadcasting
//   [6] buds: low nibble = broadcasting bud, high nibble = the other one   (0-10 = x10 %, 15 = unknown)
//   [7] high nibble: bit 0 broadcasting bud charging, bit 1 other bud charging, bit 2 case charging;
//       low nibble: case level
// (layout from OpenPods / AirPodsDesktop / librepods).
//
// A BluetoothLEAdvertisementWatcher (WinRT) is started the first time a connected Apple audio device
// is seen and keeps running. Nearby AirPods of other people broadcast the same message with random
// addresses, so only messages whose model matches the PID of the connected device are used, and the
// strongest recent signal wins.
#include "drivers.h"

#include <setupapi.h>
#include <initguid.h>
#include <devpkey.h>
#include <eventtoken.h>
#include <inspectable.h>
#include <roapi.h>
#include <winstring.h>

#include <cwchar>
#include <map>
#include <vector>

// ---- minimal WinRT ABI declarations (MinGW ships no windows.devices.bluetooth.advertisement.h) ----
// Vtable order from the Windows SDK header windows.devices.bluetooth.advertisement.h.
// Deliberately NOT in an anonymous namespace: GCC would see interfaces nobody in the program can
// implement and turn every call through them into a trap (-fdevirtualize, at -O1 and above).
namespace airpods_abi {

const GUID IID_Watcher = { 0xa6ac336f, 0xf3d3, 0x4297, { 0x8d, 0x6c, 0xc8, 0x1e, 0xa6, 0x62, 0x3f, 0x40 } };
const GUID IID_ReceivedArgs = { 0x27987ddf, 0xe596, 0x41be, { 0x8d, 0x43, 0x9e, 0x67, 0x31, 0xd4, 0xa9, 0x13 } };
// ITypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>
const GUID IID_ReceivedHandler = { 0x90eb4eca, 0xd465, 0x5ea0, { 0xa6, 0x1c, 0x03, 0x3c, 0x8c, 0x5e, 0xce, 0xf2 } };
const GUID IID_BufferByteAccess = { 0x905a0fef, 0xbc53, 0x11df, { 0x8c, 0x49, 0x00, 0x1e, 0x4f, 0xc6, 0x86, 0xda } };
const GUID IID_Unknown = { 0x00000000, 0x0000, 0x0000, { 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46 } };
const GUID IID_Agile = { 0x94ea2b94, 0xe9cc, 0x49e0, { 0xc0, 0xff, 0xee, 0x64, 0xca, 0x8f, 0x5b, 0x90 } };

struct IBufferAbi : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Capacity(UINT32* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Length(UINT32* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Length(UINT32 v) = 0;
};

struct IBufferByteAccessAbi : IUnknown {
    virtual HRESULT STDMETHODCALLTYPE Buffer(BYTE** v) = 0;
};

struct IManufacturerData : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_CompanyId(UINT16* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_CompanyId(UINT16 v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Data(IBufferAbi** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Data(IBufferAbi* v) = 0;
};

struct IManufacturerDataView : IInspectable {  // IVectorView<BluetoothLEManufacturerData>
    virtual HRESULT STDMETHODCALLTYPE GetAt(UINT32 i, IManufacturerData** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Size(UINT32* v) = 0;
};

struct IAdvertisement : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Flags(IInspectable** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Flags(IInspectable* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_LocalName(HSTRING* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_LocalName(HSTRING v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_ServiceUuids(IInspectable** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_ManufacturerData(IInspectable** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_DataSections(IInspectable** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetManufacturerDataByCompanyId(UINT16 company, IManufacturerDataView** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetSectionsByType(BYTE type, IInspectable** v) = 0;
};

struct IReceivedArgs : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_RawSignalStrengthInDBm(INT16* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_BluetoothAddress(UINT64* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_AdvertisementType(INT32* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Timestamp(INT64* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Advertisement(IAdvertisement** v) = 0;
};

struct IWatcher : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_MinSamplingInterval(INT64* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_MaxSamplingInterval(INT64* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_MinOutOfRangeTimeout(INT64* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_MaxOutOfRangeTimeout(INT64* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Status(INT32* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_ScanningMode(INT32* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_ScanningMode(INT32 v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_SignalStrengthFilter(IInspectable** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_SignalStrengthFilter(IInspectable* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_AdvertisementFilter(IInspectable** v) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_AdvertisementFilter(IInspectable* v) = 0;
    virtual HRESULT STDMETHODCALLTYPE Start() = 0;
    virtual HRESULT STDMETHODCALLTYPE Stop() = 0;
    virtual HRESULT STDMETHODCALLTYPE add_Received(IUnknown* handler, EventRegistrationToken* token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_Received(EventRegistrationToken token) = 0;
};

}  // namespace airpods_abi

namespace {

using namespace airpods_abi;

enum { kWatcherStopped = 3, kWatcherAborted = 4 };

template <class T>
void Release(T*& p) {
    if (p) p->Release();
    p = nullptr;
}

// ---- received messages -------------------------------------------------------------------------

struct Advert {
    UINT16 model = 0;
    int left = -1, right = -1, box = -1;  // percent, -1 unknown
    bool leftChg = false, rightChg = false, boxChg = false;
    int rssi = -127;
    ULONGLONG tick = 0;
};

SRWLOCK g_lock = SRWLOCK_INIT;
std::map<UINT64, Advert> g_adverts;  // by (random, rotating) BLE address

int Level(int nibble) { return nibble <= 10 ? nibble * 10 : -1; }

bool Parse(const BYTE* d, UINT32 n, Advert& a) {
    if (n < 9 || d[0] != 0x07 || d[1] < 0x09) return false;
    a.model = (UINT16)(d[3] | d[4] << 8);
    bool leftBroadcasts = d[5] & 0x20;
    int cur = d[6] & 0x0F, other = d[6] >> 4;
    int chg = d[7] >> 4;
    a.left = Level(leftBroadcasts ? cur : other);
    a.right = Level(leftBroadcasts ? other : cur);
    a.leftChg = chg & (leftBroadcasts ? 0x01 : 0x02);
    a.rightChg = chg & (leftBroadcasts ? 0x02 : 0x01);
    a.boxChg = chg & 0x04;
    a.box = Level(d[7] & 0x0F);
    return a.left >= 0 || a.right >= 0;
}

void OnReceived(IReceivedArgs* args) {
    IAdvertisement* adv = nullptr;
    IManufacturerDataView* view = nullptr;
    if (FAILED(args->get_Advertisement(&adv)) || !adv) return;
    if (SUCCEEDED(adv->GetManufacturerDataByCompanyId(0x004C, &view)) && view) {
        UINT32 count = 0;
        view->get_Size(&count);
        for (UINT32 i = 0; i < count; i++) {
            IManufacturerData* md = nullptr;
            IBufferAbi* buf = nullptr;
            IBufferByteAccessAbi* bytes = nullptr;
            BYTE* p = nullptr;
            UINT32 len = 0;
            Advert a;
            if (SUCCEEDED(view->GetAt(i, &md)) && md && SUCCEEDED(md->get_Data(&buf)) && buf && SUCCEEDED(buf->get_Length(&len)) &&
                SUCCEEDED(buf->QueryInterface(IID_BufferByteAccess, (void**)&bytes)) && bytes && SUCCEEDED(bytes->Buffer(&p)) && p &&
                Parse(p, len, a)) {
                UINT64 addr = 0;
                INT16 rssi = -127;
                args->get_BluetoothAddress(&addr);
                args->get_RawSignalStrengthInDBm(&rssi);
                a.rssi = rssi;
                a.tick = GetTickCount64();
                AcquireSRWLockExclusive(&g_lock);
                g_adverts[addr] = a;
                for (auto it = g_adverts.begin(); it != g_adverts.end();)  // addresses rotate: drop old ones
                    it = a.tick - it->second.tick > 10 * 60 * 1000 ? g_adverts.erase(it) : std::next(it);
                ReleaseSRWLockExclusive(&g_lock);
            }
            Release(bytes);
            Release(buf);
            Release(md);
        }
    }
    Release(view);
    Release(adv);
}

// Static delegate object: lives as long as the process.
struct ReceivedHandler : IUnknown {
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** out) override {
        if (iid == IID_Unknown || iid == IID_ReceivedHandler || iid == IID_Agile) {
            *out = this;
            return S_OK;
        }
        *out = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return 2; }
    ULONG STDMETHODCALLTYPE Release() override { return 1; }
    virtual HRESULT STDMETHODCALLTYPE Invoke(IInspectable* /*sender*/, IInspectable* argsObj) {
        IReceivedArgs* args = nullptr;
        if (argsObj && SUCCEEDED(argsObj->QueryInterface(IID_ReceivedArgs, (void**)&args)) && args) {
            OnReceived(args);
            args->Release();
        }
        return S_OK;
    }
};

ReceivedHandler g_handler;
IWatcher* g_watcher = nullptr;

// Starts (or restarts after the radio was switched off) the watcher. Returns true if it was just started.
bool EnsureWatcher() {
    if (!g_watcher) {
        RoInitialize(RO_INIT_MULTITHREADED);  // our poll thread; harmless if already initialised
        const wchar_t* cls = L"Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher";
        HSTRING name = nullptr;
        IInspectable* obj = nullptr;
        if (SUCCEEDED(WindowsCreateString(cls, (UINT32)wcslen(cls), &name))) {
            RoActivateInstance(name, &obj);
            WindowsDeleteString(name);
        }
        if (!obj) return false;
        obj->QueryInterface(IID_Watcher, (void**)&g_watcher);
        obj->Release();
        if (!g_watcher) return false;
        EventRegistrationToken tok;
        if (FAILED(g_watcher->add_Received(&g_handler, &tok))) {
            Release(g_watcher);
            return false;
        }
        return SUCCEEDED(g_watcher->Start());
    }
    INT32 st = 0;
    if (SUCCEEDED(g_watcher->get_Status(&st)) && (st == kWatcherStopped || st == kWatcherAborted))
        return SUCCEEDED(g_watcher->Start());
    return false;
}

// ---- connected Apple audio devices -------------------------------------------------------------

const DEVPROPKEY kIsConnected = { { 0x83DA6326, 0x97A6, 0x4088, { 0x94, 0x53, 0xA1, 0x92, 0x3F, 0x57, 0x3B, 0x29 } }, 15 };

struct AppleDevice {
    std::wstring name;
    UINT16 pid = 0;          // Apple model id, from the "_VID&0001004C_PID&xxxx" service nodes
    bool connected = false;
    bool apple = false;
};

std::wstring Upper(std::wstring s) {
    for (auto& c : s) c = towupper(c);
    return s;
}

std::vector<AppleDevice> ConnectedAppleAudio() {
    std::map<std::wstring, AppleDevice> byContainer;
    HDEVINFO di = SetupDiGetClassDevsW(nullptr, L"BTHENUM", nullptr, DIGCF_ALLCLASSES | DIGCF_PRESENT);
    if (di == INVALID_HANDLE_VALUE) return {};
    SP_DEVINFO_DATA dd{ sizeof(dd) };
    for (DWORD i = 0; SetupDiEnumDeviceInfo(di, i, &dd); i++) {
        wchar_t inst[512];
        if (!SetupDiGetDeviceInstanceIdW(di, &dd, inst, 512, nullptr)) continue;
        GUID container{};
        DEVPROPTYPE t;
        if (!SetupDiGetDevicePropertyW(di, &dd, &DEVPKEY_Device_ContainerId, &t, (PBYTE)&container, sizeof(container), nullptr, 0)) continue;
        wchar_t g[64];
        StringFromGUID2(container, g, 64);
        AppleDevice& d = byContainer[g];
        std::wstring id = Upper(inst);
        size_t v = id.find(L"_VID&0001004C");
        if (v != std::wstring::npos) {
            d.apple = true;
            size_t p = id.find(L"_PID&", v);
            if (p != std::wstring::npos) d.pid = (UINT16)wcstoul(id.c_str() + p + 5, nullptr, 16);
        }
        if (!wcsncmp(inst, L"BTHENUM\\DEV_", 12)) {
            wchar_t buf[256] = {};
            if (SetupDiGetDevicePropertyW(di, &dd, &DEVPKEY_Device_FriendlyName, &t, (PBYTE)buf, sizeof(buf) - sizeof(wchar_t), nullptr, 0))
                d.name = buf;
            DEVPROP_BOOLEAN conn = DEVPROP_FALSE;
            if (SetupDiGetDevicePropertyW(di, &dd, &kIsConnected, &t, (PBYTE)&conn, sizeof(conn), nullptr, 0) && t == DEVPROP_TYPE_BOOLEAN)
                d.connected = conn != DEVPROP_FALSE;
        }
    }
    SetupDiDestroyDeviceInfoList(di);
    std::vector<AppleDevice> out;
    for (auto& [cid, d] : byContainer) {
        std::wstring n = Upper(d.name);
        bool looksApple = n.find(L"AIRPODS") != std::wstring::npos || n.find(L"BEATS") != std::wstring::npos;
        // Apple audio model ids are 0x20xx (0x2027 AirPods Pro 3); iPhones, iPads and Macs are not.
        bool appleAudio = d.apple && (d.pid & 0xFF00) == 0x2000;
        if (d.connected && (appleAudio || (looksApple && !d.pid))) out.push_back(d);
    }
    return out;
}

// Best message for one device: the model must match when the PID is known; the strongest signal
// among the last 90 s wins (or the latest one within 5 min if none is that recent).
bool Pick(const AppleDevice& dev, Advert& best) {
    ULONGLONG now = GetTickCount64();
    bool found = false;
    AcquireSRWLockShared(&g_lock);
    for (auto& [addr, a] : g_adverts) {
        if (dev.pid && a.model != dev.pid) continue;
        ULONGLONG age = now - a.tick;
        if (age > 5 * 60 * 1000) continue;
        bool fresh = age < 90 * 1000, bestFresh = found && now - best.tick < 90 * 1000;
        if (!found || (fresh && !bestFresh) || (fresh && bestFresh && a.rssi > best.rssi) ||
            (!fresh && !bestFresh && a.tick > best.tick)) {
            best = a;
            found = true;
        }
    }
    ReleaseSRWLockShared(&g_lock);
    return found;
}

std::wstring Pct(int v) { return v < 0 ? L"?" : std::to_wstring(v) + L"%"; }

}  // namespace

void PollAirPods(PollContext& ctx) {
    auto devices = ConnectedAppleAudio();
    if (devices.empty()) return;
    if (EnsureWatcher()) {
        // Just started: give the buds a moment to broadcast (they do several times a second).
        for (int i = 0; i < 25; i++) {
            Advert a;
            bool all = true;
            for (auto& d : devices) all &= Pick(d, a);
            if (all) break;
            Sleep(200);
        }
    }
    for (auto& d : devices) {
        Advert a;
        if (!Pick(d, a)) continue;
        DeviceStatus s;
        s.name = d.name.empty() ? L"AirPods" : d.name;
        s.key = L"airpods:" + Hex4(d.pid) + L":" + s.name;
        s.kind = DeviceKind::Headset;
        // The lower bud is what runs out first; a bud sitting in the case reports as charging.
        int lo = a.left < 0 ? a.right : a.right < 0 ? a.left : (a.left < a.right ? a.left : a.right);
        s.percent = lo;
        s.charging = (a.left < 0 || a.leftChg) && (a.right < 0 || a.rightChg);
        s.via = L"Bluetooth \x00B7 L " + Pct(a.left) + (a.leftChg ? L"\x26A1" : L"") + L"  R " + Pct(a.right) +
                (a.rightChg ? L"\x26A1" : L"") + L"  case " + Pct(a.box) + (a.boxChg ? L"\x26A1" : L"");
        s.graceSec = 300;
        ctx.out.push_back(s);
    }
}
