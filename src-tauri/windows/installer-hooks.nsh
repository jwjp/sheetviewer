!define SHEETVIEW_PROGID "Sheetview.Document"

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
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
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
