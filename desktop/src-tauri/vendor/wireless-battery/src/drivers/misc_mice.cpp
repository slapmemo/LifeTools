// Smaller mouse brands, each with a community-documented battery protocol:
//  * Motospeed X6 (Realtek VID 0BDA, receivers FFE0 / FFF2, interface 4): output report B5 [06],
//    reply report B4, byte 20 = level (+128 while charging). The cable (FFF1) reports no battery.
//    From github.com/Jacobz888/LGSTrayBattery-MotospeedX6.
//  * Xenta receivers (Delux M900 Pro, Attack Shark X6 / R1 / X11 / X3 Max / V3 Pro; VID 1D57): the receiver
//    broadcasts input report 03 on usage page 000A every ~2 s: [03][model][40][state][percent],
//    state 2 = full, 3 = charging (percent frozen). From github.com/AeonArcHQ/omarchy-delux-m900.
//    The collection is push-only (no output or feature report), so it is opened read-only, as BatteryTray
//    and attackshark-battery-windows do: a read/write open fails while a vendor app holds it without
//    sharing write access. `--dump` also prints the raw frames it sends, to add models such as the
//    Moxanic Lumi G1 whose receiver (1D57:FA60) was not read yet.
//  * Ajazz AJ179 family (VID 249A receiver, 248A cable, interface 2): unnumbered 32-byte report,
//    command 10 (device info, answered by the receiver): reply [10][00 = ok]..., [4..7] model id,
//    [12] charging, [13] percent, [14] mouse connected (receiver), [31] = sum([4..30]).
//    From github.com/Rockeyxx/aj179-linux (docs/PROTOCOL.md).
//  * AJAZZ AJ-series mice on the SONiX vendor id 3151 (AJ159 PRO / APEX and siblings). The dongle
//    exposes a 65-byte feature collection on usage page FFFF / usage 02. A SET_FEATURE status poll
//    (report 0x00, opcode 0xF7, zero payload) brings the 2.4 GHz telemetry link up; ~30 ms later
//    GET_FEATURE report 0x05 carries the charge in byte 3 (0..100). A frame with a non-zero byte 1
//    or 2 is transient reconnect garbage and is rejected.
//    From github.com/Aiacos/ajazz-control-center (docs/protocols/mouse/aj_series.md).
//  * AJAZZ AJ139 V2 MC and siblings on PID 2255 (VID A8A5 = 2.4 GHz dongle, A8A4 = USB cable; the PID is
//    shared with the K-snake X11 and NJ07/NJ08 V2, so the mouse gets a generic name). Vendor collection
//    FF01:0010, unnumbered 64-byte output/input reports: request [55][30][A5][chk][2E][00 ...], reply
//    [AA][30]..., byte 8 = percent, byte 9 = non-zero on USB power. Unrelated AA FA / AA ED reports are
//    skipped. The two sources disagree on request byte 3: werquess sends the low byte of sum(bytes 4..63)
//    (2E) and nico2525nn sends 0B with 01 01 in bytes 5..6, so both variants are tried.
//    From github.com/werquess/ajazz-aj139-macos (PROTOCOL.md) and github.com/nico2525nn/AjazzAJ139V2.
//  * Incott G23 V2 / G24 on the PixArt vendor id 093A (522C = 2.4 GHz dongle, 622C = USB cable), vendor
//    collection FF05:0001. Read-only status query: SET_FEATURE report 09 [09][89][00 x7], then
//    GET_FEATURE report 09 until [09][89][battery][dpi/rate]...; battery bit 7 = charging, low 7 bits =
//    percent. The same layout is pushed as input report 09, but only now and then (when the mouse
//    idles or a setting changes), too rarely for a one-shot poll. A reply with bytes 2 and 3 both 0 is
//    stale and skipped. On the cable the first FF05 collection rejects SET_FEATURE, so the collections
//    are tried last to first. From github.com/OmarK6/Incott-Manager (device.go),
//    github.com/HeHaoren/incott-mouse-app (docs/protocol.md) and github.com/FelixNg21/MouseBattery
//    (battery byte layout, verified on a G23 V2 with the 522C dongle).
#include "drivers.h"

#include <algorithm>
#include <cstdio>
#include <map>
#include <memory>
#include <set>
#include <string>

namespace {

template <class Match>
bool ReadUntil(HidDev& d, std::vector<BYTE>& r, int timeoutMs, Match match) {
    ULONGLONG end = GetTickCount64() + timeoutMs;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (d.Read(r, left) < 0) return false;
        if (match(r)) return true;
    }
    return false;
}

