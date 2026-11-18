# Third-party notices

## Wireless Battery

Integrated from [krisgfx9/Wireless-Device-Battery-Monitor](https://github.com/krisgfx9/Wireless-Device-Battery-Monitor), upstream commit `47ecc14c2de7f3b615607f4efb311ff98a0a1936` (2026-11-18; previously `3e2fb2e3d2d4d995b6a732831eba3c5354b6e7b5`).

Only `src/` is vendored, without the upstream tray app (`main.cpp`, `widget.*`), the device-request window (`report.cpp`, which makes network requests), the HeadsetControl driver and the Linux backend (`src/linux/`); `desktop/src-tauri/build.rs` skips them. Local changes: `devices.cpp` does not call `PollHeadsetControl`, and `lifetools_bridge.cpp` (LifeTools' own file) adds the JSON bridge and an empty `report::DumpExtras`. The MSVC build adds `/Zc:lambda` and maps the MinGW WinRT name `__FIReference_1_INT32` to the Windows SDK's `__FIReference_1_int` instead of editing the sources.

The native battery polling and vendor protocol sources are under GNU GPL version 3 or later. The upstream license is preserved at `desktop/src-tauri/vendor/wireless-battery/LICENSE`.

LifeTools links this code into the desktop application. The combined LifeTools distribution is therefore licensed under GPL-3.0-or-later; the license text is in `LICENSE`. Local integration changes are documented in the vendor source comments and are covered by the same license.
