// Keychron wireless mice (VID 3434, e.g. M4), from Keychron's own web Launcher (launcher.keychron.com).
// 64-byte output report without report id: [01][00][81][01][0...][checksum], checksum (byte 63)
// = 0xA1 - sum(bytes 0..62). The reply [01][..][..][01][state][rate][vid lo][vid hi][pid lo][pid hi]
// [charging][battery %]... carries the mouse's own vendor id, which is checked so that only a
// genuine reply is accepted. Keychron keyboards do not report their battery this way (only over
// Bluetooth, which the Bluetooth fallback already covers).
// The 8K mice (M5 8K, G6 HE 8K ... on the TurboLink 8K receiver, Launcher protocol "8k_nordic") use
// the same request, but on the receiver bit 6 of the first byte is set (41 00 81 01 ...). Their reply
// [41][..][..][01][..][max rate][..]..[state][battery %][profile] has no vendor id; state 1 =
// charging, 3 is treated as 0.
// The 4K mice (M4 4K, M3 4K, M3 mini 4K, M6 4K ... on the Keychron 4K Link receiver, e.g. 3434:D038)
// use the Launcher protocol "4k" on the FF0A:0001 collection. The Launcher tells it apart from
// "8k_nordic" by the reply to 01 00 81 01: bytes 6/7 are 34 34 or 2D 36 on 8k_nordic, anything else
// means "4k". The battery request is the same 41 00 81 01 (bit 6 = ask the mouse over the receiver),
// but the reply is [41][..][..][01][..][state][battery %][profile]..[max rate]; state != 0 is shown
// as charging. 40 00 81 00 returns the paired mouse's product id at bytes 4/5, used for its name.
// The Nape Pro trackball (ZMK firmware) on the Link-KM receiver (3434:D026) uses neither: it is read
// through the receiver's VIA-style raw HID collection FF60:0061 (unnumbered 32-byte reports). B2 asks
// the receiver for its three slots (at bytes 2/7/12: vid BE16, pid BE16, status, 1 = connected) and
// A7 31 is tunnelled to the trackball; the reply A7 31 [battery %][charging] echoes the request.
// Sources: github.com/nvalis/nape_pro (docs/protocol-reference.md, src/nape_cli/receiver.py, checked
// on a real D026), github.com/gtun/KeychronNapeBatteryWidget (src/nape_battery.py) and
// github.com/ky0209/NapeBar. The same request works on the Nape Pro's own USB cable PID (3434:0440).
#include "drivers.h"

namespace {

void SetChecksum(std::vector<BYTE>& payload) {  // payload = 64 bytes without the report id
    unsigned sum = 0;
    for (int i = 0; i < 63; i++) sum += payload[i];
    payload[63] = (BYTE)(0xA1 - sum);
}

std::wstring CleanName(std::wstring n) {
    if (n.empty() || n.find(L"Link") != std::wstring::npos || n.find(L"Receiver") != std::wstring::npos) return L"Keychron mouse";
    return n;
}

}  // namespace

namespace {

// Sends [cmd][00][81][sub] and waits up to 600 ms for a reply starting with cmd whose byte 3 is sub.
bool Query(HidDev& d, BYTE cmd, std::vector<BYTE>& r, BYTE sub = 0x01) {
    std::vector<BYTE> payload(64, 0);
    payload[0] = cmd;
    payload[2] = 0x81;
    payload[3] = sub;
    SetChecksum(payload);
    std::vector<BYTE> req(1, 0x00);  // report id 0 (unnumbered)
    req.insert(req.end(), payload.begin(), payload.end());
    d.Flush();
    if (!d.Write(req)) return false;
    ULONGLONG end = GetTickCount64() + 600;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (d.Read(r, left) < 13) return false;
        if (r[0] == cmd && r[3] == sub) return true;
    }
    return false;
}

constexpr USHORT kLinkKm = 0xD026;     // Keychron Link-KM 2.4 GHz receiver
constexpr USHORT kNapeUsb = 0x0440;    // Nape Pro on its USB cable
constexpr USHORT kNapeInSlot = 0x4004; // product id the Link-KM reports for a paired Nape Pro

