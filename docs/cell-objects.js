(() => {
  "use strict";

  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
  const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const decoder = new TextDecoder("utf-8");

  function contents(files, name) {
    const data = files[name]?.content;
    if (!data) return null;
    return typeof data === "string" ? data : decoder.decode(data);
  }

  function xml(files, name) {
    const source = contents(files, name);
    if (!source) return null;
    const document = new DOMParser().parseFromString(source, "application/xml");
    return document.getElementsByTagName("parsererror").length ? null : document;
  }

  function resolve(base, target) {
    if (!target || /^[a-z]+:/i.test(target)) return null;
    const parts = (target.startsWith("/")
      ? target.slice(1)
      : `${base.slice(0, base.lastIndexOf("/") + 1)}${target}`
    ).split("/");
    const clean = [];
    for (const part of parts) {
      if (part === "..") clean.pop();
      else if (part && part !== ".") clean.push(part);
    }
    return clean.join("/");
  }

  function relations(files, source) {
    const slash = source.lastIndexOf("/");
    const relsPath = `${source.slice(0, slash + 1)}_rels/${source.slice(slash + 1)}.rels`;
    const document = xml(files, relsPath);
    const result = new Map();
    for (const node of Array.from(document?.getElementsByTagNameNS(PKG_REL, "Relationship") || [])) {
      if (node.getAttribute("TargetMode") === "External") continue;
      const path = resolve(source, node.getAttribute("Target"));
      if (path) result.set(node.getAttribute("Id"), { path, type: node.getAttribute("Type") });
    }
    return result;
  }

  function anchorPosition(anchor) {
    const from = anchor.getElementsByTagNameNS(XDR, "from")[0];
    const row = Number(from?.getElementsByTagNameNS(XDR, "row")[0]?.textContent || 0);
    const col = Number(from?.getElementsByTagNameNS(XDR, "col")[0]?.textContent || 0);
    return { row, col };
  }

  function extract(workbook) {
    const files = workbook.files || {};
    const urls = [];
    const imageUrls = new Map();
    const sheets = workbook.SheetNames.map(() => ({
      items: [],
      plainShapes: 0,
      maxRow: -1,
      maxCol: -1,
    }));
    const bookPath = "xl/workbook.xml";
    const bookXml = xml(files, bookPath);
    const bookRels = relations(files, bookPath);
    const sheetNodes = bookXml?.getElementsByTagNameNS(MAIN, "sheet") || [];

    for (let index = 0; index < sheets.length; index++) {
      const relationId = sheetNodes[index]?.getAttributeNS(REL, "id");
      const sheetPath = bookRels.get(relationId)?.path || `xl/worksheets/sheet${index + 1}.xml`;
      const sheetXml = xml(files, sheetPath);
      const sheetRels = relations(files, sheetPath);
      for (const drawingRef of Array.from(sheetXml?.getElementsByTagNameNS(MAIN, "drawing") || [])) {
        const drawingId = drawingRef.getAttributeNS(REL, "id");
        const drawingPath = sheetRels.get(drawingId)?.path;
        if (!drawingPath) continue;
        const drawingXml = xml(files, drawingPath);
        const drawingRels = relations(files, drawingPath);
        for (const anchor of Array.from(drawingXml?.documentElement?.childNodes || []).filter((node) => node.nodeType === 1)) {
          const position = anchorPosition(anchor);
          sheets[index].maxRow = Math.max(sheets[index].maxRow, position.row);
          sheets[index].maxCol = Math.max(sheets[index].maxCol, position.col);
          for (const picture of Array.from(anchor.getElementsByTagNameNS(XDR, "pic"))) {
            const embed = picture.getElementsByTagNameNS(DRAWING, "blip")[0]?.getAttributeNS(REL, "embed");
            const imagePath = drawingRels.get(embed)?.path;
            const data = files[imagePath]?.content;
            const extension = imagePath?.split(".").pop()?.toLowerCase();
            if (!data || !["png", "jpg", "jpeg", "gif", "webp"].includes(extension)) continue;
            let url = imageUrls.get(imagePath);
            if (!url) {
              const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
              url = URL.createObjectURL(new Blob([data], { type: mime }));
              urls.push(url);
              imageUrls.set(imagePath, url);
            }
            const name = picture.getElementsByTagNameNS(XDR, "cNvPr")[0]?.getAttribute("name") || "그림";
            sheets[index].items.push({ type: "image", url, name, ...position });
          }
          for (const shape of Array.from(anchor.getElementsByTagNameNS(XDR, "sp"))) {
            const text = Array.from(shape.getElementsByTagNameNS(DRAWING, "t"))
              .map((node) => node.textContent || "")
              .join(" ")
              .trim();
            if (text) sheets[index].items.push({ type: "text", text, ...position });
            else sheets[index].plainShapes++;
          }
          for (const frame of Array.from(anchor.getElementsByTagNameNS(XDR, "graphicFrame"))) {
            sheets[index].items.push({ type: "chart", ...position });
          }
        }
      }
      sheets[index].items.sort((a, b) => a.row - b.row || a.col - b.col);
    }
    return { sheets, urls };
  }

  window.CellObjects = { extract };
})();
