// Logitech HID++ (VID 046D): Unifying / Bolt / Lightspeed / Nano receivers, wired or Bluetooth
// devices, and G headsets. Features are discovered through the root feature, so devices are
// supported without a per-model table.
//
// Message: [report][device index][feature index][function << 4 | sw id][params...]
//   report 0x10 = short (7 bytes), 0x11 = long (20 bytes)
//   HID++ 2.0 error: [.., 0xFF, feature, fn|sw, code]   HID++ 1.0 error: [.., 0x8F, sub id, address, code]
// Battery features: 0x1004 unified battery, 0x1000 battery level, 0x1001 battery voltage,
// 0x1F20 ADC measurement (headsets). HID++ 1.0 devices: registers 0x0D and 0x07.
// References: Logitech HID++ 2.0 specification drafts, github.com/pwr-Solaar/Solaar,
// github.com/Sapd/HeadsetControl (headset voltage calibration).
#include "drivers.h"

#include <cwctype>
#include <optional>

namespace {

constexpr BYTE kSwId = 0x0D;  // our software id; replies to other apps (G HUB, Options+) carry theirs

class Hidpp {
public:
    bool Open(const HidColl* shortC, const HidColl* longC) {
        if (shortC) hasShort_ = s_.Open(*shortC);
        if (longC) hasLong_ = l_.Open(*longC);
        return hasShort_ || hasLong_;
    }
    bool hasLong() const { return hasLong_; }

    // Sends a request and waits for its reply. Returns 1 = reply (params in `p`), 0 = error reply
    // (code in `err`), -1 = no answer.
    int Request(BYTE idx, BYTE b2, BYTE b3, std::initializer_list<BYTE> params, std::vector<BYTE>& p, BYTE& err,
                bool forceShort = false, int timeoutMs = 500) {
        bool useLong = hasLong_ && !forceShort;
        if (!useLong && !hasShort_) return -1;
        std::vector<BYTE> msg(useLong ? 20 : 7, 0);
        msg[0] = useLong ? 0x11 : 0x10;
        msg[1] = idx;
        msg[2] = b2;
        msg[3] = b3;
        size_t i = 4;
        for (BYTE v : params) if (i < msg.size()) msg[i++] = v;
        if (!(useLong ? l_ : s_).Write(msg)) return -1;

        ULONGLONG end = GetTickCount64() + timeoutMs;
        std::vector<BYTE> r;
        while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
            for (HidDev* d : { &l_, &s_ }) {
                if (!d->ok() || d->Read(r, 15) < 7) continue;
                if ((r[0] != 0x10 && r[0] != 0x11) || r[1] != idx) continue;
                if (r[2] == b2 && r[3] == b3) {
                    p.assign(r.begin() + 4, r.end());
                    return 1;
                }
                if ((r[2] == 0xFF || r[2] == 0x8F) && r[3] == b2 && r[4] == b3) {
                    err = r[5];
                    return 0;
                }
            }
        }
        return -1;
    }

    // HID++ 2.0 call: feature index + function number.
    int Call(BYTE idx, BYTE feature, BYTE fn, std::initializer_list<BYTE> params, std::vector<BYTE>& p) {
        BYTE err = 0;
        return Request(idx, feature, (BYTE)((fn << 4) | kSwId), params, p, err) == 1 ? 1 : 0;
    }

    BYTE FeatureIndex(BYTE idx, USHORT featureId) {
        std::vector<BYTE> p;
        if (Call(idx, 0x00, 0, { (BYTE)(featureId >> 8), (BYTE)featureId }, p) && !p.empty()) return p[0];
        return 0;
    }

private:
    HidDev s_, l_;
    bool hasShort_ = false, hasLong_ = false;
};

// Voltage -> % for a typical Li-ion cell (mice/keyboards).
int LiIonPercent(int mv) {
    static const int v[] = { 4186, 4067, 3989, 3922, 3859, 3811, 3778, 3751, 3717, 3671, 3646, 3579, 3500 };
    static const int p[] = { 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 2, 0 };
    return Interpolate(mv, v, p, 13);
}

// Voltage -> % for G headsets (calibration from HeadsetControl).
int HeadsetPercent(USHORT pid, int mv) {
    static const int g533v[] = { 4200, 3850, 3790, 3750, 3680, 3330 }, g533p[] = { 100, 50, 30, 20, 5, 0 };
    static const int g535v[] = { 4175, 3817, 3766, 3730, 3664, 3310 }, g535p[] = { 100, 50, 30, 20, 5, 0 };
    static const int g633v[] = { 4100, 3950, 3850, 3750, 3650, 3500, 3300, 3150 }, g633p[] = { 100, 80, 60, 40, 20, 10, 5, 0 };
    static const int gprov[] = { 4150, 3830, 3780, 3740, 3670, 3320 }, gprop[] = { 100, 50, 30, 20, 5, 0 };
    static const int defv[] = { 4100, 3850, 3780, 3730, 3650, 3300 }, defp[] = { 100, 50, 30, 20, 5, 0 };
    switch (pid) {
        case 0x0A66: return Interpolate(mv, g533v, g533p, 6);
        case 0x0AC4: return Interpolate(mv, g535v, g535p, 6);
        case 0x0A5C: case 0x0A89: case 0x0A5B: case 0x0A87: case 0x0AB5: case 0x0AFE: return Interpolate(mv, g633v, g633p, 8);
        case 0x0AA7: case 0x0AAA: case 0x0ABA: case 0x0AFB: return Interpolate(mv, gprov, gprop, 6);
        default: return Interpolate(mv, defv, defp, 6);
    }
}

