#pragma once
// Thin Win32 HID layer shared by all drivers.
//
// Report buffers follow hidapi conventions so protocol code from other projects maps 1:1:
//  * Write/SetFeature: data[0] is the report ID (0 when the device does not number its reports);
//    the buffer is zero-padded to the report length.
//  * Read: a leading 0 report ID is stripped, so data[0] is the first payload byte for
//    unnumbered reports and the report ID for numbered ones.
#include <windows.h>
#include <hidsdi.h>
#include <hidpi.h>

#include <initializer_list>
#include <string>
#include <vector>

#include "devices.h"

struct HidColl {
    std::wstring path;
    USHORT vid = 0, pid = 0;
    int iface = -1;  // USB interface number (MI_xx in the path), -1 when unknown
    HIDP_CAPS caps{};
    USHORT page() const { return caps.UsagePage; }
    USHORT usage() const { return caps.Usage; }
    USHORT inLen() const { return caps.InputReportByteLength; }
    USHORT outLen() const { return caps.OutputReportByteLength; }
    USHORT featLen() const { return caps.FeatureReportByteLength; }
};

std::vector<HidColl> EnumHid();

class HidDev {
public:
    HidDev() = default;
    ~HidDev() { Close(); }
    HidDev(const HidDev&) = delete;
    HidDev& operator=(const HidDev&) = delete;

    bool Open(const HidColl& c);            // read/write, overlapped
    bool OpenReadOnly(const HidColl& c);    // read only, overlapped: for push-only collections another app may hold
    bool OpenFeatureOnly(const HidColl& c);  // zero access: enough for feature reports, works on mice/keyboards
    void Close();
    bool ok() const { return h_ != INVALID_HANDLE_VALUE; }
    const HidColl& coll() const { return c_; }

    bool Write(const std::vector<BYTE>& data, int timeoutMs = 500);
    bool Write(std::initializer_list<BYTE> data, int timeoutMs = 500) { return Write(std::vector<BYTE>(data), timeoutMs); }
    // Reads one input report into `buf` (resized to fit). Returns the byte count, or -1 on timeout/error.
    int Read(std::vector<BYTE>& buf, int timeoutMs);
    // For collections without an interrupt OUT pipe (WriteFile fails there): arms a read, sends
    // `data` with HidD_SetOutputReport, and returns the first input report like Read() does.
    int SetOutputAndRead(const std::vector<BYTE>& data, std::vector<BYTE>& buf, int timeoutMs);
    void Flush();  // discard queued input reports

    bool SetFeature(const std::vector<BYTE>& data);
    bool GetFeature(BYTE reportId, std::vector<BYTE>& out);  // out[0] = report ID

private:
    HANDLE h_ = INVALID_HANDLE_VALUE;
    bool overlapped_ = false;
    HidColl c_;
};

std::wstring HidProduct(const HidColl& c);
std::wstring Hex4(USHORT v);
int Clamp100(int v);
int MapTo100(int v, int lo, int hi);  // linear map lo..hi -> 0..100, clamped
// Piecewise-linear interpolation through (mv[i], pct[i]); tables sorted by descending voltage.
int Interpolate(int mv, const int* mvTable, const int* pctTable, int n);
DeviceKind GuessKind(const std::wstring& name);
// Device type from the top-level collections a device exposes (mouse > gamepad > keyboard).
DeviceKind KindFromCollections(const std::vector<HidColl>& all, USHORT vid, USHORT pid);
