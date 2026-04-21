// AppVolume.cs - Per-app volume/mute via WASAPI (native pointer approach)
// csc /nologo /out:AppVolume.exe /r:System.dll AppVolume.cs

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Diagnostics;

// ── Native WASAPI via direct COM pointer manipulation ─────────────────────────

class AppVolume {
    // user32 for VK send (mute key fallback)
    [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr extra);

    // ole32
    [DllImport("ole32.dll")] static extern int CoCreateInstance(ref Guid clsid, IntPtr inner, uint ctx, ref Guid iid, out IntPtr ppv);
    [DllImport("ole32.dll")] static extern int CoInitialize(IntPtr reserved);

    // GUIDs
    static Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    static Guid IID_IMMDeviceEnumerator  = new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
    static Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    static Guid IID_IAudioSessionManager2= new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    static Guid IID_ISimpleAudioVolume   = new Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8");
    static Guid IID_IAudioSessionControl2= new Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d");

    // vtable offsets for IMMDeviceEnumerator
    // GetDefaultAudioEndpoint is at index 4 (0-based after IUnknown 3 methods)
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetDefaultAudioEndpointDel(IntPtr self, int dataFlow, int role, out IntPtr ppDevice);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int ActivateDel(IntPtr self, ref Guid iid, int clsCtx, IntPtr parms, out IntPtr ppv);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetSessionEnumeratorDel(IntPtr self, out IntPtr ppEnum);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetCountDel(IntPtr self, out int count);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetSessionDel(IntPtr self, int index, out IntPtr ppSession);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int QueryInterfaceDel(IntPtr self, ref Guid iid, out IntPtr ppv);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate uint AddRefDel(IntPtr self);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate uint ReleaseDel(IntPtr self);