// Raw HID (FF60:61) request: report id 0 + 32 bytes. Waits up to 600 ms for a reply that starts with
// the request bytes; the channel also carries unsolicited notifications, which are skipped.
bool RawQuery(HidDev& d, std::initializer_list<BYTE> cmd, std::vector<BYTE>& r) {
    std::vector<BYTE> req(1, 0x00);
    req.insert(req.end(), cmd.begin(), cmd.end());
    req.resize(33, 0);
    d.Flush();
    if (!d.Write(req)) return false;
    ULONGLONG end = GetTickCount64() + 600;
    while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        int n = d.Read(r, left);
        if (n < 0) return false;
        if (n < (int)cmd.size() + 2) continue;
        bool match = true;
        size_t i = 0;
        for (BYTE b : cmd) match = match && r[i++] == b;
        if (match) return true;
    }
    return false;
}

// Nape Pro trackball, on the Link-KM receiver or on its USB cable.
void PollNape(PollContext& ctx) {
    for (USHORT pid : {kLinkKm, kNapeUsb}) {
        for (const HidColl* c : ctx.Find(0x3434, pid, [](const HidColl& c) { return c.page() == 0xFF60 && c.usage() == 0x61 && c.outLen() == 33; })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            std::vector<BYTE> r;
            if (pid == kLinkKm) {
                // Only ask when a Nape Pro sits in a receiver slot and is connected.
                if (!RawQuery(d, {0xB2}, r) || r.size() < 17) continue;
                bool connected = false;
                for (int off : {2, 7, 12})
                    if (((r[off + 2] << 8) | r[off + 3]) == kNapeInSlot) connected = r[off + 4] == 1;
                if (!connected) continue;
            }
            if (!RawQuery(d, {0xA7, 0x31}, r) || r[2] > 100) continue;
            DeviceStatus s;
            s.key = L"keychron:nape";
            s.name = L"Keychron Nape Pro";
            s.kind = DeviceKind::Mouse;
            s.via = pid == kLinkKm ? L"2.4 GHz receiver" : L"USB cable";
            s.percent = r[2];
            s.charging = r[3] != 0;
            ctx.Add(s, 0x3434, pid);
            return;
        }
    }
}

// Product ids the 4K Link reports for its paired mouse (Launcher's productFirmware table).
const wchar_t* Name4k(USHORT productId) {
    switch (productId) {
        case 0x0620: return L"Keychron M3 mini 4K";
        case 0x0621: return L"Keychron M4 4K";
        case 0x0622: return L"Keychron M3 mini 4K";
        case 0x0624: return L"Keychron M6 4K";
        case 0x07A0: return L"Keychron M3 4K";
    }
    return nullptr;
}

// Older Keychron mice (M1, M2, M3, M3 mini, M6, M7 ...) on the 1K 2.4 GHz receiver (3434:D030
// Type-A, D031 Type-C), as read by the "Keychron" desktop app (DeviceDriver.exe). The receiver
// exposes a vendor collection on usage page 0x8C (MI_01) with a 1001-byte feature report 0x51.
// SetFeature [51][cmd] queues a command, GetFeature 51 returns the reply [51][cmd][01 = ok]...
// Command 06 (device status) answers [51][06][01][00][vid lo][vid hi][pid lo][pid hi][..][..][..]
// [battery %][charging: 01]; the vid/pid are the mouse's own (e.g. 3434:D033 for an M3).
// Read-only; checked on a real M3 on the D030 receiver.
constexpr USHORT kLegacyA = 0xD030;    // 1K receiver, Type-A
constexpr USHORT kLegacyC = 0xD031;    // 1K receiver, Type-C
constexpr BYTE kLegacyReport = 0x51;
constexpr BYTE kLegacyStatus = 0x06;

std::wstring LegacyName(USHORT pid) {
    switch (pid) {
        case 0xD032: case 0xD033: return L"Keychron M3";
        case 0xD035: return L"Keychron M1";
        case 0xD036: case 0xD03E: return L"Keychron M3 mini";
        case 0xD03B: return L"Keychron M2";
        case 0xD03D: return L"Keychron M2 mini";
        case 0xD03F: return L"Keychron M6";
        case 0xD044: return L"Keychron M7";
        default: return L"Keychron mouse";
    }
}

