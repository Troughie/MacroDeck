# MacroDeck

Bien bat ky ban phim nao thanh bo phim macro cho desktop.

## Tinh nang

- Chon backend ban phim driverless de trigger macro.
- Keyboard visualizer voi trang thai phim va macro da gan.
- Keo tha macro type vao phim de gan thao tac.
- Ho tro macro Launch App, Web Link, Media Control, Mute Toggle, Volume Control, Hotkey va Profile Switch.
- Luu cau hinh tu dong.
- Chay nen trong system tray.
- Tuy chon khoi dong cung Windows.

## Trang thai input backend

Kernel driver cu da duoc go khoi project. App hien tai dung backend driverless `uiohook-napi` da co san trong dependencies.

Gioi han tam thoi:

- Khong con cai hoac dong goi kernel driver cu.
- Khong con phan biet tung ban phim theo hardware id.
- Khong suppress keystroke cua ban phim macro. Phim duoc bam van di vao Windows/app dang focus.
- Device list hien mot nguon tong: `All Keyboards (driverless)`.

Phan pipeline phan biet thiet bi/suppress se duoc lam lai o backend moi sau.

## Yeu cau he thong

| Yeu cau | Chi tiet |
|---|---|
| OS | Windows 10/11 64-bit |
| Node.js | 18+ khi build tu source |
| .NET Framework | 4.x cho cac helper audio/hotkey |
| RAM | Khoang 100MB |
| Disk | Khoang 200MB |

## Cai dat tu source

```bash
npm install --legacy-peer-deps
npm run dev
```

## Build

```powershell
npm run build
npx electron-builder --win nsis --x64
```

Hoac:

```powershell
.\build.ps1
```

Output nam trong thu muc `release/`.

## Su dung

1. Mo MacroDeck.
2. Chon `All Keyboards (driverless)` trong panel Keyboards.
3. Keo macro type vao phim tren keyboard visualizer.
4. Cau hinh chi tiet macro trong panel settings.
5. Bam phim da gan macro de trigger.

## Troubleshooting

**Macro khong chay**

- Kiem tra da gan macro cho dung phim.
- Kiem tra `All Keyboards (driverless)` dang duoc chon.
- Xem log trong DevTools khi chay dev mode.

**Volume/Mute khong hoat dong voi app cu the**

- App can dang co audio session thi moi xuat hien trong danh sach.
- Thu mo app va phat audio truoc khi cau hinh macro.

**App khong khoi dong**

- Kiem tra Node/npm khi chay source.
- Kiem tra .NET Framework 4.x neu helper hotkey/audio can compile lan dau.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 29 + React 18 + TypeScript |
| UI | Tailwind CSS + Framer Motion |
| State | Zustand |
| Storage | electron-store |
| Keyboard Hook | uiohook-napi driverless backend |
| Audio Control | WASAPI via compiled C# helper |
| Drag & Drop | @dnd-kit/core |

## License

MIT
