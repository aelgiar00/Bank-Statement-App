import * as XLSX from "xlsx";
import {
  emptyMeta,
  type Statement,
  type StatementMeta,
  type Transaction,
} from "@/lib/banks/types";

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s || s.toLowerCase() === "nan" || s === "undefined") return "";
  if (/^\d{5}(\.0+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      epoch.setUTCDate(epoch.getUTCDate() + n);
      const y = epoch.getUTCFullYear();
      const m = String(epoch.getUTCMonth() + 1).padStart(2, "0");
      const d = String(epoch.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return s;
}

function collapse(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

// ضفنا الـ description كحقل منفصل عشان مايتعملوش Override
type Field =
  | "date"
  | "details"
  | "description"
  | "debit"
  | "credit"
  | "balance"
  | "type"
  | "checkNo"
  | "ref"
  | "amount";

const HEADER_ALIASES: Array<{ field: Field; tests: RegExp[] }> = [
  { field: "date", tests: [/تاريخ/, /date/i, /value\s*date/i, /txn/i] },
  { field: "details", tests: [/تفاصيل/, /details?/i, /narration/i] },
  // فصلنا الوصف في سطر لوحده
  { field: "description", tests: [/الوصف/, /وصف/, /desc/i, /description/i, /memo/i] },
  { field: "debit", tests: [/مدين/, /خصم/, /سحب/, /debit/i, /withdraw/i] },
  { field: "credit", tests: [/دائن/, /إيداع/, /ايداع/, /credit/i, /deposit/i] },
  { field: "balance", tests: [/رصيد/, /balance/i] },
  { field: "type", tests: [/نوع/, /operation/i, /type/i] },
  { field: "checkNo", tests: [/شيك/, /cheque/i, /check/i] },
  { field: "ref", tests: [/مرجع/, /reference/i, /\bref\b/i] },
  { field: "amount", tests: [/المبلغ/, /amount/i, /قيمة/] },
];

const META_LABELS: Array<{ key: string; tests: RegExp[] }> = [
  { key: "reportDate", tests: [/تاريخ التقرير/, /report\s*date/i] },
  { key: "customer", tests: [/اسم العميل/, /customer/i, /client/i, /اسم صاحب/] },
  { key: "accountName", tests: [/اسم الحساب/, /account\s*name/i] },
  { key: "shortName", tests: [/الاسم المختصر/, /short\s*name/i] },
  { key: "accountNumber", tests: [/رقم الحساب/, /account\s*(no|number|#)/i] },
  { key: "accountType", tests: [/نوع الحساب/, /account\s*type/i] }, 
  { key: "branch", tests: [/الفرع/, /branch/i] }, 
  { key: "period", tests: [/الفترة/, /period/i] }, 
  { key: "iban", tests: [/iban/i, /آيبان/, /ايبان/, /الايبان/] }, 
  { key: "fromDate", tests: [/تاريخ من/, /from/, /من تاريخ/] },
  { key: "toDate", tests: [/تاريخ الى/, /تاريخ إلى/, /to date/i, /إلى تاريخ/] },
  { key: "accountBalance", tests: [/رصيد الحساب/, /account balance/i] },
  { key: "openingBalance", tests: [/رصيد.*افتتاح/, /opening/i, /الرصيد الافتتاحي/] }, 
  { key: "closingBalance", tests: [/رصيد.*ختام/, /closing/i, /رصيد الاغلاق/] }, 
  { key: "currency", tests: [/العملة/, /currency/i] },
];

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(" ");
  if (!joined) return false;
  const hasDate = HEADER_ALIASES[0]!.tests.some((r) => r.test(joined));
  const hasMoney = [/مدين/, /دائن/, /رصيد/, /debit/i, /credit/i, /balance/i, /خصم/, /إيداع/].some(
    (r) => r.test(joined),
  );
  return hasDate && hasMoney;
}

function mapHeaders(cells: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  cells.forEach((raw, idx) => {
    const cell = collapse(raw);
    if (!cell) return;
    for (const { field, tests } of HEADER_ALIASES) {
      if (map[field] !== undefined) continue;
      if (tests.some((r) => r.test(cell))) {
        map[field] = idx;
        break;
      }
    }
  });
  return map;
}

function parseAmount(raw: string): number | string {
  const s = raw.replace(/sar/gi, "").replace(/ر\.?\s*س/g, "").replace(/,/g, "").trim();
  if (!s) return "";
  const n = Number(s);
  if (Number.isNaN(n)) return raw;
  return n;
}

function formatMoney(value: string | number, asBalance = false): string {
  if (value === "" || value === undefined || value === null) return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").replace(/sar/gi, "").trim());
  if (Number.isNaN(n)) return String(value);
  if (Math.abs(n) < 1e-12) return asBalance ? "0.00" : "";
  const body = n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return asBalance ? `SAR ${body}` : body;
}

function extractMeta(rows: string[][], headerIndex: number): StatementMeta {
  const meta: any = emptyMeta();
  const scan = rows.slice(0, headerIndex);
  
  for (const row of scan) {
    const present = row
      .map((v, i) => [i, collapse(v)] as const)
      .filter(([, v]) => v);
      
    for (let p = 0; p < present.length; p++) {
      const [i, label] = present[p]!;
      
      for (const { key, tests } of META_LABELS) {
        if (meta[key]) continue;
        
        if (tests.some((r) => r.test(label))) {
          // لوجيك تنظيف الخلايا الملزوقة (زي CAنوع الحساب)
          let inlineValue = label;
          for (const r of tests) {
             inlineValue = inlineValue.replace(new RegExp(r.source, 'gi'), '');
          }
          inlineValue = inlineValue.replace(/الحساب|نوع|:/g, '').trim();

          if (inlineValue && !META_LABELS.some(m => m.tests.some(r => r.test(inlineValue)))) {
            meta[key] = inlineValue;
            continue;
          }

          const next = present[p + 1]?.[1];
          const prev = present[p - 1]?.[1];
          
          let candidate = prev && !META_LABELS.some((m) => m.tests.some((r) => r.test(prev)))
            ? prev
            : next;
            
          if (candidate && META_LABELS.some(m => m.tests.some(r => r.test(candidate!)))) {
              candidate = "";
          }

          if (candidate) {
              meta[key] = candidate;
          }
        }
      }
    }
  }
  return meta;
}

function isJunkRow(tx: any): boolean {
  const filled = [tx.date, tx.details, tx.debit, tx.credit, tx.balance].filter(Boolean);
  if (filled.length === 0) return true;
  if (tx.date === "تاريخ" || tx.date === "Date") return true;
  if (!tx.date && !tx.debit && !tx.credit && !tx.balance && (tx.details || "").length > 80) return true;
  return false;
}

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function readSheetMatrix(data: ArrayBuffer, filename: string): string[][] {
  const workbook = XLSX.read(toUint8(data), {
    type: "array",
    raw: false,
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Could not read the first worksheet.");

  const aoa = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  if (/\.csv$/i.test(filename) && aoa.length === 0) {
    throw new Error("The CSV file is empty.");
  }

  return aoa.map((row) => (row ?? []).map((cell) => clean(cell)));
}

export function parseStatement(data: ArrayBuffer, filename: string): Statement {
  const matrix = readSheetMatrix(data, filename);
  if (matrix.length < 2) {
    throw new Error("The file does not contain enough rows to be a statement.");
  }

  let headerIndex = matrix.findIndex(looksLikeHeader);
  if (headerIndex < 0) {
    headerIndex = matrix.findIndex((r) => r.filter(Boolean).length >= 4);
  }
  if (headerIndex < 0) {
    throw new Error("Could not find a transaction header row.");
  }

  const header = matrix[headerIndex]!;
  const col = mapHeaders(header);

  const meta = extractMeta(matrix, headerIndex);
  const rows: any[] = []; // استخدمنا any عشان نقبل حقل description

  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const pick = (field: Field) => col[field] !== undefined ? clean(line[col[field]!]) : "";

    const tx: any = {
      date: pick("date"),
      details: pick("details"),
      description: pick("description"), // سحبنا الوصف هنا!
      debit: pick("debit"),
      credit: pick("credit"),
      balance: pick("balance"),
      type: pick("type"),
      checkNo: pick("checkNo"),
      ref: pick("ref"),
    };

    if (!tx.debit && !tx.credit && col.amount !== undefined) {
      const parsed = parseAmount(pick("amount"));
      if (typeof parsed === "number") {
        if (parsed < 0) tx.debit = formatMoney(Math.abs(parsed));
        else if (parsed > 0) tx.credit = formatMoney(parsed);
      }
    }

    if (isJunkRow(tx)) continue;
    rows.push(tx);
  }

  if (rows.length === 0) {
    throw new Error("No transactions were found under the header row.");
  }

  if (!meta.closingBalance) {
    const last = rows[rows.length - 1];
    if (last?.balance) meta.closingBalance = last.balance;
  }
  if (!meta.openingBalance) {
    const first = rows[0];
    if (first?.balance) meta.openingBalance = first.balance;
  }
  if (!meta.fromDate && rows[0]?.date) meta.fromDate = rows[0].date;
  if (!meta.toDate && rows[rows.length - 1]?.date) meta.toDate = rows[rows.length - 1]!.date;
  if (!meta.reportDate) {
    meta.reportDate = new Date().toISOString().slice(0, 10);
  }
  if (!meta.currency) meta.currency = "SAR";

  return {
    meta,
    rows,
    sourceName: filename.split(/[/\\]/).pop() || filename,
  };
}

export function moneyLabel(value: string, withSar = false) {
  return formatMoney(value, withSar);
}
