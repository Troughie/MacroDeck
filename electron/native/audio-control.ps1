# audio-control.ps1
# Usage: powershell -File audio-control.ps1 -Action <action> -Target <target> -Value <value>
# Actions: mute-toggle, volume-set, volume-up, volume-down
# Target: master | <process name>
# Value: 0-100 (for volume-set), step (for up/down)

param(
    [string]$Action = "mute-toggle",
    [string]$Target = "master",
    [int]$Value = 10
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int NotImpl1(); int NotImpl2();
    int GetChannelCount([Out] out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel([Out] out float pfLevelDB);
    int GetMasterVolumeLevelScalar([Out] out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, [Out] out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, [Out] out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute([Out][MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    int GetVolumeStepInfo([Out] out uint pnStep, [Out] out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport([Out] out uint pdwHardwareSupportMask);
    int GetVolumeRange([Out] out float pflVolumeMindB, [Out] out float pflVolumeMaxdB, [Out] out float pflVolumeIncrementdB);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [Out][MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId([Out][MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    int GetState([Out] out int pdwState);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, [Out] out IMMDevice ppEndpoint);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, [Out] out IMMDevice ppDevice);
    int RegisterEndpointNotificationCallback(IntPtr pClient);
    int UnregisterEndpointNotificationCallback(IntPtr pClient);
}

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
[ClassInterface(ClassInterfaceType.None)]
class MMDeviceEnumeratorClass {}

public class AudioAPI {
    static IMMDevice GetDefaultDevice() {
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorClass();
        IMMDevice device;
        enumerator.GetDefaultAudioEndpoint(0, 1, out device); // eRender, eMultimedia
        return device;
    }

    static IAudioEndpointVolume GetMasterVolume() {
        var device = GetDefaultDevice();
        var iid = typeof(IAudioEndpointVolume).GUID;
        object aev;
        device.Activate(ref iid, 23, IntPtr.Zero, out aev);
        return (IAudioEndpointVolume)aev;
    }

    public static float GetMasterVolumeLevel() {
        float level;
        GetMasterVolume().GetMasterVolumeLevelScalar(out level);
        return level * 100f;
    }

    public static void SetMasterVolumeLevel(float percent) {
        float level = Math.Max(0f, Math.Min(1f, percent / 100f));
        GetMasterVolume().SetMasterVolumeLevelScalar(level, Guid.Empty);
    }

    public static bool GetMasterMute() {
        bool muted;
        GetMasterVolume().GetMute(out muted);
        return muted;
    }

    public static void SetMasterMute(bool mute) {
        GetMasterVolume().SetMute(mute, Guid.Empty);
    }
}
'@

switch ($Action) {
    "mute-toggle" {
        if ($Target -eq "master") {
            $current = [AudioAPI]::GetMasterMute()
            [AudioAPI]::SetMasterMute(-not $current)
            Write-Output "master mute: $(-not $current)"
        } else {
            # Per-app mute via SoundMixer
            $procs = Get-Process -Name $Target -ErrorAction SilentlyContinue
            if (-not $procs) { Write-Error "Process not found: $Target"; exit 1 }
            Write-Output "app mute toggle: $Target (not supported without AudioSessions.exe)"
        }
    }
    "volume-set" {
        if ($Target -eq "master") {
            [AudioAPI]::SetMasterVolumeLevel($Value)
            Write-Output "master volume set: $Value%"
        }
    }
    "volume-up" {
        if ($Target -eq "master") {
            $current = [AudioAPI]::GetMasterVolumeLevel()
            $new = [Math]::Min(100, $current + $Value)
            [AudioAPI]::SetMasterVolumeLevel($new)
            Write-Output "master volume: $([Math]::Round($new))%"
        }
    }
    "volume-down" {
        if ($Target -eq "master") {
            $current = [AudioAPI]::GetMasterVolumeLevel()
            $new = [Math]::Max(0, $current - $Value)
            [AudioAPI]::SetMasterVolumeLevel($new)
            Write-Output "master volume: $([Math]::Round($new))%"
        }
    }
    "get-volume" {
        if ($Target -eq "master") {
            $vol = [AudioAPI]::GetMasterVolumeLevel()
            Write-Output ([Math]::Round($vol))
        }
    }
}
