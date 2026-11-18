// AULA F75 / F87 Pro / F99 and MCHOSE (K99 V2, G75 Pro, X75 ...) wireless keyboards on the "BY" 2.4 GHz
// receivers: 3554:FA09 (Compx, shared by both brands) and MCHOSE's own 41E4:2001.
// The receiver exposes a 20-byte vendor collection (usage page FF02 or FF04, usage 02). Battery is a
// 20-byte output report 0x13 carrying command 0x4A and a trailing sum checksum. The reply is
// another 0x13 frame whose command byte, with its top bit masked, is 0x4A. Its payload starts at
// byte 5: the level (1..100), then the state byte (low nibble: full, high nibble: charging; AULA
// reports 0x01 on battery and 0x10 with the cable in).
// The receiver also pushes unrelated 0x13 frames (a 0x0A status among them), so the report id
// alone does not identify the reply. MCHOSE firmware leaves the reply's trailer at 0 instead of a
// checksum; such a reply is accepted only as a single-packet frame (byte 2 = 1 packet, byte 3 = index 0).
// A keyboard that is dozing or has just switched to 2.4 GHz leaves the first request unanswered
// (one F75 capture timed out at exactly 1 s), so the request is resent every ~1.3 s within one
// 4-second deadline, the documented exception for slow links. Byte 2 alternates between 00 (PyFlat,
// sanshoku captures on the F75) and 01 (the "packet count" the Womier L65 tool sends on the same
// receiver); the reply is identified by command and checksum either way.
// Receivers named "2.4G Wireless Receiver" / "MCHOSE 2.4G Wireless" are first asked for their
// six-byte model code (command 0x05, read-only), as MCHOSE's M HUB does, to tell an MCHOSE model
// apart; MCHOSE models then get M HUB's exact battery frame (13 4A 01 ...).
// AULA protocol from github.com/PyFlat/Device-Battery-Info (PR 6), github.com/deepan-alve/womier-l65-linux
// (windows/l65w.ps1) and github.com/ushineko/sanshoku issue 36.
// MCHOSE receiver ids, model codes and frames from the official M HUB web driver
// (www.mchose.com.cn, assets/main-DQZs6ZzX.js: HidIndexDeviceFilters, getDevName, keyboardPwds,
// getPassWord, getBattery, getBatteryParser), as also documented in
// github.com/wushuai0802/myfinder-device-battery (engine/upstream-protocols.md, sections
// "MCHOSE BY keyboard receiver 3554:FA09" and "MCHOSE 41E4:2001 and other 41E4 identities").
//
// AULA HERO 68 Air (and possibly other AULA keyboards) on the "8K Wireless Receiver" (VID 372E,
// PID 106C) speaks a different, acknowledged protocol on usage page FF60 / usage 61 (interface 2):
//  * 20-byte reports: 09 66, three control bytes, 14 payload bytes, checksum.
//    Byte 3 (low 7 bits) is the frame index 1..5, byte 4 (low 7 bits) the frame type:
//    0E data, 00 ACK, 08 trailer from the host, 07 trailer from the keyboard. The top bits of
//    bytes 2, 3 and 4 form a 3-bit counter that advances with every frame a side sends.
//    Data frame checksum: byte 19 = sum of bytes 1..18.
//  * A message is always 4 data frames (56 bytes) plus a trailer. Host trailer: byte 12 =
//    0xFF - sum of the 56 message bytes, byte 13 = sum of bytes 1..12.
//  * Every data and trailer frame is acknowledged by the other side: bytes 2..4 echoed with the
//    type bits cleared (counter bit kept), byte 5 = sum of bytes 1..4. Unacknowledged frames are
//    resent by the keyboard every ~100 ms.
//  * Battery request: message 09 87 00 00 01 00. Reply: 87 00 00 01 00 02 <level> <flags>; the 02
//    is constant (it does not change with charging). The keyboard also pushes FE 05 <level> <flags>
//    on its own. <flags> is 0x10 while charging on the cable and 0x00 on battery.
// From a USB capture of AULA Hub (Wireless-Device-Battery-Monitor issue #201); read-only.
#include "drivers.h"

#include <algorithm>
#include <cstring>
#include <initializer_list>

