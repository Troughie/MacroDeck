/**
 * AppVolume helper — compiles AppVolume.exe on first use and caches it.
 * Source is embedded as a string to avoid __dirname path issues.
 */

import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), 'macrodeck');
const exePath = path.join(tmpDir, 'AppVolume.exe');
const srcPath = path.join(tmpDir, 'AppVolume.cs');

// ─── Embedded C# source ───────────────────────────────────────────────────────
// Embedded directly to avoid __dirname path resolution issues in Electron

const APP_VOLUME_CS = `using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Diagnostics;

class AppVolume {
    [DllImport("ole32.dll")] static extern int CoCreateInstance(ref Guid clsid, IntPtr inner, uint ctx, ref Guid iid, out IntPtr ppv);
    [DllImport("ole32.dll")] static extern int CoInitialize(IntPtr reserved);

    static Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    static Guid IID_IMMDeviceEnumerator  = new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
    static Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    static Guid IID_IAudioSessionManager2= new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    static Guid IID_ISimpleAudioVolume   = new Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8");
    static Guid IID_IAudioSessionControl2= new Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d");

    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetDefaultAudioEndpointDel(IntPtr self, int dataFlow, int role, out IntPtr ppDevice);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ActivateDel(IntPtr self, ref Guid iid, int clsCtx, IntPtr parms, out IntPtr ppv);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetSessionEnumeratorDel(IntPtr self, out IntPtr ppEnum);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetCountDel(IntPtr self, out int count);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetSessionDel(IntPtr self, int index, out IntPtr ppSession);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int QueryInterfaceDel(IntPtr self, ref Guid iid, out IntPtr ppv);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint ReleaseDel(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetMasterVolumeLevelScalarDel(IntPtr self, float level, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetMasterVolumeLevelScalarDel(IntPtr self, out float level);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] out bool mute);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SAV_SetMasterVolumeDel(IntPtr self, float level, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SAV_GetMasterVolumeDel(IntPtr self, out float level);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SAV_SetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SAV_GetMuteDel(IntPtr self, [MarshalAs(UnmanagedType.Bool)] out bool mute);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetProcessIdDel(IntPtr self, out uint pid);

    static T GetVT<T>(IntPtr p, int i) where T : class {
        IntPtr vt = Marshal.ReadIntPtr(p);
        IntPtr fn = Marshal.ReadIntPtr(vt, i * IntPtr.Size);
        return Marshal.GetDelegateForFunctionPointer(fn, typeof(T)) as T;
    }

    static IntPtr GetDefaultDevice() {
        CoInitialize(IntPtr.Zero);
        IntPtr pEnum;
        int hr = CoCreateInstance(ref CLSID_MMDeviceEnumerator, IntPtr.Zero, 1, ref IID_IMMDeviceEnumerator, out pEnum);
        if (hr != 0) throw new Exception("CoCreateInstance 0x" + hr.ToString("X"));
        IntPtr pDevice;
        GetVT<GetDefaultAudioEndpointDel>(pEnum, 4)(pEnum, 0, 1, out pDevice);
        return pDevice;
    }

    static IntPtr Activate(IntPtr pDevice, Guid iid) {
        IntPtr ppv;
        int hr = GetVT<ActivateDel>(pDevice, 3)(pDevice, ref iid, 23, IntPtr.Zero, out ppv);
        if (hr != 0) throw new Exception("Activate 0x" + hr.ToString("X"));
        return ppv;
    }

    static IntPtr QI(IntPtr p, Guid iid) {
        IntPtr ppv;
        return GetVT<QueryInterfaceDel>(p, 0)(p, ref iid, out ppv) == 0 ? ppv : IntPtr.Zero;
    }

    static void Rel(IntPtr p) { if (p != IntPtr.Zero) GetVT<ReleaseDel>(p, 2)(p); }

    static float GetMasterVol() {
        var d = GetDefaultDevice(); var aev = Activate(d, IID_IAudioEndpointVolume);
        float v; GetVT<GetMasterVolumeLevelScalarDel>(aev, 9)(aev, out v);
        Rel(aev); Rel(d); return v * 100f;
    }
    static void SetMasterVol(float pct) {
        var d = GetDefaultDevice(); var aev = Activate(d, IID_IAudioEndpointVolume);
        var ctx = Guid.Empty; GetVT<SetMasterVolumeLevelScalarDel>(aev, 7)(aev, Math.Max(0f, Math.Min(1f, pct/100f)), ref ctx);
        Rel(aev); Rel(d);
    }
    static bool GetMasterMute() {
        var d = GetDefaultDevice(); var aev = Activate(d, IID_IAudioEndpointVolume);
        bool m; GetVT<GetMuteDel>(aev, 14)(aev, out m); Rel(aev); Rel(d); return m;
    }
    static void SetMasterMute(bool mute) {
        var d = GetDefaultDevice(); var aev = Activate(d, IID_IAudioEndpointVolume);
        var ctx = Guid.Empty; GetVT<SetMuteDel>(aev, 13)(aev, mute, ref ctx); Rel(aev); Rel(d);
    }

    struct SI { public IntPtr pSAV; public string name; public uint pid; public float vol; public bool muted; public string display; }

    static List<SI> GetSessions() {
        var res = new List<SI>();
        var d = GetDefaultDevice();
        var mgr = Activate(d, IID_IAudioSessionManager2);
        IntPtr pEnum; GetVT<GetSessionEnumeratorDel>(mgr, 5)(mgr, out pEnum);
        int count; GetVT<GetCountDel>(pEnum, 3)(pEnum, out count);
        var seen = new HashSet<string>();
        for (int i = 0; i < count; i++) {
            IntPtr pSess; GetVT<GetSessionDel>(pEnum, 4)(pEnum, i, out pSess);
            if (pSess == IntPtr.Zero) continue;
            try {
                IntPtr pC2 = QI(pSess, IID_IAudioSessionControl2);
                if (pC2 == IntPtr.Zero) { Rel(pSess); continue; }
                uint pid; GetVT<GetProcessIdDel>(pC2, 14)(pC2, out pid); Rel(pC2);
                if (pid == 0) { Rel(pSess); continue; }
                Process proc; try { proc = Process.GetProcessById((int)pid); } catch { Rel(pSess); continue; }
                string name = proc.ProcessName;
                if (seen.Contains(name)) { Rel(pSess); continue; }
                seen.Add(name);
                IntPtr pSAV = QI(pSess, IID_ISimpleAudioVolume);
                if (pSAV == IntPtr.Zero) { Rel(pSess); continue; }
                float vol; GetVT<SAV_GetMasterVolumeDel>(pSAV, 4)(pSAV, out vol);
                bool muted; GetVT<SAV_GetMuteDel>(pSAV, 6)(pSAV, out muted);
                string disp = proc.MainWindowTitle.Length > 0 ? proc.MainWindowTitle : name;
                res.Add(new SI { pSAV=pSAV, name=name, pid=pid, vol=vol*100f, muted=muted, display=disp });
            } catch { Rel(pSess); }
        }
        Rel(pEnum); Rel(mgr); Rel(d);
        return res;
    }

    static List<IntPtr> FindSAV(string procName) {
        var r = new List<IntPtr>();
        foreach (var s in GetSessions())
            if (s.name.Equals(procName, StringComparison.OrdinalIgnoreCase)) r.Add(s.pSAV);
        return r;
    }

    static void SAVSetVol(IntPtr p, float f) { var ctx=Guid.Empty; GetVT<SAV_SetMasterVolumeDel>(p,3)(p,Math.Max(0f,Math.Min(1f,f)),ref ctx); }
    static float SAVGetVol(IntPtr p) { float v; GetVT<SAV_GetMasterVolumeDel>(p,4)(p,out v); return v; }
    static void SAVSetMute(IntPtr p, bool m) { var ctx=Guid.Empty; GetVT<SAV_SetMuteDel>(p,5)(p,m,ref ctx); }
    static bool SAVGetMute(IntPtr p) { bool m; GetVT<SAV_GetMuteDel>(p,6)(p,out m); return m; }

    static void Main(string[] args) {
        if (args.Length == 0) { Console.Error.WriteLine("Usage: AppVolume <cmd> [target] [value]"); return; }
        string cmd = args[0].ToLower();
        string target = args.Length > 1 ? args[1] : "master";
        try {
            if (cmd == "list") {
                Console.WriteLine("[");
                float mv = GetMasterVol(); bool mm = GetMasterMute();
                Console.WriteLine("  {\\"processName\\":\\"master\\",\\"processId\\":0,\\"displayName\\":\\"Master Volume\\",\\"volume\\":" + (int)Math.Round(mv) + ",\\"isMuted\\":" + mm.ToString().ToLower() + "}");
                foreach (var s in GetSessions()) {
                    string dn = s.display.Replace("\\\\","\\\\\\\\").Replace("\\"","\\\\\\\"");
                    Console.WriteLine("  ,{\\"processName\\":\\""+s.name+"\\",\\"processId\\":"+s.pid+",\\"displayName\\":\\""+dn+"\\",\\"volume\\":" + (int)Math.Round(s.vol) + ",\\"isMuted\\":" + s.muted.ToString().ToLower() + "}");
                    Rel(s.pSAV);
                }
                Console.WriteLine("]");
                return;
            }
            if (target == "master") {
                switch (cmd) {
                    case "get-volume": Console.WriteLine((int)Math.Round(GetMasterVol())); break;
                    case "set-volume": { float prev=(float)Math.Round(GetMasterVol()); float nv=float.Parse(args[2]); SetMasterVol(nv); Console.WriteLine("{\\"ok\\":true,\\"previousValue\\":" + (int)prev + ",\\"currentValue\\":" + (int)Math.Round(Math.Max(0f,Math.Min(100f,nv))) + "}"); break; }
                    case "volume-up": { float prev=(float)Math.Round(GetMasterVol()); float delta=args.Length>2?float.Parse(args[2]):10f; float nv=Math.Min(100f,prev+delta); SetMasterVol(nv); Console.WriteLine("{\\"ok\\":true,\\"previousValue\\":" + (int)prev + ",\\"currentValue\\":" + (int)Math.Round(nv) + "}"); break; }
                    case "volume-down": { float prev=(float)Math.Round(GetMasterVol()); float delta=args.Length>2?float.Parse(args[2]):10f; float nv=Math.Max(0f,prev-delta); SetMasterVol(nv); Console.WriteLine("{\\"ok\\":true,\\"previousValue\\":" + (int)prev + ",\\"currentValue\\":" + (int)Math.Round(nv) + "}"); break; }
                    case "get-mute": Console.WriteLine(GetMasterMute().ToString().ToLower()); break;
                    case "toggle-mute": { bool wasMuted=GetMasterMute(); SetMasterMute(!wasMuted); float vol=(float)Math.Round(GetMasterVol()); Console.WriteLine("{\\"ok\\":true,\\"isMuted\\":" + (!wasMuted).ToString().ToLower() + ",\\"volume\\":" + (int)vol + "}"); break; }
                    case "set-mute": SetMasterMute(args[2].ToLower()=="true"); Console.WriteLine("OK"); break;
                }
            } else {
                var savs = FindSAV(target);
                if (savs.Count == 0) { Console.Error.WriteLine("No session: " + target); Environment.Exit(1); }
                switch (cmd) {
                    case "get-volume": Console.WriteLine((int)Math.Round(SAVGetVol(savs[0])*100)); break;
                    case "set-volume": { float prev=(float)Math.Round(SAVGetVol(savs[0])*100); float sv=float.Parse(args[2])/100f; foreach(var p in savs) SAVSetVol(p,sv); Console.WriteLine("{\\"ok\\":true,\\"previousValue\\":" + (int)prev + ",\\"currentValue\\":" + (int)Math.Round(float.Parse(args[2])) + "}"); break; }
                    case "volume-up": { float d=args.Length>2?float.Parse(args[2]):10f; float c=SAVGetVol(savs[0])*100f; float nv=Math.Min(100f,c+d); foreach(var p in savs) SAVSetVol(p,nv/100f); Console.WriteLine("{\\"ok\\":true,\\"previousValue\\":" + (int)Math.Round(c) + ",\\"currentValue\\":" + (int)Math.Round(nv) + "}"); break; }
                    case "volume-down": { float dd=args.Length>2?float.Parse(args[2]):10f; float dc=SAVGetVol(savs[0])*100f; float nv=Math.Max(0f,dc-dd); foreach(var p in savs) SAVSetVol(p,nv/100f); Console.WriteLine("{\\"ok\\":true,\\"previousValue\\":" + (int)Math.Round(dc) + ",\\"currentValue\\":" + (int)Math.Round(nv) + "}"); break; }
                    case "get-mute": Console.WriteLine(SAVGetMute(savs[0]).ToString().ToLower()); break;
                    case "toggle-mute": { bool tm=SAVGetMute(savs[0]); float vol=(float)Math.Round(SAVGetVol(savs[0])*100); foreach(var p in savs) SAVSetMute(p,!tm); Console.WriteLine("{\\"ok\\":true,\\"isMuted\\":" + (!tm).ToString().ToLower() + ",\\"volume\\":" + (int)vol + "}"); break; }
                    case "set-mute": bool sm=args[2].ToLower()=="true"; foreach(var p in savs) SAVSetMute(p,sm); Console.WriteLine("OK"); break;
                }
                foreach(var p in savs) Rel(p);
            }
        } catch(Exception ex) { Console.Error.WriteLine("Error: "+ex.Message); Environment.Exit(1); }
    }
}`;

// ─── Compile once ─────────────────────────────────────────────────────────────

let compiled = false;

export function ensureAppVolumeExe(): string {
    if (compiled && fs.existsSync(exePath)) return exePath;

    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Write embedded source to temp file
    fs.writeFileSync(srcPath, APP_VOLUME_CS, 'utf8');

    // Find csc.exe
    const cscPaths = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    ];
    const csc = cscPaths.find(p => fs.existsSync(p));
    if (!csc) throw new Error('csc.exe not found — .NET Framework 4.x required');

    // Delete stale exe
    if (fs.existsSync(exePath)) fs.unlinkSync(exePath);

    execFileSync(csc, ['/nologo', `/out:${exePath}`, '/r:System.dll', srcPath],
        { timeout: 30000, stdio: 'pipe' });

    compiled = true;
    console.log('[appvolume] Compiled AppVolume.exe');
    return exePath;
}

export function runAppVolume(args: string[]): string {
    const exe = ensureAppVolumeExe();
    return execFileSync(exe, args, { timeout: 5000 }).toString().trim();
}