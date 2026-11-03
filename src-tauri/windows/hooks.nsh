!include "WinVer.nsh"

!macro NSIS_HOOK_PREINSTALL
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP|MB_OK "Magnat requires Windows 10 or newer."
    Abort
  ${EndIf}
!macroend
