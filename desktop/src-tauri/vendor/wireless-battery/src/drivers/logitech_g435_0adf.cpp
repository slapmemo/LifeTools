// Logitech G435 LIGHTSPEED headset on the newer 046D:0ADF dongle. It does not speak HID++: its
// vendor collection (FF00:0001, unnumbered 64-byte reports) carries CRC-16 framed messages, and
// "PA" commands inside them reach the headset's radio SoC. The battery is read with the OTA
// GET_BATTERY command (millivolts). The older 046D:0ACB dongle uses a different transport and is
// not handled here.
//
// Session, as captured by portyporty: open (84 01), 85 01, session init (OTA IOCTL_READ_MAX_LEN),
// REMOTE_GET_MODE / REMOTE_SET_MODE 01 / REMOTE_GET_MODE so the query is forwarded to the headset
// rather than answered by the dongle, GET_BATTERY, close (85 02). SET_MODE 01 only selects where
// the dongle routes the command; it is not a user setting and does not persist.
//
// The fixed waits between steps come from the original capture (about 1.2 s in total, under the
// 4 s per-device limit). Unlike the 0ACB dongle, a read does not interrupt audio or microphone
// (checked on hardware), so the headset is read on every poll and switching it off or on shows up
// within one poll interval.
// Protocol: github.com/portyporty/g435-battery-percentage (MIT), ported in
// github.com/deddroid/logitech-g435-battery.
#include "drivers.h"
#include "logitech_g435_0adf.h"

namespace {

constexpr USHORT kVid = 0x046D;
constexpr USHORT kPid = 0x0ADF;
constexpr BYTE kCatOta = 0x06;
constexpr BYTE kCatWireless = 0x0E;
constexpr BYTE kGetMode = 0xE0;
constexpr BYTE kSetMode = 0xE1;

// Session init from the capture (OTA_CMD_IOCTL_READ_MAX_LEN, sequence 1 embedded).
const std::vector<BYTE> kSessionInit = { 0x50, 0x41, 0x06, 0x01, 0x0D, 0x00, 0x25, 0x34, 0x12, 0x5A,
                                         0x5A, 0x01, 0x00, 0x00, 0x00, 0xF0, 0x00, 0x00, 0x00 };

// Sends one frame (report ID 0) and collects the input reports that arrive within `waitMs`.
// With `mv` set, returns as soon as a battery reply is seen.
bool Transact(HidDev& d, BYTE cmd, const std::vector<BYTE>& body, int waitMs, int* mv = nullptr) {
    auto f = G435Adf::Frame(cmd, body);
    std::vector<BYTE> out(1, 0x00);
    out.insert(out.end(), f.begin(), f.end());
    d.Flush();
    if (!d.Write(out)) return false;
    ULONGLONG end = GetTickCount64() + waitMs;
    std::vector<BYTE> r;
    for (;;) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0) return true;
        if (d.Read(r, left) < 0) continue;
        if (mv && (*mv = G435Adf::ParseMillivolts(r.data(), r.size())) >= 0) return true;
    }
}

// Always closes the session (85 02) once it was opened, whatever happens in between.
struct SessionGuard {
    HidDev& d;
    ~SessionGuard() { Transact(d, 0x85, { 0x02 }, 50); }
};

int ReadMillivolts(HidDev& d) {
    if (!Transact(d, 0x84, { 0x01 }, 50)) return -1;
    SessionGuard guard{ d };
    Transact(d, 0x85, { 0x01 }, 50);
    Transact(d, 0x80, kSessionInit, 450);
    BYTE seq = 2;
    auto pa = [&](BYTE cat, BYTE len, std::initializer_list<BYTE> payload) {
        auto cmd = G435Adf::Pa(cat, seq, len, payload);
        seq = (BYTE)(seq % 127 + 1);
        return cmd;
    };
    Transact(d, 0x80, pa(kCatWireless, 1, { kGetMode }), 120);
    Transact(d, 0x80, pa(kCatWireless, 2, { kSetMode, 0x01 }), 120);
    Transact(d, 0x80, pa(kCatWireless, 1, { kGetMode }), 120);
    int mv = -1;
    Transact(d, 0x80, pa(kCatOta, 1, { 0x00, 0x31 }), 250, &mv);
    return mv;
}

}  // namespace

void PollLogitechG435(PollContext& ctx) {
    if (ctx.IsClaimed(kVid, kPid)) return;
    auto colls = ctx.Find(kVid, kPid, [](const HidColl& c) {
        return c.page() == 0xFF00 && c.usage() == 0x0001 && c.inLen() == 65 && c.outLen() == 65;
    });
    if (colls.empty()) return;

    HidDev d;
    if (!d.Open(*colls[0])) return;

    DeviceStatus s;
    s.key = L"g435:" + Hex4(kPid);
    s.name = L"Logitech G435";
    s.kind = DeviceKind::Headset;
    s.via = L"2.4 GHz receiver";

    int mv = ReadMillivolts(d);
    if (mv < 0) {
        // Dongle present but no reply: the headset is off or out of range.
        s.connected = false;
        ctx.Add(s, kVid, kPid);
        return;
    }
    s.millivolts = mv;
    s.percent = G435Adf::Percent(mv);
    ctx.Add(s, kVid, kPid);
}