DeviceKind KindFromType(BYTE t) {
    switch (t) {
        case 0x00: case 0x02: return DeviceKind::Keyboard;
        case 0x03: case 0x04: case 0x05: return DeviceKind::Mouse;
        case 0x08: return DeviceKind::Headset;
        case 0x0B: case 0x0C: return DeviceKind::Gamepad;
        default: return DeviceKind::Other;
    }
}

// Fills battery fields from whichever battery feature the device has. Returns false if none.
bool ReadBattery20(Hidpp& h, BYTE idx, USHORT pid, DeviceStatus& s) {
    std::vector<BYTE> p;
    if (BYTE f = h.FeatureIndex(idx, 0x1004)) {  // UNIFIED_BATTERY: get_status (fn 1)
        if (h.Call(idx, f, 1, {}, p) && p.size() >= 3) {
            int soc = p[0], level = p[1], st = p[2];
            if (soc > 0 && soc <= 100) {
                s.percent = soc;
            } else if (level) {
                s.percent = (level & 8) ? 100 : (level & 4) ? 60 : (level & 2) ? 20 : 5;
                s.levelText = (level & 8) ? L"Full" : (level & 4) ? L"Good" : (level & 2) ? L"Low" : L"Critical";
            }
            s.charging = st == 1 || st == 2 || st == 3;
            return true;
        }
    }
    if (BYTE f = h.FeatureIndex(idx, 0x1000)) {  // BATTERY_STATUS: GetBatteryLevelStatus (fn 0)
        if (h.Call(idx, f, 0, {}, p) && p.size() >= 3) {
            int st = p[2];
            s.charging = st >= 1 && st <= 4;
            s.percent = p[0] <= 100 ? p[0] : -1;
            if (s.percent == 0 && st == 3) s.percent = 100;
            return true;
        }
    }
    if (BYTE f = h.FeatureIndex(idx, 0x1001)) {  // BATTERY_VOLTAGE: GetBatteryInfo (fn 0)
        if (h.Call(idx, f, 0, {}, p) && p.size() >= 3) {
            s.millivolts = (p[0] << 8) | p[1];
            s.charging = (p[2] & 0x80) != 0;
            if (s.millivolts) s.percent = LiIonPercent(s.millivolts);
            return true;
        }
    }
    if (BYTE f = h.FeatureIndex(idx, 0x1F20)) {  // ADC_MEASUREMENT (headsets)
        if (h.Call(idx, f, 0, {}, p) && p.size() >= 3) {
            s.millivolts = (p[0] << 8) | p[1];
            s.charging = p[2] == 0x03;
            if (s.millivolts) s.percent = HeadsetPercent(pid, s.millivolts);
            return true;
        }
    }
    return false;
}

void ReadNameAndType20(Hidpp& h, BYTE idx, DeviceStatus& s) {
    BYTE f = h.FeatureIndex(idx, 0x0005);  // DEVICE_NAME
    if (!f) return;
    std::vector<BYTE> p;
    if (h.Call(idx, f, 0, {}, p) && !p.empty()) {
        int len = p[0];
        std::string name;
        while ((int)name.size() < len) {
            if (!h.Call(idx, f, 1, { (BYTE)name.size() }, p) || p.empty()) break;
            size_t before = name.size();
            for (BYTE ch : p) {
                if ((int)name.size() >= len || !ch) break;
                name += (char)ch;
            }
            if (name.size() == before) break;
        }
        if (!name.empty()) {
            std::wstring w(name.begin(), name.end());
            s.name = (w.rfind(L"Logitech", 0) == 0 || w.rfind(L"G ", 0) == 0 || w.rfind(L"MX", 0) == 0) ? w : L"Logitech " + w;
        }
    }
    if (h.Call(idx, f, 2, {}, p) && !p.empty()) s.kind = KindFromType(p[0]);
}

// DEVICE_INFORMATION (0x0003) getDeviceInfo: [entity count][unit id x4][transport x2][model id x6]...
// The unit id identifies the physical device, so a mouse keeps one entry whether it is reached
// through its receiver or directly over its charging cable (where it shows up under another
// product id and device index). Returns an empty string if the device does not report one.
std::wstring ReadUnitId20(Hidpp& h, BYTE idx) {
    BYTE f = h.FeatureIndex(idx, 0x0003);
    if (!f) return L"";
    std::vector<BYTE> p;
    if (!h.Call(idx, f, 0, {}, p) || p.size() < 5) return L"";
    if (!p[1] && !p[2] && !p[3] && !p[4]) return L"";
    return Hex4((USHORT)((p[1] << 8) | p[2])) + Hex4((USHORT)((p[3] << 8) | p[4]));
}

