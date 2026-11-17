// Runs every driver in order. Vendor drivers go first and claim the devices they handle; the
// generic fallbacks then only look at what is left.
#include "devices.h"

#include <cstdio>

#include "drivers/drivers.h"
#include "hid.h"

std::vector<DeviceStatus> PollAllDevices() {
    PollContext ctx;
    ctx.colls = EnumHid();
    PollGlorious(ctx);
    PollAula(ctx);       // before Kysona, which shares the 3554 vendor id and would probe it first
    PollDareu(ctx);
    PollAtkSerial(ctx);  // before Kysona, which shares the ATK vendor id
    PollPulsar(ctx);     // before Kysona, which also scans the 3710 vendor id
    PollAtkBitmouse(ctx);  // before Kysona, which would probe the NK dongle with the wrong protocol
    PollKysona(ctx);
    PollKeychron(ctx);
    PollLamzu(ctx);
    PollEndgame(ctx);
    PollWlmouse(ctx);
    PollNinjutso(ctx);
    PollRongyuan(ctx);
    PollSonix(ctx);
    PollSonyInzone(ctx);
    PollFractal(ctx);
    PollJabra(ctx);
    PollRog(ctx);
    PollZowie(ctx);
    PollMchose(ctx);
    PollRapoo(ctx);
    PollAreson(ctx);
    PollMchoseG3(ctx);
    PollMiscMice(ctx);
    PollRazerHeadsets(ctx);  // before the generic Razer driver, which shares the vendor id
    PollHyperX(ctx);
    PollLogitech(ctx);
    PollRazer(ctx);
    PollSteelSeries(ctx);
    PollCorsair(ctx);
    PollCoolerMaster(ctx);
    PollPlayStation(ctx);
    PollSteamController(ctx);
    PollGameSir(ctx);
    PollFlydigi(ctx);
    PollGameSirCyclone(ctx);
    PollAirPods(ctx);  // before the Bluetooth fallback, which has no level for AirPods
    PollPhoneLink(ctx);
    PollGalaxyBuds(ctx);  // before the Bluetooth fallback, which skips devices already listed by name
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
    out += DumpXentaFrames();
    return out;
}
