(() => {
  "use strict";

  const ROW_HEIGHT = 34;
  const COL_WIDTH = 150;
  const ROW_LABEL_WIDTH = 62;
  const MAX_ROWS = 100000;
  const MAX_COLS = 200;
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
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
    colWidth: COL_WIDTH,
    compactGrid: false,
    selected: { r: 0, c: 0 },
    matches: [],
    matchIndex: -1,
    query: "",
    renderPending: false,
    objectsBySheet: [],
    objectUrls: [],
  };
  let toastTimer = 0;
  let dragDepth = 0;

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

  function columnName(index) {
    let name = "";
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
      name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    }
    return name;
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
        "지원하는 파일은 CSV, TSV, XLSX, XLS, XLSM, XLSB, ODS, CELL입니다.",
        true,
      );
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast("현재 버전은 30MB 이하 파일을 열 수 있습니다.", true);
      return;
    }
    showToast("파일을 읽는 중입니다…", false, 30000);
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
          console.warn("삽입된 개체를 읽지 못했습니다:", error);
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
        `${formatBytes(file.size)} · ${workbook.SheetNames.length}개 시트 · ${ext === "cell" ? "셀 값·배경색·그림·도형 텍스트 보기 (원본 배치 제외)" : "읽기 전용"}`;
      $("fileName").title = file.name;
      elements.empty.classList.add("hidden");
      elements.viewer.classList.remove("hidden");
      activateSheet(0);
      elements.toast.classList.add("hidden");
    } catch (error) {
      console.error("파일 열기 실패:", error);
      if (ext === "cell") {
        showToast(
          "이 .cell 파일은 직접 읽을 수 없습니다. 한셀에서 '다른 이름으로 저장' → XLSX 또는 CSV로 저장한 뒤 열어 주세요.",
          true,
          11000,
        );
      } else {
        showToast(
          "파일을 열지 못했습니다. 손상되었거나 암호가 걸린 파일인지 확인해 주세요.",
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
    state.colWidth = compactGrid ? 26 : COL_WIDTH;
    state.rowCount = Math.min(MAX_ROWS, Math.max(30, state.actualRows));
    state.colCount = Math.min(MAX_COLS, Math.max(12, state.actualCols));
    state.selected = { r: 0, c: 0 };
    state.matches = [];
    state.matchIndex = -1;
    state.query = "";
    elements.search.value = "";
    elements.searchCount.textContent = "";
    $("sheetName").textContent = name;
    $("dimensionText").textContent =
      `${state.actualRows.toLocaleString()}행 × ${state.actualCols.toLocaleString()}열`;
    $("footerCount").textContent = state.filledCellCount
      ? `${state.valueCellCount.toLocaleString()}개 값 · ${state.filledCellCount.toLocaleString()}개 색상 셀`
      : `${state.valueCellCount.toLocaleString()}개 셀`;
    renderSheetObjects();
    renderTabs();
    renderGridStructure();
    elements.gridViewport.scrollTop = 0;
    elements.gridViewport.scrollLeft = 0;
    updateSelectionBar();
    renderRows();
    if (state.actualRows > MAX_ROWS || state.actualCols > MAX_COLS) {
      showToast(
        `큰 시트는 처음 ${MAX_ROWS.toLocaleString()}행, ${MAX_COLS}열까지만 표시합니다.`,
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
          ? "셀 값은 없습니다. 배경색은 표에, 삽입된 개체는 아래에 표시됩니다."
          : "셀 값은 없지만 배경색으로 만든 내용이 표에 표시됩니다."
        : objects.items.length
          ? "이 시트에는 셀 값이 없습니다. 아래 삽입된 개체를 확인하세요."
          : "표시할 셀 값이 없습니다. 빈 양식이나 서식만 있는 시트일 수 있습니다.";
    }
    const total = objects.items.length + objects.plainShapes;
    elements.sheetObjects.classList.toggle("hidden", total === 0);
    elements.sheetObjects.open = !hasValues && total > 0;
    elements.sheetObjectsSummary.textContent =
      `삽입된 개체 ${total.toLocaleString()}개 (원본 배치와 다를 수 있음)`;
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
        text.textContent = item.type === "text" ? item.text : "차트·개체 미리보기는 지원하지 않습니다.";
        card.append(text);
      }
      elements.sheetObjectList.append(card);
    }
    if (objects.plainShapes) {
      const note = document.createElement("p");
      note.className = "sheet-objects-note";
      note.textContent = `텍스트가 없는 도형 ${objects.plainShapes.toLocaleString()}개는 표시하지 않습니다.`;
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
    elements.gridInner.style.setProperty("--col-width", `${state.colWidth}px`);
    elements.gridInner.style.setProperty("--cell-padding", state.compactGrid ? "2px" : "10px");
    elements.gridInner.style.width = `${ROW_LABEL_WIDTH + state.colCount * state.colWidth}px`;
    elements.gridInner.style.height = `${state.rowHeight + state.rowCount * state.rowHeight}px`;
    const header = document.createElement("div");
    header.className = "grid-header";
    const corner = document.createElement("div");
    corner.className = "grid-corner";
    header.append(corner);
    for (let c = 0; c < state.colCount; c++) {
      const label = document.createElement("div");
      label.className = "grid-column";
      label.textContent = columnName(c);
      header.append(label);
    }
    elements.gridInner.append(header);
  }

  function renderRows() {
    elements.gridInner
      .querySelectorAll(".grid-row")
      .forEach((row) => row.remove());
    const viewport = elements.gridViewport;
    const first = Math.max(0, Math.floor(viewport.scrollTop / state.rowHeight) - 8);
    const last = Math.min(
      state.rowCount,
      first + Math.ceil(viewport.clientHeight / state.rowHeight) + 18,
    );
    const fragment = document.createDocumentFragment();
    const matchSet = new Set(state.matches.map((entry) => entry.address));
    for (let r = first; r < last; r++) {
      const row = document.createElement("div");
      row.className = "grid-row";
      row.style.top = `${state.rowHeight + r * state.rowHeight}px`;
      row.style.width = `${ROW_LABEL_WIDTH + state.colCount * state.colWidth}px`;
      const number = document.createElement("div");
      number.className = "grid-row-number";
      number.textContent = String(r + 1);
      row.append(number);
      for (let c = 0; c < state.colCount; c++) {
        const address = `${columnName(c)}${r + 1}`;
        const cell = state.sheet[address];
        const element = document.createElement("div");
        element.className = "grid-cell";
        if (cell?.t === "n") element.classList.add("is-number");
        const fill = cellFillColor(cell);
        if (fill) element.style.setProperty("--cell-fill", fill);
        if (state.selected.r === r && state.selected.c === c)
          element.classList.add("selected");
        if (matchSet.has(address)) element.classList.add("search-hit");
        element.textContent = cellText(cell);
        element.title = cellText(cell);
        element.addEventListener("click", () => {
          elements.gridViewport.focus({ preventScroll: true });
          selectCell(r, c, false);
        });
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
    $("cellAddress").textContent = address;
    $("cellValue").textContent = cell?.f ? `=${cell.f}` : cellText(cell);
  }

  function selectCell(r, c, scroll = true) {
    state.selected = {
      r: Math.max(0, Math.min(state.rowCount - 1, r)),
      c: Math.max(0, Math.min(state.colCount - 1, c)),
    };
    updateSelectionBar();
    if (scroll) {
      const vp = elements.gridViewport;
      const top = state.rowHeight + state.selected.r * state.rowHeight;
      const left = ROW_LABEL_WIDTH + state.selected.c * state.colWidth;
      if (top < vp.scrollTop + state.rowHeight)
        vp.scrollTop = Math.max(0, top - state.rowHeight * 2);
      else if (top + state.rowHeight > vp.scrollTop + vp.clientHeight)
        vp.scrollTop = top + state.rowHeight - vp.clientHeight;
      if (left < vp.scrollLeft + ROW_LABEL_WIDTH)
        vp.scrollLeft = Math.max(0, left - ROW_LABEL_WIDTH);
      else if (left + state.colWidth > vp.scrollLeft + vp.clientWidth)
        vp.scrollLeft = left + state.colWidth - vp.clientWidth;
    }
    scheduleRender();
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
      ? `${state.matches.length}개`
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
      selectCell(state.selected.r + dr, state.selected.c + dc);
    }
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
      showToast("연결된 파일을 열지 못했습니다. 파일이 있는지 확인해 주세요.", true, 7000);
    }
  }

  openStartupFile();
})();
