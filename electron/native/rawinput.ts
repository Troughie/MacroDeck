import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createHash } from 'crypto';

const tmpDir = path.join(os.tmpdir(), 'macrodeck');

const RAW_INPUT_HOST_CS = `using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

class RawInputHost {
    const int RIM_TYPEMOUSE = 0;
    const int RIM_TYPEKEYBOARD = 1;
    const int RIM_TYPEHID = 2;
    const int WM_INPUT = 0x00FF;
    const int WM_INPUT_DEVICE_CHANGE = 0x00FE;
    const int WM_KEYDOWN = 0x0100;
    const int WM_KEYUP = 0x0101;
    const int WM_SYSKEYDOWN = 0x0104;
    const int WM_SYSKEYUP = 0x0105;
    const int WH_KEYBOARD_LL = 13;
    const uint RID_INPUT = 0x10000003;
    const uint RIDI_DEVICENAME = 0x20000007;
    const uint RIDEV_INPUTSINK = 0x00000100;
    const uint RIDEV_DEVNOTIFY = 0x00002000;
    const uint LLKHF_EXTENDED = 0x01;
    const uint LLKHF_INJECTED = 0x10;
    const int INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_SCANCODE = 0x0008;
    const int PENDING_REPLAY_TIMEOUT_MS = 250;

    static readonly object OutputLock = new object();
    static readonly object PendingLock = new object();
    static readonly List<PendingStroke> PendingBlocks = new List<PendingStroke>();
    static LowLevelKeyboardProc HookProcRef = HookProc;
    static IntPtr HookHandle = IntPtr.Zero;
    static bool BlockEnabled = true;
    static volatile bool BlockKeyboardInput = false;
    // Blocking the selected keyboard's normal typing is ON by default so a macro
    // keyboard stops behaving like a normal keyboard. Set
    // MACRODECK_DISABLE_KEYBOARD_BLOCK=1 to fall back to passthrough (debug only).
    static readonly bool ReplayBlockingEnabled =
        Environment.GetEnvironmentVariable("MACRODECK_DISABLE_KEYBOARD_BLOCK") != "1";
    static System.Threading.Timer PendingReplayTimer;

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICELIST {
        public IntPtr hDevice;
        public uint dwType;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICE {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTHEADER {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWKEYBOARD {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUT {
        public RAWINPUTHEADER header;
        public RAWKEYBOARD keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public INPUTUNION u;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct INPUTUNION {
        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    class DeviceInfo {
        public string Id = "";
        public string Name = "";
        public string Type = "keyboard";
        public string Path = "";
        public string Handle = "";
        public int VendorId;
        public int ProductId;
        public int InterfaceNumber = -1;
    }

    class PendingStroke {
        public int VKey;
        public int ScanCode;
        public bool Extended;
        public bool IsUp;
        public long ExpiresAt;
    }

    delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputDeviceList(IntPtr pRawInputDeviceList, ref uint puiNumDevices, uint cbSize);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern uint GetRawInputDeviceInfo(IntPtr hDevice, uint uiCommand, IntPtr pData, ref uint pcbSize);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern uint GetRawInputDeviceInfo(IntPtr hDevice, uint uiCommand, StringBuilder pData, ref uint pcbSize);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] pRawInputDevices, uint uiNumDevices, uint cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputData(IntPtr hRawInput, uint uiCommand, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    static string JsonEscape(string value) {
        if (value == null) return "";
        StringBuilder sb = new StringBuilder(value.Length + 8);
        foreach (char c in value) {
            if (c == (char)92) {
                sb.Append((char)92).Append((char)92);
            } else if (c == (char)34) {
                sb.Append((char)92).Append((char)34);
            } else if (c == (char)13 || c == (char)10) {
            } else {
                sb.Append(c);
            }
        }
        return sb.ToString();
    }

    static void WriteLine(string json) {
        lock (OutputLock) {
            Console.WriteLine(json);
            Console.Out.Flush();
        }
    }

    static string Q(string value) {
        return ((char)34) + JsonEscape(value) + ((char)34);
    }

    static string GetJsonValue(string line, string key) {
        string quotedKey = ((char)34) + key + ((char)34);
        int keyPos = line.IndexOf(quotedKey, StringComparison.Ordinal);
        if (keyPos < 0) return "";
        int colon = line.IndexOf(':', keyPos + quotedKey.Length);
        if (colon < 0) return "";
        int firstQuote = line.IndexOf((char)34, colon + 1);
        if (firstQuote < 0) return "";
        int secondQuote = line.IndexOf((char)34, firstQuote + 1);
        if (secondQuote < 0) return "";
        return line.Substring(firstQuote + 1, secondQuote - firstQuote - 1);
    }

    static bool GetJsonBool(string line, string key, bool fallbackValue) {
        string quotedKey = ((char)34) + key + ((char)34);
        int keyPos = line.IndexOf(quotedKey, StringComparison.Ordinal);
        if (keyPos < 0) return fallbackValue;
        int colon = line.IndexOf(':', keyPos + quotedKey.Length);
        if (colon < 0) return fallbackValue;
        string rest = line.Substring(colon + 1).TrimStart();
        if (rest.StartsWith("true", StringComparison.OrdinalIgnoreCase)) return true;
        if (rest.StartsWith("false", StringComparison.OrdinalIgnoreCase)) return false;
        return fallbackValue;
    }

    static uint Fnv1a(string value) {
        unchecked {
            uint hash = 2166136261;
            string normalized = (value ?? "").ToUpperInvariant();
            for (int i = 0; i < normalized.Length; i++) {
                hash ^= normalized[i];
                hash *= 16777619;
            }
            return hash;
        }
    }

    static int HexMatch(string value, string pattern, int fallbackValue) {
        Match m = Regex.Match(value ?? "", pattern, RegexOptions.IgnoreCase);
        if (!m.Success) return fallbackValue;
        return Convert.ToInt32(m.Groups[1].Value, 16);
    }

    static string GetDevicePath(IntPtr handle) {
        uint size = 0;
        GetRawInputDeviceInfo(handle, RIDI_DEVICENAME, IntPtr.Zero, ref size);
        if (size == 0) return "";
        StringBuilder sb = new StringBuilder((int)size + 1);
        uint result = GetRawInputDeviceInfo(handle, RIDI_DEVICENAME, sb, ref size);
        if (result == UInt32.MaxValue) return "";
        return sb.ToString();
    }

    static string HandleToString(IntPtr handle) {
        return handle.ToInt64().ToString("X");
    }

    static long NowMs() {
        return (Stopwatch.GetTimestamp() * 1000) / Stopwatch.Frequency;
    }

    static string DeviceTypeFromRawType(uint rawType) {
        if (rawType == RIM_TYPEMOUSE) return "mouse";
        if (rawType == RIM_TYPEKEYBOARD) return "keyboard";
        return "hid";
    }

    static string DeviceLabelFromType(string type) {
        if (type == "mouse") return "Mouse";
        if (type == "keyboard") return "Keyboard";
        return "HID";
    }

    static DeviceInfo BuildDevice(IntPtr handle, uint rawType) {
        string devicePath = GetDevicePath(handle);
        int vid = HexMatch(devicePath, "VID_([0-9A-Fa-f]{4})", 0);
        int pid = HexMatch(devicePath, "PID_([0-9A-Fa-f]{4})", 0);
        int mi = HexMatch(devicePath, "MI_([0-9A-Fa-f]{2})", -1);
        string type = DeviceTypeFromRawType(rawType);
        string label = DeviceLabelFromType(type);
        string name;
        if (vid > 0 || pid > 0) {
            name = label + " " + vid.ToString("X4") + ":" + pid.ToString("X4");
            if (mi >= 0) name += " [Interface " + mi.ToString() + "]";
        } else {
            name = label + " " + HandleToString(handle);
        }
        string identitySource = devicePath.Length > 0 ? devicePath : HandleToString(handle);
        return new DeviceInfo {
            Id = "raw:" + Fnv1a(identitySource).ToString("X8"),
            Name = name,
            Type = type,
            Path = devicePath,
            Handle = HandleToString(handle),
            VendorId = vid,
            ProductId = pid,
            InterfaceNumber = mi
        };
    }

    static List<DeviceInfo> EnumerateInputDevices() {
        List<DeviceInfo> devices = new List<DeviceInfo>();
        uint count = 0;
        uint listItemSize = (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICELIST));
        uint result = GetRawInputDeviceList(IntPtr.Zero, ref count, listItemSize);
        if (result == UInt32.MaxValue || count == 0) return devices;

        IntPtr buffer = Marshal.AllocHGlobal((int)(listItemSize * count));
        try {
            result = GetRawInputDeviceList(buffer, ref count, listItemSize);
            if (result == UInt32.MaxValue) return devices;
            for (int i = 0; i < count; i++) {
                IntPtr itemPtr = new IntPtr(buffer.ToInt64() + i * listItemSize);
                RAWINPUTDEVICELIST item = (RAWINPUTDEVICELIST)Marshal.PtrToStructure(itemPtr, typeof(RAWINPUTDEVICELIST));
                if (item.dwType != RIM_TYPEKEYBOARD && item.dwType != RIM_TYPEMOUSE) continue;
                devices.Add(BuildDevice(item.hDevice, item.dwType));
            }
        } finally {
            Marshal.FreeHGlobal(buffer);
        }
        return devices;
    }

    static string DevicesJson(List<DeviceInfo> devices) {
        StringBuilder sb = new StringBuilder();
        sb.Append("[");
        for (int i = 0; i < devices.Count; i++) {
            DeviceInfo d = devices[i];
            if (i > 0) sb.Append(",");
            sb.Append("{");
            sb.Append((char)34).Append("id").Append((char)34).Append(":").Append(Q(d.Id)).Append(",");
            sb.Append((char)34).Append("name").Append((char)34).Append(":").Append(Q(d.Name)).Append(",");
            sb.Append((char)34).Append("deviceType").Append((char)34).Append(":").Append(Q(d.Type)).Append(",");
            sb.Append((char)34).Append("vendorId").Append((char)34).Append(":").Append(d.VendorId).Append(",");
            sb.Append((char)34).Append("productId").Append((char)34).Append(":").Append(d.ProductId).Append(",");
            sb.Append((char)34).Append("interfaceNumber").Append((char)34).Append(":").Append(d.InterfaceNumber).Append(",");
            sb.Append((char)34).Append("hwid").Append((char)34).Append(":").Append(Q(d.Path)).Append(",");
            sb.Append((char)34).Append("rawDeviceHandle").Append((char)34).Append(":").Append(Q(d.Handle)).Append(",");
            sb.Append((char)34).Append("isKeyboard").Append((char)34).Append(":").Append(d.Type == "keyboard" ? "true" : "false").Append(",");
            sb.Append((char)34).Append("isMouse").Append((char)34).Append(":").Append(d.Type == "mouse" ? "true" : "false").Append(",");
            sb.Append((char)34).Append("isConnected").Append((char)34).Append(":true");
            sb.Append("}");
        }
        sb.Append("]");
        return sb.ToString();
    }

    static string CodeFromScan(int scanCode, bool extended) {
        if (extended) {
            switch (scanCode) {
                case 28: return "NumpadEnter";
                case 29: return "ControlRight";
                case 53: return "NumpadDivide";
                case 56: return "AltRight";
                case 71: return "Home";
                case 72: return "ArrowUp";
                case 73: return "PageUp";
                case 75: return "ArrowLeft";
                case 77: return "ArrowRight";
                case 79: return "End";
                case 80: return "ArrowDown";
                case 81: return "PageDown";
                case 82: return "Insert";
                case 83: return "Delete";
                case 91: return "MetaLeft";
                case 92: return "MetaRight";
                case 93: return "ContextMenu";
            }
        }

        switch (scanCode) {
            case 1: return "Escape";
            case 2: return "Digit1";
            case 3: return "Digit2";
            case 4: return "Digit3";
            case 5: return "Digit4";
            case 6: return "Digit5";
            case 7: return "Digit6";
            case 8: return "Digit7";
            case 9: return "Digit8";
            case 10: return "Digit9";
            case 11: return "Digit0";
            case 12: return "Minus";
            case 13: return "Equal";
            case 14: return "Backspace";
            case 15: return "Tab";
            case 16: return "KeyQ";
            case 17: return "KeyW";
            case 18: return "KeyE";
            case 19: return "KeyR";
            case 20: return "KeyT";
            case 21: return "KeyY";
            case 22: return "KeyU";
            case 23: return "KeyI";
            case 24: return "KeyO";
            case 25: return "KeyP";
            case 26: return "BracketLeft";
            case 27: return "BracketRight";
            case 28: return "Enter";
            case 29: return "ControlLeft";
            case 30: return "KeyA";
            case 31: return "KeyS";
            case 32: return "KeyD";
            case 33: return "KeyF";
            case 34: return "KeyG";
            case 35: return "KeyH";
            case 36: return "KeyJ";
            case 37: return "KeyK";
            case 38: return "KeyL";
            case 39: return "Semicolon";
            case 40: return "Quote";
            case 41: return "Backquote";
            case 42: return "ShiftLeft";
            case 43: return "Backslash";
            case 44: return "KeyZ";
            case 45: return "KeyX";
            case 46: return "KeyC";
            case 47: return "KeyV";
            case 48: return "KeyB";
            case 49: return "KeyN";
            case 50: return "KeyM";
            case 51: return "Comma";
            case 52: return "Period";
            case 53: return "Slash";
            case 54: return "ShiftRight";
            case 55: return "NumpadMultiply";
            case 56: return "AltLeft";
            case 57: return "Space";
            case 58: return "CapsLock";
            case 59: return "F1";
            case 60: return "F2";
            case 61: return "F3";
            case 62: return "F4";
            case 63: return "F5";
            case 64: return "F6";
            case 65: return "F7";
            case 66: return "F8";
            case 67: return "F9";
            case 68: return "F10";
            case 69: return "NumLock";
            case 70: return "ScrollLock";
            case 71: return "Numpad7";
            case 72: return "Numpad8";
            case 73: return "Numpad9";
            case 74: return "NumpadSubtract";
            case 75: return "Numpad4";
            case 76: return "Numpad5";
            case 77: return "Numpad6";
            case 78: return "NumpadAdd";
            case 79: return "Numpad1";
            case 80: return "Numpad2";
            case 81: return "Numpad3";
            case 82: return "Numpad0";
            case 83: return "NumpadDecimal";
            case 87: return "F11";
            case 88: return "F12";
            default: return "SC" + scanCode.ToString();
        }
    }

    static void ReplayStroke(PendingStroke stroke) {
        uint flags = KEYEVENTF_SCANCODE;
        if (stroke.Extended) flags |= KEYEVENTF_EXTENDEDKEY;
        if (stroke.IsUp) flags |= KEYEVENTF_KEYUP;

        INPUT input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.u.ki.wVk = 0;
        input.u.ki.wScan = (ushort)stroke.ScanCode;
        input.u.ki.dwFlags = flags;
        input.u.ki.time = 0;
        input.u.ki.dwExtraInfo = UIntPtr.Zero;

        INPUT[] inputs = new INPUT[] { input };
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    static List<PendingStroke> CollectExpiredPendingLocked(long now) {
        List<PendingStroke> expired = new List<PendingStroke>();
        for (int i = PendingBlocks.Count - 1; i >= 0; i--) {
            if (PendingBlocks[i].ExpiresAt < now) {
                expired.Add(PendingBlocks[i]);
                PendingBlocks.RemoveAt(i);
            }
        }
        expired.Reverse();
        return expired;
    }

    static void ReplayExpiredPending(object state) {
        long now = NowMs();
        List<PendingStroke> expired;
        lock (PendingLock) {
            expired = CollectExpiredPendingLocked(now);
        }
        for (int i = 0; i < expired.Count; i++) {
            ReplayStroke(expired[i]);
        }
    }

    static void QueueBlockedStroke(int vkey, int scanCode, bool extended, bool isUp) {
        long now = NowMs();
        List<PendingStroke> expired;
        lock (PendingLock) {
            expired = CollectExpiredPendingLocked(now);
            PendingBlocks.Add(new PendingStroke {
                VKey = vkey,
                ScanCode = scanCode,
                Extended = extended,
                IsUp = isUp,
                ExpiresAt = now + PENDING_REPLAY_TIMEOUT_MS
            });
        }
        for (int i = 0; i < expired.Count; i++) {
            ReplayStroke(expired[i]);
        }
    }

    static PendingStroke TakePendingStroke(int vkey, int scanCode, bool extended, bool isUp) {
        long now = NowMs();
        List<PendingStroke> expired;
        PendingStroke match = null;
        lock (PendingLock) {
            expired = CollectExpiredPendingLocked(now);
            for (int i = PendingBlocks.Count - 1; i >= 0; i--) {
                PendingStroke p = PendingBlocks[i];
                if (p.VKey == vkey && p.ScanCode == scanCode && p.Extended == extended && p.IsUp == isUp) {
                    PendingBlocks.RemoveAt(i);
                    match = p;
                    break;
                }
            }
        }
        for (int i = 0; i < expired.Count; i++) {
            ReplayStroke(expired[i]);
        }
        return match;
    }

    static IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int msg = wParam.ToInt32();
            bool isUp = msg == WM_KEYUP || msg == WM_SYSKEYUP;
            KBDLLHOOKSTRUCT data = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            bool isInjected = (data.flags & LLKHF_INJECTED) != 0;
            bool isExtended = (data.flags & LLKHF_EXTENDED) != 0;
            if (!isInjected && BlockEnabled && BlockKeyboardInput) {
                QueueBlockedStroke((int)data.vkCode, (int)data.scanCode, isExtended, isUp);
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(HookHandle, nCode, wParam, lParam);
    }

    static bool InstallHook() {
        try {
            using (Process currentProcess = Process.GetCurrentProcess())
            using (ProcessModule currentModule = currentProcess.MainModule) {
                IntPtr moduleHandle = GetModuleHandle(currentModule.ModuleName);
                HookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, HookProcRef, moduleHandle, 0);
            }
            return HookHandle != IntPtr.Zero;
        } catch {
            return false;
        }
    }

    class RawWindow : NativeWindow {
        public string SelectedDeviceId = "";
        Dictionary<string, DeviceInfo> devicesByHandle = new Dictionary<string, DeviceInfo>();
        Dictionary<string, DeviceInfo> devicesById = new Dictionary<string, DeviceInfo>();

        public RawWindow() {
            CreateParams cp = new CreateParams();
            cp.Caption = "MacroDeckRawInput";
            CreateHandle(cp);
            RegisterInputDevices();
            RefreshDevices("ready");
        }

        void RegisterInputDevices() {
            RAWINPUTDEVICE[] rid = new RAWINPUTDEVICE[2];
            rid[0].usUsagePage = 0x01;
            rid[0].usUsage = 0x02;
            rid[0].dwFlags = RIDEV_INPUTSINK | RIDEV_DEVNOTIFY;
            rid[0].hwndTarget = Handle;
            rid[1].usUsagePage = 0x01;
            rid[1].usUsage = 0x06;
            rid[1].dwFlags = RIDEV_INPUTSINK | RIDEV_DEVNOTIFY;
            rid[1].hwndTarget = Handle;
            bool ok = RegisterRawInputDevices(rid, 2, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE)));
            if (!ok) WriteLine("{\\"type\\":\\"error\\",\\"message\\":\\"RegisterRawInputDevices failed\\"}");
        }

        public void SelectDevice(string deviceId) {
            SelectedDeviceId = deviceId ?? "";
            UpdateKeyboardBlockState();
        }

        void UpdateKeyboardBlockState() {
            DeviceInfo selected;
            BlockKeyboardInput = ReplayBlockingEnabled
                && SelectedDeviceId.Length > 0
                && devicesById.TryGetValue(SelectedDeviceId, out selected)
                && selected.Type == "keyboard";
        }

        public void RefreshDevices(string type) {
            List<DeviceInfo> devices = EnumerateInputDevices();
            Dictionary<string, DeviceInfo> next = new Dictionary<string, DeviceInfo>();
            Dictionary<string, DeviceInfo> nextById = new Dictionary<string, DeviceInfo>();
            for (int i = 0; i < devices.Count; i++) {
                next[devices[i].Handle] = devices[i];
                nextById[devices[i].Id] = devices[i];
            }
            devicesByHandle = next;
            devicesById = nextById;
            UpdateKeyboardBlockState();
            WriteLine("{\\"type\\":\\"" + type + "\\",\\"devices\\":" + DevicesJson(devices) + ",\\"hookInstalled\\":" + (HookHandle != IntPtr.Zero ? "true" : "false") + ",\\"blockingActive\\":" + (BlockKeyboardInput ? "true" : "false") + ",\\"blockingSupported\\":" + (ReplayBlockingEnabled ? "true" : "false") + "}");
        }

        protected override void WndProc(ref Message m) {
            if (m.Msg == WM_INPUT) {
                ProcessRawInput(m.LParam);
            } else if (m.Msg == WM_INPUT_DEVICE_CHANGE) {
                RefreshDevices("device-list");
            }
            base.WndProc(ref m);
        }

        void ProcessRawInput(IntPtr lParam) {
            uint size = 0;
            uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
            GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref size, headerSize);
            if (size == 0) return;
            IntPtr buffer = Marshal.AllocHGlobal((int)size);
            try {
                uint read = GetRawInputData(lParam, RID_INPUT, buffer, ref size, headerSize);
                if (read == UInt32.MaxValue || read == 0) return;
                RAWINPUT raw = (RAWINPUT)Marshal.PtrToStructure(buffer, typeof(RAWINPUT));
                if (raw.header.dwType != RIM_TYPEKEYBOARD) return;

                string handle = HandleToString(raw.header.hDevice);
                DeviceInfo device;
                if (!devicesByHandle.TryGetValue(handle, out device)) {
                    device = BuildDevice(raw.header.hDevice, raw.header.dwType);
                    devicesByHandle[handle] = device;
                    devicesById[device.Id] = device;
                    UpdateKeyboardBlockState();
                }

                if (device.Type != "keyboard") return;

                bool isUp = raw.keyboard.Message == WM_KEYUP || raw.keyboard.Message == WM_SYSKEYUP || (raw.keyboard.Flags & 0x01) != 0;
                bool isExtended = (raw.keyboard.Flags & 0x02) != 0;
                int scanCode = raw.keyboard.MakeCode;
                int vkey = raw.keyboard.VKey;
                string code = CodeFromScan(scanCode, isExtended);
                PendingStroke blocked = TakePendingStroke(vkey, scanCode, isExtended, isUp);
                bool isSelected = SelectedDeviceId.Length > 0 && device.Id == SelectedDeviceId;

                if (!isSelected) {
                    if (blocked != null) ReplayStroke(blocked);
                    return;
                }

                StringBuilder sb = new StringBuilder();
                sb.Append("{\\"type\\":\\"key\\",");
                sb.Append("\\"code\\":").Append(Q(code)).Append(",");
                sb.Append("\\"keycode\\":").Append(vkey).Append(",");
                sb.Append("\\"scanCode\\":").Append(scanCode).Append(",");
                sb.Append("\\"extended\\":").Append(isExtended ? "true" : "false").Append(",");
                sb.Append("\\"state\\":").Append(Q(isUp ? "up" : "down")).Append(",");
                sb.Append("\\"deviceId\\":").Append(Q(device.Id)).Append(",");
                sb.Append("\\"deviceHandle\\":").Append(Q(device.Handle)).Append(",");
                sb.Append("\\"isMacroDevice\\":true}");
                WriteLine(sb.ToString());
            } finally {
                Marshal.FreeHGlobal(buffer);
            }
        }
    }

    static void CommandLoop(RawWindow window) {
        string line;
        while ((line = Console.ReadLine()) != null) {
            string cmd = GetJsonValue(line, "cmd");
            if (cmd == "select") {
                window.SelectDevice(GetJsonValue(line, "deviceId"));
            } else if (cmd == "setBlock") {
                BlockEnabled = GetJsonBool(line, "enabled", true);
            } else if (cmd == "list") {
                window.RefreshDevices("device-list");
            } else if (cmd == "exit") {
                Application.Exit();
                return;
            }
        }
    }

    [STAThread]
    static void Main() {
        Console.OutputEncoding = Encoding.UTF8;
        PendingReplayTimer = new System.Threading.Timer(ReplayExpiredPending, null, PENDING_REPLAY_TIMEOUT_MS, 25);
        bool hookOk = InstallHook();
        RawWindow window = new RawWindow();
        WriteLine("{\\"type\\":\\"hook\\",\\"installed\\":" + (hookOk ? "true" : "false") + ",\\"mode\\":\\"raw-input-correlated\\"}");
        Thread commandThread = new Thread(delegate() { CommandLoop(window); });
        commandThread.IsBackground = true;
        commandThread.Start();
        Application.Run();
        if (PendingReplayTimer != null) PendingReplayTimer.Dispose();
        if (HookHandle != IntPtr.Zero) UnhookWindowsHookEx(HookHandle);
    }
}`;

