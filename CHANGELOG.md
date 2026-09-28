# Changelog

**English** | [한국어](CHANGELOG.ko.md)

## 0.1.9 — Row sizing and whole-data selection

- Keep cell selections when the horizontal scrollbar is clicked.
- Select column or row data from its header; Ctrl+A selects the sheet's data range.
- Resize individual rows by dragging their number dividers, or double-click to fit wrapped content.
- Explain the 500,000-cell copy limit in the app and documentation.

## 0.1.8 — Grid resizing and range copy

- Resize individual columns by dragging header dividers, or double-click to fit their contents.
- Select rectangular cell ranges with the mouse or Shift+arrow keys and copy displayed values as tab-separated rows.
- Preserve blank cells, tabs, quotes, and line breaks when copying a range.

## 0.1.7 — English Windows app identity

- Use "Sheetview" for the executable, installer, and shortcut display names.
- Preserve the existing NSIS registry identity so earlier installations can still update.
- Migrate earlier Start menu and desktop shortcuts to the English name.

## 0.1.6 — English Windows app choice

- Show "Sheetview" in the Windows **Open with** and installed apps lists while preserving the existing installation identity for updates.

## 0.1.5 — English interface

- Display app controls, notices, errors, update messages, and accessibility labels in English.
- Show an English window title and installer descriptions while retaining the existing Windows installation identity for updates.

## 0.1.4 — In-app updates

- Check GitHub Releases for new desktop versions at startup and on demand.
- Download and verify signed updates automatically, then offer in-app installation.
- Add a release script that prepares the NSIS installer, update signature, manifest, and checksum.

## 0.1.3 — Windows file associations

- Registered supported spreadsheet formats as Windows **Open with** options in the installer.
- Opened a file passed by Windows Explorer automatically when Sheetview starts.
- Left default app selection to the user in Windows settings.

## 0.1.2 — HanCell cell fills

- Read styled cells without values and display solid fills.
- Use a compact grid for documents built from colored cells.
- Re-audited all 95 valid documents in the HanCell 2016 folder, including styled cells.

## 0.1.1 — Broader HanCell previews

- Audited all 95 valid `.cell` documents in the HanCell 2016 folder and opened templates without cell values.
- Added a per-sheet panel for embedded images and text in drawing objects.
- Distinguished temporary files from valid workbooks.

## 0.1.0 — First Windows app

- Added an installable Windows app that works offline.
- Opened CSV, TSV, TXT, XLSX, XLS, XLSM, XLSB, ODS, and HanCell `.cell` files.
- Added file selection, drag and drop, sheet navigation, search, and formula display.
- Kept file processing on the user's device without uploading documents.

Exact HanCell formatting and layout, rendered charts, and formula recalculation are not supported. The file size limit is 30 MB. The current installer is unsigned and may trigger a Windows SmartScreen warning.
