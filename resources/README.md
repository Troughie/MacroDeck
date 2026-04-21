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
