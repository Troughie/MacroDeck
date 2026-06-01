; Installer script to auto-install Interception with MacroDeck
; This file is included in the electron-builder NSIS installer

!macro customInstall
  DetailPrint "Post-installation: Installing Interception..."
  
  ; Check multiple possible locations for the installer
  StrCpy $0 ""
  ${If} ${FileExists} "$INSTDIR\resources\resources\install-interception.exe"
    StrCpy $0 "$INSTDIR\resources\resources\install-interception.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\resources\install-interception.exe"
    StrCpy $0 "$INSTDIR\resources\install-interception.exe"
  ${EndIf}
  
  ${If} $0 != ""
    DetailPrint "Found Interception installer at: $0"
    
    ; Show MessageBox to user
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "Đang cài đặt Interception Driver...`n`nMacroDeck cần Interception driver để hoạt động tốt." IDCANCEL InterceptionSkip
    
    DetailPrint "Running Interception installation..."
    
    ; Create temp directory
    CreateDirectory "$TEMP\MacroDeckInterception"
    
    ; Copy installer to temp
    CopyFiles $0 "$TEMP\MacroDeckInterception\install-interception.exe"
    
    ; Execute installer and wait
    DetailPrint "Executing Interception installer..."
    ExecWait "$TEMP\MacroDeckInterception\install-interception.exe" $1
    
    DetailPrint "Interception installation completed with exit code: $1"
    
    ; Clean up temp files
    RMDir /r "$TEMP\MacroDeckInterception"
    
    ; Show completion message with restart requirement
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Cài đặt Interception hoàn tất!$\n$\nMáy tính PHẢI khởi động lại để driver Interception hoạt động.$\n$\n- Nhấn OK: Khởi động lại ngay$\n- Nhấn CANCEL: Khởi động lại sau (app sẽ thông báo)" IDOK RestartNow
    
    ; User clicked CANCEL - write flag file for Electron to detect
    DetailPrint "User chose to restart later - writing restart flag"
    CreateDirectory "$LOCALAPPDATA\MacroDeck"
    FileOpen $9 "$LOCALAPPDATA\MacroDeck\need-restart-for-interception.flag" w
    FileWrite $9 "1"
    FileClose $9
    Goto InterceptionDone
    
    RestartNow:
    ; User clicked OK - set restart flag
    DetailPrint "Setting system restart flag..."
    SetRebootFlag true
    
    InterceptionDone:
    InterceptionSkip:
  ${Else}
    DetailPrint "Warning: Interception installer not found"
    MessageBox MB_OK|MB_ICONWARNING "Không tìm thấy Interception installer!$\n$\nBạn cần cài đặt Interception thủ công hoặc cài đặt lại MacroDeck."
  ${EndIf}
  
!macroend

!macro customUnInstall
  ; Uninstall cleanup if needed
!macroend