void PollMotospeed(PollContext& ctx) {
    for (USHORT pid : { (USHORT)0xFFE0, (USHORT)0xFFF2, (USHORT)0xFFF1 }) {
        if (ctx.IsClaimed(0x0BDA, pid)) continue;
        for (const HidColl* c : ctx.Find(0x0BDA, pid, [](const HidColl& c) { return c.iface == 4 && c.outLen() >= 21; })) {
            DeviceStatus s;
            s.key = L"motospeed:" + Hex4(pid);
            s.name = L"Motospeed X6";
            s.kind = DeviceKind::Mouse;
            if (pid == 0xFFF1) {  // plugged in: charging, no battery reading over the cable
                s.via = L"USB cable";
                s.charging = true;
                ctx.Add(s, 0x0BDA, pid);
                break;
            }
            HidDev d;
            if (!d.Open(*c)) continue;
            d.Flush();
            if (!d.Write({ 0xB5, 0x06 })) continue;
            std::vector<BYTE> r;
            if (!ReadUntil(d, r, 1500, [](const std::vector<BYTE>& r) { return r.size() > 20 && r[0] == 0xB4; })) continue;
            int raw = r[20];
            s.via = L"2.4 GHz receiver";
            s.charging = raw >= 128;
            s.percent = Clamp100(s.charging ? raw - 128 : raw);
            ctx.Add(s, 0x0BDA, pid);
            break;
        }
    }
}

// Xenta receiver (1D57:FA60, also FA65; cable FA55 / 2155), used by Delux and Attack Shark mice.
// The receiver broadcasts [03][model][40][state][level] every ~2 s; nothing is sent to it. The handle
// stays open between polls so these frames queue up. A reading counts once two frames agree, because
// every link-up starts with a false 100% (github.com/qu1ncky/BatteryTray, XentaReceiverProvider).
struct XentaModel { BYTE code; const wchar_t* name; bool tens; };
const XentaModel kXentaModels[] = {
    { 0x3D, L"Delux M900 Pro", false },
    { 0x55, L"Attack Shark X11", false },
    { 0x4E, L"Attack Shark X3 Max", false },
    { 0xE5, L"Attack Shark V3 Pro", false },
    { 0x10, L"Attack Shark X6 / R1", true },  // level reported in tens (0-10)
};

struct XentaListener {
    std::unique_ptr<HidDev> dev;
    std::vector<BYTE> last, prev;  // the two most recent battery frames
    ULONGLONG lastFrameAt = 0;
};
std::map<std::wstring, XentaListener> g_xenta;  // by collection path

void PollXenta(PollContext& ctx) {
    const USHORT pids[] = { 0xFA60, 0xFA65, 0xFA55, 0x2155 };
    std::set<std::wstring> present;
    for (USHORT pid : pids) {
        if (ctx.IsClaimed(0x1D57, pid)) continue;
        for (const HidColl* c : ctx.Find(0x1D57, pid, [](const HidColl& c) { return c.page() == 0x000A && c.inLen() >= 5; })) {
            present.insert(c->path);
            XentaListener& l = g_xenta[c->path];
            bool fresh = !l.dev;
            if (fresh) {
                l.dev = std::make_unique<HidDev>();
                if (!l.dev->OpenReadOnly(*c)) { g_xenta.erase(c->path); continue; }
            }
            // Take everything queued since the last poll; a new listener waits for two frames.
            ULONGLONG until = GetTickCount64() + (fresh ? 5000 : 0);
            std::vector<BYTE> r;
            int got = 0;
            while (true) {
                int wait = fresh && got < 2 ? (int)std::max<LONGLONG>(1, (LONGLONG)until - (LONGLONG)GetTickCount64()) : 30;
                if (fresh && got < 2 && (LONGLONG)until - (LONGLONG)GetTickCount64() <= 0) break;
                if (l.dev->Read(r, wait) < 5) break;
                if (r[0] != 0x03 || r[2] != 0x40) continue;
                l.prev = l.last;
                l.last.assign(r.begin(), r.begin() + 5);
                l.lastFrameAt = GetTickCount64();
                got++;
            }
            if (l.last.empty() || GetTickCount64() - l.lastFrameAt > 15000) break;  // mouse off: no frames
            bool cable = pid == 0xFA55 || pid == 0x2155;
            BYTE code = l.last[1], st = l.last[3], level = l.last[4];
            const XentaModel* model = nullptr;
            for (const auto& m : kXentaModels)
                if (m.code == code) model = &m;
            DeviceStatus s;
            s.key = L"xenta:" + Hex4(pid);
            s.name = model ? model->name : L"Wireless mouse";
            s.kind = DeviceKind::Mouse;
            s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
            bool agreed = l.prev == l.last;
            if (cable || st == 0x02 || st == 0x03) {
                s.charging = true;  // the level is frozen on external power
                if (st == 0x02 && !cable) s.percent = 100;
            } else if (agreed) {
                if (model && model->tens) {
                    if (level >= 1 && level <= 10) s.percent = level * 10;
                } else if (st == 0x01 && level >= 1 && level <= 100) {
                    s.percent = level;
                }
            }
            if (s.percent < 0 && !s.charging) s.asleep = true;  // shown with the last known value
            ctx.Add(s, 0x1D57, pid);
            break;
        }
    }
    for (auto it = g_xenta.begin(); it != g_xenta.end();)  // forget receivers that were unplugged
        it = present.count(it->first) ? std::next(it) : g_xenta.erase(it);
}

