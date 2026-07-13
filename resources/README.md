# Resources

## AudioSessions.exe

This directory should contain the compiled `AudioSessions.exe` binary.

### Building from source

Requirements:
- .NET 6.0 SDK or later
- Windows

```bash
cd resources
dotnet publish AudioSessions.csproj -c Release -r win-x64 --self-contained true -o ./
```

The compiled `AudioSessions.exe` will be placed in this directory and bundled with the app via `electron-builder`'s `extraResources` config.

### Fallback behavior

If `AudioSessions.exe` is not present, the app falls back to PowerShell-based audio control with limited per-app support.

## wdi-simple-x64.exe

This directory must contain `wdi-simple-x64.exe` — the [libwdi](https://github.com/pbatard/libwdi)
helper (the same driver-install engine Zadig uses). MacroDeck runs it **elevated**
to swap a keyboard's driver to **WinUSB** ("Dedicate") and restores the in-box HID
driver via `pnputil` ("Release"). libwdi's self-signed cert + Trusted Publisher
flow means no purchased code-signing certificate is required.

### Building from source

Requirements:
- Windows + Visual Studio (MSVC) or MSYS2/MinGW-w64
- libwdi source tree

Build `examples/wdi-simple.c` for **x64** per the libwdi docs, then copy the
resulting executable here as `wdi-simple-x64.exe`. (You may also extract it from
an official libwdi/Zadig release build.)

Usage MacroDeck invokes:

```
wdi-simple-x64.exe --vid 0xXXXX --pid 0xXXXX --type 0 --name "MacroDeck Keyboard (WinUSB)"
```

`--type 0` selects the WinUSB driver. It is bundled with the app via
`electron-builder`'s `extraResources` config.

### Fallback behavior

If `wdi-simple-x64.exe` is not present, `keyboard:driverStatus` reports
`available: false`, the Dedicate/Release buttons are hidden, and reading still
works for keyboards that were bound to WinUSB manually (e.g. with Zadig once).

