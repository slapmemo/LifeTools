#pragma once
// Each driver looks at the enumerated HID collections, talks to the devices it recognises and
// appends what it finds. A driver claims a device (vendor/product id) once it has handled it so
// that the generic fallbacks further down the chain do not report it twice.
#include <set>
#include <utility>
#include <vector>

#include "../devices.h"
#include "../hid.h"

struct PollContext {
    std::vector<HidColl> colls;
    std::set<std::pair<USHORT, USHORT>> claimed;
    std::set<std::wstring> btContainers;  // container ids PollBluetooth already reported
    std::vector<DeviceStatus> out;

    bool IsClaimed(USHORT vid, USHORT pid) const { return claimed.count({ vid, pid }) != 0; }
    void Claim(USHORT vid, USHORT pid) { claimed.insert({ vid, pid }); }
    void Add(const DeviceStatus& s, USHORT vid, USHORT pid) {
        out.push_back(s);
        Claim(vid, pid);
    }
    // Distinct (vid, pid) pairs for a vendor that are not claimed yet.
    std::vector<std::pair<USHORT, USHORT>> Products(USHORT vid) const {
        std::set<std::pair<USHORT, USHORT>> s;
        for (const auto& c : colls)
            if (c.vid == vid && !IsClaimed(c.vid, c.pid)) s.insert({ c.vid, c.pid });
        return { s.begin(), s.end() };
    }
    // Collections of one product, optionally filtered.
    template <class Pred>
    std::vector<const HidColl*> Find(USHORT vid, USHORT pid, Pred pred) const {
        std::vector<const HidColl*> r;
        for (const auto& c : colls)
            if (c.vid == vid && c.pid == pid && pred(c)) r.push_back(&c);
        return r;
    }
};

// G-Wolves model names (shared by the Glorious- and Kysona-protocol drivers).
const wchar_t* GWolvesModelName(USHORT pid);
bool GWolvesIsCable(USHORT pid);

