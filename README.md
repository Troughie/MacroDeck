# MacroDeck

Biến bất kỳ bàn phím nào thành macro keyboard chuyên dụng — tương tự StreamDeck nhưng dùng bàn phím thật.

![MacroDeck Screenshot](assets/screenshot.png)

## Tính năng

- 🎹 **Chọn bàn phím macro** — Chọn 1 bàn phím cụ thể làm macro device. Bàn phím đó sẽ bị disable hoàn toàn (không gõ văn bản), chỉ dùng để trigger macro
- ⌨️ **Keyboard Visualizer** — Hiển thị layout bàn phím, animation khi nhấn phím
- 🖱️ **Drag & Drop** — Kéo macro type từ panel phải thả vào phím bất kỳ để gán
- 🚀 **6 loại macro:**
  - **Launch App** — Mở ứng dụng đã cài
  - **Web Link** — Mở URL trong trình duyệt
  - **Media Control** — Play/Pause/Next/Prev
  - **Mute Toggle** — Mute/Unmute system hoặc per-app
  - **Volume Control** — Tăng/giảm/set âm lượng system hoặc per-app (Brave, Discord, Spotify...)
  - **Hotkey** — Gửi tổ hợp phím
- 💾 **Auto-save** — Cấu hình tự động lưu
- 🔲 **System Tray** — Chạy nền, đóng cửa sổ không thoát app
- ⚡ **Run on Startup** — Khởi động cùng Windows

---

## Yêu cầu hệ thống

| Yêu cầu | Chi tiết |
|---|---|
| OS | Windows 10/11 (64-bit) |
| .NET Framework | 4.x (có sẵn trên Windows 10+) |
| Interception Driver | **Bắt buộc** — xem hướng dẫn bên dưới |
| RAM | ~100MB |
| Disk | ~200MB |

---

## Cài đặt

### Bước 1: Cài Interception Driver (BẮT BUỘC)

MacroDeck dùng [Interception driver](https://github.com/oblitum/Interception) để phân biệt input từ từng bàn phím riêng biệt và suppress keystroke.

**Cách cài:**

1. Download installer từ: https://github.com/oblitum/Interception/releases
2. Giải nén, mở **Command Prompt as Administrator**
3. Chạy:
   ```cmd
   install-interception.exe /install
   ```
4. **Restart máy tính**

> ⚠️ Nếu không cài driver này, MacroDeck vẫn chạy nhưng không thể phân biệt bàn phím và không thể suppress keystroke.

### Bước 2: Cài MacroDeck

**Option A — Installer (khuyến nghị):**
1. Download `MacroDeck-Setup-1.0.0.exe` từ [Releases](../../releases)
2. Chạy installer (có thể cần click "More info" → "Run anyway" vì app chưa được ký)
3. Chọn thư mục cài đặt → Install

**Option B — Portable:**
1. Download `MacroDeck-1.0.0-portable.exe`
2. Chạy trực tiếp, không cần cài đặt

---

## Build từ source

### Yêu cầu

- Node.js 18+
- npm
- .NET Framework 4.x SDK (để compile audio tools)

### Các bước

```bash
# 1. Clone repo
git clone https://github.com/yourusername/macrodeck.git
cd macrodeck

# 2. Cài dependencies
npm install --legacy-peer-deps

# 3. Chạy dev mode
npm run dev
```

### Build installer

**Chạy PowerShell as Administrator**, sau đó:

```powershell
cd D:\path\to\macrodeck
.\build.ps1
```

Hoặc build thủ công:

```powershell
# Set env vars để skip code signing
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK = ""

# Build
npm run build
npx electron-builder --win nsis --x64
```

Output sẽ ở thư mục `release/`.

> **Lưu ý:** Phải chạy as Administrator vì electron-builder cần tạo symlinks khi đóng gói.

---

## Hướng dẫn sử dụng

### 1. Chọn bàn phím macro

- Mở MacroDeck
- Panel trái hiển thị danh sách bàn phím đang kết nối
- Click **"Set as Macro Keyboard"** trên bàn phím muốn dùng
- Bàn phím đó sẽ bị disable hoàn toàn (không gõ văn bản được nữa)

### 2. Gán macro cho phím

- Panel phải có 6 loại macro
- **Kéo** một loại macro và **thả** vào phím bất kỳ trên keyboard visualizer
- Panel dưới sẽ hiện ra để cấu hình chi tiết

### 3. Cấu hình từng loại macro

**Launch App:**
- Tìm kiếm app trong danh sách
- Click để chọn

**Web Link:**
- Nhập URL (vd: `https://youtube.com`)
- Chọn trình duyệt (hoặc để Default)

**Media Control:**
- Chọn action: Play/Pause, Next, Previous
- Chọn target: System (global) hoặc app cụ thể

**Mute Toggle / Volume Control:**
- Chọn target: Master Volume hoặc app đang phát âm thanh (Brave, Discord, Spotify...)
- Volume Control: chọn Increase/Decrease/Set + giá trị %

**Hotkey:**
- Click vào ô "Record Shortcut"
- Nhấn tổ hợp phím muốn gửi (vd: Ctrl+Shift+N)

### 4. Chạy nền

- Đóng cửa sổ → app ẩn xuống system tray (góc phải taskbar)
- Double-click icon tray để mở lại
- Right-click icon tray → **Quit** để thoát hoàn toàn

### 5. Khởi động cùng Windows

- Click icon ⚙️ trên titlebar
- Bật **"Run on Startup"**
- Tùy chọn bật **"Start Minimized"** để app tự ẩn khi khởi động

---

## Troubleshooting

**Bàn phím không được nhận diện:**
- Kiểm tra Interception driver đã cài chưa: `install-interception.exe /is-installed`
- Restart máy sau khi cài driver
- Chạy MacroDeck as Administrator

**Macro không chạy:**
- Kiểm tra đã chọn đúng bàn phím trong panel trái
- Kiểm tra phím đã được gán macro (có label trên visualizer)
- Xem log trong DevTools (Ctrl+Shift+I trong dev mode)

**Volume/Mute không hoạt động với app cụ thể:**
- App phải đang phát âm thanh thì mới xuất hiện trong danh sách
- Thử mở app và phát audio trước khi cấu hình macro

**App không khởi động:**
- Đảm bảo .NET Framework 4.x đã cài (có sẵn trên Windows 10+)
- Chạy as Administrator lần đầu để compile audio tools

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 29 + React 18 + TypeScript |
| UI | Tailwind CSS + Framer Motion |
| State | Zustand |
| Storage | electron-store |
| Keyboard Hook | node-interception (Interception driver) |
| Audio Control | WASAPI via compiled C# (AppVolume.exe) |
| Drag & Drop | @dnd-kit/core |

---

## License

MIT
