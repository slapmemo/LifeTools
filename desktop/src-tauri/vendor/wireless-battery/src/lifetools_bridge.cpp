#include "devices.h"

#include <windows.h>
#include <string>

namespace {
std::string Utf8(const std::wstring& value) {
    if (value.empty()) return {};
    const int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (size <= 0) return {};
    std::string result(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
    return result;
}

void JsonString(std::string& out, const std::string& value) {
    static constexpr char hex[] = "0123456789abcdef";
    out.push_back('"');
    for (const unsigned char c : value) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) { out += "\\u00"; out.push_back(hex[c >> 4]); out.push_back(hex[c & 0x0f]); }
                else out.push_back(static_cast<char>(c));
        }
    }
    out.push_back('"');
}

const char* Kind(DeviceKind kind) {
    switch (kind) {
        case DeviceKind::Mouse: return "mouse";
        case DeviceKind::Headset: return "headset";
        case DeviceKind::Keyboard: return "keyboard";
        case DeviceKind::Gamepad: return "gamepad";
        case DeviceKind::Phone: return "phone";
        default: return "other";
    }
}
}

extern "C" __declspec(dllexport) const char* lifetools_battery_poll_json() {
    thread_local std::string json;
    json.clear();
    json.push_back('[');
    bool first = true;
    for (const auto& device : PollAllDevices()) {
        if (!device.connected) continue;
        if (!first) json.push_back(',');
        first = false;
        json += "{\"id\":"; JsonString(json, Utf8(device.key));
        json += ",\"name\":"; JsonString(json, Utf8(device.name));
        json += ",\"kind\":"; JsonString(json, Kind(device.kind));
        json += ",\"via\":"; JsonString(json, Utf8(device.via));
        json += ",\"percent\":";
        if (device.percent >= 0 && device.percent <= 100) json += std::to_string(device.percent);
        else json += "null";
        json += ",\"detail\":"; JsonString(json, Utf8(device.detail));
        json += ",\"level_text\":"; JsonString(json, Utf8(device.levelText));
        json += ",\"charging\":"; json += device.charging ? "true" : "false";
        json += ",\"asleep\":"; json += device.asleep ? "true" : "false";
        json += ",\"connected\":true,\"millivolts\":";
        if (device.millivolts > 0) json += std::to_string(device.millivolts); else json += "null";
        json += ",\"grace_sec\":"; json += std::to_string(device.graceSec);
        json.push_back('}');
    }
    json.push_back(']');
    return json.c_str();
}
