# MacroDeck

Bien mot ban phim phu thanh bo phim macro chuyen dung cho desktop.

## Cach hoat dong

MacroDeck "dedicate" mot ban phim: doi driver cua no sang **WinUSB** (qua `wdi-simple` /
libwdi, chay **elevated**), roi doc truc tiep **HID boot report** tu ban phim do. Khi da
dedicate, ban phim do **NGUNG go vao Windows** va chi dung de trigger macro — nen khong bi
go nham vao app dang focus. Bam **"Release to Windows"** de tra lai driver HID mac dinh
(qua `pnputil`), khong can rut/cam lai.

> Vi ban phim macro ngung go vao Windows khi dedicate, ban nen co **ban phim thu hai** de go binh thuong.

## Tinh nang

- Dedicate mot ban phim thanh macro device (WinUSB), doc raw HID.
- Keyboard visualizer voi trang thai phim va macro da gan.
- Keo tha macro type vao phim de gan thao tac.
- Ho tro macro: Launch App, Web Link, Media Control, Mute Toggle, Volume Control, Hotkey, Profile Switch.
- Nhieu profile, chuyen profile bang macro.
- Luu cau hinh tu dong, chay nen trong system tray, tuy chon khoi dong cung Windows.

## Yeu cau he thong

| Yeu cau | Chi tiet |
|---|---|
| OS | Windows 10/11 64-bit |
| Quyen | Admin (UAC) khi Dedicate/Release de doi driver |
| Ban phim | Nen co 2 ban phim (1 lam macro, 1 go binh thuong) |
| Node.js | 18+ khi build tu source |
| .NET Framework | 4.x cho helper audio/hotkey |

## Cai dat tu source

```bash
npm install --legacy-peer-deps
npm run dev
```

`resources/wdi-simple.exe` (libwdi) can co de dung tinh nang Dedicate/Release — xem
[`resources/README.md`](resources/README.md).

## Build

```powershell
npm run build
npm run dist:win
```

Output nam trong thu muc `release/`.

## Su dung

1. Mo MacroDeck.
2. Trong panel **Keyboards**, chon ban phim muon dung lam macro roi bam **"Set as Macro Keyboard"** (chap nhan UAC).
3. Doi vai giay cho Windows re-enumerate; ban phim do ngung go vao Windows.
4. Keo macro type vao phim tren keyboard visualizer va cau hinh chi tiet trong panel settings.
5. Bam phim da gan de trigger macro.
6. Xong thi bam **"Release to Windows"** de tra ban phim ve binh thuong.

## Troubleshooting

**Nut Dedicate/Release bi an hoac bao loi**
- Can `resources/wdi-simple.exe` (xem `resources/README.md`). Neu thieu, `driverStatus.available = false` va nut Dedicate bi an.
- Phai chap nhan UAC (thao tac chay elevated).

**Ban phim khong phan hoi sau khi Dedicate**
- Windows con dang re-enumerate — doi vai giay. Neu van khong duoc, rut/cam lai mot lan.

**Macro khong chay / phim bi "ket"**
- Kiem tra da gan macro dung phim va dung ban phim macro dang duoc doc.
- Xem log (ca ban dev lan ban exe): `%APPDATA%/MacroDeck/macrodeck-debug.log`.

**Volume/Mute khong hoat dong voi app cu the**
- App can dang co audio session thi moi xuat hien trong danh sach. Thu mo app va phat audio truoc.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron + React 18 + TypeScript |
| UI | Tailwind CSS + Framer Motion |
| State | Zustand |
| Storage | electron-store |
| Keyboard input | node-usb (libusb) doc HID boot report qua WinUSB |
| Driver swap | libwdi (`wdi-simple.exe`) + `pnputil` |
| Audio Control | WASAPI qua C# helper compiled |
| Drag & Drop | @dnd-kit/core |

## License

MIT
