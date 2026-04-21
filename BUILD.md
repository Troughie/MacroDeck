# Hướng dẫn Build MacroDeck

## Vấn đề thường gặp khi build

electron-builder cần tạo **symbolic links** khi đóng gói, yêu cầu quyền Administrator trên Windows.

## Cách build

### Bước 1: Mở PowerShell as Administrator

- Nhấn `Win + X` → chọn **"Windows PowerShell (Admin)"** hoặc **"Terminal (Admin)"**
- Hoặc: Tìm "PowerShell" trong Start Menu → Right-click → **"Run as administrator"**

### Bước 2: Di chuyển đến thư mục project

```powershell
cd D:\Project\streamdesk
```

### Bước 3: Chạy build script

```powershell
.\build.ps1
```

### Output

File installer sẽ ở: `release\MacroDeck Setup 1.0.0.exe`

---

## Build thủ công

```powershell
# Trong PowerShell as Administrator
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK = ""

npm run build
npx electron-builder --win nsis --x64
```
