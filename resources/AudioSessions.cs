// AudioSessions.cs — NAudio-based audio session manager
// Compile with: csc /r:NAudio.dll AudioSessions.cs /out:AudioSessions.exe
// Or: dotnet build (see AudioSessions.csproj)
//
// Usage:
//   AudioSessions.exe --list                          → JSON array of audio sessions
//   AudioSessions.exe --volume <target> <delta> <mode> → adjust volume
//   AudioSessions.exe --mute <target>                 → toggle mute
//   AudioSessions.exe --set <target> <value>          → set exact volume (0-100)

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.Json;
using NAudio.CoreAudioApi;

class AudioSessions
{
    static void Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: AudioSessions.exe --list | --volume <target> <delta> <mode> | --mute <target>");
            Environment.Exit(1);
        }

        try
        {
            switch (args[0])
            {
                case "--list":
                    ListSessions();
                    break;
                case "--volume":
                    if (args.Length >= 4)
                        AdjustVolume(args[1], int.Parse(args[2]), args[3]);
                    break;
                case "--mute":
                    if (args.Length >= 2)
                        ToggleMute(args[1]);
                    break;
                case "--set":
                    if (args.Length >= 3)
                        SetVolume(args[1], int.Parse(args[2]));
                    break;
                default:
                    Console.Error.WriteLine($"Unknown command: {args[0]}");
                    Environment.Exit(1);
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
            Environment.Exit(1);
        }
    }

    static MMDeviceEnumerator GetEnumerator() => new MMDeviceEnumerator();

    static void ListSessions()
    {
        var enumerator = GetEnumerator();
        var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        var sessions = device.AudioSessionManager.Sessions;

        var result = new List<object>();

        // Master volume
        result.Add(new
        {
            processName = "master",
            processId = 0,
            displayName = "Master Volume",
            volume = (int)(device.AudioEndpointVolume.MasterVolumeLevelScalar * 100),
            isMuted = device.AudioEndpointVolume.Mute
        });

        // Per-app sessions
        for (int i = 0; i < sessions.Count; i++)
        {
            var session = sessions[i];
            var ctrl = session.QueryInterface<AudioSessionControl2>();
            if (ctrl == null) continue;

            try
            {
                var proc = System.Diagnostics.Process.GetProcessById((int)ctrl.GetProcessID);
                result.Add(new
                {
                    processName = proc.ProcessName,
                    processId = (int)ctrl.GetProcessID,
                    displayName = string.IsNullOrEmpty(session.DisplayName) ? proc.ProcessName : session.DisplayName,
                    volume = (int)(session.SimpleAudioVolume.Volume * 100),
                    isMuted = session.SimpleAudioVolume.Mute
                });
            }
            catch { /* Process may have exited */ }
        }

        Console.WriteLine(JsonSerializer.Serialize(result));
    }

    static void AdjustVolume(string target, int delta, string mode)
    {
        var enumerator = GetEnumerator();
        var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);

        if (target == "master")
        {
            var current = device.AudioEndpointVolume.MasterVolumeLevelScalar * 100;
            float newVol = mode == "increase"
                ? Math.Min(100, current + delta)
                : Math.Max(0, current - delta);
            device.AudioEndpointVolume.MasterVolumeLevelScalar = newVol / 100f;
        }
        else
        {
            var sessions = device.AudioSessionManager.Sessions;
            for (int i = 0; i < sessions.Count; i++)
            {
                var session = sessions[i];
                var ctrl = session.QueryInterface<AudioSessionControl2>();
                if (ctrl == null) continue;

                try
                {
                    var proc = System.Diagnostics.Process.GetProcessById((int)ctrl.GetProcessID);
                    if (proc.ProcessName.Equals(target, StringComparison.OrdinalIgnoreCase))
                    {
                        var current = session.SimpleAudioVolume.Volume * 100;
                        float newVol = mode == "increase"
                            ? Math.Min(100, current + delta)
                            : Math.Max(0, current - delta);
                        session.SimpleAudioVolume.Volume = newVol / 100f;
                        break;
                    }
                }
                catch { }
            }
        }

        Console.WriteLine("OK");
    }

    static void SetVolume(string target, int value)
    {
        var enumerator = GetEnumerator();
        var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        float vol = Math.Max(0, Math.Min(100, value)) / 100f;

        if (target == "master")
        {
            device.AudioEndpointVolume.MasterVolumeLevelScalar = vol;
        }
        else
        {
            var sessions = device.AudioSessionManager.Sessions;
            for (int i = 0; i < sessions.Count; i++)
            {
                var session = sessions[i];
                var ctrl = session.QueryInterface<AudioSessionControl2>();
                if (ctrl == null) continue;
                try
                {
                    var proc = System.Diagnostics.Process.GetProcessById((int)ctrl.GetProcessID);
                    if (proc.ProcessName.Equals(target, StringComparison.OrdinalIgnoreCase))
                    {
                        session.SimpleAudioVolume.Volume = vol;
                        break;
                    }
                }
                catch { }
            }
        }

        Console.WriteLine("OK");
    }

    static void ToggleMute(string target)
    {
        var enumerator = GetEnumerator();
        var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);

        if (target == "master")
        {
            device.AudioEndpointVolume.Mute = !device.AudioEndpointVolume.Mute;
        }
        else
        {
            var sessions = device.AudioSessionManager.Sessions;
            for (int i = 0; i < sessions.Count; i++)
            {
                var session = sessions[i];
                var ctrl = session.QueryInterface<AudioSessionControl2>();
                if (ctrl == null) continue;
                try
                {
                    var proc = System.Diagnostics.Process.GetProcessById((int)ctrl.GetProcessID);
                    if (proc.ProcessName.Equals(target, StringComparison.OrdinalIgnoreCase))
                    {
                        session.SimpleAudioVolume.Mute = !session.SimpleAudioVolume.Mute;
                        break;
                    }
                }
                catch { }
            }
        }

        Console.WriteLine("OK");
    }
}
