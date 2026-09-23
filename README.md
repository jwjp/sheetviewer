# Sheetview

**English** | [한국어](README.ko.md)

Sheetview is an open-source, read-only viewer for CSV, Excel, and HanCell spreadsheets. Use it in a browser or as an installable Windows app. Files are processed on your device and are never uploaded to a server.

## Use Sheetview

Download the Windows installer from [GitHub Releases](https://github.com/jwjp/sheetviewer/releases), or open `docs/index.html` or the [online viewer](https://jwjp.github.io/sheetviewer/) in a browser. Choose a file or drag it onto the window. The installed app works offline and requires WebView2, which is usually present on Windows 10/11. The installer can prompt for WebView2 if it is missing.

| Format | Support |
| --- | --- |
| `.csv`, `.tsv`, `.txt` | UTF-8, UTF-16, and Korean EUC-KR/CP949-family encodings |
| `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.ods` | Cell values and formulas |
| HanCell `.cell` | Cell values, formulas, solid fills, embedded images, and text in drawing objects; layout and formatting are simplified |

If a `.cell` file does not open, use **File → Save As → Excel Workbook (.xlsx)** or CSV in HanCell, then open the converted file. [Hancom's HanCell help](https://help.hancom.com/hoffice/webhelp/9.0/en_us/hcell/file/save_as/save_as.htm) describes these export options. HanCell-specific typography and drawing placement are not reproduced exactly.

We audited 95 valid `.cell` documents in a HanCell 2016 folder. Every document's sheets opened, including templates without cell values. Pixel art made with cell fills is also visible. One hidden temporary file in the folder was excluded because it was not a workbook. This audit does not guarantee identical results for every HanCell version. None of the user-provided documents are included in the repository or app.

## Features

- Switch sheets, select cells, and inspect formulas
- View embedded images and drawing text by sheet in HanCell documents
- Show solid cell fills and use a compact grid for color-based documents
- Search cell values and move between matches
- Scroll large sheets with virtualized rows
- Detect common CSV delimiters and Korean text encodings
- Use the web version without installing anything, or use the Windows app offline

Files are limited to 30 MB, and the viewer displays up to the first 100,000 rows and 200 columns. Formulas are not recalculated; the viewer displays values saved in the file. Charts show a placeholder instead of a rendered graph. Pattern fills, textless shapes, pivot tables, and exact source formatting and placement are not rendered. Macros are never executed.

## Run locally

The web version needs no build or dependency installation. Open `docs/index.html` directly, or start a local server:

```sh
python -m http.server 8000 --directory docs
```

Then visit `http://localhost:8000`.

## Build the Windows app

The build machine needs Node.js and the [Rust MSVC toolchain, Microsoft C++ Build Tools, and WebView2](https://tauri.app/start/prerequisites/). Run these commands from the repository root:

```sh
npm ci
npm run desktop:build
```

The Windows installer (`-setup.exe`) is written to `src-tauri/target/release/bundle/nsis/`. The app embeds the same `docs` files as the web version. To regenerate the icons, install Pillow and run `python scripts/generate_icons.py`.

The current installer is unsigned, so Windows SmartScreen may show a warning. Check the publisher and file hash on GitHub Releases before installing.

## Web deployment

GitHub Pages serves the `docs` directory from `main`. Pushing changes to `docs` publishes a new web version.

## Development

The interface uses static HTML, CSS, and JavaScript with a Tauri 2 desktop shell. `docs/index.html` defines the page, `docs/style.css` styles it, and `docs/app.js` handles file parsing and grid rendering. Windows app settings are in `src-tauri/tauri.conf.json`. Check both the web and installed app after changing the interface.

Write code comments and primary documentation in English. Keep Korean translations in the corresponding `.ko.md` files.

To audit a directory of HanCell files, run `node scripts/audit-cell.mjs "path/to/folder"`. The report includes document, sheet, and formula counts and open errors without printing cell values.

Spreadsheet parsing uses [SheetJS Community Edition 0.20.3](https://docs.sheetjs.com/docs/miscellany/formats/). Its browser bundle is included at `docs/vendor/xlsx.full.min.js`, with the Apache-2.0 license at `docs/vendor/LICENSE.sheetjs.txt`.

See the [changelog](CHANGELOG.md) for release notes.

## Contributing

For reproducible bugs, attach a sample with sensitive information removed. HanCell compatibility issues are easier to investigate when the sample and expected cell values are available. Pull requests are welcome.

## License

Sheetview is released under the [MIT license](LICENSE). The bundled SheetJS code is licensed under Apache-2.0.
