import type { QuoteMasterCell } from "./quote-master-model";

export function buildQuoteMasterFormulaRepairs(): QuoteMasterCell[] {
  const edits: QuoteMasterCell[] = [];
  const formula = (sheet: string, address: string, expression: string) => edits.push({ sheet, address, formula: expression });
  const pricing = ["E", "F", "G", "H", "I"];
  const summary = ["F", "H", "J", "L", "N"];
  const letters = (n: number): string => n > 26 ? letters(Math.floor((n - 1) / 26)) + letters((n - 1) % 26 + 1) : String.fromCharCode(64 + n);
  const summaryRows: Record<number, number> = { 24: 52, 25: 24, 26: 53, 28: 55, 29: 7, 30: 54, 31: 56, 32: 57, 33: 58, 34: 59, 35: 60, 36: 61, 42: 97, 43: 98, 44: 99, 45: 100, 46: 101 };
  for (const [row, sourceRow] of Object.entries(summaryRows)) {
    formula("Exec Summary", `D${row}`, `'Pricing'!D${sourceRow}`);
    summary.forEach((col, i) => formula("Exec Summary", `${col}${row}`, `'Pricing'!${pricing[i]}${sourceRow}`));
  }
  summary.forEach((col, i) => {
    for (const [row, sourceRow] of [[20, 3], [21, 4], [22, 5], [39, 64], [40, 65]]) formula("Exec Summary", `${col}${row}`, `'Pricing'!${pricing[i]}${sourceRow}`);
  });
  formula("Exec Summary", "D29", "SUM('Pricing'!E7:I7)");
  edits.push({ sheet: "Pricing", address: "D59", value: "n/m" });
  // Net initial investment is deducted once in cash flow, not also hidden inside capex.
  pricing.forEach((col, i) => {
    formula("Pricing", `${col}52`, `SUM(${col}11,${col}24,${col}49)`);
    formula("Pricing", `${col}61`, `${col}54-${col}53*${col}4-${col}52+${col}100`);
    formula("Pricing", `${col}60`, `'Cashflow & Payback'!C${48 + i * 26}`);
  });

  // Existing cash-flow grids have one initial period and 59 monthly periods.
  const blocks = [{ head: 2, gp: 3, initial: 7, cash: 8, cumulative: 10, fraction: 11, payback: 14, integer: 18, remainder: 19, repeat: 23, col: "D" }, ...pricing.map((col, i) => ({ head: 27 + i * 26, gp: 28 + i * 26, initial: 32 + i * 26, cash: 33 + i * 26, cumulative: 35 + i * 26, fraction: 36 + i * 26, payback: 39 + i * 26, integer: 43 + i * 26, remainder: 44 + i * 26, repeat: 48 + i * 26, col }))];
  formula("Cashflow & Payback", "C6", "SUM('Pricing'!E7:I7)");
  for (const block of blocks) {
    const sheet = "Cashflow & Payback";
    edits.push({ sheet, address: `C${block.head}`, value: 0 });
    formula(sheet, `C${block.initial}`, block.col === "D" ? "'Pricing'!D52-SUM('Pricing'!E7:I7)-'Pricing'!D100" : `'Pricing'!${block.col}52-'Pricing'!${block.col}7-'Pricing'!${block.col}100`);
    formula(sheet, `C${block.cash}`, `-C${block.initial}`);
    formula(sheet, `C${block.cumulative}`, `C${block.cash}`);
    for (let n = 4; n <= 62; n++) {
      const col = letters(n), prev = letters(n - 1);
      formula(sheet, `${col}${block.head}`, `${prev}${block.head}+1`);
      const cashFlow = (p: string) => `IF(${col}$${block.head}<='Pricing'!${p}$4,'Pricing'!${p}$56,0)`;
      formula(sheet, `${col}${block.cash}`, block.col === "D" ? pricing.map(cashFlow).join("+") : cashFlow(block.col));
      formula(sheet, `${col}${block.cumulative}`, `SUM($C${block.cash}:${col}${block.cash})`);
      formula(sheet, `${col}${block.fraction}`, `IF(AND(${prev}${block.cumulative}<0,${col}${block.cumulative}>=0,${col}${block.cash}>0),-${prev}${block.cumulative}/${col}${block.cash},"n/m")`);
    }
    const payback = block.col === "D"
      ? `IF(C${block.initial}<=0,0,IF(BJ${block.cumulative}<0,"n/m",COUNTIF(D${block.cumulative}:BJ${block.cumulative},"<0")+INDEX(D${block.fraction}:BJ${block.fraction},1,COUNTIF(D${block.cumulative}:BJ${block.cumulative},"<0")+1)))`
      : `IF(C${block.initial}<=0,0,IF(AND('Pricing'!${block.col}56>0,C${block.initial}<='Pricing'!${block.col}56*'Pricing'!${block.col}4),C${block.initial}/'Pricing'!${block.col}56,"n/m"))`;
    formula(sheet, `C${block.payback}`, payback);
    formula(sheet, `C${block.integer}`, `IF(ISNUMBER(C${block.payback}),INT(C${block.payback}),"n/m")`);
    formula(sheet, `C${block.remainder}`, `IF(ISNUMBER(C${block.payback}),MOD(C${block.payback},1),"n/m")`);
    formula(sheet, `C${block.repeat}`, `C${block.payback}`);
  }
  pricing.forEach((col, i) => {
    const sheet = "NPV - IRR", start = 7 + i * 15, end = start + 10;
    formula(sheet, `D${start}`, `'Pricing'!${col}52-'Pricing'!${col}7-'Pricing'!${col}100`);
    formula(sheet, `E${start}`, `-D${start}`);
    for (let row = start + 1; row <= end; row++) formula(sheet, `E${row}`, `'Pricing'!${col}$56*MAX(0,MIN(12,'Pricing'!${col}$4-(C${row}-1)*12))`);
    for (let row = start; row <= end; row++) formula(sheet, `G${row}`, i < 2 ? `SUM(E$${start}:E${row})` : `E${row}/((1+$C$3)^C${row})`);
    formula(sheet, `J${start - 1}`, `IFERROR(IRR(E${start}:E${end}),"n/m")`);
    if (i < 2) {
      formula(sheet, `J${start}`, `NPV($C$3,E${start + 1}:E${end})+E${start}`);
      formula(sheet, `J${start + 1}`, `'Pricing'!${col}60`);
    }
  });
  return edits;
}
