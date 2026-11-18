// Xbox controllers.
//  1. Windows.Gaming.Input (WinRT): every Xbox controller Windows knows (Xbox Wireless adapter, USB,
//     Bluetooth) with a real battery report (remaining / full mWh -> %).
//  2. XInput fallback: coarse levels (empty / low / medium / full) shown as text, also covering
//     headsets plugged into a controller.
#ifndef ____FIReference_1_boolean_INTERFACE_DEFINED__
// Recent MinGW headers add an IReference<boolean> specialisation next to IReference<BYTE>,
// but BYTE and boolean are both unsigned char, so the second one is a redefinition. Nothing
// here uses IReference<boolean> (only INT32), so keep the BYTE one and skip that block.
#define ____FIReference_1_boolean_INTERFACE_DEFINED__
#endif
#include "drivers.h"

#include <roapi.h>
#include <winstring.h>
#include <xinput.h>
#include <windows.system.power.h>
// MinGW's windows.devices.power.h names BatteryStatus without its namespace; make it visible there.
namespace ABI { namespace Windows { namespace Devices { namespace Power {
using ABI::Windows::System::Power::BatteryStatus;
} } } }
#include <windows.devices.power.h>
#include <windows.gaming.input.h>

namespace {

using namespace ABI::Windows::Gaming::Input;
using ABI::Windows::Devices::Power::IBatteryReport;

template <class T>
void Release(T*& p) {
    if (p) p->Release();
    p = nullptr;
}

IRawGameControllerStatics* Statics() {
    static IRawGameControllerStatics* statics = nullptr;
    static bool tried = false;
    if (!tried) {
        tried = true;
        RoInitialize(RO_INIT_MULTITHREADED);  // our poll thread; harmless if already initialised
        const wchar_t* cls = L"Windows.Gaming.Input.RawGameController";
        HSTRING name = nullptr;
        if (SUCCEEDED(WindowsCreateString(cls, (UINT32)wcslen(cls), &name))) {
            RoGetActivationFactory(name, __uuidof(IRawGameControllerStatics), (void**)&statics);
            WindowsDeleteString(name);
        }
        if (statics) Sleep(300);  // the controller list fills in asynchronously after first use
    }
    return statics;
}

// Vendors whose controllers report a real battery through Windows.Gaming.Input:
// Microsoft, and GameSir in Xbox (GIP) mode (e.g. G7 Pro on its receiver, 3537:105E).
bool WgiVendor(UINT16 vid) { return vid == 0x045E || vid == 0x3537; }

// Adds Xbox controllers with a real percentage. Returns how many were added; `thirdParty` counts
// the non-Microsoft ones among them.
int PollWgi(PollContext& ctx, int& thirdParty) {
    thirdParty = 0;
    IRawGameControllerStatics* statics = Statics();
    if (!statics) return 0;
    __FIVectorView_1_Windows__CGaming__CInput__CRawGameController* list = nullptr;
    if (FAILED(statics->get_RawGameControllers(&list)) || !list) return 0;
    UINT32 count = 0;
    list->get_Size(&count);
    int added = 0;
    for (UINT32 i = 0; i < count; i++) {
        IRawGameController* raw = nullptr;
        if (FAILED(list->GetAt(i, &raw)) || !raw) continue;
        UINT16 vid = 0, pid = 0;
        raw->get_HardwareVendorId(&vid);
        raw->get_HardwareProductId(&pid);
        IGameControllerBatteryInfo* info = nullptr;
        IBatteryReport* report = nullptr;
        if (WgiVendor(vid) && SUCCEEDED(raw->QueryInterface(__uuidof(IGameControllerBatteryInfo), (void**)&info)) && info &&
            SUCCEEDED(info->TryGetBatteryReport(&report)) && report) {
            __FIReference_1_INT32 *rem = nullptr, *full = nullptr;
            report->get_RemainingCapacityInMilliwattHours(&rem);
            report->get_FullChargeCapacityInMilliwattHours(&full);
            INT32 r = 0, f = 0;
            if (rem) rem->get_Value(&r);
            if (full) full->get_Value(&f);
            ABI::Windows::System::Power::BatteryStatus st = ABI::Windows::System::Power::BatteryStatus_NotPresent;
            report->get_Status(&st);
            if (f > 0 && st != ABI::Windows::System::Power::BatteryStatus_NotPresent) {
                DeviceStatus s;
                s.key = L"xbox:" + Hex4(pid) + L":" + std::to_wstring(i);
                s.name = L"Xbox controller";
                IRawGameController2* raw2 = nullptr;
                if (SUCCEEDED(raw->QueryInterface(__uuidof(IRawGameController2), (void**)&raw2)) && raw2) {
                    HSTRING dn = nullptr;
                    if (SUCCEEDED(raw2->get_DisplayName(&dn)) && dn) {
                        UINT32 len = 0;
                        const wchar_t* p = WindowsGetStringRawBuffer(dn, &len);
                        if (p && len) s.name.assign(p, len);
                        WindowsDeleteString(dn);
                    }
                    Release(raw2);
                }
                // GIP reports a generic "Xbox One Game Controller" for third-party pads.
                if (vid == 0x3537) s.name = L"GameSir controller";
                s.kind = DeviceKind::Gamepad;
                s.via = L"Xbox Wireless / Bluetooth";
                s.percent = Clamp100(r * 100 / f);
                s.charging = st == ABI::Windows::System::Power::BatteryStatus_Charging;
                ctx.Add(s, vid, pid);
                added++;
                if (vid != 0x045E) thirdParty++;
            }
            Release(rem);
            Release(full);
        }
        Release(report);
        Release(info);
        Release(raw);
    }
    Release(list);
    return added;
}

using GetBatteryFn = DWORD(WINAPI*)(DWORD, BYTE, XINPUT_BATTERY_INFORMATION*);
using GetStateFn = DWORD(WINAPI*)(DWORD, XINPUT_STATE*);

struct XInputApi { GetBatteryFn battery = nullptr; GetStateFn state = nullptr; };

const XInputApi& LoadXInput() {
    static XInputApi api = [] {
        XInputApi a;
        for (const wchar_t* dll : { L"xinput1_4.dll", L"xinput9_1_0.dll" }) {
            if (HMODULE m = LoadLibraryExW(dll, nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32)) {
                a.battery = (GetBatteryFn)GetProcAddress(m, "XInputGetBatteryInformation");
                a.state = (GetStateFn)GetProcAddress(m, "XInputGetState");
                if (a.battery && a.state) break;
            }
        }
        return a;
    }();
    return api;
}

}  // namespace

