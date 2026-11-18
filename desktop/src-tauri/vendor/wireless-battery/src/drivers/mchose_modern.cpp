// MCHOSE "new" wireless mice on the 2.4 GHz receiver (VID 3837): K7 V2 Ultra+ (receiver 3837:1014)
// and the other Nordic models M HUB groups with it (receiver ids 0x1014, 0x1018, 0x1016, 0x102C,
// 0x102D). The receiver exposes vendor collection FF01:0001 (64-byte input/output reports) and
// answers a 64-byte "device info" frame:
//   request: output report id 0x4D:
//            [4D][01][flags 01 = read][len 00][cmd lo][cmd hi][biz][seq][xor of bytes 2..7]
//            command 0x0900 = read device info, which carries the battery
//   reply:   input report id 0x4D, same header, then len bytes of data and a checksum:
//            [4D][01][flags][len][cmd lo][cmd hi][biz][seq][data ...][xor of bytes 2..7+len]
//            data[0..1] = vendor id (3837), data[2..3] = paired model id, data[10] = link status
//            (0 = receiver present, mouse not linked), data[11] = charge status (1 = charging),
//            data[12] = battery percent, data[13] = game mode
//            With the mouse switched off the receiver still answers, but with len = 1 and a single
//            0xFF in place of the model id (4D 01 01 01 00 09 00 00 FF 00 ...): no battery data, so
//            the device is reported as asleep rather than dropped. Verified on the K7 V2 Ultra+.
// Protocol from MCHOSE's own M HUB web driver (cdn.mchose.com.cn, assets/main-DQZs6ZzX.js:
// getCommandBuffer, mcReadCommand, readDeviceInfo with commandId 0x0900, deviceInfoToObj), and the
// same frame is documented in github.com/HifumiDaisuki01/MchoseBatteryTray (PROTOCOL.md,
// ModernRequest/ParseModern). Confirmed on a real K7 V2 Ultra+ receiver (3837:1014): 29% reported,
// matching M HUB.
// The G3 V2 driver (mchose_g3.cpp) speaks a different protocol on FF01:0010; this one needs FF01:0001
// and report 0x4D, which the 0x1014 receiver does not expose through the feature-report path.
#include "drivers.h"

namespace {

const USHORT kVid = 0x3837;
// M HUB's newMouseWirelessPids: receivers of the "new" MCHOSE mice. Only 0x1014 was tested.
const USHORT kReceivers[] = { 0x1014, 0x1018, 0x1016, 0x102C, 0x102D };

const BYTE kReport = 0x4D;
const USHORT kCmdDeviceInfo = 0x0900;
const size_t kData = 8;  // first byte of the data block in both the request and the reply

BYTE Xor(const std::vector<BYTE>& b, size_t from, size_t to) {  // both ends inclusive
    BYTE x = 0;
    for (size_t i = from; i <= to && i < b.size(); i++) x ^= b[i];
    return x;
}

// Returns 1 for a status frame, 0 for a valid frame that says the mouse is not linked, -1 otherwise.
int ParseInfo(const std::vector<BYTE>& r, int& percent, bool& charging) {
    if (r.size() < kData + 2 || r[0] != kReport) return -1;
    if ((USHORT)(r[4] | (r[5] << 8)) != kCmdDeviceInfo) return -1;
    const size_t len = r[3];
    if (kData + len >= r.size()) return -1;
    // While the mouse is off or asleep the receiver answers with the header only, a single 0xFF in
    // place of the model id and a zeroed data area (4D 01 01 01 00 09 00 00 FF 00 ...), so anything
    // shorter than the 14-byte device-info payload means "not linked" rather than "bad checksum".
    if (len < 14) return 0;
    if (r[kData + len] != Xor(r, 2, 7 + len)) return -1;
    if ((USHORT)(r[kData] | (r[kData + 1] << 8)) != kVid) return -1;
    if (r[kData + 10] == 0) return 0;  // not linked: the mouse is off or asleep
    if (r[kData + 12] > 100) return -1;
    percent = r[kData + 12];
    charging = r[kData + 11] == 1;
    return 1;
}

}  // namespace

void PollMchoseModern(PollContext& ctx) {
    for (USHORT pid : kReceivers) {
        for (const HidColl* c : ctx.Find(kVid, pid, [](const HidColl& c) {
                 return (c.page() == 0xFF01 || c.page() == 0xFF0B) && c.outLen() >= 64 && c.inLen() >= 21;
             })) {
            HidDev d;
            if (!d.Open(*c)) continue;
            d.Flush();
            int state = -1, percent = -1;
            bool charging = false;
            for (int attempt = 0; attempt < 3 && state < 0; attempt++) {
                if (attempt) Sleep(150);
                std::vector<BYTE> req(c->outLen(), 0);
                req[0] = kReport;
                req[1] = 0x01;
                req[2] = 0x01;  // read
                req[4] = (BYTE)(kCmdDeviceInfo & 0xFF);
                req[5] = (BYTE)(kCmdDeviceInfo >> 8);
                req[kData] = Xor(req, 2, 7);
                if (!d.Write(req)) continue;
                ULONGLONG end = GetTickCount64() + 1000;
                std::vector<BYTE> r;
                while ((LONGLONG)end - (LONGLONG)GetTickCount64() > 0) {
                    int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
                    int n = d.Read(r, left);
                    if (n < 0) break;
                    int st = ParseInfo(r, percent, charging);
                    if (st >= 0) {
                        state = st;
                        break;
                    }
                }
            }
            if (state < 0) continue;
            DeviceStatus s;
            s.key = L"mchose:" + Hex4(kVid) + L":" + Hex4(pid);
            s.name = HidProduct(*c);
            if (s.name.empty()) s.name = L"MCHOSE mouse";
            s.kind = DeviceKind::Mouse;
            s.via = L"2.4 GHz receiver";
            s.graceSec = 1800;
            if (state == 1) {
                s.percent = Clamp100(percent);
                s.charging = charging;
            } else {
                s.asleep = true;
            }
            ctx.Add(s, kVid, pid);
            break;
        }
    }
}
