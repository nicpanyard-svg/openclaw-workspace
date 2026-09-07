import JSZip from "jszip";
import { calculateQuoteMasterWorkbook } from "./quote-master-calculation";
import { buildQuoteMasterFormulaRepairs } from "./quote-master-formulas";
import { buildQuoteMasterInputs, QUOTE_MASTER_TEMPLATE_URL, type QuoteMasterCell, type QuoteMasterSelection } from "./quote-master-model";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SHEETS = ["Instructions, Assumptions", "Rental (BOM)", "Sale (BOM)", "Pricing", "Cashflow & Payback", "Exec Summary", "NPV - IRR"];
function parse(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("The Quote Master template contains unreadable XML.");
  return document;
}
function children(element: Element, name: string) { return Array.from(element.children).filter((child) => child.localName === name); }
function columnNumber(address: string) {
  return address.match(/^[A-Z]+/)![0].split("").reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
}

// Change cell content only; retain all formatting, drawings, print settings and other ZIP parts.
export async function patchQuoteMasterWorkbook(bytes: ArrayBuffer | Uint8Array, edits: QuoteMasterCell[]) {
  const zip = await JSZip.loadAsync(bytes);
  const read = async (name: string) => {
    const file = zip.file(name);
    if (!file) throw new Error(`Quote Master template is missing ${name}.`);
    return file.async("string");
  };
  const workbook = parse(await read("xl/workbook.xml"));
  const relationships = parse(await read("xl/_rels/workbook.xml.rels"));
  // Formula edits invalidate the template's calculation chain. Excel rebuilds this optional index.
  zip.remove("xl/calcChain.xml");
  for (const relationship of Array.from(relationships.documentElement.children)) {
    if (relationship.getAttribute("Type") === `${REL}/calcChain`) relationship.remove();
  }
  zip.file("xl/_rels/workbook.xml.rels", new XMLSerializer().serializeToString(relationships));
  const contentTypes = parse(await read("[Content_Types].xml"));
  for (const override of Array.from(contentTypes.documentElement.children)) {
    if (override.getAttribute("PartName") === "/xl/calcChain.xml") override.remove();
  }
  zip.file("[Content_Types].xml", new XMLSerializer().serializeToString(contentTypes));
  const sheetElements = Array.from(workbook.getElementsByTagNameNS(NS, "sheet"));
  if (JSON.stringify(sheetElements.map((sheet) => sheet.getAttribute("name"))) !== JSON.stringify(SHEETS)) throw new Error("This is not Hector's seven-sheet Quote Master template.");
  const paths = new Map(sheetElements.map((sheet) => {
    const rel = Array.from(relationships.documentElement.children).find((item) => item.getAttribute("Id") === sheet.getAttributeNS(REL, "id"));
    const target = rel?.getAttribute("Target");
    if (!target || target.includes("..")) throw new Error("Invalid worksheet reference in Quote Master template.");
    return [sheet.getAttribute("name")!, target.startsWith("/") ? target.slice(1) : `xl/${target}`];
  }));
  const bySheet = new Map<string, QuoteMasterCell[]>();
  const documents = new Map<string, XMLDocument>();
  for (const edit of edits) {
    if (!paths.has(edit.sheet) || !/^[A-Z]{1,3}[1-9][0-9]*$/.test(edit.address)) throw new Error("Invalid Quote Master input mapping.");
    const rows = bySheet.get(edit.sheet) || [];
    rows.push(edit);
    bySheet.set(edit.sheet, rows);
  }
  for (const [name, path] of paths) {
    const document = parse(await read(path));
    documents.set(name, document);
    const data = document.getElementsByTagNameNS(NS, "sheetData")[0];
    if (!data) throw new Error(`Missing cells in ${name}.`);
    const cellMap = new Map(Array.from(data.getElementsByTagNameNS(NS, "c")).map((cell) => [cell.getAttribute("r"), cell]));
    const rowMap = new Map(children(data, "row").map((row) => [Number(row.getAttribute("r")), row]));
    for (const edit of bySheet.get(name) || []) {
      let cell = cellMap.get(edit.address);
      if (!cell) {
        const row = rowMap.get(Number(edit.address.match(/[0-9]+$/)![0]));
        if (!row) throw new Error(`${name}!${edit.address} is outside the template's existing rows.`);
        cell = document.createElementNS(NS, "c");
        cell.setAttribute("r", edit.address);
        const after = children(row, "c").find((candidate) => columnNumber(candidate.getAttribute("r")!) > columnNumber(edit.address));
        row.insertBefore(cell, after || null);
        cellMap.set(edit.address, cell);
      }
      for (const child of Array.from(cell.children)) if (["v", "is", "f"].includes(child.localName)) child.remove();
      cell.removeAttribute("t");
      if (edit.formula !== undefined) {
        const formula = document.createElementNS(NS, "f");
        formula.textContent = edit.formula.replace(/^=/, "");
        cell.appendChild(formula);
      } else if (typeof edit.value === "string") {
        cell.setAttribute("t", "inlineStr");
        const inline = document.createElementNS(NS, "is"), text = document.createElementNS(NS, "t");
        text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        text.textContent = edit.value;
        inline.appendChild(text);
        cell.appendChild(inline);
      } else if (typeof edit.value === "number") {
        if (!Number.isFinite(edit.value)) throw new Error(`${name}!${edit.address} is not a finite number.`);
        const value = document.createElementNS(NS, "v");
        value.textContent = String(edit.value);
        cell.appendChild(value);
      }
    }
    // Remove stale template totals before calculating this quote's results.
    let cleared = false;
    for (const cell of cellMap.values()) {
      if (children(cell, "f").length) {
        children(cell, "v").forEach((value) => { value.remove(); cleared = true; });
      }
    }
    if (cleared || bySheet.has(name)) zip.file(path, new XMLSerializer().serializeToString(document));
  }
  const results = calculateQuoteMasterWorkbook(await zip.generateAsync({ type: "uint8array", compression: "STORE" }));
  for (const [name, document] of documents) {
    for (const cell of Array.from(document.getElementsByTagNameNS(NS, "c"))) {
      if (!children(cell, "f").length) continue;
      const result = results.get(`${name}!${cell.getAttribute("r")}`);
      if (!result) throw new Error(`Missing Quote Master calculation for ${name}!${cell.getAttribute("r")}.`);
      children(cell, "v").forEach((value) => value.remove());
      cell.setAttribute("t", result.type);
      const value = document.createElementNS(NS, "v");
      value.textContent = String(typeof result.value === "boolean" ? Number(result.value) : result.value);
      cell.appendChild(value);
    }
    zip.file(paths.get(name)!, new XMLSerializer().serializeToString(document));
  }
  let calc = workbook.getElementsByTagNameNS(NS, "calcPr")[0];
  if (!calc) { calc = workbook.createElementNS(NS, "calcPr"); workbook.documentElement.appendChild(calc); }
  calc.setAttribute("calcMode", "auto");
  calc.setAttribute("fullCalcOnLoad", "1");
  calc.setAttribute("forceFullCalc", "1");
  zip.file("xl/workbook.xml", new XMLSerializer().serializeToString(workbook));
  return new Blob([await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function buildQuoteMasterWorkbook(selections: QuoteMasterSelection[]) {
  const model = buildQuoteMasterInputs(selections);
  const response = await fetch(QUOTE_MASTER_TEMPLATE_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error("The Quote Master template could not be loaded. Please retry.");
  return { ...model, blob: await patchQuoteMasterWorkbook(await response.arrayBuffer(), [...buildQuoteMasterFormulaRepairs(), ...model.cells]) };
}
