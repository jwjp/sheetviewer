!define SHEETVIEW_PROGID "Sheetview.Document"
!define SHEETVIEW_DISPLAYNAME "Sheetview"
!define SHEETVIEW_LEGACY_NAME "시트뷰"

!macro SHEETVIEW_RENAME_SHORTCUT DIRECTORY
  !insertmacro IsShortcutTarget "${DIRECTORY}\${SHEETVIEW_LEGACY_NAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro IsShortcutTarget "${DIRECTORY}\${SHEETVIEW_DISPLAYNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $1
    ${If} $1 = 1
      Delete "${DIRECTORY}\${SHEETVIEW_DISPLAYNAME}.lnk"
    ${EndIf}
    ${IfNot} ${FileExists} "${DIRECTORY}\${SHEETVIEW_DISPLAYNAME}.lnk"
      Rename "${DIRECTORY}\${SHEETVIEW_LEGACY_NAME}.lnk" "${DIRECTORY}\${SHEETVIEW_DISPLAYNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend

!macro SHEETVIEW_DELETE_LEGACY_SHORTCUT DIRECTORY
  !insertmacro IsShortcutTarget "${DIRECTORY}\${SHEETVIEW_LEGACY_NAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "${DIRECTORY}\${SHEETVIEW_LEGACY_NAME}.lnk"
    Delete "${DIRECTORY}\${SHEETVIEW_LEGACY_NAME}.lnk"
  ${EndIf}
!macroend

!macro SHEETVIEW_REGISTER_EXTENSION EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${SHEETVIEW_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro SHEETVIEW_UNREGISTER_EXTENSION EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${SHEETVIEW_PROGID}"
  DeleteRegValue SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Add Open with choices without changing the file type's default ProgID.
  WriteRegStr SHCTX "Software\Classes\${SHEETVIEW_PROGID}" "" "Sheetview spreadsheet"
  WriteRegDWORD SHCTX "Software\Classes\${SHEETVIEW_PROGID}" "AllowSilentDefaultTakeOver" 1
  WriteRegStr SHCTX "Software\Classes\${SHEETVIEW_PROGID}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "Software\Classes\${SHEETVIEW_PROGID}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  ; Keep the existing NSIS registry identity while displaying an English app name.
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${SHEETVIEW_DISPLAYNAME}"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${SHEETVIEW_DISPLAYNAME}"
  ; Migrate shortcuts made by earlier installers.
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  !insertmacro SHEETVIEW_RENAME_SHORTCUT "$SMPROGRAMS\$AppStartMenuFolder"
  !insertmacro SHEETVIEW_RENAME_SHORTCUT "$SMPROGRAMS"
  !insertmacro SHEETVIEW_RENAME_SHORTCUT "$DESKTOP"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "csv"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "tsv"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "xlsx"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "xls"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "xlsm"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "xlsb"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "ods"
  !insertmacro SHEETVIEW_REGISTER_EXTENSION "cell"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
    !insertmacro SHEETVIEW_DELETE_LEGACY_SHORTCUT "$SMPROGRAMS\$AppStartMenuFolder"
    ${If} $AppStartMenuFolder != ""
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro SHEETVIEW_DELETE_LEGACY_SHORTCUT "$SMPROGRAMS"
    !insertmacro SHEETVIEW_DELETE_LEGACY_SHORTCUT "$DESKTOP"
  ${EndIf}
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "csv"
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "tsv"
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "xlsx"
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "xls"
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "xlsm"
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "xlsb"
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "ods"
  !insertmacro SHEETVIEW_UNREGISTER_EXTENSION "cell"
  DeleteRegKey SHCTX "Software\Classes\${SHEETVIEW_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  !insertmacro UPDATEFILEASSOC
!macroend