void PollXInput(PollContext& ctx) {
    // An Xbox controller on Bluetooth may already be listed with a real percentage.
    bool btXbox = false;
    for (auto& s : ctx.out) btXbox |= s.via == L"Bluetooth" && s.name.find(L"Xbox") != std::wstring::npos;
    int thirdParty = 0;
    int precise = btXbox ? 0 : PollWgi(ctx, thirdParty);
    // GameSir pads answer XInput's headset query with their own battery ("Full") even with nothing
    // plugged in, so skip headsets when every precisely shown controller is third-party.
    bool skipHeadset = precise > 0 && thirdParty == precise;

    const XInputApi& api = LoadXInput();
    if (!api.battery || !api.state) return;
    auto query = [&](DWORD user, BYTE type, XINPUT_BATTERY_INFORMATION& bi) {
        bi = {};
        return api.battery(user, type, &bi) == ERROR_SUCCESS && bi.BatteryType != BATTERY_TYPE_DISCONNECTED &&
               bi.BatteryType != BATTERY_TYPE_WIRED;
    };
    for (DWORD user = 0; user < 4; user++) {
        // The Xbox Wireless adapter answers battery queries for empty slots too (one controller
        // showed up as four "Medium" headsets), so only look at slots with a controller connected.
        XINPUT_STATE state{};
        if (api.state(user, &state) != ERROR_SUCCESS) continue;
        XINPUT_BATTERY_INFORMATION pad{};
        const bool hasPad = query(user, BATTERY_DEVTYPE_GAMEPAD, pad);
        for (BYTE type : { (BYTE)BATTERY_DEVTYPE_GAMEPAD, (BYTE)BATTERY_DEVTYPE_HEADSET }) {
            if (type == BATTERY_DEVTYPE_GAMEPAD && (btXbox || precise > 0)) continue;  // already shown precisely
            if (type == BATTERY_DEVTYPE_HEADSET && skipHeadset) continue;
            XINPUT_BATTERY_INFORMATION bi{};
            if (type == BATTERY_DEVTYPE_GAMEPAD) {
                if (!hasPad) continue;
                bi = pad;
            } else {
                if (!query(user, type, bi)) continue;
                // Without a headset plugged in, the headset query can still answer with an unknown type.
                if (bi.BatteryType == BATTERY_TYPE_UNKNOWN) continue;
                // Xbox One / Series controllers echo their own battery back for the headset query (the
                // phantom headsets all read "Medium", same as the controller). Headsets on these
                // controllers are powered by the controller, so a mirrored answer is not a headset.
                if (hasPad && bi.BatteryType == pad.BatteryType && bi.BatteryLevel == pad.BatteryLevel) continue;
            }
            DeviceStatus s;
            s.key = L"xinput:" + std::to_wstring(user) + L":" + std::to_wstring(type);
            s.name = type == BATTERY_DEVTYPE_GAMEPAD ? L"Xbox controller " + std::to_wstring(user + 1) : L"Xbox headset";
            s.kind = type == BATTERY_DEVTYPE_GAMEPAD ? DeviceKind::Gamepad : DeviceKind::Headset;
            s.via = L"Xbox Wireless";
            switch (bi.BatteryLevel) {
                case BATTERY_LEVEL_EMPTY:  s.percent = 5;   s.levelText = L"Empty";  break;
                case BATTERY_LEVEL_LOW:    s.percent = 25;  s.levelText = L"Low";    break;
                case BATTERY_LEVEL_MEDIUM: s.percent = 60;  s.levelText = L"Medium"; break;
                default:                   s.percent = 100; s.levelText = L"Full";   break;
            }
            ctx.out.push_back(s);
        }
    }
}