namespace {

struct Receiver {
    USHORT vid, pid;
};
const Receiver kReceivers[] = { { 0x3554, 0xFA09 }, { 0x3554, 0xFB40 }, { 0x41E4, 0x2001 } };

// M HUB's keyboardPwds table: the six-byte model code returned by command 0x05.
struct Model {
    BYTE code[6];
    const wchar_t* name;
};
const Model kModels[] = {
    { { 0x03, 0x00, 0x00, 0x00, 0x02, 0x1C }, L"MCHOSE G87" },
    { { 0x03, 0x00, 0x00, 0x00, 0x00, 0x77 }, L"MCHOSE K99" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0xDF }, L"MCHOSE K99 V2" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0x32 }, L"MCHOSE G98" },
    { { 0x03, 0x00, 0x00, 0x00, 0x00, 0xD6 }, L"MCHOSE X75" },
    { { 0x0A, 0x00, 0x00, 0x00, 0x00, 0x03 }, L"MCHOSE G98 Pro" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0xC6 }, L"MCHOSE X75 V2" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0x15 }, L"MCHOSE G75 Pro" },
    { { 0x0A, 0x00, 0x00, 0x00, 0x00, 0x18 }, L"MCHOSE G98 V2" },
    { { 0x0A, 0x00, 0x00, 0x00, 0x00, 0x2B }, L"MCHOSE UT98" },
    { { 0x0A, 0x00, 0x00, 0x00, 0x00, 0x01 }, L"MCHOSE Z75" },
    { { 0x0A, 0x00, 0x00, 0x00, 0x00, 0x09 }, L"MCHOSE Z75S" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0xC7 }, L"MCHOSE KX75" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0x74 }, L"MCHOSE GX87" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0xED }, L"MCHOSE GX87 V2" },
    { { 0x03, 0x00, 0x00, 0x00, 0x01, 0x35 }, L"MCHOSE K87" },
    { { 0x03, 0x00, 0x00, 0x00, 0x03, 0x35 }, L"MCHOSE G75 V2" },
    { { 0x0A, 0x00, 0x00, 0x00, 0x00, 0x34 }, L"MCHOSE G87 V2" },
};

BYTE Sum(const std::vector<BYTE>& b, size_t n) {
    unsigned s = 0;
    for (size_t i = 0; i < n; i++) s += b[i];
    return (BYTE)(s & 0xFF);
}

bool SendRequest(HidDev& d, BYTE cmd, BYTE packets) {
    std::vector<BYTE> req(20, 0);
    req[0] = 0x13;
    req[1] = cmd;
    req[2] = packets;
    req[19] = Sum(req, 19);
    return d.Write(req);
}

// Sends 13 <cmd> ... and waits for the matching reply, resending every 1.3 s within `totalMs`.
bool Exchange(HidDev& d, BYTE cmd, std::vector<BYTE>& r, int totalMs) {
    const ULONGLONG start = GetTickCount64(), end = start + totalMs;  // single absolute deadline
    const int kResendMs = 1300;
    int sent = 0;
    d.Flush();
    for (;;) {
        LONGLONG now = (LONGLONG)GetTickCount64();
        if (now >= (LONGLONG)end) return false;
        if (now >= (LONGLONG)start + (LONGLONG)sent * kResendMs) {
            if (!SendRequest(d, cmd, (BYTE)(sent & 1))) return false;
            ++sent;
        }
        LONGLONG nextSend = (LONGLONG)start + (LONGLONG)sent * kResendMs;
        int wait = (int)(std::min<LONGLONG>(nextSend, (LONGLONG)end) - now);
        if (wait < 1) wait = 1;
        ULONGLONG before = GetTickCount64();
        int n = d.Read(r, wait);
        // A read that fails at once is an I/O error (receiver unplugged), not a timeout: stop.
        if (n < 0 && (int)(GetTickCount64() - before) + 20 < wait) return false;
        if (n < 20) continue;  // timeout (resend or give up above) or a short unrelated report
        if (r[0] != 0x13) continue;
        if ((r[1] & 0x7F) != cmd) continue;  // the receiver also pushes unrelated 0x13 frames
        if (std::all_of(r.begin() + 4, r.begin() + 19, [](BYTE b) { return b == 0; })) continue;  // echo of a request
        bool checksum = r[19] == Sum(r, 19);
        bool mchose = r[19] == 0 && r[2] == 1 && r[3] == 0;  // MCHOSE leaves the trailer at 0
        if (!checksum && !mchose) continue;
        return true;
    }
}

// M HUB reads the model code from bytes 5..10. One user capture (myfinder-device-battery issue 476)
// had it one byte earlier, so byte 4 is tried too. A code that matches neither leaves the model unknown.
const wchar_t* IdentifyModel(HidDev& d) {
    std::vector<BYTE> r;
    if (!Exchange(d, 0x05, r, 1300)) return nullptr;
    for (size_t off : { (size_t)5, (size_t)4 })
        for (const auto& m : kModels)
            if (std::memcmp(&r[off], m.code, 6) == 0) return m.name;
    return nullptr;
}

// --- HERO 68 Air / 8K Wireless Receiver (372E:106C) ---