// HID++ 1.0 devices: register 0x0D (battery %) or 0x07 (battery level 1..7).
bool ReadBattery10(Hidpp& h, BYTE idx, DeviceStatus& s) {
    std::vector<BYTE> p;
    BYTE err;
    if (h.Request(idx, 0x81, 0x0D, {}, p, err, true) == 1 && p.size() >= 3 && p[0] && p[0] <= 100) {
        s.percent = p[0];
        s.charging = p[2] >= 0x21 && p[2] <= 0x26;
        return true;
    }
    if (h.Request(idx, 0x81, 0x07, {}, p, err, true) == 1 && p.size() >= 2 && p[0]) {
        static const int pct[] = { 0, 5, 10, 20, 35, 50, 75, 100 };
        s.percent = pct[p[0] > 7 ? 7 : p[0]];
        s.levelText = p[0] >= 7 ? L"Full" : p[0] >= 5 ? L"Good" : p[0] >= 3 ? L"Low" : L"Critical";
        s.charging = p[1] >= 0x21 && p[1] <= 0x26;
        return true;
    }
    return false;
}

}  // namespace

void PollLogitech(PollContext& ctx) {
    for (auto [vid, pid] : ctx.Products(0x046D)) {
        auto shorts = ctx.Find(vid, pid, [](const HidColl& c) { return c.page() == 0xFF00 && c.usage() == 0x0001 && c.outLen() == 7; });
        auto longs = ctx.Find(vid, pid, [](const HidColl& c) {
            return ((c.page() == 0xFF00 && c.usage() == 0x0002) || (c.page() == 0xFF43 && c.usage() == 0x0202)) && c.outLen() == 20;
        });
        if (shorts.empty() && longs.empty()) continue;
        Hidpp h;
        if (!h.Open(shorts.empty() ? nullptr : shorts[0], longs.empty() ? nullptr : longs[0])) continue;

        std::wstring product = HidProduct(longs.empty() ? *shorts[0] : *longs[0]);
        bool isReceiver = product.find(L"Receiver") != std::wstring::npos || product.find(L"USB Receiver") != std::wstring::npos;

        // A device answering a HID++ 2.0 ping at index 0xFF is connected directly (USB cable,
        // Bluetooth, or a receiver-less headset); otherwise it is a receiver with paired devices.
        std::vector<BYTE> p;
        BYTE err = 0;
        std::vector<BYTE> indices;
        // A Bluetooth HID path (HOGP service 1812, classic HID 1124) is always a direct link. A sleepy
        // Bluetooth mouse can miss the 400 ms ping; probing it as a receiver then answers on every
        // index and lists the same mouse six times.
        std::wstring path = (longs.empty() ? shorts[0] : longs[0])->path;
        for (auto& ch : path) ch = towlower(ch);
        bool bluetooth = path.find(L"{00001812-") != std::wstring::npos || path.find(L"{00001124-") != std::wstring::npos;
        if (bluetooth ||
            (!isReceiver && h.Request(0xFF, 0x00, 0x10 | kSwId, { 0, 0, 0x5A }, p, err, false, 400) == 1 && p.size() >= 3 && p[0] >= 2))
            indices = { 0xFF };
        else
            indices = { 1, 2, 3, 4, 5, 6 };

        bool any = false;
        for (BYTE idx : indices) {
            DeviceStatus s;
            s.key = L"logi:" + Hex4(pid) + L":" + std::to_wstring(idx);
            s.name = (idx == 0xFF && !product.empty()) ? product : L"Logitech wireless device";
            s.via = idx == 0xFF ? L"USB / Bluetooth" : L"Logitech receiver";
            s.graceSec = idx == 0xFF ? 0 : 1800;  // receiver devices drop off the link while sleeping
            s.kind = GuessKind(s.name);

            int r = h.Request(idx, 0x00, 0x10 | kSwId, { 0, 0, 0x5A }, p, err, false, 400);
            bool found = false;
            if (r == 1 && p.size() >= 3 && p[0] >= 2) {
                ReadNameAndType20(h, idx, s);
                found = ReadBattery20(h, idx, pid, s);
                std::wstring unit = found ? ReadUnitId20(h, idx) : L"";
                if (!unit.empty()) {
                    s.key = L"logi:unit:" + unit;
                    // Unplugging the cable hands a receiver device back to its receiver; keep the
                    // entry for a minute so it does not blink out while the link comes back.
                    if (idx == 0xFF) s.graceSec = 60;
                }
                if (found && s.kind == DeviceKind::Other && longs.size() && longs[0]->page() == 0xFF43) s.kind = DeviceKind::Headset;
            } else if (r == 0 && err == 0x01) {  // "invalid sub id": a HID++ 1.0 device
                found = ReadBattery10(h, idx, s);
            }
            if (found) {
                if (s.kind == DeviceKind::Other) s.kind = GuessKind(s.name);
                ctx.out.push_back(s);
                any = true;
            }
        }
        if (any) ctx.Claim(vid, pid);
    }
}