// Vendor drivers (run in this order).
void PollGlorious(PollContext& ctx);  // also Hitscan
void PollAula(PollContext& ctx);      // AULA F75 / F87 Pro / F99 / HERO 68 Air keyboards (before Kysona)
void PollDareu(PollContext& ctx);     // DAREU EM901X receiver (split feature/input collections)
void PollDarmoshark(PollContext& ctx); // Darmoshark M3 over its 2.4 GHz receiver
void PollAtkSerial(PollContext& ctx); // ATK N9 Pro / N9 Ultra headsets (virtual COM port)
void PollKeychron(PollContext& ctx);  // Keychron mice, Nape Pro trackball (Link-KM receiver)
void PollLamzu(PollContext& ctx);     // LAMZU mice on vendor ids 373E / 37B0
void PollEndgame(PollContext& ctx);   // Endgame Gear 4K mice (OP1w 4k, XM2w 4k) on the 4K dongle
void PollEndgameWe(PollContext& ctx);     // Endgame Gear XM2we on its original receiver (3367:1961)
void PollAtkKeyboard(PollContext& ctx);   // ATK V75X keyboard (320F:5088 receiver, 5055 cable)
void PollBarracudaPro(PollContext& ctx);  // Razer Barracuda Pro (1532:053A), before the generic Razer driver
void PollSteelSeriesElite(PollContext& ctx);  // SteelSeries Arctis Nova Elite base station (1038:2244)
void PollAudeze(PollContext& ctx);        // Audeze Maxwell (VID 3329) dongle or cable
void PollNzxt(PollContext& ctx);          // NZXT Lift Elite Wireless (1E71:2101 / 2129)
void PollPlantronics(PollContext& ctx);   // Poly / Plantronics headsets behind the BT600 adapter (047F)
void PollVaxee(PollContext& ctx);     // VAXEE 4K receiver / NP-01S V2 cable, read-only battery commands
void PollWlmouse(PollContext& ctx);   // WLMouse Beast X family (VID 36A7)
void PollFinalmouse(PollContext& ctx);  // Finalmouse UltralightX / Starlight X dongles (VID 361D), read-only GETs
void PollNinjutso(PollContext& ctx);  // Sora V2 1K receiver (1915:AE1C)
void PollNinjutso(PollContext& ctx);  // Sora V2 (1915:AE1C 1K receiver, AE11 cable)
void PollNinjutso(PollContext& ctx);  // Sora V2 1K receiver (1915:AE1C) and Ten / Ten Air (093A:EB01 / 093A:E020)
void PollSprime(PollContext& ctx);    // Sprime PM1 (1915:AC1C / AD8C receivers, AC11-AC13 cable)
void PollRongyuan(PollContext& ctx);  // Rongyuan receivers (Attack Shark, Ajazz keyboards, ...)
void PollSonyInzone(PollContext& ctx);  // Sony INZONE H9 II / H5 / Buds
void PollSonix(PollContext& ctx);     // SONiX keyboards on their 2.4 GHz dongle (AJAZZ AK820 MAX, AK980 V2, AULA F108 Pro)
void PollFractal(PollContext& ctx);   // Fractal Design Scape headset (dongle or cable)
void PollJabra(PollContext& ctx);     // Jabra headsets behind a Link 380 / 390 dongle
void PollJbl(PollContext& ctx);       // JBL Quantum 520 / 650 / 850 / 950 wireless headsets
void PollRog(PollContext& ctx);       // ASUS ROG keyboards, mice and the Pelta headset
void PollZowie(PollContext& ctx);     // BenQ ZOWIE EC-CW / DW / U2 mice
void PollRoyalKludge(PollContext& ctx);  // Royal Kludge MG6 Pro (VID 2E3C, QiWang protocol)
void PollMchoseG3(PollContext& ctx);  // MCHOSE G3 V2 wireless mouse (VID 3837)
void PollMsi(PollContext& ctx);       // MSI VERSA 300 ELITE WIRELESS on its dongle (0DB0:9E22)
void PollMchoseModern(PollContext& ctx);  // MCHOSE K7 V2 Ultra+ and other new-family mice (VID 3837 receiver)
void PollRapoo(PollContext& ctx);     // Rapoo VT gaming mice incl. VT1 Pro Max (passive battery reports)
void PollAreson(PollContext& ctx);    // Areson 25A7 receivers (Redragon M913 / M915)
void PollMchose(PollContext& ctx);    // MCHOSE mice (L7 / M7 / A7 / K7 families, VID 5253)
void PollMachenike(PollContext& ctx); // Machenike L7 Arctic / L7 Mix, receiver 248A:FF4C and cable FF4E
void PollMiscMice(PollContext& ctx);  // Motospeed X6, Delux M900 Pro / M800 Pro, Ajazz AJ179 and AJ159/AJ-series
void PollRazerHeadsets(PollContext& ctx);  // BlackShark V2 HyperSpeed / V2 Pro (2020/2023) / V3 variants, Barracuda X (2022)
void PollFantech(PollContext& ctx);   // Fantech Helios Go XD5 (wired 25A7:FA7B, dongle 25A7:FA7C)
std::wstring DumpXentaFrames();        // raw Xenta (1D57) status frames, for `--dump`
void PollPulsar(PollContext& ctx);    // Pulsar X2 V3 / X2 V3 eS on 3710 (before Kysona, same vendor id)
void PollAtkBitmouse(PollContext& ctx);  // ATK / VXE NK NANO dongle 373B:1216 (before Kysona, same vendor id)
void PollKysona(PollContext& ctx);    // also Pulsar, ATK / VXE, Hitscan Hyperlight
void PollHyperX(PollContext& ctx);
void PollLogitechG435(PollContext& ctx);  // G435 headset on the 046D:0ADF dongle (not HID++)
void PollAstro(PollContext& ctx);  // A50 X / Gen 5 vendor protocol (before generic Logitech)
void PollLogitech(PollContext& ctx);
void PollRazer(PollContext& ctx);
void PollSteelSeries(PollContext& ctx);
void PollCorsair(PollContext& ctx);
void PollCoolerMaster(PollContext& ctx);
void PollPlayStation(PollContext& ctx);
void PollSteamController(PollContext& ctx);
void PollGameSir(PollContext& ctx);    // Nova Lite / Nova 2 / Nova 2 Lite
void PollFlydigi(PollContext& ctx);    // Vader 5 Pro vendor battery channel
void PollGameSirCyclone(PollContext& ctx);  // Cyclone 2 (XInput mode)
void Poll8BitDo(PollContext& ctx);     // Ultimate 2 Wireless in D-input mode (2DC8:6012)
void PollAirPods(PollContext& ctx);   // Apple AirPods / Beats (BLE proximity broadcasts)
void PollPhoneLink(PollContext& ctx);  // phone linked with Microsoft Phone Link (reads its Start menu card)
void PollGalaxyBuds(PollContext& ctx); // Samsung Galaxy Buds (Bluetooth RFCOMM, not HID)
void PollMoondrop(PollContext& ctx);   // MOONDROP GM01 Pro headset (WalkPlay 2.4 GHz dongle)
// Fallbacks.
void PollHeadsetControl(PollContext& ctx);  // only if headsetcontrol.exe is installed
void PollGenericHid(PollContext& ctx);
void PollBluetooth(PollContext& ctx);
void PollXInput(PollContext& ctx);
