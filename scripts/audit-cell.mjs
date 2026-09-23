// Audit a private folder of HanCell files without copying or printing cell values.
// Usage: node scripts/audit-cell.mjs <folder>
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("../docs/vendor/xlsx.full.min.js");
const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/audit-cell.mjs <folder>");
  process.exit(2);
}

async function collect(folder) {
  const found = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const filePath = path.join(folder, item.name);
    if (item.isDirectory()) found.push(...(await collect(filePath)));
    else if (item.isFile() && item.name.toLowerCase().endsWith(".cell"))
      found.push(filePath);
  }
  return found;
}

const files = (await collect(root)).sort();
const result = {
  files: files.length,
  opened: 0,
  failed: [],
  empty: [],
  over30MB: [],
  temporary: [],
  signatures: {},
  sheets: 0,
  cells: 0,
  valueCells: 0,
  colorCells: 0,
  formulas: 0,
};

for (const filePath of files) {
  const name = path.relative(root, filePath);
  if (path.basename(filePath).includes("~$")) {
    result.temporary.push(name);
    continue;
  }
  const info = await stat(filePath);
  if (info.size > 30 * 1024 * 1024) result.over30MB.push(name);
  const bytes = await readFile(filePath);
  const signature = bytes.subarray(0, 4).toString("hex");
  result.signatures[signature] = (result.signatures[signature] || 0) + 1;
  try {
    const book = XLSX.read(bytes, {
      type: "array",
      cellFormula: true,
      cellText: true,
      cellHTML: false,
      cellStyles: true,
      bookFiles: true,
    });
    if (!book.SheetNames?.length) throw new Error("no sheets");
    let cells = 0;
    let values = 0;
    for (const sheetName of book.SheetNames) {
      const sheet = book.Sheets[sheetName] || {};
      for (const [address, cell] of Object.entries(sheet)) {
        if (address.startsWith("!")) continue;
        cells++;
        if (cell?.v != null || cell?.f) values++;
        if (cell?.s?.patternType === "solid" && cell.s.fgColor?.rgb)
          result.colorCells++;
        if (cell?.f) result.formulas++;
      }
    }
    if (!values) result.empty.push(name);
    result.opened++;
    result.sheets += book.SheetNames.length;
    result.cells += cells;
    result.valueCells += values;
  } catch (error) {
    result.failed.push({ name, error: String(error?.message || error) });
  }
}

console.log(JSON.stringify(result, null, 2));
if (result.failed.length || result.over30MB.length)
  process.exitCode = 1;