constexpr BYTE kHeroId = 0x09, kHeroMagic = 0x66;
constexpr BYTE kHeroData = 0x0E, kHeroAck = 0x00, kHeroTrailerHost = 0x08, kHeroTrailerDev = 0x07;
constexpr int kHeroDeadlineMs = 1000;  // the whole exchange takes ~30 ms when the keyboard is awake
constexpr int kHeroResendMs = 150;     // resend a frame the keyboard has not acknowledged yet

BYTE SumRange(const std::vector<BYTE>& b, size_t from, size_t to) {
    unsigned s = 0;
    for (size_t i = from; i < to; i++) s += b[i];
    return (BYTE)(s & 0xFF);
}

// Bytes 0..4 of a frame; the 3-bit counter lives in the top bits of bytes 2, 3 and 4.
std::vector<BYTE> HeroHeader(int counter, BYTE index, BYTE type) {
    std::vector<BYTE> f(20, 0);
    f[0] = kHeroId;
    f[1] = kHeroMagic;
    f[2] = (BYTE)(0x05 | ((counter & 4) ? 0x80 : 0));
    f[3] = (BYTE)(index | ((counter & 2) ? 0x80 : 0));
    f[4] = (BYTE)(type | ((counter & 1) ? 0x80 : 0));
    return f;
}

std::vector<BYTE> HeroDataFrame(int counter, BYTE index, const std::vector<BYTE>& msg) {
    std::vector<BYTE> f = HeroHeader(counter, index, kHeroData);
    for (int i = 0; i < 14; i++) f[5 + i] = msg[(index - 1) * 14 + i];
    f[19] = SumRange(f, 1, 19);
    return f;
}

std::vector<BYTE> HeroTrailer(int counter, const std::vector<BYTE>& msg) {
    std::vector<BYTE> f = HeroHeader(counter, 5, kHeroTrailerHost);
    f[12] = (BYTE)(0xFF - SumRange(msg, 0, msg.size()));
    f[13] = SumRange(f, 1, 13);
    return f;
}

std::vector<BYTE> HeroAck(const std::vector<BYTE>& r) {
    std::vector<BYTE> f(20, 0);
    f[0] = kHeroId;
    f[1] = kHeroMagic;
    f[2] = r[2];
    f[3] = r[3];
    f[4] = (BYTE)(r[4] & 0x80);
    f[5] = SumRange(f, 1, 5);
    return f;
}

bool IsAckFor(const std::vector<BYTE>& r, const std::vector<BYTE>& f) {
    return (r[4] & 0x7F) == kHeroAck && r[2] == f[2] && r[3] == f[3] && (r[4] & 0x80) == (f[4] & 0x80) &&
            r[5] == SumRange(r, 1, 5);
}

class HeroLink {
public:
    explicit HeroLink(HidDev& d) : d_(d), end_(GetTickCount64() + kHeroDeadlineMs) {}

    // Sends the 4 data frames and the trailer, each one only after the previous was acknowledged.
    bool SendMessage(const std::vector<BYTE>& msg) {
        int counter = 1;  // AULA Hub starts a session at 1 as well
        for (BYTE i = 1; i <= 4; i++, counter = (counter + 1) & 7)
            if (!SendFrame(HeroDataFrame(counter, i, msg))) return false;
        return SendFrame(HeroTrailer(counter, msg));
    }

    // Reads (and acknowledges) the keyboard's frames until the reply has been received in full.
    bool WaitForBattery() {
        std::vector<BYTE> r;
        while (!(level_ >= 0 && replyDone_)) {
            if (!ReadFrame(r, Remaining())) break;
        }
        return level_ >= 0;
    }

    int level() const { return level_; }
    bool charging() const { return flags_ >= 0 && (flags_ & 0x10) != 0; }

private:
    int Remaining() const {
        LONGLONG left = (LONGLONG)end_ - (LONGLONG)GetTickCount64();
        return left > 0 ? (int)left : 0;
    }

    bool SendFrame(const std::vector<BYTE>& f) {
        std::vector<BYTE> r;
        while (Remaining() > 0) {
            if (!d_.Write(f)) return false;
            ULONGLONG resendAt = GetTickCount64() + kHeroResendMs;
            for (;;) {
                LONGLONG wait = std::min<LONGLONG>((LONGLONG)resendAt - (LONGLONG)GetTickCount64(), Remaining());
                if (wait <= 0) break;
                if (!ReadFrame(r, (int)wait)) {
                    if (ioError_) return false;
                    break;
                }
                if (IsAckFor(r, f)) return true;
            }
        }
        return false;
    }

