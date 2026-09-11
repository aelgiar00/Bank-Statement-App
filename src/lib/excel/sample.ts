import * as XLSX from "xlsx";
import { emptyMeta, type Statement, type Transaction } from "@/lib/banks/types";

const DESCRIPTIONS = [
  ["إيداع راتب", "SALARY CREDIT — HR"],
  ["تحويل سريع", "SARIE INSTANT PAYMENT"],
  ["نقطة بيع — أسواق التميمي", "POS PURCHASE AL TAMIMI"],
  ["سحب صراف آلي", "ATM WITHDRAWAL"],
  ["سداد فاتورة الكهرباء", "SADAD — SEC UTILITY"],
  ["تحويل داخلي", "INTRA BANK TRANSFER"],
  ["رسوم خدمة شهرية", "ACCOUNT MAINTENANCE FEE"],
  ["نقطة بيع — أرامكس", "POS ARAMEX"],
  ["إيداع نقدي", "CASH DEPOSIT TELLER"],
  ["سداد فاتورة الاتصالات", "SADAD — STC"],
  ["تحويل دولي", "SWIFT MT103 OUTGOING"],
  ["نقطة بيع — النهدي", "POS AL NAHDI"],
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** In-memory Riyad-style ledger so the atelier can be tried without a file. */
export function buildSampleStatement(): { statement: Statement; bytes: Uint8Array; filename: string } {
  const opening = 128450.75;
  let balance = opening;
  const start = new Date(2026, 0, 4);
  const rows: Transaction[] = [];
  const aoa: (string | number)[][] = [
    [],
    ["", "", "", "", "", "", "", "", "", "2026-03-12", "تاريخ التقرير"],
    ["", "", "", "", "", "", "", "", "", "شركة الأفق للتجارة", "اسم العميل"],
    ["", "", "", "", "", "", "", "", "", "الحساب الجاري الرئيسي", "اسم الحساب"],
    ["", "", "", "", "", "", "", "", "", "الأفق", "الاسم المختصر للحساب"],
    ["", "", "", "", "", "", "", "", "", "2363341779940", "رقم الحساب"],
    ["", "", "", "", "", "", "", "", "", "2026-01-04", "تاريخ من"],
    ["", "", "", "", "", "", "", "", "", "2026-03-01", "تاريخ الى"],
    ["", "", "", "", "", "", "", "", "", money(opening), "رصيد الحساب"],
    ["", "", "", "", "", "", "", "", "", money(opening), "الرصيد الافتتاحي للكشف"],
  ];

  for (let i = 0; i < 18; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 3);
    const [ar, en] = DESCRIPTIONS[i % DESCRIPTIONS.length]!;
    const isCredit = i % 4 === 0 || i === 8;
    const amount = isCredit
      ? [18000, 42500, 2500, 9600][i % 4]!
      : [85.5, 1240.0, 320.75, 64.0, 2100.0][i % 5]!;
    if (isCredit) balance += amount;
    else balance -= amount;
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    rows.push({
      date,
      details: `${ar} — ${en}`,
      debit: isCredit ? "" : money(amount),
      credit: isCredit ? money(amount) : "",
      balance: money(balance),
      type: isCredit ? "إيداع" : "سحب",
      checkNo: "",
      ref: `TBC${2608000 + i}`,
    });
    aoa.push([
      "",
      money(balance),
      "",
      isCredit ? "" : money(amount),
      isCredit ? money(amount) : "",
      "",
      isCredit ? "إيداع" : "سحب",
      "",
      `TBC${2608000 + i}`,
      "",
      `${ar} — ${en}`,
      "",
      "",
      date,
    ]);
  }

  aoa.splice(
    10,
    0,
    ["", "", "", "", "", "", "", "", "", money(balance), "الرصيد الختامي للكشف"],
    [
      "",
      "الرصيد",
      "",
      "مبلغ الخصم",
      "مبلغ الإيداع ",
      "",
      "نوع العملية",
      "رقم الشيك",
      "رقم المرجع",
      "",
      "التفاصيل",
      "",
      "",
      "تاريخ ",
    ],
  );

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Statement");
  const written = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer | Uint8Array | number[];
  const bytes =
    written instanceof ArrayBuffer
      ? new Uint8Array(written)
      : written instanceof Uint8Array
        ? written
        : Uint8Array.from(written);

  const meta = emptyMeta();
  meta.customer = "شركة الأفق للتجارة";
  meta.accountName = "الحساب الجاري الرئيسي";
  meta.shortName = "الأفق";
  meta.accountNumber = "2363341779940";
  meta.iban = "SA03 8000 0000 6080 1016 7519";
  meta.fromDate = "2026-01-04";
  meta.toDate = "2026-03-01";
  meta.reportDate = "2026-03-12";
  meta.openingBalance = money(opening);
  meta.closingBalance = money(balance);
  meta.accountBalance = money(balance);
  meta.currency = "SAR";

  return {
    statement: {
      meta,
      rows,
      sourceName: "Keshf_Sample_Riyad.xlsx",
    },
    bytes,
    filename: "Keshf_Sample_Riyad.xlsx",
  };
}