void PollLegacy(PollContext& ctx) {
    for (USHORT rpid : {kLegacyA, kLegacyC}) {
        for (const HidColl* c : ctx.Find(0x3434, rpid, [](const HidColl& c) { return c.page() == 0x8C && c.featLen() >= 16; })) {
            HidDev d;
            if (!d.Open(*c) && !d.OpenFeatureOnly(*c)) continue;
            if (!d.SetFeature({kLegacyReport, kLegacyStatus})) continue;
            std::vector<BYTE> r;
            bool got = false;
            for (int i = 0; i < 5 && !got; i++) {  // the reply is usually there at once; give the mouse up to ~200 ms
                Sleep(40);
                got = d.GetFeature(kLegacyReport, r) && r.size() >= 13 && r[0] == kLegacyReport && r[1] == kLegacyStatus;
            }
            if (!got || r[2] != 0x01 || (USHORT)(r[4] | (r[5] << 8)) != 0x3434 || r[11] > 100) continue;
            USHORT mpid = (USHORT)(r[6] | (r[7] << 8));
            DeviceStatus s;
            s.key = L"keychron:" + Hex4(mpid);
            s.name = LegacyName(mpid);
            s.kind = DeviceKind::Mouse;
            s.via = L"2.4 GHz receiver";
            s.percent = r[11];
            s.charging = r[12] == 0x01;
            ctx.Add(s, 0x3434, rpid);
            break;
        }
    }
}

}  // namespace

void PollKeychron(PollContext& ctx) {
    PollNape(ctx);
    PollLegacy(ctx);
    for (auto [vid, pid] : ctx.Products(0x3434)) {
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) { return c.page() >= 0xFF00 && c.outLen() == 65 && c.inLen() == 65; })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            std::vector<BYTE> r, r1;
            int percent = -1;
            bool charging = false, wireless = true;
            bool got1 = Query(d, 0x01, r1);
            USHORT tag = got1 ? (USHORT)(r1[6] | (r1[7] << 8)) : 0;
            if (got1 && c->page() == 0xFF0A && c->usage() == 0x01 && tag != 0x3434 && tag != 0x362D) {
                // 4K mouse on the 4K Link receiver (Launcher protocol "4k"); the 8K layout does not apply.
                if (!Query(d, 0x41, r) || r[6] < 1 || r[6] > 100) continue;
                DeviceStatus s;
                s.key = L"keychron:" + Hex4(pid);
                s.name = CleanName(HidProduct(*c));
                std::vector<BYTE> st;
                if (Query(d, 0x40, st, 0x00)) {
                    const wchar_t* n = Name4k((USHORT)(st[4] | (st[5] << 8)));
                    if (n) s.name = n;
                }
                s.kind = DeviceKind::Mouse;
                s.via = L"2.4 GHz receiver";
                s.percent = r[6];
                s.charging = r[5] != 0;
                ctx.Add(s, vid, pid);
                break;
            }
            if (got1 && tag == 0x3434 && r1[11] <= 100) {
                percent = r1[11];  // M4 and other mice on the classic protocol: the reply carries the vendor id
                charging = r1[10] != 0;
            } else if (Query(d, 0x41, r) && r[10] <= 3 && r[11] <= 100) {
                percent = r[11];  // 8K mouse on its receiver
                charging = r[10] == 1;
            } else if (got1 && r1[10] <= 3 && r1[11] >= 1 && r1[11] <= 100 && r1[5] >= 1 && r1[5] <= 8) {
                percent = r1[11];  // 8K mouse on the USB cable (no bit 6); byte 5 = highest polling rate level
                charging = r1[10] == 1;
                wireless = false;
            }
            if (percent < 0) continue;
            DeviceStatus s;
            s.key = L"keychron:" + Hex4(pid);
            s.name = CleanName(HidProduct(*c));
            s.kind = DeviceKind::Mouse;
            s.via = wireless ? L"2.4 GHz receiver" : L"USB cable";
            s.percent = percent;
            s.charging = charging;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}