void PollAjazz(PollContext& ctx) {
    for (USHORT vendor : { (USHORT)0x249A, (USHORT)0x248A }) {
        for (auto [vid, pid] : ctx.Products(vendor)) {
            for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) { return c.iface == 2 && c.outLen() == 33 && c.inLen() == 33; })) {
                HidDev d;
                if (!d.Open(*c)) continue;
                d.Flush();
                if (!d.Write({ 0x00, 0x10 })) continue;  // report id 0, command 10, zero payload (checksum 0)
                std::vector<BYTE> r;
                bool ok = ReadUntil(d, r, 1500, [](const std::vector<BYTE>& r) {
                    if (r.size() < 32 || r[0] != 0x10 || r[1] != 0x00) return false;
                    unsigned sum = 0;
                    for (int i = 4; i <= 30; i++) sum += r[i];
                    return (BYTE)sum == r[31];
                });
                if (!ok || r[13] > 100) continue;
                DeviceStatus s;
                s.key = L"ajazz:" + Hex4(vid) + L":" + Hex4(pid);
                std::string model;
                for (int i = 4; i < 8 && r[i] >= 0x20 && r[i] < 0x7F; i++) model += (char)r[i];
                s.name = model.size() == 4 && model[0] == 'M' ? L"Ajazz AJ" + std::wstring(model.begin() + 1, model.end()) : L"Ajazz mouse";
                s.kind = DeviceKind::Mouse;
                bool receiver = vid == 0x249A;
                s.via = receiver ? L"2.4 GHz receiver" : L"USB cable";
                s.connected = !receiver || r[14] != 0;
                s.charging = r[12] != 0;
                if (s.connected) s.percent = r[13];
                ctx.Add(s, vid, pid);
                break;
            }
        }
    }
}

void PollAjazzAjSeries(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x3151)) {
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.page() == 0xFFFF && c.usage() == 0x02 && c.featLen() >= 65;
             })) {
            HidDev d;
            if (!d.OpenFeatureOnly(*c)) continue;
            std::vector<BYTE> req(c->featLen(), 0);
            req[0] = 0x00;  // unnumbered report
            req[1] = 0xF7;  // status poll: brings the 2.4 GHz telemetry link up
            if (!d.SetFeature(req)) continue;
            Sleep(30);
            std::vector<BYTE> r;
            if (!d.GetFeature(0x05, r) || r.size() < 4) continue;
            if (r[0] != 0x05 || r[1] != 0 || r[2] != 0) continue;  // malformed / reconnect frame
            int pct = r[3];
            if (pct > 100) continue;
            DeviceStatus s;
            s.key = L"ajazzaj:" + Hex4(vid) + L":" + Hex4(pid);
            s.name = HidProduct(*c);
            if (s.name.empty()) s.name = L"AJAZZ mouse";
            s.kind = DeviceKind::Mouse;
            s.via = L"2.4 GHz receiver";
            s.connected = pct > 0;  // 0 means the link is up but the mouse is off
            if (s.connected) s.percent = pct;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}

