#pragma once
// Small portability layer so the shared vendor drivers compile unchanged on both platforms.
// On Windows this is just <windows.h> plus a couple of UTF-8 helpers. On Linux it supplies the
// handful of Windows typedefs/builtins the drivers use, implemented with the C++ standard library.
//
// NOTE FOR REVIEWERS: nothing here changes the Windows code path. It only gives the Linux build
// the same spellings for a few types and functions.

#include <string>

#ifdef _WIN32

#include <windows.h>

// Convert between UTF-8 and the platform's wchar_t (UTF-16 on Windows).
inline std::wstring Utf8ToWide(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring out(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), out.data(), n);
    return out;
}
inline std::string WideToUtf8(const std::wstring& s) {
    if (s.empty()) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    std::string out(n, 0);
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), out.data(), n, nullptr, nullptr);
    return out;
}
inline unsigned long long PlatNowMs() { return GetTickCount64(); }
inline void PlatSleep(unsigned long ms) { Sleep(ms); }

#else  // __linux__

#include <chrono>
#include <cstdint>
#include <thread>

// Types used by the shared drivers that originally came from <windows.h>.
using BYTE = unsigned char;
using USHORT = unsigned short;
using SHORT = short;
using ULONG = unsigned long;
using LONG = long;
using UINT = unsigned int;
using DWORD = unsigned long;
using ULONGLONG = unsigned long long;
using LONGLONG = long long;

inline ULONGLONG GetTickCount64() {
    using namespace std::chrono;
    return (ULONGLONG)duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}
inline void Sleep(DWORD ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }
inline unsigned long long PlatNowMs() { return GetTickCount64(); }
inline void PlatSleep(unsigned long ms) { Sleep((DWORD)ms); }

// std::wstring is UTF-32 on Linux; hidapi/sysfs paths and names are UTF-8.
inline std::wstring Utf8ToWide(const std::string& s) {
    std::wstring out;
    out.reserve(s.size());
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = (unsigned char)s[i];
        unsigned int cp = 0;
        int len = 0;
        if (c < 0x80) { cp = c; len = 1; }
        else if ((c & 0xE0) == 0xC0) { cp = c & 0x1F; len = 2; }
        else if ((c & 0xF0) == 0xE0) { cp = c & 0x0F; len = 3; }
        else if ((c & 0xF8) == 0xF0) { cp = c & 0x07; len = 4; }
        else { cp = 0xFFFD; len = 1; }
        if (i + (size_t)len > s.size()) { cp = 0xFFFD; len = 1; }
        for (int k = 1; k < len; k++) {
            unsigned char d = (unsigned char)s[i + k];
            if ((d & 0xC0) != 0x80) { cp = 0xFFFD; break; }
            cp = (cp << 6) | (d & 0x3F);
        }
        out.push_back((wchar_t)cp);
        i += (size_t)len;
    }
    return out;
}
inline std::string WideToUtf8(const std::wstring& s) {
    std::string out;
    out.reserve(s.size() * 2);
    for (wchar_t wc : s) {
        unsigned int cp = (unsigned int)wc;
        if (cp < 0x80) out.push_back((char)cp);
        else if (cp < 0x800) {
            out.push_back((char)(0xC0 | (cp >> 6)));
            out.push_back((char)(0x80 | (cp & 0x3F)));
        } else if (cp < 0x10000) {
            out.push_back((char)(0xE0 | (cp >> 12)));
            out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back((char)(0x80 | (cp & 0x3F)));
        } else if (cp < 0x110000) {
            out.push_back((char)(0xF0 | (cp >> 18)));
            out.push_back((char)(0x80 | ((cp >> 12) & 0x3F)));
            out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back((char)(0x80 | (cp & 0x3F)));
        } else out.push_back((char)0xEF), out.push_back((char)0xBF), out.push_back((char)0xBD);
    }
    return out;
}

#endif