    // Reads one HERO frame, acknowledges keyboard data/trailer frames and picks up the battery.
    // Returns false on timeout or I/O error.
    bool ReadFrame(std::vector<BYTE>& r, int waitMs) {
        for (;;) {
            if (waitMs <= 0) return false;
            ULONGLONG before = GetTickCount64();
            int n = d_.Read(r, waitMs);
            int took = (int)(GetTickCount64() - before);
            // A read that fails at once is an I/O error (receiver unplugged), not a timeout: stop.
            if (n < 0 && took + 20 < waitMs) {
                ioError_ = true;
                return false;
            }
            if (n < 0) return false;
            waitMs -= took;
            if (n < 20 || r[0] != kHeroId || r[1] != kHeroMagic) continue;  // unrelated report
            BYTE type = r[4] & 0x7F;
            if (type == kHeroData) {
                if (r[19] != SumRange(r, 1, 19)) continue;  // damaged: no ACK, the keyboard resends
                d_.Write(HeroAck(r));
                if ((r[3] & 0x7F) == 1) Inspect(r);
            } else if (type == kHeroTrailerDev) {
                d_.Write(HeroAck(r));
                if (inReply_) replyDone_ = true;
                inReply_ = false;
            }
            return true;
        }
    }

    // First data frame of a keyboard message: payload starts at byte 5.
    void Inspect(const std::vector<BYTE>& r) {
        inReply_ = false;
        if (r[5] == 0x87 && r[11] >= 1 && r[11] <= 100) {  // reply to our request
            level_ = r[11];
            flags_ = r[12];
            inReply_ = true;
        } else if (r[5] == 0xFE && r[6] == 0x05 && r[7] >= 1 && r[7] <= 100 && level_ < 0) {
            level_ = r[7];  // pushed by the keyboard on its own; keep waiting for the real reply
            flags_ = r[8];
        }
    }

    HidDev& d_;
    ULONGLONG end_;
    int level_ = -1, flags_ = -1;  // flags: the byte after the level, 0x10 while charging
    bool inReply_ = false, replyDone_ = false, ioError_ = false;
};

bool QueryHeroBattery(HidDev& d, int& level, bool& charging) {
    std::vector<BYTE> msg(56, 0);
    msg[0] = 0x09;
    msg[1] = 0x87;  // battery
    msg[4] = 0x01;
    d.Flush();
    HeroLink link(d);
    if (!link.SendMessage(msg)) return false;
    if (!link.WaitForBattery()) return false;
    level = link.level();
    charging = link.charging();
    return true;
}

}  // namespace

void PollAula(PollContext& ctx) {
    for (const auto& rcv : kReceivers) {
        USHORT vid = rcv.vid, pid = rcv.pid;
        if (ctx.IsClaimed(vid, pid)) continue;
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return (c.page() == 0xFF02 || c.page() == 0xFF04) && c.usage() == 0x0002 && c.outLen() >= 20 &&
                        c.inLen() >= 20;
             })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            // Only the generic receiver names carry a model code (M HUB asks no other device).
            std::wstring product = HidProduct(*c);
            bool generic = product.find(L"2.4G Wireless Receiver") != std::wstring::npos ||
                           product.find(L"MCHOSE 2.4G Wireless") != std::wstring::npos;
            const wchar_t* model = generic ? IdentifyModel(d) : nullptr;
            bool mchose = vid == 0x41E4 || model != nullptr;
            std::vector<BYTE> r;
            // Byte 2 alternates 00 / 01 on resends; M HUB sends 01, the AULA references 00.
            if (!Exchange(d, 0x4A, r, 4000)) continue;
            int level = r[5];
            if (level < 1 || level > 100) continue;
            DeviceStatus s;
            s.key = L"aula:" + Hex4(vid) + L":" + Hex4(pid);
            s.name = model ? model : mchose ? L"MCHOSE wireless keyboard" : L"AULA wireless keyboard";
            s.kind = DeviceKind::Keyboard;
            s.via = L"2.4 GHz receiver";
            s.percent = level;
            s.charging = (r[6] >> 4) == 1;  // high nibble: AULA's 0x10 cable flag, M HUB's chargeStatus
            ctx.Add(s, vid, pid);
            break;
        }
    }

    for (auto [vid, pid] : ctx.Products(0x372E)) {
        if (pid != 0x106C) continue;  // HERO 68 Air "8K Wireless Receiver"; other 372E products are unknown
        for (const HidColl* c : ctx.Find(vid, pid, [](const HidColl& c) {
                 return c.page() == 0xFF60 && c.usage() == 0x0061 && c.outLen() >= 20 && c.inLen() >= 20;
             })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            int level = -1;
            bool charging = false;
            if (!QueryHeroBattery(d, level, charging)) continue;
            DeviceStatus s;
            s.key = L"aula:" + Hex4(vid) + L":" + Hex4(pid);
            s.name = L"AULA wireless keyboard";
            s.kind = DeviceKind::Keyboard;
            s.via = L"2.4 GHz receiver";
            s.percent = level;
            s.charging = charging;
            ctx.Add(s, vid, pid);
            break;
        }
    }
}
