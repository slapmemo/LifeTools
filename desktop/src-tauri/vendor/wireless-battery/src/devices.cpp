// Runs every driver in order. Vendor drivers go first and claim the devices they handle; the
// generic fallbacks then only look at what is left.
#include "devices.h"

#include <algorithm>
#include <cstdio>
#include <cwchar>

#include "drivers/drivers.h"
#include "report.h"
#include "hid.h"

namespace {

// HKCU\Software\WirelessBattery\IgnoreDevices (REG_SZ): "VID:PID" pairs in hex, separated by spaces,
// commas or semicolons (e.g. "28BD:0947, 046D:C547"). No driver ever opens those devices (issue #232).
std::vector<std::pair<USHORT, USHORT>> IgnoredDevices() {
    std::vector<std::pair<USHORT, USHORT>> out;
    wchar_t buf[1024];
    DWORD size = sizeof(buf);
    if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\WirelessBattery", L"IgnoreDevices", RRF_RT_REG_SZ, nullptr, buf, &size) !=
        ERROR_SUCCESS)
        return out;
    for (const wchar_t* p = buf; *p;) {
        unsigned vid = 0, pid = 0;
        int used = 0;
        if (swscanf(p, L" %x:%x%n", &vid, &pid, &used) == 2 && used > 0) {
            out.push_back({ (USHORT)vid, (USHORT)pid });
            p += used;
        } else {
            p++;
        }
        while (*p == L',' || *p == L';' || *p == L' ') p++;
    }
    return out;
}

}  // namespace

std::vector<DeviceStatus> PollAllDevices() {
    PollContext ctx;
    ctx.colls = EnumHid();
    auto ignored = IgnoredDevices();
    if (!ignored.empty())
        ctx.colls.erase(std::remove_if(ctx.colls.begin(), ctx.colls.end(), [&](const HidColl& c) {
                            return std::find(ignored.begin(), ignored.end(), std::make_pair(c.vid, c.pid)) != ignored.end();
                        }),
                        ctx.colls.end());
    PollGlorious(ctx);
    PollAula(ctx);       // before Kysona, which shares the 3554 vendor id and would probe it first
    PollDareu(ctx);
    PollDarmoshark(ctx);
    PollAtkSerial(ctx);  // before Kysona, which shares the ATK vendor id
    PollAtkKeyboard(ctx);
    PollPulsar(ctx);     // before Kysona, which also scans the 3710 vendor id
    PollAtkBitmouse(ctx);  // before Kysona, which would probe the NK dongle with the wrong protocol
    PollKysona(ctx);
    PollKeychron(ctx);
    PollLamzu(ctx);
    PollEndgame(ctx);
    PollEndgameWe(ctx);
    PollVaxee(ctx);
    PollWlmouse(ctx);
    PollFinalmouse(ctx);
    PollNinjutso(ctx);
    PollSprime(ctx);
    PollRongyuan(ctx);
    PollSonix(ctx);
    PollSonyInzone(ctx);
    PollFractal(ctx);
    PollJabra(ctx);
    PollJbl(ctx);
    PollRog(ctx);
    PollZowie(ctx);
    PollRoyalKludge(ctx);
    PollMchose(ctx);
    PollRapoo(ctx);
    PollAreson(ctx);
    PollMchoseG3(ctx);
    PollMsi(ctx);
    PollMachenike(ctx);  // before Ajazz in PollMiscMice, which shares the L7's 248A vendor id
    PollMchoseModern(ctx);
    PollMiscMice(ctx);
    PollFantech(ctx);
    PollRazerHeadsets(ctx);  // before the generic Razer driver, which shares the vendor id
    PollBarracudaPro(ctx);   // before the generic Razer driver as well
    PollHyperX(ctx);
    PollLogitechG435(ctx);  // before the HID++ driver, which shares the vendor id
    PollAstro(ctx);
    PollLogitech(ctx);
    PollRazer(ctx);
    PollSteelSeriesElite(ctx);
    PollSteelSeries(ctx);
    PollAudeze(ctx);
    PollNzxt(ctx);
    PollPlantronics(ctx);
    PollCorsair(ctx);
    PollCoolerMaster(ctx);
    PollPlayStation(ctx);
    PollSteamController(ctx);
    PollGameSir(ctx);
    PollFlydigi(ctx);
    PollGameSirCyclone(ctx);
    Poll8BitDo(ctx);
    PollAirPods(ctx);  // before the Bluetooth fallback, which has no level for AirPods
    PollPhoneLink(ctx);
    PollGalaxyBuds(ctx);  // before the Bluetooth fallback, which skips devices already listed by name
    PollMoondrop(ctx);
    PollBluetooth(ctx);   // before the generic HID check: Windows' own level wins for the same device
    PollGenericHid(ctx);
    PollXInput(ctx);
    return ctx.out;
}

std::wstring DumpHidCollections() {
    std::wstring out = L"VID:PID    IF  UsagePg:Usage  In  Out Feat  Product\n";
    for (const auto& c : EnumHid()) {
        wchar_t line[160];
        swprintf(line, 160, L"%04X:%04X  %2d  %04X:%04X    %3u %3u %3u   ", c.vid, c.pid, c.iface, c.page(), c.usage(), c.inLen(), c.outLen(),
                 c.featLen());
        out += line + HidProduct(c) + L"\n";
    }
    out += report::DumpExtras();  // unopenable HID collections, non-HID USB devices, Bluetooth devices
    out += DumpXentaFrames();
    return out;
}