const rawInputHostHash = createHash('sha1').update(RAW_INPUT_HOST_CS).digest('hex').slice(0, 10);
const exePath = path.join(tmpDir, `RawInputHost-${rawInputHostHash}.exe`);
const srcPath = path.join(tmpDir, `RawInputHost-${rawInputHostHash}.cs`);

let compiled = false;

export interface RawInputHostMessage {
  type: string;
  devices?: any[];
  blockingActive?: boolean;
  blockingSupported?: boolean;
  code?: string;
  keycode?: number;
  scanCode?: number;
  extended?: boolean;
  state?: 'down' | 'up';
  deviceId?: string;
  deviceHandle?: string;
  isMacroDevice?: boolean;
  hookInstalled?: boolean;
  installed?: boolean;
  message?: string;
}

export function ensureRawInputHostExe(): string {
  if (compiled && fs.existsSync(exePath)) return exePath;
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  fs.writeFileSync(srcPath, RAW_INPUT_HOST_CS, 'utf8');

  const cscPaths = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
  const csc = cscPaths.find(p => fs.existsSync(p));
  if (!csc) throw new Error('csc.exe not found - .NET Framework 4.x required');

  if (fs.existsSync(exePath)) fs.unlinkSync(exePath);

  execFileSync(csc, [
    '/nologo',
    `/out:${exePath}`,
    '/r:System.dll',
    '/r:System.Core.dll',
    '/r:System.Windows.Forms.dll',
    srcPath,
  ], { timeout: 30000, stdio: 'pipe' });

  compiled = true;
  console.log('[rawinput] Compiled RawInputHost.exe');
  return exePath;
}

export function startRawInputHost(
  onMessage: (message: RawInputHostMessage) => void,
  onExit: (code: number | null) => void
): ChildProcessWithoutNullStreams {
  const exe = ensureRawInputHostExe();
  const child = spawn(exe, [], {
    stdio: 'pipe',
    windowsHide: true,
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let buffer = '';
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          onMessage(JSON.parse(line));
        } catch (err) {
          console.error('[rawinput] Invalid host JSON:', line.slice(0, 200), err);
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });

  child.stderr.on('data', (chunk: string) => {
    const text = chunk.trim();
    if (text) console.error('[rawinput] host stderr:', text);
  });

  child.on('exit', (code) => onExit(code));

  return child;
}
