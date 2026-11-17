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
void PollAula(PollContext& ctx);      // AULA F75 / F87 Pro / F99 wireless keyboards (before Kysona, same vendor id)
void PollDareu(PollContext& ctx);     // DAREU EM901X receiver (split feature/input collections)
void PollAtkSerial(PollContext& ctx); // ATK N9 Pro / N9 Ultra headsets (virtual COM port)
void PollKeychron(PollContext& ctx);  // Keychron mice, Nape Pro trackball (Link-KM receiver)
void PollLamzu(PollContext& ctx);     // LAMZU mice on vendor ids 373E / 37B0
void PollEndgame(PollContext& ctx);   // Endgame Gear 4K mice (OP1w 4k, XM2w 4k) on the 4K dongle
void PollWlmouse(PollContext& ctx);   // WLMouse Beast X family (VID 36A7)
void PollNinjutso(PollContext& ctx);  // Sora V2 1K receiver (1915:AE1C)
void PollRongyuan(PollContext& ctx);  // Rongyuan receivers (Attack Shark, Ajazz keyboards, ...)
void PollSonyInzone(PollContext& ctx);  // Sony INZONE H9 II / H5 / Buds
void PollSonix(PollContext& ctx);     // SONiX keyboards on their 2.4 GHz dongle (AJAZZ AK820 MAX, AK980 V2, AULA F108 Pro)
void PollSonyInzone(PollContext& ctx);  // Sony INZONE H9 II / H5
void PollFractal(PollContext& ctx);   // Fractal Design Scape headset (dongle or cable)
void PollJabra(PollContext& ctx);     // Jabra headsets behind a Link 380 / 390 dongle
void PollRog(PollContext& ctx);       // ASUS ROG keyboards and mice
void PollZowie(PollContext& ctx);     // BenQ ZOWIE EC-CW / DW / U2 mice
void PollRog(PollContext& ctx);       // ASUS ROG keyboards, mice and the Pelta headset
void PollZowie(PollContext& ctx);     // BenQ ZOWIE EC-CW / DW mice
void PollMchoseG3(PollContext& ctx);  // MCHOSE G3 V2 wireless mouse (VID 3837)
void PollRapoo(PollContext& ctx);     // Rapoo VT gaming mice (passive battery reports)
void PollAreson(PollContext& ctx);    // Areson 25A7 receivers (Redragon M913 / M915)
void PollMchose(PollContext& ctx);    // MCHOSE mice (L7 / M7 / A7 / K7 families, VID 5253)
void PollMiscMice(PollContext& ctx);  // Motospeed X6, Delux M900 Pro, Ajazz AJ179 and AJ159/AJ-series
void PollRazerHeadsets(PollContext& ctx);  // Razer BlackShark V3 / V3 Pro, BlackShark V2 Pro (2023)
std::wstring DumpXentaFrames();        // raw Xenta (1D57) status frames, for `--dump`
void PollRazerHeadsets(PollContext& ctx);  // Razer BlackShark V3 / V3 Pro
void PollPulsar(PollContext& ctx);    // Pulsar X2 V3 / X2 V3 eS on 3710 (before Kysona, same vendor id)
void PollAtkBitmouse(PollContext& ctx);  // ATK / VXE NK NANO dongle 373B:1216 (before Kysona, same vendor id)
void PollKysona(PollContext& ctx);    // also Pulsar, ATK / VXE, Hitscan Hyperlight
void PollRazerHeadsets(PollContext& ctx);  // Razer BlackShark V3 / V3 Pro
void PollKysona(PollContext& ctx);    // also Pulsar, ATK / VXE, Hitscan Hyperlight, Redragon (incl. dual-mode M913)
void PollHyperX(PollContext& ctx);
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
void PollAirPods(PollContext& ctx);   // Apple AirPods / Beats (BLE proximity broadcasts)
void PollPhoneLink(PollContext& ctx);  // phone linked with Microsoft Phone Link (reads its Start menu card)
void PollGalaxyBuds(PollContext& ctx); // Samsung Galaxy Buds (Bluetooth RFCOMM, not HID)
// Fallbacks.
void PollHeadsetControl(PollContext& ctx);  // only if headsetcontrol.exe is installed
void PollGenericHid(PollContext& ctx);
void PollBluetooth(PollContext& ctx);
void PollXInput(PollContext& ctx);
