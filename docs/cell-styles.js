(() => {
  "use strict";

  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const decoder = new TextDecoder("utf-8");
  const themeOrder = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const indexedColors = [
    "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
    "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
    "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
    "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
    "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
    "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
    "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
    "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
  ];

  function parse(files, path) {
    const content = files[path]?.content;
    if (!content) return null;
    const source = typeof content === "string" ? content : decoder.decode(content);
    const document = new DOMParser().parseFromString(source, "application/xml");
    return document.getElementsByTagName("parsererror").length ? null : document;
  }

  function children(node, name) {
    return Array.from(node?.children || []).filter((item) => item.localName === name);
  }

  function child(node, name) {
    return children(node, name)[0];
  }

  function resolve(base, target) {
    if (!target || /^[a-z]+:/i.test(target)) return null;
    const parts = (target.startsWith("/")
      ? target.slice(1)
      : `${base.slice(0, base.lastIndexOf("/") + 1)}${target}`).split("/");
    const clean = [];
    for (const part of parts) {
      if (part === "..") clean.pop();
      else if (part && part !== ".") clean.push(part);
    }
    return clean.join("/");
  }

  function themeColors(files) {
    const document = parse(files, "xl/theme/theme1.xml");
    const scheme = document?.getElementsByTagNameNS(DRAWING, "clrScheme")[0];
    return themeOrder.map((name) => {
      const entry = child(scheme, name);
      const color = child(entry, "srgbClr")?.getAttribute("val") ||
        child(entry, "sysClr")?.getAttribute("lastClr");
      return /^[0-9a-f]{6}$/i.test(color || "") ? color : null;
    });
  }

  function color(node, theme) {
    if (!node || node.getAttribute("auto") === "1") return null;
    let hex = node.getAttribute("rgb");
    if (!hex) {
      const index = Number(node.getAttribute("theme"));
      if (node.hasAttribute("theme")) hex = theme[index];
      else if (node.hasAttribute("indexed")) hex = indexedColors[Number(node.getAttribute("indexed"))];
    }
    if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex || "")) return null;
    hex = hex.slice(-6);
    const tint = Number(node.getAttribute("tint") || 0);
    if (tint) {
      hex = [0, 2, 4].map((i) => {
        const value = parseInt(hex.slice(i, i + 2), 16);
        const adjusted = Math.round(tint < 0 ? value * (1 + tint) : value + (255 - value) * tint);
        return Math.max(0, Math.min(255, adjusted)).toString(16).padStart(2, "0");
      }).join("");
    }
    return `#${hex}`;
  }

  function fontStyle(font, theme) {
    if (!font) return {};
    const style = {};
    const name = (child(font, "name") || child(font, "rFont"))?.getAttribute("val");
    const size = Number(child(font, "sz")?.getAttribute("val"));
    if (name) style.fontFamily = name;
    if (size >= 6 && size <= 72) style.fontSize = `${size}pt`;
    const enabled = (name) => {
      const entry = child(font, name);
      return entry && !["0", "false"].includes(entry.getAttribute("val"));
    };
    if (enabled("b")) style.fontWeight = "700";
    if (enabled("i")) style.fontStyle = "italic";
    const decoration = [];
    if (enabled("u")) decoration.push("underline");
    if (enabled("strike")) decoration.push("line-through");
    if (decoration.length) style.textDecoration = decoration.join(" ");
    const foreground = color(child(font, "color"), theme);
    if (foreground) style.color = foreground;
    const script = child(font, "vertAlign")?.getAttribute("val");
    if (["superscript", "subscript"].includes(script)) {
      style.verticalAlign = script === "superscript" ? "super" : "sub";
      style.fontSize = "0.8em";
    }
    return style;
  }

  function borderStyle(border, theme) {
    const style = {};
    for (const side of ["left", "right", "top", "bottom"]) {
      const entry = child(border, side);
      const kind = entry?.getAttribute("style");
      if (!kind) continue;
      const width = kind.includes("medium") ? 2 : kind.includes("thick") ? 3 : 1;
      const line = kind.includes("dash") ? "dashed" : kind.includes("dot") ? "dotted" : kind === "double" ? "double" : "solid";
      style[`border${side[0].toUpperCase()}${side.slice(1)}`] = `${width}px ${line} ${color(child(entry, "color"), theme) || "#687680"}`;
    }
    const diagonal = child(border, "diagonal");
    if (diagonal?.getAttribute("style")) {
      const shade = color(child(diagonal, "color"), theme) || "#687680";
      if (border.getAttribute("diagonalUp") === "1")
        style.diagonalUp = `linear-gradient(to top right, transparent calc(50% - 0.5px), ${shade} 50%, transparent calc(50% + 0.5px))`;
      if (border.getAttribute("diagonalDown") === "1")
        style.diagonalDown = `linear-gradient(to bottom right, transparent calc(50% - 0.5px), ${shade} 50%, transparent calc(50% + 0.5px))`;
    }
    return style;
  }

  function fillStyle(fill, theme) {
    const style = {};
    const pattern = child(fill, "patternFill");
    const kind = pattern?.getAttribute("patternType");
    const foreground = color(child(pattern, "fgColor"), theme);
    const background = color(child(pattern, "bgColor"), theme) || "#ffffff";
    if (kind === "solid" && foreground) {
      style.backgroundColor = foreground;
      style.backgroundPattern = "none";
    }
    else if (foreground && kind && kind !== "none" && kind !== "gray125") {
      style.backgroundColor = background;
      const patterns = {
        gray0625: `repeating-linear-gradient(45deg, ${foreground} 0 1px, transparent 1px 7px)`,
        gray125: `repeating-linear-gradient(45deg, ${foreground} 0 1px, transparent 1px 5px)`,
        lightDown: `repeating-linear-gradient(45deg, ${foreground} 0 1px, transparent 1px 7px)`,
        mediumGray: `repeating-linear-gradient(45deg, ${foreground} 0 2px, transparent 2px 5px)`,
        darkGray: `repeating-linear-gradient(45deg, ${foreground} 0 3px, transparent 3px 5px)`,
        lightGray: `repeating-linear-gradient(45deg, ${foreground} 0 1px, transparent 1px 4px)`,
        lightUp: `repeating-linear-gradient(-45deg, ${foreground} 0 1px, transparent 1px 7px)`,
        darkDown: `repeating-linear-gradient(45deg, ${foreground} 0 3px, transparent 3px 7px)`,
        darkUp: `repeating-linear-gradient(-45deg, ${foreground} 0 3px, transparent 3px 7px)`,
        lightHorizontal: `repeating-linear-gradient(0deg, ${foreground} 0 1px, transparent 1px 7px)`,
        darkHorizontal: `repeating-linear-gradient(0deg, ${foreground} 0 3px, transparent 3px 7px)`,
        lightVertical: `repeating-linear-gradient(90deg, ${foreground} 0 1px, transparent 1px 7px)`,
        darkVertical: `repeating-linear-gradient(90deg, ${foreground} 0 3px, transparent 3px 7px)`,
      };
      style.backgroundPattern = patterns[kind] ||
        `repeating-linear-gradient(45deg, ${foreground} 0 1px, transparent 1px 6px)`;
    }
    const gradient = child(fill, "gradientFill");
    if (gradient) {
      const stops = children(gradient, "stop").map((stop) => ({
        position: Number(stop.getAttribute("position")),
        value: color(child(stop, "color"), theme),
      })).filter((stop) => stop.value && stop.position >= 0 && stop.position <= 1);
      if (stops.length >= 2) {
        const points = stops.map((stop) => `${stop.value} ${Math.round(stop.position * 100)}%`).join(", ");
        const degree = Number(gradient.getAttribute("degree") || 0);
        style.backgroundPattern = gradient.getAttribute("type") === "path"
          ? `radial-gradient(${points})`
          : `linear-gradient(${(90 - degree + 360) % 360}deg, ${points})`;
      }
    }
    return style;
  }

  function alignmentStyle(alignment) {
    const style = {};
    const horizontal = alignment?.getAttribute("horizontal");
    const vertical = alignment?.getAttribute("vertical");
    if (["left", "center", "right", "justify"].includes(horizontal)) style.textAlign = horizontal;
    if (horizontal === "centerContinuous") style.textAlign = "center";
    if (vertical === "top") style.alignContent = "start";
    if (vertical === "center") style.alignContent = "center";
    if (vertical === "bottom") style.alignContent = "end";
    if (alignment?.getAttribute("wrapText") === "1") {
      style.whiteSpace = "pre-wrap";
      style.overflowWrap = "anywhere";
    }
    if (alignment?.getAttribute("shrinkToFit") === "1") style.shrinkToFit = true;
    const indent = Number(alignment?.getAttribute("indent") || 0);
    if (indent > 0 && indent <= 20) style[horizontal === "right" ? "paddingRight" : "paddingLeft"] = `${10 + indent * 12}px`;
    const rotation = Number(alignment?.getAttribute("textRotation") || 0);
    if (rotation >= 1 && rotation <= 180) style.rotation = rotation <= 90 ? -rotation : 180 - rotation;
    if (rotation === 255) style.writingMode = "vertical-rl";
    return style;
  }

  function richRuns(container, theme) {
    const runs = children(container, "r");
    if (!runs.length) return null;
    return runs.map((run) => ({
      text: child(run, "t")?.textContent || "",
      style: fontStyle(child(run, "rPr"), theme),
    }));
  }

  function interpolate(first, second, fraction) {
    const amount = Math.max(0, Math.min(1, fraction));
    const components = [1, 3, 5].map((start) => Math.round(
      parseInt(first.slice(start, start + 2), 16) * (1 - amount) +
      parseInt(second.slice(start, start + 2), 16) * amount,
    ));
    return `#${components.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }

  function threshold(node, values) {
    const kind = node?.getAttribute("type");
    const raw = Number(node?.getAttribute("val"));
    if (kind === "min") return values[0];
    if (kind === "max") return values.at(-1);
    if (kind === "num") return raw;
    if (kind === "percent") return values[0] + (values.at(-1) - values[0]) * raw / 100;
    if (kind === "percentile") return values[Math.round((values.length - 1) * raw / 100)];
    return Number.isFinite(raw) ? raw : values[0];
  }

  function conditionalStyle(rule, cell) {
    const value = cell?.v;
    const text = value == null ? "" : String(value);
    const target = rule.text || "";
    if (rule.type === "colorScale") {
      if (!Number.isFinite(Number(value)) || value == null) return null;
      const points = rule.points;
      if (points?.length < 2) return null;
      const number = Number(value);
      let upper = points.findIndex((point) => number <= point.value);
      if (upper < 1) upper = upper < 0 ? points.length - 1 : 1;
      const left = points[upper - 1], right = points[upper];
      const fraction = right.value === left.value ? 0 :
        (number - left.value) / (right.value - left.value);
      return { backgroundColor: interpolate(left.color, right.color, fraction), backgroundPattern: "none" };
    }
    if (rule.type === "dataBar") {
      if (!Number.isFinite(Number(value)) || value == null || !rule.bounds) return null;
      const [min, max] = rule.bounds;
      const width = max === min ? 100 : Math.round(Math.max(0, Math.min(1, (Number(value) - min) / (max - min))) * 100);
      return { backgroundBar: `linear-gradient(90deg, ${rule.barColor}88 0%, ${rule.barColor}88 ${width}%, transparent ${width}%)` };
    }
    if (rule.type === "iconSet") {
      if (!Number.isFinite(Number(value)) || value == null || !rule.thresholds?.length) return null;
      let rank = 0;
      for (let i = 1; i < rule.thresholds.length; i++)
        if (Number(value) >= rule.thresholds[i]) rank = i;
      if (rule.reverse) rank = rule.thresholds.length - 1 - rank;
      const palette = rule.iconSet?.includes("Traffic") ? ["🔴", "🟡", "🟢"] :
        rule.iconSet?.includes("Symbols") ? ["✖", "!", "✔"] :
        rule.thresholds.length === 5 ? ["▼", "↘", "→", "↗", "▲"] :
        rule.thresholds.length === 4 ? ["▼", "↘", "↗", "▲"] : ["▼", "→", "▲"];
      const colors = palette.length === 3 ? ["#d34c46", "#dd9b23", "#248651"] :
        palette.length === 4 ? ["#d34c46", "#dd9b23", "#46a978", "#248651"] :
          ["#d34c46", "#dd9b23", "#4a94c9", "#46a978", "#248651"];
      return { icon: palette[Math.min(rank, palette.length - 1)], iconColor: colors[Math.min(rank, colors.length - 1)], hideValue: rule.hideValue };
    }
    const lowerText = text.toLocaleLowerCase();
    const lowerTarget = target.toLocaleLowerCase();
    if (rule.type === "containsText") return lowerText.includes(lowerTarget) ? rule.style : null;
    if (rule.type === "notContainsText") return !lowerText.includes(lowerTarget) ? rule.style : null;
    if (rule.type === "beginsWith") return lowerText.startsWith(lowerTarget) ? rule.style : null;
    if (rule.type === "endsWith") return lowerText.endsWith(lowerTarget) ? rule.style : null;
    if (rule.type !== "cellIs") return null;
    const number = Number(value);
    const first = Number(rule.formulas[0]);
    const second = Number(rule.formulas[1]);
    if (value == null) return null;
    if (!Number.isFinite(number) || !Number.isFinite(first)) {
      const comparison = String(rule.formulas[0] || "").replace(/^"|"$/g, "");
      if (rule.operator === "equal") return text === comparison ? rule.style : null;
      if (rule.operator === "notEqual") return text !== comparison ? rule.style : null;
      return null;
    }
    const compare = {
      equal: number === first,
      notEqual: number !== first,
      greaterThan: number > first,
      lessThan: number < first,
      greaterThanOrEqual: number >= first,
      lessThanOrEqual: number <= first,
      between: number >= first && number <= second,
      notBetween: number < first || number > second,
    };
    return compare[rule.operator] ? rule.style : null;
  }

  function conditionalFormats(rules, r, c, cell) {
    let result = null;
    for (const entry of rules || []) {
      if (r < entry.range.s.r || r > entry.range.e.r ||
          c < entry.range.s.c || c > entry.range.e.c) continue;
      const style = conditionalStyle(entry, cell);
      if (!style) continue;
      result = { ...style, ...result };
      if (entry.stopIfTrue) break;
    }
    return result;
  }

  function extract(workbook) {
    const files = workbook.files || {};
    const stylesXml = parse(files, "xl/styles.xml");
    if (!stylesXml) return null;
    const root = stylesXml.documentElement;
    const theme = themeColors(files);
    const fonts = children(child(root, "fonts"), "font");
    const fills = children(child(root, "fills"), "fill");
    const borders = children(child(root, "borders"), "border");
    const xfs = children(child(root, "cellXfs"), "xf");
    const styles = xfs.map((xf) => {
      const style = { ...fontStyle(fonts[Number(xf.getAttribute("fontId") || 0)], theme) };
      Object.assign(style, fillStyle(fills[Number(xf.getAttribute("fillId") || 0)], theme));
      Object.assign(style, borderStyle(borders[Number(xf.getAttribute("borderId") || 0)], theme));
      Object.assign(style, alignmentStyle(child(xf, "alignment")));
      return style;
    });
    const differentials = children(child(root, "dxfs"), "dxf").map((dxf) => ({
      ...fontStyle(child(dxf, "font"), theme),
      ...fillStyle(child(dxf, "fill"), theme),
      ...borderStyle(child(dxf, "border"), theme),
      ...alignmentStyle(child(dxf, "alignment")),
    }));
    const sharedStringsXml = parse(files, "xl/sharedStrings.xml");
    const sharedStrings = children(sharedStringsXml?.documentElement, "si")
      .map((item) => richRuns(item, theme));

    const book = parse(files, "xl/workbook.xml");
    const rels = parse(files, "xl/_rels/workbook.xml.rels");
    const paths = new Map();
    for (const relation of rels?.getElementsByTagNameNS(PKG_REL, "Relationship") || []) {
      if (relation.getAttribute("TargetMode") === "External") continue;
      paths.set(relation.getAttribute("Id"), resolve("xl/workbook.xml", relation.getAttribute("Target")));
    }
    const sheetNodes = book?.getElementsByTagNameNS(MAIN, "sheet") || [];
    const sheets = [];
    const rowStyles = [];
    const columnStyles = [];
    const richText = [];
    const conditionalRules = [];
    workbook.SheetNames.forEach((_, index) => {
      const id = sheetNodes[index]?.getAttributeNS(REL, "id");
      const path = paths.get(id) || `xl/worksheets/sheet${index + 1}.xml`;
      const xml = parse(files, path);
      const cells = new Map();
      const rows = new Map();
      const columns = new Map();
      const runs = new Map();
      const rules = [];
      for (const row of xml?.getElementsByTagNameNS(MAIN, "row") || []) {
        const index = Number(row.getAttribute("r")) - 1;
        const styleIndex = Number(row.getAttribute("s"));
        if (index >= 0 && row.getAttribute("customFormat") === "1" && styles[styleIndex])
          rows.set(index, styles[styleIndex]);
      }
      for (const col of xml?.getElementsByTagNameNS(MAIN, "col") || []) {
        const first = Number(col.getAttribute("min")) - 1;
        const last = Number(col.getAttribute("max")) - 1;
        const style = styles[Number(col.getAttribute("style"))];
        if (!style) continue;
        for (let c = Math.max(0, first); c <= Math.min(199, last); c++) columns.set(c, style);
      }
      for (const node of xml?.getElementsByTagNameNS(MAIN, "c") || []) {
        const address = node.getAttribute("r");
        const styleIndex = Number(node.getAttribute("s") || 0);
        if (address && styleIndex > 0 && styles[styleIndex]) cells.set(address, styles[styleIndex]);
        if (!address) continue;
        if (node.getAttribute("t") === "s") {
          const index = Number(child(node, "v")?.textContent);
          if (sharedStrings[index]) runs.set(address, sharedStrings[index]);
        } else if (node.getAttribute("t") === "inlineStr") {
          const inlineRuns = richRuns(child(node, "is"), theme);
          if (inlineRuns) runs.set(address, inlineRuns);
        }
      }
      const formattingGroups = xml?.getElementsByTagNameNS(MAIN, "conditionalFormatting") || [];
      const needsRangeValues = Array.from(formattingGroups).some((group) =>
        children(group, "cfRule").some((rule) =>
          ["colorScale", "dataBar", "iconSet"].includes(rule.getAttribute("type"))));
      const numericCells = needsRangeValues ? Object.entries(workbook.Sheets[workbook.SheetNames[index]])
        .filter(([address, cell]) => address[0] !== "!" && cell?.t === "n" && Number.isFinite(Number(cell.v)))
        .map(([address, cell]) => ({ ...XLSX.utils.decode_cell(address), value: Number(cell.v) })) : [];
      for (const group of formattingGroups) {
        const ranges = (group.getAttribute("sqref") || "").split(/\s+/);
        for (const item of children(group, "cfRule")) {
          const type = item.getAttribute("type");
          const style = differentials[Number(item.getAttribute("dxfId"))];
          if (!style && !["colorScale", "dataBar", "iconSet"].includes(type)) continue;
          const rule = {
            type,
            operator: item.getAttribute("operator"),
            text: item.getAttribute("text"),
            formulas: children(item, "formula").map((formula) => formula.textContent),
            style,
            priority: Number(item.getAttribute("priority") || 9999),
            stopIfTrue: item.getAttribute("stopIfTrue") === "1",
          };
          for (const rangeText of ranges) {
            if (!rangeText) continue;
            try {
              const range = XLSX.utils.decode_range(rangeText);
              const entry = { ...rule, range };
              if (["colorScale", "dataBar", "iconSet"].includes(type)) {
                const values = numericCells.filter((cell) => cell.r >= range.s.r && cell.r <= range.e.r &&
                  cell.c >= range.s.c && cell.c <= range.e.c).map((cell) => cell.value).sort((a, b) => a - b);
                if (!values.length) continue;
                const detail = child(item, type);
                const limits = children(detail, "cfvo");
                if (type === "colorScale") {
                  const colors = children(detail, "color").map((item) => color(item, theme));
                  entry.points = limits.map((limit, i) => ({
                    value: threshold(limit, values), color: colors[i],
                  })).filter((point) => Number.isFinite(point.value) && point.color);
                } else if (type === "dataBar") {
                  entry.bounds = [threshold(limits[0], values), threshold(limits[1], values)];
                  entry.barColor = color(child(detail, "color"), theme) || "#638ec6";
                } else {
                  entry.thresholds = limits.map((limit) => threshold(limit, values));
                  entry.iconSet = detail?.getAttribute("iconSet") || "3Arrows";
                  entry.reverse = detail?.getAttribute("reverse") === "1";
                  entry.hideValue = detail?.getAttribute("showValue") === "0";
                }
              }
              rules.push(entry);
            }
            catch { /* Ignore malformed conditional-format ranges. */ }
          }
        }
      }
      rules.sort((a, b) => a.priority - b.priority);
      sheets.push(cells);
      rowStyles.push(rows);
      columnStyles.push(columns);
      richText.push(runs);
      conditionalRules.push(rules);
    });
    return { sheets, rowStyles, columnStyles, richText, conditionalRules, defaultStyle: styles[0] || {} };
  }

  window.CellStyles = { extract, conditionalFormats };
})();