    // Volume delegates
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int SetMasterVolumeLevelScalarDel(IntPtr self, float level, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetMasterVolumeLevelScalarDel(IntPtr self, out float level);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int SetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] out bool mute);

    // ISimpleAudioVolume delegates
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int SAV_SetMasterVolumeDel(IntPtr self, float level, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int SAV_GetMasterVolumeDel(IntPtr self, out float level);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int SAV_SetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int SAV_GetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] out bool mute);

    // IAudioSessionControl2 GetProcessId
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetProcessIdDel(IntPtr self, out uint pid);

    static T GetVTableFunc<T>(IntPtr comPtr, int index) where T : class {
        IntPtr vtable = Marshal.ReadIntPtr(comPtr);
        IntPtr funcPtr = Marshal.ReadIntPtr(vtable, index * IntPtr.Size);
        return Marshal.GetDelegateForFunctionPointer(funcPtr, typeof(T)) as T;
    }

    static IntPtr GetDefaultDevice() {
        CoInitialize(IntPtr.Zero);
        IntPtr pEnum;
        int hr = CoCreateInstance(ref CLSID_MMDeviceEnumerator, IntPtr.Zero, 1,
            ref IID_IMMDeviceEnumerator, out pEnum);
        if (hr != 0) throw new Exception("CoCreateInstance failed: 0x" + hr.ToString("X"));

        // GetDefaultAudioEndpoint: vtable[4]
        var fn = GetVTableFunc<GetDefaultAudioEndpointDel>(pEnum, 4);
        IntPtr pDevice;
        fn(pEnum, 0, 1, out pDevice); // eRender=0, eMultimedia=1
        return pDevice;
    }

    static IntPtr ActivateInterface(IntPtr pDevice, Guid iid) {
        // IMMDevice::Activate is vtable[3]
        var fn = GetVTableFunc<ActivateDel>(pDevice, 3);
        IntPtr ppv;
        int hr = fn(pDevice, ref iid, 23, IntPtr.Zero, out ppv);
        if (hr != 0) throw new Exception("Activate failed: 0x" + hr.ToString("X"));
        return ppv;
    }

    static IntPtr QI(IntPtr pUnk, Guid iid) {
        var fn = GetVTableFunc<QueryInterfaceDel>(pUnk, 0);
        IntPtr ppv;
        int hr = fn(pUnk, ref iid, out ppv);
        return hr == 0 ? ppv : IntPtr.Zero;
    }

    static void Release(IntPtr p) {
        if (p != IntPtr.Zero) {
            var fn = GetVTableFunc<ReleaseDel>(p, 2);
            fn(p);
        }
    }

    // ── Master volume ─────────────────────────────────────────────────────────

    static float GetMasterVolume() {
        var pDevice = GetDefaultDevice();
        var pAEV = ActivateInterface(pDevice, IID_IAudioEndpointVolume);
        // IAudioEndpointVolume::GetMasterVolumeLevelScalar = vtable[9]
        var fn = GetVTableFunc<GetMasterVolumeLevelScalarDel>(pAEV, 9);
        float level; fn(pAEV, out level);
        Release(pAEV); Release(pDevice);
        return level * 100f;
    }

    static void SetMasterVolume(float percent) {
        var pDevice = GetDefaultDevice();
        var pAEV = ActivateInterface(pDevice, IID_IAudioEndpointVolume);
        // IAudioEndpointVolume::SetMasterVolumeLevelScalar = vtable[7]
        var fn = GetVTableFunc<SetMasterVolumeLevelScalarDel>(pAEV, 7);
        float level = Math.Max(0f, Math.Min(1f, percent / 100f));
        var ctx = Guid.Empty;
        fn(pAEV, level, ref ctx);
        Release(pAEV); Release(pDevice);
    }

    static bool GetMasterMute() {
        var pDevice = GetDefaultDevice();
        var pAEV = ActivateInterface(pDevice, IID_IAudioEndpointVolume);
        // GetMute = vtable[14]
        var fn = GetVTableFunc<GetMuteDel>(pAEV, 14);
        bool muted; fn(pAEV, out muted);
        Release(pAEV); Release(pDevice);
        return muted;
    }

    static void SetMasterMute(bool mute) {
        var pDevice = GetDefaultDevice();
        var pAEV = ActivateInterface(pDevice, IID_IAudioEndpointVolume);
        // SetMute = vtable[13]
        var fn = GetVTableFunc<SetMuteDel>(pAEV, 13);
        var ctx = Guid.Empty;
        fn(pAEV, mute, ref ctx);
        Release(pAEV); Release(pDevice);
    }

    // ── Per-app sessions ──────────────────────────────────────────────────────

    struct SessionInfo {
        public IntPtr pSAV;   // ISimpleAudioVolume
        public string processName;
        public uint pid;
        public float volume;
        public bool muted;
        public string displayName;
    }

    static List<SessionInfo> GetSessions() {
        var result = new List<SessionInfo>();
        var pDevice = GetDefaultDevice();
        var pMgr = ActivateInterface(pDevice, IID_IAudioSessionManager2);

        // IAudioSessionManager2::GetSessionEnumerator = vtable[5]
        var fnEnum = GetVTableFunc<GetSessionEnumeratorDel>(pMgr, 5);
        IntPtr pEnum;
        fnEnum(pMgr, out pEnum);

        // IAudioSessionEnumerator::GetCount = vtable[3]
        var fnCount = GetVTableFunc<GetCountDel>(pEnum, 3);
        int count; fnCount(pEnum, out count);

        // IAudioSessionEnumerator::GetSession = vtable[4]
        var fnGet = GetVTableFunc<GetSessionDel>(pEnum, 4);

        var seen = new HashSet<string>();

        for (int i = 0; i < count; i++) {
            IntPtr pSession;
            fnGet(pEnum, i, out pSession);
            if (pSession == IntPtr.Zero) continue;

            try {
                // QI for IAudioSessionControl2
                IntPtr pCtrl2 = QI(pSession, IID_IAudioSessionControl2);
                if (pCtrl2 == IntPtr.Zero) { Release(pSession); continue; }

                // IAudioSessionControl2::GetProcessId = vtable[14]
                var fnPid = GetVTableFunc<GetProcessIdDel>(pCtrl2, 14);
                uint pid; fnPid(pCtrl2, out pid);
                Release(pCtrl2);

                if (pid == 0) { Release(pSession); continue; }

                Process proc;
                try { proc = Process.GetProcessById((int)pid); }
                catch { Release(pSession); continue; }

                string name = proc.ProcessName;
                if (seen.Contains(name)) { Release(pSession); continue; }
                seen.Add(name);

                // QI for ISimpleAudioVolume
                IntPtr pSAV = QI(pSession, IID_ISimpleAudioVolume);
                if (pSAV == IntPtr.Zero) { Release(pSession); continue; }

                // GetMasterVolume = vtable[4], GetMute = vtable[6]
                var fnVol = GetVTableFunc<SAV_GetMasterVolumeDel>(pSAV, 4);
                var fnMute = GetVTableFunc<SAV_GetMuteDel>(pSAV, 6);
                float vol; fnVol(pSAV, out vol);
                bool muted; fnMute(pSAV, out muted);

                string display = proc.MainWindowTitle.Length > 0 ? proc.MainWindowTitle : name;

                result.Add(new SessionInfo {
                    pSAV = pSAV,
                    processName = name,
                    pid = pid,
                    volume = vol * 100f,
                    muted = muted,
                    displayName = display,
                });
            } catch { Release(pSession); }
        }

        Release(pEnum); Release(pMgr); Release(pDevice);
        return result;
    }

    static List<IntPtr> FindAppSAV(string processName) {
        var result = new List<IntPtr>();
        var sessions = GetSessions();
        foreach (var s in sessions) {
            if (s.processName.Equals(processName, StringComparison.OrdinalIgnoreCase))
                result.Add(s.pSAV);
        }
        return result;
    }

    static void AppSetVolume(IntPtr pSAV, float level) {
        var fn = GetVTableFunc<SAV_SetMasterVolumeDel>(pSAV, 3);
        var ctx = Guid.Empty;
        fn(pSAV, Math.Max(0f, Math.Min(1f, level)), ref ctx);
    }

    static float AppGetVolume(IntPtr pSAV) {
        var fn = GetVTableFunc<SAV_GetMasterVolumeDel>(pSAV, 4);
        float v; fn(pSAV, out v);
        return v;
    }

    static void AppSetMute(IntPtr pSAV, bool mute) {
        var fn = GetVTableFunc<SAV_SetMuteDel>(pSAV, 5);
        var ctx = Guid.Empty;
        fn(pSAV, mute, ref ctx);
    }

    static bool AppGetMute(IntPtr pSAV) {
        var fn = GetVTableFunc<SAV_GetMuteDel>(pSAV, 6);
        bool m; fn(pSAV, out m);
        return m;
    }

    // ── Main ──────────────────────────────────────────────────────────────────

    static void Main(string[] args) {
        if (args.Length == 0) {
            Console.Error.WriteLine("Usage: AppVolume.exe <cmd> [target] [value]");
            return;
        }

        string cmd = args[0].ToLower();
        string target = args.Length > 1 ? args[1] : "master";

        try {
            if (cmd == "list") {
                Console.WriteLine("[");
                // Master
                float mv = GetMasterVolume();
                bool mm = GetMasterMute();
                Console.WriteLine("  {\"processName\":\"master\",\"processId\":0,\"displayName\":\"Master Volume\",\"volume\":"
                    + (int)Math.Round(mv) + ",\"isMuted\":" + mm.ToString().ToLower() + "}");

                var sessions = GetSessions();
                foreach (var s in sessions) {
                    string dn = s.displayName.Replace("\\", "\\\\").Replace("\"", "\\\"");
                    Console.WriteLine("  ,{\"processName\":\"" + s.processName + "\",\"processId\":" + s.pid
                        + ",\"displayName\":\"" + dn + "\",\"volume\":" + (int)Math.Round(s.volume)
                        + ",\"isMuted\":" + s.muted.ToString().ToLower() + "}");
                    Release(s.pSAV);
                }
                Console.WriteLine("]");
                return;
            }

            if (target == "master") {
                var ctx = Guid.Empty;
                switch (cmd) {
                    case "get-volume":
                        Console.WriteLine((int)Math.Round(GetMasterVolume()));
                        break;
                    case "set-volume":
                        SetMasterVolume(float.Parse(args[2]));
                        Console.WriteLine("OK");
                        break;
                    case "volume-up":
                        float delta = args.Length > 2 ? float.Parse(args[2]) : 10f;
                        SetMasterVolume(Math.Min(100f, GetMasterVolume() + delta));
                        Console.WriteLine("OK");
                        break;
                    case "volume-down":
                        float ddelta = args.Length > 2 ? float.Parse(args[2]) : 10f;
                        SetMasterVolume(Math.Max(0f, GetMasterVolume() - ddelta));
                        Console.WriteLine("OK");
                        break;
                    case "get-mute":
                        Console.WriteLine(GetMasterMute().ToString().ToLower());
                        break;
                    case "toggle-mute":
                        SetMasterMute(!GetMasterMute());
                        Console.WriteLine("OK");
                        break;
                    case "set-mute":
                        SetMasterMute(args[2].ToLower() == "true");
                        Console.WriteLine("OK");
                        break;
                }
            } else {
                var savList = FindAppSAV(target);
                if (savList.Count == 0) {
                    Console.Error.WriteLine("No audio session: " + target);
                    Environment.Exit(1);
                }

                switch (cmd) {
                    case "get-volume":
                        Console.WriteLine((int)Math.Round(AppGetVolume(savList[0]) * 100));
                        break;
                    case "set-volume":
                        float sv = float.Parse(args[2]) / 100f;
                        foreach (var p in savList) AppSetVolume(p, sv);
                        Console.WriteLine("OK");
                        break;
                    case "volume-up":
                        float delta = args.Length > 2 ? float.Parse(args[2]) : 10f;
                        float cur = AppGetVolume(savList[0]);
                        foreach (var p in savList) AppSetVolume(p, Math.Min(1f, cur + delta / 100f));
                        Console.WriteLine("OK");
                        break;
                    case "volume-down":
                        float ddelta = args.Length > 2 ? float.Parse(args[2]) : 10f;
                        float dcur = AppGetVolume(savList[0]);
                        foreach (var p in savList) AppSetVolume(p, Math.Max(0f, dcur - ddelta / 100f));
                        Console.WriteLine("OK");
                        break;
                    case "get-mute":
                        Console.WriteLine(AppGetMute(savList[0]).ToString().ToLower());
                        break;
                    case "toggle-mute":
                        bool tm = AppGetMute(savList[0]);
                        foreach (var p in savList) AppSetMute(p, !tm);
                        Console.WriteLine("OK");
                        break;
                    case "set-mute":
                        bool sm = args[2].ToLower() == "true";
                        foreach (var p in savList) AppSetMute(p, sm);
                        Console.WriteLine("OK");
                        break;
                }

                foreach (var p in savList) Release(p);
            }
        } catch (Exception ex) {
            Console.Error.WriteLine("Error: " + ex.Message);
            Environment.Exit(1);
        }
    }
}
