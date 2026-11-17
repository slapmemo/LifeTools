// DAREU EM901X receiver (260D:1074), verified on hardware. Battery query from the official
// EM901X AIM-WL driver v1.0 (GetPower / SendCommand); protocol analysis:
// github.com/wushuai0802/myfinder-device-battery/blob/main/engine/upstream-protocols.md
// Unlike the Kysona transport, Feature 08 is sent on FF02:0002 and Input 09 arrives on
// the sibling FF01:0000 collection. Only command 04 is needed; no initialization/settings.
// Reply: [09][04][status=0]...[6=percent][7=charging]. No reply checksum rule is established.
#include "drivers.h"

void PollDareu(PollContext& ctx) {
    const USHORT vid = 0x260D, pid = 0x1074;
    if (ctx.IsClaimed(vid, pid)) return;
    auto inputs = ctx.Find(vid, pid, [](const HidColl& c) {
        return c.iface == 1 && c.page() == 0xFF01 && c.usage() == 0 && c.inLen() == 17;
    });
    auto features = ctx.Find(vid, pid, [](const HidColl& c) {
        return c.iface == 1 && c.page() == 0xFF02 && c.usage() == 2 && c.featLen() == 17;
    });
    // Do not pair arbitrary collections when multiple receivers are present.
    if (inputs.size() != 1 || features.size() != 1) return;

    HidDev input, feature;
    if (!input.Open(*inputs[0]) || !feature.OpenFeatureOnly(*features[0])) return;
    std::vector<BYTE> req(17, 0), r;
    req[0] = 0x08;
    req[1] = 0x04;
    req[16] = 0x49;  // 0x55 minus the sum of bytes 0..15
    input.Flush();
    if (!feature.SetFeature(req)) return;
    ULONGLONG end = GetTickCount64() + 1000;
    for (int reports = 0; reports < 32; reports++) {
        int left = (int)((LONGLONG)end - (LONGLONG)GetTickCount64());
        if (left <= 0 || input.Read(r, left) < 0) return;
        if (r.size() != 17 || r[0] != 0x09 || r[1] != 0x04 || r[2] != 0 || r[6] > 100) continue;
        DeviceStatus s;
        s.key = L"dareu:" + Hex4(vid) + L":" + Hex4(pid);
        s.name = L"DAREU EM901X";
        s.kind = DeviceKind::Mouse;
        s.via = L"2.4 GHz receiver";
        s.percent = r[6];
        s.charging = r[7] != 0;
        ctx.Add(s, vid, pid);
        return;
    }
}
