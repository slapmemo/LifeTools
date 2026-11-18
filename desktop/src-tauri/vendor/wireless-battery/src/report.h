#pragma once
// "Request support for a device": a small window where a user picks a device that is not shown, and the
// app sends its name and a short technical summary to the public request list at krisgfx.com/tools
// (which opens or updates a GitHub issue). Nothing is sent until the user clicks Send, and the window
// shows exactly what will be sent first.
#include <windows.h>

#include <string>

namespace report {

// Opens the window (or brings it to the front if it is already open). With no owner (`--report`), closing
// the window ends the message loop.
void Show(HINSTANCE inst, HWND owner);

// Lets Tab / Enter / Esc work inside the window; call from the message loop before TranslateMessage.
bool PreTranslate(MSG* msg);

// Extra sections for `--dump` and the full report: HID devices that could not be opened, every USB device
// (including ones without a HID interface, e.g. audio-only or WinUSB dongles and serial ports) and the
// Bluetooth devices Windows knows about.
std::wstring DumpExtras();

}  // namespace report
