// Phones linked with Microsoft Phone Link (formerly "Your Phone"), over Wi-Fi or Bluetooth.
// Phone Link keeps the Windows 11 Start menu companion card up to date in its package folder:
//   %LOCALAPPDATA%\Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalState\StartMenu\StartMenuCompanion.json
// It is an Adaptive Card whose "speak" field reads "<phone name> - Connected to your PC" and
// whose battery element carries the tooltip "Battery <n>% remaining". Only those two fields are
// read; the rest of the card (notification previews) is ignored.
// The file is an undocumented Phone Link implementation detail, so the parse is strict: anything
// unexpected means no phone is reported. Read-only, no device or network access.
#include "drivers.h"

#include <cwctype>

namespace {

// A card that has not been rewritten for this long is shown dimmed, as a last known value.
constexpr ULONGLONG kStaleSec = 3 * 60 * 60;

bool ReadUtf8File(const std::wstring& path, std::wstring& out, FILETIME& written) {
    HANDLE h = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER size{};
    bool ok = GetFileSizeEx(h, &size) && size.QuadPart > 0 && size.QuadPart < 4 * 1024 * 1024 && GetFileTime(h, nullptr, nullptr, &written);
    std::string bytes;
    if (ok) {
        bytes.resize((size_t)size.QuadPart);
        DWORD got = 0;
        ok = ReadFile(h, bytes.data(), (DWORD)bytes.size(), &got, nullptr) && got == bytes.size();
    }
    CloseHandle(h);
    if (!ok) return false;
    int n = MultiByteToWideChar(CP_UTF8, 0, bytes.data(), (int)bytes.size(), nullptr, 0);
    if (n <= 0) return false;
    out.resize(n);
    MultiByteToWideChar(CP_UTF8, 0, bytes.data(), (int)bytes.size(), out.data(), n);
    return true;
}

// Value of the first JSON string field `"key":"..."` (simple escapes only).
bool JsonString(const std::wstring& json, const wchar_t* key, std::wstring& value) {
    std::wstring pat = L"\"" + std::wstring(key) + L"\":\"";
    size_t i = json.find(pat);
    if (i == std::wstring::npos) return false;
    value.clear();
    for (i += pat.size(); i < json.size() && json[i] != L'"'; i++) {
        if (json[i] == L'\\' && i + 1 < json.size()) {
            wchar_t e = json[++i];
            if (e == L'u' && i + 4 < json.size()) {
                value += (wchar_t)wcstoul(json.substr(i + 1, 4).c_str(), nullptr, 16);
                i += 4;
            } else {
                value += (e == L'n' || e == L't') ? L' ' : e;
            }
        } else {
            value += json[i];
        }
    }
    return i < json.size();
}

// <n> from the first "Battery <n>% remaining".
int BatteryPercent(const std::wstring& json) {
    const std::wstring pat = L"Battery ";
    for (size_t i = json.find(pat); i != std::wstring::npos; i = json.find(pat, i + 1)) {
        size_t j = i + pat.size(), k = j;
        while (k < json.size() && iswdigit(json[k]) && k - j < 3) k++;
        if (k > j && json.compare(k, 11, L"% remaining") == 0) {
            int v = _wtoi(json.substr(j, k - j).c_str());
            if (v >= 0 && v <= 100) return v;
        }
    }
    return -1;
}

}  // namespace

void PollPhoneLink(PollContext& ctx) {
    wchar_t base[MAX_PATH];
    DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", base, MAX_PATH);
    if (!n || n >= MAX_PATH) return;
    std::wstring path = std::wstring(base) + L"\\Packages\\Microsoft.YourPhone_8wekyb3d8bbwe\\LocalState\\StartMenu\\StartMenuCompanion.json";

    std::wstring json, speak;
    FILETIME written{};
    if (!ReadUtf8File(path, json, written) || !JsonString(json, L"speak", speak)) return;
    // "Nothing Phone (4a) Pro - Connected to your PC"; anything else (disconnected, setup cards) is skipped.
    const std::wstring suffix = L" - Connected to your PC";
    if (speak.size() <= suffix.size() || speak.compare(speak.size() - suffix.size(), suffix.size(), suffix) != 0) return;
    int pct = BatteryPercent(json);
    if (pct < 0) return;

    FILETIME now{};
    GetSystemTimeAsFileTime(&now);
    ULARGE_INTEGER a{}, b{};
    a.LowPart = now.dwLowDateTime, a.HighPart = now.dwHighDateTime;
    b.LowPart = written.dwLowDateTime, b.HighPart = written.dwHighDateTime;
    ULONGLONG ageSec = a.QuadPart > b.QuadPart ? (a.QuadPart - b.QuadPart) / 10000000ull : 0;

    DeviceStatus s;
    s.key = L"phonelink";
    s.name = speak.substr(0, speak.size() - suffix.size());
    s.via = L"Phone Link";
    s.kind = DeviceKind::Phone;
    s.percent = pct;
    s.asleep = ageSec > kStaleSec;
    ctx.out.push_back(s);
}
