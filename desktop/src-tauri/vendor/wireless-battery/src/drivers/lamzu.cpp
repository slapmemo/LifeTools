// LAMZU wireless mice on their own vendor ids 373E and 37B0 (Maya X, Maya, Tachi, Inca, Paro, Thorn,
// Atlantis Mini/OG Champion, Orcus ...). The Atlantis on Compx 3554 uses the Kysona driver instead.
// Protocol from LAMZU's Aurora web driver (lamzu.net, "IsNewProtocol" models):
//   SET_FEATURE report 0, 64 bytes: [00][00][02][02][00][83][00 ...]
//   ~100 ms later GET_FEATURE report 0: [A1][..][..][02][..][83][charging][percent] after the report
//   id byte (the web driver accepts the reply with or without that byte, so we do too).
//   charging 1 = on the cable; percent 0 means the mouse is not linked to the dongle.
// Model ids from lamzu.net/Config/env-models.json. Several newer models share one dongle id, so those
// dongles get a generic name.
#include "drivers.h"

namespace {

const wchar_t* ModelName(USHORT vid, USHORT pid) {
    struct M { USHORT vid; USHORT pids[3]; const wchar_t* name; };
    static const M kModels[] = {
        { 0x373E, { 0x001C, 0x001D, 0x001E }, L"LAMZU Maya X" },
        { 0x373E, { 0x0016, 0, 0 }, L"LAMZU Maya X V2" },
        { 0x37B0, { 0x001F, 0, 0 }, L"LAMZU Maya X V2" },
        { 0x37B0, { 0x0005, 0x000B, 0x000C }, L"LAMZU Tachi" },
        { 0x37B0, { 0x001C, 0x001E, 0 }, L"LAMZU Tachi Lite" },
        { 0x37B0, { 0x0009, 0x000F, 0x0010 }, L"LAMZU Inca" },
        { 0x37B0, { 0x0011, 0x0013, 0x0015 }, L"LAMZU Maya" },
        { 0x37B0, { 0x0007, 0x000D, 0x000E }, L"LAMZU Paro" },
        { 0x37B0, { 0x0017, 0x0019, 0x001B }, L"LAMZU Thorn" },
        { 0x37B0, { 0x0021, 0x0003, 0x0023 }, L"LAMZU Thorn V2" },
        { 0x37B0, { 0x0030, 0x0032, 0x0040 }, L"LAMZU Thorn V2" },
        { 0x37B0, { 0x0025, 0x0027, 0 }, L"LAMZU Atlantis OG Champion" },
        { 0x37B0, { 0x0028, 0x002B, 0x002A }, L"LAMZU Atlantis Mini" },
        { 0x37B0, { 0x003E, 0x003F, 0 }, L"LAMZU Atlantis Mini" },
        { 0x37B0, { 0x002C, 0x0052, 0 }, L"LAMZU Maya M" },
        { 0x37B0, { 0x003A, 0x003B, 0x0044 }, L"LAMZU Maya X" },
        { 0x37B0, { 0x003C, 0x0050, 0 }, L"LAMZU Maya" },
        { 0x37B0, { 0x0042, 0x0056, 0 }, L"LAMZU Orcus" },
        { 0x37B0, { 0x0046, 0x0054, 0 }, L"LAMZU Mini" },
    };
    for (const auto& m : kModels)
        if (m.vid == vid)
            for (USHORT p : m.pids)
                if (p && p == pid) return m.name;
    return nullptr;
}

// Wired product ids: the mouse itself on the USB cable.
bool IsCable(USHORT vid, USHORT pid) {
    if (vid == 0x373E) return pid == 0x001C;
    switch (pid) {
        case 0x0005: case 0x0007: case 0x0009: case 0x0011: case 0x0017: case 0x001C: case 0x001F: case 0x0021:
        case 0x0025: case 0x0028: case 0x002C: case 0x0030: case 0x0034: case 0x0038: case 0x003A: case 0x003C:
        case 0x003E: case 0x0040: case 0x0042: case 0x0044: case 0x0046: case 0x0050: case 0x0052: case 0x0056:
            return true;
        default:
            return false;
    }
}

}  // namespace

void PollLamzu(PollContext& ctx) {
    for (USHORT vendor : { (USHORT)0x373E, (USHORT)0x37B0 }) {
        for (auto [vid, pid] : ctx.Products(vendor)) {
            for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) { return c.featLen() == 65; })) {
                HidDev d;
                if (!d.OpenFeatureOnly(*c)) continue;
                std::vector<BYTE> req(65, 0);  // [0] = report id 0
                req[3] = 0x02;
                req[4] = 0x02;
                req[6] = 0x83;
                if (!d.SetFeature(req)) continue;
                Sleep(100);
                std::vector<BYTE> r;
                if (!d.GetFeature(0x00, r) || r.size() < 10) continue;
                int chg, pct;
                if (r[1] == 0xA1 && r[4] == 0x02 && r[6] == 0x83) { chg = r[7]; pct = r[8]; }
                else if (r[0] == 0xA1 && r[3] == 0x02 && r[5] == 0x83) { chg = r[6]; pct = r[7]; }
                else continue;
                if (pct > 100) continue;
                DeviceStatus s;
                s.key = L"lamzu:" + Hex4(vid) + L":" + Hex4(pid);
                const wchar_t* name = ModelName(vid, pid);
                s.name = name ? name : L"LAMZU wireless mouse";
                s.kind = DeviceKind::Mouse;
                bool cable = IsCable(vid, pid);
                s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
                s.connected = pct > 0 || cable;  // 0 from a dongle = mouse off or out of range
                if (pct > 0) s.percent = pct;
                s.charging = chg == 1;
                ctx.Add(s, vid, pid);
                break;
            }
        }
    }
}