void PollAjazzAj139(PollContext& ctx) {
    for (USHORT vendor : { (USHORT)0xA8A5, (USHORT)0xA8A4 }) {
        const USHORT pid = 0x2255;
        if (ctx.IsClaimed(vendor, pid)) continue;
        for (const HidColl* c : ctx.Find(vendor, pid, [](const HidColl& c) {
                 return c.page() == 0xFF01 && c.usage() == 0x0010 && c.outLen() >= 65 && c.inLen() >= 65;
             })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            auto isBattery = [](const std::vector<BYTE>& r) { return r.size() > 9 && r[0] == 0xAA && r[1] == 0x30; };
            std::vector<BYTE> r;
            d.Flush();
            bool ok = d.Write({ 0x00, 0x55, 0x30, 0xA5, 0x2E, 0x2E }) && ReadUntil(d, r, 700, isBattery);
            if (!ok) ok = d.Write({ 0x00, 0x55, 0x30, 0xA5, 0x0B, 0x2E, 0x01, 0x01 }) && ReadUntil(d, r, 800, isBattery);
            if (!ok || r[8] > 100) continue;
            bool cable = vendor == 0xA8A4;
            DeviceStatus s;
            s.key = L"ajazz139:" + Hex4(vendor) + L":" + Hex4(pid);
            s.name = L"AJAZZ wireless mouse";
            s.kind = DeviceKind::Mouse;
            s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
            s.charging = r[9] != 0;
            s.connected = cable || r[8] > 0;  // 0 from the dongle: the mouse is off or out of range
            if (s.connected) s.percent = r[8];
            ctx.Add(s, vendor, pid);
            break;
        }
    }
}

void PollIncott(PollContext& ctx) {
    for (USHORT pid : { (USHORT)0x522C, (USHORT)0x622C }) {
        if (ctx.IsClaimed(0x093A, pid)) continue;
        auto colls = ctx.Find(0x093A, pid, [](const HidColl& c) { return c.page() == 0xFF05 && c.featLen() >= 9; });
        std::reverse(colls.begin(), colls.end());
        for (const HidColl* c : colls) {
            HidDev d;
            if (!d.OpenFeatureOnly(*c)) continue;
            if (!d.SetFeature({ 0x09, 0x89 })) continue;
            std::vector<BYTE> r;
            bool ok = false;
            for (int i = 0; i < 10 && !ok; i++) {
                Sleep(50);
                if (!d.GetFeature(0x09, r)) break;
                ok = r.size() >= 4 && r[0] == 0x09 && r[1] == 0x89 && (r[2] | r[3]) != 0;
            }
            if (!ok) continue;
            int pct = r[2] & 0x7F;
            if (pct > 100) continue;
            bool cable = pid == 0x622C;
            DeviceStatus s;
            s.key = L"incott:" + Hex4(pid);
            s.name = L"Incott mouse";  // the ids are shared by the G23 V2 and the G24
            s.kind = DeviceKind::Mouse;
            s.via = cable ? L"USB cable" : L"2.4 GHz receiver";
            s.charging = (r[2] & 0x80) != 0;
            s.connected = cable || pct > 0;  // 0 from the dongle: the mouse is off or out of range
            if (s.connected) s.percent = pct;
            if (!cable) s.graceSec = 1800;  // keep the last value if a sleeping mouse stops answering
            ctx.Add(s, 0x093A, pid);
            break;
        }
    }
}

}  // namespace

// For `--dump`: the raw input reports each Xenta status collection sends during ~6 s (three frames at the
// usual 2 s cadence), so a model whose frames are not understood yet can be added from a user's output.
std::wstring DumpXentaFrames() {
    std::wstring out;
    for (const HidColl& c : EnumHid()) {
        if (c.vid != 0x1D57 || c.page() != 0x000A || c.inLen() < 5) continue;
        wchar_t head[64];
        swprintf(head, 64, L"\nXenta %04X:%04X status frames (6 s):\n", c.vid, c.pid);
        out += head;
        HidDev d;
        if (!d.OpenReadOnly(c)) {
            out += L"  cannot open (error " + std::to_wstring(GetLastError()) + L")\n";
            continue;
        }
        std::vector<BYTE> r;
        int frames = 0;
        ULONGLONG end = GetTickCount64() + 6000;
        while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0 && frames < 16) {
            if (d.Read(r, (int)std::max<LONGLONG>(1, (LONGLONG)end - (LONGLONG)GetTickCount64())) < 0) break;
            out += L" ";
            for (BYTE b : r) {
                wchar_t hx[4];
                swprintf(hx, 4, L" %02X", b);
                out += hx;
            }
            out += L"\n";
            frames++;
        }
        if (!frames) out += L"  none (mouse off, asleep or on Bluetooth?)\n";
    }
    return out;
}

void PollMiscMice(PollContext& ctx) {
    PollMotospeed(ctx);
    PollXenta(ctx);
    PollAjazz(ctx);
    PollAjazzAjSeries(ctx);
    PollAjazzAj139(ctx);
    PollIncott(ctx);
}
