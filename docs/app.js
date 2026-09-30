(() => {
  "use strict";

  const ROW_HEIGHT = 34;
  const COL_WIDTH = 150;
  const MIN_COL_WIDTH = 26;
  const MAX_COL_WIDTH = 2000;
  const MIN_ROW_HEIGHT = 22;
  const MAX_ROW_HEIGHT = 800;
  const ROW_LABEL_WIDTH = 62;
  const MAX_ROWS = 100000;
  const MAX_COLS = 200;
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  // Clipboard data is built synchronously, so very large ranges can freeze the view.
  const MAX_COPY_CELLS = 500000;
  const ACCEPTED = new Set([
    "csv",
    "tsv",
    "txt",
    "xlsx",
    "xls",
    "xlsm",
    "xlsb",
    "ods",
    "cell",
  ]);
  const $ = (id) => document.getElementById(id);
  const elements = {
    fileInput: $("fileInput"),
    empty: $("emptyState"),
    viewer: $("viewer"),
    gridViewport: $("gridViewport"),
    gridInner: $("gridInner"),
    tabs: $("sheetTabs"),
    search: $("searchInput"),
    searchCount: $("searchCount"),
    toast: $("toast"),
    dragOverlay: $("dragOverlay"),
    sheetNotice: $("sheetNotice"),
    sheetObjects: $("sheetObjects"),
    sheetObjectsSummary: $("sheetObjectsSummary"),
    sheetObjectList: $("sheetObjectList"),
    updateCheck: $("updateCheckButton"),
    updateBanner: $("updateBanner"),
    updateMessage: $("updateMessage"),
    updateInstall: $("updateInstallButton"),
  };
  const state = {
    workbook: null,
    file: null,
    activeIndex: 0,
    sheet: null,
    rowCount: 30,
    colCount: 12,
    actualRows: 0,
    actualCols: 0,
    cellKeys: [],
    valueCellCount: 0,
    filledCellCount: 0,
    rowHeight: ROW_HEIGHT,
    rowHeights: [],
    rowOffsets: [],
    columnWidths: [],
    columnOffsets: [],
    compactGrid: false,
    selected: { r: 0, c: 0 },
    selectionAnchor: { r: 0, c: 0 },
    selectionScope: "cells",
    matches: [],
    matchIndex: -1,
    query: "",
    renderPending: false,
    objectsBySheet: [],
    objectUrls: [],
  };
  let toastTimer = 0;
  let dragDepth = 0;
  let selectionDragging = false;
  let headerSelectionDrag = null;
  let resizeSession = null;

  function showToast(message, isError = false, duration = 5000) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.classList.remove("hidden");
    toastTimer = setTimeout(
      () => elements.toast.classList.add("hidden"),
      duration,
    );
  }

  function extension(name) {
    return name.split(".").pop().toLowerCase();
  }

  function countLabel(count, singular, plural = `${singular}s`) {
    return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
  }

  function columnName(index) {
    let name = "";
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
      name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    }
    return name;
  }

  function selectionBounds() {
    return {
      firstRow: Math.min(state.selectionAnchor.r, state.selected.r),
      lastRow: Math.max(state.selectionAnchor.r, state.selected.r),
      firstCol: Math.min(state.selectionAnchor.c, state.selected.c),
      lastCol: Math.max(state.selectionAnchor.c, state.selected.c),
    };
  }

  function dataRowCount() {
    return Math.max(1, Math.min(state.rowCount, state.actualRows));
  }

  function dataColCount() {
    return Math.max(1, Math.min(state.colCount, state.actualCols));
  }

  function inSelection(r, c, bounds = selectionBounds()) {
    return r >= bounds.firstRow && r <= bounds.lastRow &&
      c >= bounds.firstCol && c <= bounds.lastCol;
  }

  function rebuildColumnOffsets() {
    state.columnOffsets = [ROW_LABEL_WIDTH];
    for (const width of state.columnWidths)
      state.columnOffsets.push(state.columnOffsets.at(-1) + width);
  }

  function gridWidth() {
    return state.columnOffsets.at(-1);
  }

  function initializeRowOffsets() {
    state.rowHeights = Array(state.rowCount).fill(state.rowHeight);
    state.rowOffsets = [state.rowHeight];
    for (const height of state.rowHeights)
      state.rowOffsets.push(state.rowOffsets.at(-1) + height);
  }

  function gridHeight() {
    return state.rowOffsets.at(-1);
  }

  function rowAtOffset(y) {
    let low = 0;
    let high = state.rowCount;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (state.rowOffsets[middle + 1] <= y) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function cellText(cell) {
    if (!cell) return "";
    if ((cell.t === "s" || cell.t === "str") && cell.v != null)
      return String(cell.v);
    if (cell.w != null) return String(cell.w);
    if (cell.v != null) return String(cell.v);
    if (cell.f) return `=${cell.f}`;
    return "";
  }

  function cellFillColor(cell) {
    if (cell?.s?.patternType !== "solid") return null;
    const rgb = cell.s.fgColor?.rgb;
    return typeof rgb === "string" && /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rgb)
      ? `#${rgb.slice(-6)}`
      : null;
  }

  function decodeCsv(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe)
      return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff)
      return new TextDecoder("utf-16be").decode(bytes);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("euc-kr").decode(bytes);
    }
  }

  function detectDelimiter(text, ext) {
    if (ext === "tsv") return "\t";
    const sample = text.split(/\r?\n/).slice(0, 8).join("\n");
    const candidates = [",", "\t", ";", "|"];
    let best = ",",
      bestCount = 0;
    for (const delimiter of candidates) {
      let count = 0,
        quoted = false;
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === '"') {
          if (quoted && sample[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (!quoted && sample[i] === delimiter) count++;
      }
      if (count > bestCount) {
        best = delimiter;
        bestCount = count;
      }
    }
    return best;
  }

  async function openFile(file) {
    if (!file) return;
    const ext = extension(file.name);
    if (!ACCEPTED.has(ext)) {
      showToast(
        "Supported files: CSV, TSV, TXT, XLSX, XLS, XLSM, XLSB, ODS, and CELL.",
        true,
      );
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast("Files must be 30 MB or smaller.", true);
      return;
    }
    showToast("Opening file…", false, 30000);
    try {
      const buffer = await file.arrayBuffer();
      if (ext === "cell") {
        const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8));
        const isZip = header[0] === 0x50 && header[1] === 0x4b;
        const isCompound = header[0] === 0xd0 && header[1] === 0xcf;
        if (!isZip && !isCompound) throw new Error("not a HanCell workbook");
      }
      let workbook;
      if (["csv", "tsv", "txt"].includes(ext)) {
        const contents = decodeCsv(buffer).replace(/^\uFEFF/, "");
        workbook = XLSX.read(contents, {
          type: "string",
          raw: true,
          FS: detectDelimiter(contents, ext),
        });
      } else {
        workbook = XLSX.read(buffer, {
          type: "array",
          cellFormula: true,
          cellText: true,
          // HanCell rich text can include hs:size, which SheetJS cannot render as HTML.
          cellHTML: false,
          cellStyles: ext === "cell",
          bookFiles: ext === "cell",
        });
      }
      if (!workbook.SheetNames || workbook.SheetNames.length === 0)
        throw new Error("no sheets");
      let objects = { sheets: [], urls: [] };
      if (ext === "cell") {
        try {
          objects = window.CellObjects.extract(workbook);
        } catch (error) {
          console.warn("Failed to read embedded objects:", error);
        }
      }
      state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
      state.objectsBySheet = objects.sheets;
      state.objectUrls = objects.urls;
      state.file = file;
      state.workbook = workbook;
      state.activeIndex = 0;
      $("fileName").textContent = file.name;
      document.querySelector(".file-icon").textContent = [
        "csv",
        "tsv",
        "txt",
      ].includes(ext)
        ? "C"
        : ext === "cell"
          ? "H"
          : "X";
      $("fileMeta").textContent =
        `${formatBytes(file.size)} · ${countLabel(workbook.SheetNames.length, "sheet")} · ${ext === "cell" ? "Cell values, fills, images, and drawing text (simplified layout)" : "Read only"}`;
      $("fileName").title = file.name;
      elements.empty.classList.add("hidden");
      elements.viewer.classList.remove("hidden");
      activateSheet(0);
      elements.toast.classList.add("hidden");
    } catch (error) {
      console.error("Failed to open file:", error);
      if (ext === "cell") {
        showToast(
          "This .cell file could not be opened. In HanCell, use Save As to export it as XLSX or CSV, then open the exported file.",
          true,
          11000,
        );
      } else {
        showToast(
          "The file could not be opened. Check whether it is damaged or password protected.",
          true,
          7000,
        );
      }
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function activateSheet(index) {
    finishPointerInteraction();
    state.activeIndex = index;
    const name = state.workbook.SheetNames[index];
    state.sheet = state.workbook.Sheets[name];
    state.cellKeys = Object.keys(state.sheet).filter((key) => key[0] !== "!");
    state.valueCellCount = 0;
    state.filledCellCount = 0;
    let maxRow = -1,
      maxCol = -1;
    for (const key of state.cellKeys) {
      const address = XLSX.utils.decode_cell(key);
      maxRow = Math.max(maxRow, address.r);
      maxCol = Math.max(maxCol, address.c);
      if (cellText(state.sheet[key])) state.valueCellCount++;
      if (cellFillColor(state.sheet[key])) state.filledCellCount++;
    }
    if (maxRow < 0 && state.sheet["!ref"]) {
      try {
        const range = XLSX.utils.decode_range(state.sheet["!ref"]);
        maxRow = range.e.r;
        maxCol = range.e.c;
      } catch {
        // Keep the default grid for a malformed empty-sheet range.
      }
    }
    const sheetObjects = state.objectsBySheet[index];
    if (sheetObjects) {
      maxRow = Math.max(maxRow, sheetObjects.maxRow);
      maxCol = Math.max(maxCol, sheetObjects.maxCol);
    }
    state.actualRows = maxRow + 1;
    state.actualCols = maxCol + 1;
    const narrowColumns = (state.sheet["!cols"] || [])
      .slice(0, 100)
      .filter((col) => col?.wpx > 0 && col.wpx <= 32).length;
    const compactGrid = state.filledCellCount >= 20 && narrowColumns >= 12;
    state.compactGrid = compactGrid;
    state.rowHeight = compactGrid ? 26 : ROW_HEIGHT;
    state.rowCount = Math.min(MAX_ROWS, Math.max(30, state.actualRows));
    state.colCount = Math.min(MAX_COLS, Math.max(12, state.actualCols));
    initializeRowOffsets();
    state.columnWidths = Array(state.colCount).fill(compactGrid ? 26 : COL_WIDTH);
    rebuildColumnOffsets();
    state.selected = { r: 0, c: 0 };
    state.selectionAnchor = { r: 0, c: 0 };
    state.selectionScope = "cells";
    state.matches = [];
    state.matchIndex = -1;
    state.query = "";
    elements.search.value = "";
    elements.searchCount.textContent = "";
    $("sheetName").textContent = name;
    $("dimensionText").textContent =
      `${countLabel(state.actualRows, "row")} × ${countLabel(state.actualCols, "column")}`;
    $("footerCount").textContent = state.filledCellCount
      ? `${countLabel(state.valueCellCount, "value")} · ${countLabel(state.filledCellCount, "filled cell")}`
      : countLabel(state.valueCellCount, "cell");
    renderSheetObjects();
    renderTabs();
    renderGridStructure();
    elements.gridViewport.scrollTop = 0;
    elements.gridViewport.scrollLeft = 0;
    updateSelectionBar();
    renderRows();
    if (state.actualRows > MAX_ROWS || state.actualCols > MAX_COLS) {
      showToast(
        `Large sheets show only the first ${countLabel(MAX_ROWS, "row")} and ${countLabel(MAX_COLS, "column")}.`,
        false,
        7000,
      );
    }
  }

  function renderSheetObjects() {
    const objects = state.objectsBySheet[state.activeIndex] || {
      items: [],
      plainShapes: 0,
    };
    const hasValues = state.valueCellCount > 0;
    elements.sheetNotice.classList.toggle("hidden", hasValues);
    if (!hasValues) {
      elements.sheetNotice.textContent = state.filledCellCount
        ? objects.items.length
          ? "No cell values. Fills appear in the grid, and embedded objects appear below."
          : "No cell values. Content made with cell fills appears in the grid."
        : objects.items.length
          ? "No cell values on this sheet. See the embedded objects below."
          : "No cell values to display. This sheet may be an empty template or contain only formatting.";
    }
    const total = objects.items.length + objects.plainShapes;
    elements.sheetObjects.classList.toggle("hidden", total === 0);
    elements.sheetObjects.open = !hasValues && total > 0;
    elements.sheetObjectsSummary.textContent =
      `${countLabel(total, "embedded object")} (placement may differ from the original)`;
    elements.sheetObjectList.replaceChildren();
    for (const item of objects.items) {
      const card = document.createElement("div");
      card.className = "sheet-object-card";
      const location = document.createElement("small");
      location.textContent = `${columnName(item.col)}${item.row + 1}`;
      card.append(location);
      if (item.type === "image") {
        const picture = document.createElement("img");
        picture.src = item.url;
        picture.alt = item.name;
        picture.loading = "lazy";
        card.append(picture);
        const caption = document.createElement("span");
        caption.textContent = item.name;
        card.append(caption);
      } else {
        const text = document.createElement("span");
        text.textContent = item.type === "text" ? item.text : "Chart and object previews are unavailable.";
        card.append(text);
      }
      elements.sheetObjectList.append(card);
    }
    if (objects.plainShapes) {
      const note = document.createElement("p");
      note.className = "sheet-objects-note";
      note.textContent = `${countLabel(objects.plainShapes, "shape")} without text ${objects.plainShapes === 1 ? "is" : "are"} not displayed.`;
      elements.sheetObjectList.append(note);
    }
  }

  function renderTabs() {
    elements.tabs.replaceChildren();
    state.workbook.SheetNames.forEach((name, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.role = "tab";
      tab.className = `sheet-tab${index === state.activeIndex ? " active" : ""}`;
      tab.textContent = name;
      tab.title = name;
      tab.setAttribute("aria-selected", String(index === state.activeIndex));
      tab.addEventListener("click", () => activateSheet(index));
      elements.tabs.append(tab);
    });
  }

  function renderGridStructure() {
    elements.gridInner.replaceChildren();
    elements.gridInner.style.setProperty("--row-height", `${state.rowHeight}px`);
    elements.gridInner.style.setProperty("--cell-padding", state.compactGrid ? "2px" : "10px");
    elements.gridInner.style.setProperty("--cell-vertical-padding", state.compactGrid ? "2px" : "6px");
    elements.gridInner.style.width = `${gridWidth()}px`;
    elements.gridInner.style.height = `${gridHeight()}px`;
    const header = document.createElement("div");
    header.className = "grid-header";
    header.style.width = `${gridWidth()}px`;
    const corner = document.createElement("div");
    corner.className = "grid-corner";
    corner.title = "Select all cells";
    corner.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      selectAll();
    });
    header.append(corner);
    for (let c = 0; c < state.colCount; c++) {
      const label = document.createElement("div");
      label.className = "grid-column";
      label.style.width = `${state.columnWidths[c]}px`;
      label.dataset.col = String(c);
      label.title = `Select column ${columnName(c)}; drag to select more columns`;
      label.append(document.createTextNode(columnName(c)));
      label.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target !== label) return;
        event.preventDefault();
        event.stopPropagation();
        selectColumn(c);
        headerSelectionDrag = {
          kind: "columns",
          anchor: c,
          pointerId: event.pointerId,
        };
      });
      const handle = document.createElement("div");
      handle.className = "column-resize-handle";
      handle.dataset.col = String(c);
      handle.title = `Drag to resize column ${columnName(c)}; double-click to fit contents`;
      handle.setAttribute("aria-label", `Resize column ${columnName(c)}`);
      handle.addEventListener("pointerdown", startColumnResize);
      handle.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        finishPointerInteraction();
        autoFitColumn(c);
      });
      label.append(handle);
      header.append(label);
    }
    elements.gridInner.append(header);
  }

  function renderRows() {
    elements.gridInner
      .querySelectorAll(".grid-row")
      .forEach((row) => row.remove());
    const viewport = elements.gridViewport;
    const first = Math.max(0, rowAtOffset(viewport.scrollTop) - 8);
    const last = Math.min(
      state.rowCount,
      rowAtOffset(viewport.scrollTop + viewport.clientHeight) + 9,
    );
    const fragment = document.createDocumentFragment();
    const matchSet = new Set(state.matches.map((entry) => entry.address));
    const bounds = selectionBounds();
    for (let r = first; r < last; r++) {
      const row = document.createElement("div");
      row.className = "grid-row";
      row.dataset.row = String(r);
      row.style.top = `${state.rowOffsets[r]}px`;
      row.style.setProperty("--row-height", `${state.rowHeights[r]}px`);
      row.style.width = `${gridWidth()}px`;
      const number = document.createElement("div");
      number.className = "grid-row-number";
      number.textContent = String(r + 1);
      number.title = `Select row ${r + 1}; drag to select more rows`;
      if ((state.selectionScope === "rows" || state.selectionScope === "all") &&
          r >= bounds.firstRow && r <= bounds.lastRow)
        number.classList.add("selected");
      number.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target !== number) return;
        event.preventDefault();
        event.stopPropagation();
        selectRow(r);
        headerSelectionDrag = {
          kind: "rows",
          anchor: r,
          pointerId: event.pointerId,
        };
      });
      const handle = document.createElement("div");
      handle.className = "row-resize-handle";
      handle.title = `Drag to resize row ${r + 1}; double-click to fit contents`;
      handle.addEventListener("pointerdown", (event) => startRowResize(event, r));
      handle.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        finishPointerInteraction();
        autoFitRow(r);
      });
      number.append(handle);
      row.append(number);
      for (let c = 0; c < state.colCount; c++) {
        const address = `${columnName(c)}${r + 1}`;
        const cell = state.sheet[address];
        const element = document.createElement("div");
        element.className = "grid-cell";
        element.style.width = `${state.columnWidths[c]}px`;
        element.dataset.row = String(r);
        element.dataset.col = String(c);
        if (cell?.t === "n") element.classList.add("is-number");
        const fill = cellFillColor(cell);
        if (fill) element.style.setProperty("--cell-fill", fill);
        if (inSelection(r, c, bounds))
          element.classList.add("selected");
        if (state.selected.r === r && state.selected.c === c)
          element.classList.add("selection-focus");
        if (matchSet.has(address)) element.classList.add("search-hit");
        element.textContent = cellText(cell);
        element.title = cellText(cell);
        row.append(element);
      }
      fragment.append(row);
    }
    elements.gridInner.append(fragment);
  }

  function scheduleRender() {
    if (state.renderPending) return;
    state.renderPending = true;
    requestAnimationFrame(() => {
      state.renderPending = false;
      if (state.sheet) renderRows();
    });
  }

  function updateSelectionBar() {
    const address = `${columnName(state.selected.c)}${state.selected.r + 1}`;
    const cell = state.sheet?.[address];
    const bounds = selectionBounds();
    const first = `${columnName(bounds.firstCol)}${bounds.firstRow + 1}`;
    const last = `${columnName(bounds.lastCol)}${bounds.lastRow + 1}`;
    const selectionAddress = first === last ? first : `${first}:${last}`;
    $("cellAddress").textContent = selectionAddress;
    $("cellAddress").title = selectionAddress;
    $("cellValue").textContent = cell?.f ? `=${cell.f}` : cellText(cell);
  }

  function syncSelectionClasses() {
    const bounds = selectionBounds();
    const wholeRows = state.selectionScope === "rows" ||
      state.selectionScope === "all";
    const wholeColumns = state.selectionScope === "columns" ||
      state.selectionScope === "all";
    for (const cell of elements.gridInner.querySelectorAll(".grid-cell")) {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      cell.classList.toggle("selected", inSelection(r, c, bounds));
      cell.classList.toggle(
        "selection-focus",
        r === state.selected.r && c === state.selected.c,
      );
    }
    for (const label of elements.gridInner.querySelectorAll(".grid-column")) {
      const c = Number(label.dataset.col);
      label.classList.toggle(
        "selected",
        wholeColumns && c >= bounds.firstCol && c <= bounds.lastCol,
      );
    }
    for (const row of elements.gridInner.querySelectorAll(".grid-row")) {
      const r = Number(row.dataset.row);
      row.querySelector(".grid-row-number").classList.toggle(
        "selected",
        wholeRows && r >= bounds.firstRow && r <= bounds.lastRow,
      );
    }
    elements.gridInner.querySelector(".grid-corner").classList.toggle(
      "selected",
      state.selectionScope === "all",
    );
  }

  function selectRange(anchor, focus, scope) {
    state.selectionAnchor = anchor;
    state.selected = focus;
    state.selectionScope = scope;
    elements.gridViewport.focus({ preventScroll: true });
    updateSelectionBar();
    syncSelectionClasses();
  }

  function selectColumn(c) {
    selectColumnRange(c, c);
  }

  function selectRow(r) {
    selectRowRange(r, r);
  }

  function selectColumnRange(anchor, focus) {
    selectRange(
      { r: dataRowCount() - 1, c: anchor },
      { r: 0, c: focus },
      "columns",
    );
  }

  function selectRowRange(anchor, focus) {
    selectRange(
      { r: anchor, c: dataColCount() - 1 },
      { r: focus, c: 0 },
      "rows",
    );
  }

  function selectAll() {
    selectRange(
      { r: dataRowCount() - 1, c: dataColCount() - 1 },
      { r: 0, c: 0 },
      "all",
    );
  }

  function selectCell(r, c, scroll = true, extend = false) {
    state.selected = {
      r: Math.max(0, Math.min(state.rowCount - 1, r)),
      c: Math.max(0, Math.min(state.colCount - 1, c)),
    };
    if (!extend) state.selectionAnchor = { ...state.selected };
    state.selectionScope = "cells";
    updateSelectionBar();
    syncSelectionClasses();
    if (scroll) {
      const vp = elements.gridViewport;
      const top = state.rowOffsets[state.selected.r];
      const height = state.rowHeights[state.selected.r];
      const left = state.columnOffsets[state.selected.c];
      const width = state.columnWidths[state.selected.c];
      if (top < vp.scrollTop + state.rowHeight)
        vp.scrollTop = Math.max(0, top - state.rowHeight * 2);
      else if (top + height > vp.scrollTop + vp.clientHeight)
        vp.scrollTop = top + height - vp.clientHeight;
      if (left < vp.scrollLeft + ROW_LABEL_WIDTH)
        vp.scrollLeft = Math.max(0, left - ROW_LABEL_WIDTH);
      else if (left + width > vp.scrollLeft + vp.clientWidth)
        vp.scrollLeft = left + width - vp.clientWidth;
    }
    if (scroll) scheduleRender();
  }

  function applyColumnWidth(c, width) {
    state.columnWidths[c] = Math.max(
      MIN_COL_WIDTH,
      Math.min(MAX_COL_WIDTH, Math.round(width)),
    );
    rebuildColumnOffsets();
    const totalWidth = `${gridWidth()}px`;
    elements.gridInner.style.width = totalWidth;
    elements.gridInner.querySelector(".grid-header").style.width = totalWidth;
    for (const row of elements.gridInner.querySelectorAll(".grid-row"))
      row.style.width = totalWidth;
    const columnWidth = `${state.columnWidths[c]}px`;
    for (const element of elements.gridInner.querySelectorAll(
      `.grid-column[data-col="${c}"], .grid-cell[data-col="${c}"]`,
    ))
      element.style.width = columnWidth;
  }

  function startColumnResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const c = Number(event.currentTarget.dataset.col);
    resizeSession = {
      kind: "column",
      index: c,
      start: event.clientX,
      size: state.columnWidths[c],
    };
    document.body.classList.add("resizing-column");
  }

  function autoFitColumn(c) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    const sampleCell = elements.gridInner.querySelector(".grid-cell");
    context.font = sampleCell ? getComputedStyle(sampleCell).font : "13px sans-serif";
    let width = Math.max(MIN_COL_WIDTH, context.measureText(columnName(c)).width + 24);
    for (const address of state.cellKeys) {
      const coordinate = XLSX.utils.decode_cell(address);
      if (coordinate.c !== c || coordinate.r >= state.rowCount) continue;
      const value = cellText(state.sheet[address]);
      if (!value) continue;
      for (const line of value.replace(/\t/g, " ").split(/\r\n|\r|\n/))
        width = Math.max(
          width,
          context.measureText(line).width + (state.compactGrid ? 5 : 21),
        );
      if (width >= MAX_COL_WIDTH) break;
    }
    applyColumnWidth(c, width);
  }

  function applyRowHeight(r, height) {
    const next = Math.max(
      MIN_ROW_HEIGHT,
      Math.min(MAX_ROW_HEIGHT, Math.round(height)),
    );
    const change = next - state.rowHeights[r];
    if (!change) return;
    state.rowHeights[r] = next;
    for (let i = r + 1; i < state.rowOffsets.length; i++)
      state.rowOffsets[i] += change;
    elements.gridInner.style.height = `${gridHeight()}px`;
    for (const row of elements.gridInner.querySelectorAll(".grid-row")) {
      const index = Number(row.dataset.row);
      if (index >= r) row.style.top = `${state.rowOffsets[index]}px`;
      if (index === r) row.style.setProperty("--row-height", `${next}px`);
    }
  }

  function startRowResize(event, r) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeSession = {
      kind: "row",
      index: r,
      start: event.clientY,
      size: state.rowHeights[r],
      changed: false,
    };
    document.body.classList.add("resizing-row");
  }

  function autoFitRow(r) {
    const probe = document.createElement("div");
    probe.className = "grid-cell row-measure";
    probe.style.setProperty("--cell-padding", state.compactGrid ? "2px" : "10px");
    probe.style.setProperty("--cell-vertical-padding", state.compactGrid ? "2px" : "6px");
    document.body.append(probe);
    let height = state.rowHeight;
    for (let c = 0; c < state.colCount; c++) {
      const value = cellText(state.sheet[`${columnName(c)}${r + 1}`]);
      if (!value) continue;
      probe.style.width = `${state.columnWidths[c]}px`;
      probe.textContent = value;
      height = Math.max(height, Math.ceil(probe.getBoundingClientRect().height));
      if (height >= MAX_ROW_HEIGHT) break;
    }
    probe.remove();
    applyRowHeight(r, height);
    scheduleRender();
  }

  function copySelection(event) {
    if (!state.sheet) return;
    const bounds = selectionBounds();
    const cellCount =
      (bounds.lastRow - bounds.firstRow + 1) *
      (bounds.lastCol - bounds.firstCol + 1);
    if (cellCount > MAX_COPY_CELLS) {
      event.preventDefault();
      showToast("Copy up to 500,000 cells at once to keep the app responsive.", true);
      return;
    }
    const rows = [];
    for (let r = bounds.firstRow; r <= bounds.lastRow; r++) {
      const values = [];
      for (let c = bounds.firstCol; c <= bounds.lastCol; c++) {
        const value = cellText(state.sheet[`${columnName(c)}${r + 1}`]);
        values.push(
          /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value,
        );
      }
      rows.push(values.join("\t"));
    }
    event.clipboardData.setData("text/plain", rows.join("\r\n"));
    event.preventDefault();
    showToast(`Copied ${countLabel(cellCount, "cell")}.`, false, 2000);
  }

  function cellAtPoint(clientX, clientY) {
    const viewport = elements.gridViewport.getBoundingClientRect();
    const left = viewport.left + elements.gridViewport.clientLeft;
    const top = viewport.top + elements.gridViewport.clientTop;
    if (clientX < left + ROW_LABEL_WIDTH ||
        clientX >= left + elements.gridViewport.clientWidth ||
        clientY < top + state.rowHeight ||
        clientY >= top + elements.gridViewport.clientHeight)
      return null;
    const inner = elements.gridInner.getBoundingClientRect();
    const y = clientY - inner.top;
    if (y < state.rowOffsets[0] || y >= gridHeight()) return null;
    const r = rowAtOffset(y);
    const x = clientX - inner.left;
    if (r < 0 || r >= state.rowCount || x < ROW_LABEL_WIDTH || x >= gridWidth())
      return null;
    let c = 0;
    while (c < state.colCount && x >= state.columnOffsets[c + 1]) c++;
    return c < state.colCount ? { r, c } : null;
  }

  function columnAtPoint(clientX) {
    const x = clientX - elements.gridInner.getBoundingClientRect().left;
    let c = 0;
    while (c < state.colCount - 1 && x >= state.columnOffsets[c + 1]) c++;
    return c;
  }

  function rowAtPoint(clientY) {
    const y = clientY - elements.gridInner.getBoundingClientRect().top;
    return Math.max(0, Math.min(state.rowCount - 1, rowAtOffset(y)));
  }

  function runSearch() {
    state.query = elements.search.value.trim().toLocaleLowerCase();
    state.matches = [];
    state.matchIndex = -1;
    if (state.query) {
      for (const address of state.cellKeys) {
        const coordinate = XLSX.utils.decode_cell(address);
        if (coordinate.r >= MAX_ROWS || coordinate.c >= MAX_COLS) continue;
        if (
          cellText(state.sheet[address])
            .toLocaleLowerCase()
            .includes(state.query)
        ) {
          state.matches.push({ address, ...coordinate });
        }
      }
      state.matches.sort((a, b) => a.r - b.r || a.c - b.c);
    }
    elements.searchCount.textContent = state.query
      ? countLabel(state.matches.length, "match", "matches")
      : "";
    if (state.matches.length) moveMatch(1);
    else scheduleRender();
  }

  function moveMatch(direction) {
    if (!state.matches.length) return;
    state.matchIndex =
      (state.matchIndex + direction + state.matches.length) %
      state.matches.length;
    const target = state.matches[state.matchIndex];
    elements.searchCount.textContent = `${state.matchIndex + 1}/${state.matches.length}`;
    selectCell(target.r, target.c);
  }

  function openPicker() {
    elements.fileInput.click();
  }
  $("openButton").addEventListener("click", openPicker);
  $("emptyOpenButton").addEventListener("click", openPicker);
  $("newFileButton").addEventListener("click", openPicker);
  $("dropCard").addEventListener("click", openPicker);
  $("dropCard").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  });
  elements.fileInput.addEventListener("change", (event) => {
    openFile(event.target.files?.[0]);
    event.target.value = "";
  });
  elements.gridViewport.addEventListener("scroll", scheduleRender);
  elements.gridViewport.addEventListener("pointerdown", (event) => {
    if (!state.sheet || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!(event.target instanceof Element) || !event.target.closest(".grid-cell"))
      return;
    const cell = cellAtPoint(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    elements.gridViewport.focus({ preventScroll: true });
    selectCell(cell.r, cell.c, false, event.shiftKey);
    selectionDragging = true;
  });
  window.addEventListener("pointermove", (event) => {
    if (resizeSession) {
      // Recover if the release happened outside the window or was not delivered.
      if (event.buttons === 0) {
        finishPointerInteraction();
        return;
      }
      const distance = resizeSession.kind === "column"
        ? event.clientX - resizeSession.start
        : event.clientY - resizeSession.start;
      if (resizeSession.kind === "column")
        applyColumnWidth(resizeSession.index, resizeSession.size + distance);
      else if (Math.abs(distance) >= 3) {
        applyRowHeight(resizeSession.index, resizeSession.size + distance);
        resizeSession.changed = true;
      }
      return;
    }
    if (headerSelectionDrag) {
      if (event.pointerId !== headerSelectionDrag.pointerId) return;
      if (headerSelectionDrag.kind === "columns") {
        const c = columnAtPoint(event.clientX);
        if (c !== state.selected.c)
          selectColumnRange(headerSelectionDrag.anchor, c);
      } else {
        const r = rowAtPoint(event.clientY);
        if (r !== state.selected.r)
          selectRowRange(headerSelectionDrag.anchor, r);
      }
      return;
    }
    if (!selectionDragging) return;
    const cell = cellAtPoint(event.clientX, event.clientY);
    if (cell && (cell.r !== state.selected.r || cell.c !== state.selected.c))
      selectCell(cell.r, cell.c, false, true);
  });
  function finishPointerInteraction() {
    if (resizeSession?.kind === "row" && resizeSession.changed)
      scheduleRender();
    resizeSession = null;
    selectionDragging = false;
    headerSelectionDrag = null;
    document.body.classList.remove("resizing-column");
    document.body.classList.remove("resizing-row");
  }
  window.addEventListener("pointerup", finishPointerInteraction);
  window.addEventListener("pointercancel", finishPointerInteraction);
  window.addEventListener("blur", finishPointerInteraction);
  elements.gridViewport.addEventListener("copy", copySelection);
  elements.gridViewport.addEventListener("keydown", (event) => {
    if (!state.sheet) return;
    const moves = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dr, dc] = moves[event.key];
      selectCell(state.selected.r + dr, state.selected.c + dc, true, event.shiftKey);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!state.sheet || event.altKey || !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "a") return;
    if (event.target instanceof Element &&
        event.target.closest("input, textarea, [contenteditable]")) return;
    event.preventDefault();
    selectAll();
  });
  elements.search.addEventListener("input", runSearch);
  elements.search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveMatch(event.shiftKey ? -1 : 1);
    }
    if (event.key === "Escape") {
      elements.search.value = "";
      runSearch();
    }
  });
  $("searchPrev").addEventListener("click", () => moveMatch(-1));
  $("searchNext").addEventListener("click", () => moveMatch(1));

  document.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragDepth++;
    elements.dragOverlay.classList.remove("hidden");
  });
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  document.addEventListener("dragleave", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) elements.dragOverlay.classList.add("hidden");
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    elements.dragOverlay.classList.add("hidden");
    openFile(event.dataTransfer?.files?.[0]);
  });

  async function openStartupFile() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return;
    try {
      const name = await invoke("startup_file_name");
      if (!name) return;
      const bytes = await invoke("read_startup_file");
      await openFile(new File([new Uint8Array(bytes)], name));
    } catch (error) {
      console.error("Failed to open the file passed to the app:", error);
      showToast("Could not open the linked file. Check that it still exists.", true, 7000);
    }
  }

  let updateBusy = false;
  async function prepareUpdate(manual = false) {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || updateBusy) return;
    updateBusy = true;
    elements.updateCheck.disabled = true;
    elements.updateCheck.textContent = "Checking for updates…";
    try {
      const version = await invoke("prepare_update");
      if (version) {
        elements.updateMessage.textContent =
          `Version ${version} has been downloaded and verified.`;
        elements.updateInstall.classList.remove("hidden");
        elements.updateBanner.classList.remove("hidden");
      } else {
        elements.updateBanner.classList.add("hidden");
        if (manual) showToast("You're up to date.");
      }
    } catch (error) {
      console.error("Update check or download failed:", error);
      if (manual)
        showToast(
          "Could not check for or download updates. Check your internet connection.",
          true,
          7000,
        );
    } finally {
      updateBusy = false;
      elements.updateCheck.disabled = false;
      elements.updateCheck.textContent = "Check for updates";
    }
  }

  async function installUpdate() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || updateBusy) return;
    updateBusy = true;
    elements.updateCheck.disabled = true;
    elements.updateInstall.disabled = true;
    elements.updateMessage.textContent = "Installing the update and restarting the app…";
    try {
      await invoke("install_update");
    } catch (error) {
      console.error("Update installation failed:", error);
      elements.updateMessage.textContent =
        "The update could not be installed. You can try again.";
      showToast("Could not install the update.", true, 7000);
      updateBusy = false;
      elements.updateCheck.disabled = false;
      elements.updateInstall.disabled = false;
    }
  }

  if (window.__TAURI__?.core?.invoke) {
    elements.updateCheck.classList.remove("hidden");
    elements.updateCheck.addEventListener("click", () => prepareUpdate(true));
    elements.updateInstall.addEventListener("click", installUpdate);
    $("updateDismissButton").addEventListener("click", () => {
      elements.updateBanner.classList.add("hidden");
    });
    prepareUpdate();
  }

  openStartupFile();
})();
