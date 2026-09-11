import type { Transaction } from "@/lib/banks/types";
import { Pen, chunk, type Triplet } from "../pen";
import { yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument } from "pdf-lib";

const PAGE_W = 870;
const PAGE_H = 842;

// اللون الكحلي/البنفسجي المظبوط
const INK: Triplet = [0.106, 0.071, 0.349]; 
const WASH: Triplet = [0.96, 0.96, 0.97]; 
const GRID: Triplet = [0.85, 0.85, 0.87]; 
const WHITE: Triplet = [1, 1, 1];
const GOLD: Triplet = [0.72, 0.58, 0.28];

const X = {
  left: 30,
  balance: 120,   
  debit: 210,     
  credit: 300,    
  type: 390,      
  check: 450,     
  ref: 550,       
  details: 750,   
  right: 840,     
};

const COLS = [
  { key: "balance", x0: X.left, x1: X.balance, title: "الرصيد" },
  { key: "debit", x0: X.balance, x1: X.debit, title: "مبلغ الخصم" },
  { key: "credit", x0: X.debit, x1: X.credit, title: "مبلغ الإيداع" },
  { key: "type", x0: X.credit, x1: X.type, title: "نوع العملية" },
  { key: "checkNo", x0: X.type, x1: X.check, title: "رقم الشيك" },
  { key: "ref", x0: X.check, x1: X.ref, title: "رقم المرجع" },
  { key: "details", x0: X.ref, x1: X.details, title: "التفاصيل" },
  { key: "date", x0: X.details, x1: X.right, title: "التاريخ" },
];

const safeShape = (txt: any) => {
  if (!txt || String(txt).trim() === "" || String(txt).toLowerCase() === "nan") {
    return "—";
  }

  const str = String(txt).trim();

  if (str === "—") return str;

  if (
    str.includes("emaN") ||
    str.toLowerCase().includes("customer") ||
    str.includes("العميل")
  ) {
    return "—";
  }

  // العربي كله يمر من خلال محرك الـ shaping + bidi.
  // ممنوع نقلب الـ tokens هنا، لأن shapeArabic هي المسؤولة
  // عن ترتيب العربي مع الأرقام والإنجليزي.
  if (/[؀-ۿݐ-ݿࢠ-ࣿ]/.test(str)) {
    return shapeArabic(str);
  }

  return "\u200E" + str;
};

const safeMoney = (val: any) => {
  if (!val || String(val).toLowerCase() === 'nan') return "—";
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return "—";
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " SAR";
};

export async function renderRiyad({ doc, fonts, statement, onProgress }: TemplateArgs) {
  const rows = statement.rows;
  const firstCount = 9; 
  const rest = rows.slice(firstCount);
  const perPage = 19; 
  // تثبيت عدد الصفحات على 74
  const totalPages = 74;

  const pages: Transaction[][] = [rows.slice(0, firstCount)];
  for (let i = 0; i < rest.length; i += perPage) pages.push(rest.slice(i, i + perPage));

  let templateDoc: PDFDocument | null = null;
  try {
    const templateBytes = await fetch("/riyad.pdf").then(res => {
      if (!res.ok) throw new Error("File not found");
      return res.arrayBuffer();
    });
    templateDoc = await PDFDocument.load(templateBytes);
  } catch (error) {
    console.warn("⚠️ قالب riyad.pdf غير موجود.");
  }

  const m = statement.meta;

  let finalAccNum = String(m.accountNumber || "").trim();
  let finalCustName = String(m.accountName || m.customer || "").trim();

  const isBadName = (s: string) => !s || /^\d+$/.test(s) || s === "NaN" || s.includes("emaN") || s.toLowerCase().includes("customer") || s === "—" || s === "";
  const isBadAcc = (s: string) => !s || !/^\d{10,}$/.test(s);

  if (isBadAcc(finalAccNum) || isBadName(finalCustName)) {
      const allStrs: string[] = [];
      for (const [k, v] of Object.entries(m)) {
          if (k) allStrs.push(String(k).trim());
          if (v) allStrs.push(String(v).trim());
      }
      if (isBadAcc(finalAccNum)) {
          const acc = allStrs.find(s => /^\d{10,24}$/.test(s));
          if (acc) finalAccNum = acc;
      }
      if (isBadName(finalCustName)) {
          const name = allStrs.find(s => 
              s.length > 1 && !/^\d/.test(s) && !s.includes("/") && !s.toLowerCase().includes("sar") && !s.toLowerCase().includes("date") && !isBadName(s)
          );
          if (name) finalCustName = name;
      }
  }

  if (isBadAcc(finalAccNum)) finalAccNum = "—";
  if (isBadName(finalCustName)) finalCustName = "—";

  for (let p = 0; p < pages.length; p++) {
    let page;
    if (templateDoc) {
      const copyIdx = p === 0 ? 0 : (templateDoc.getPageCount() > 1 ? 1 : 0);
      const [templatePage] = await doc.copyPages(templateDoc, [copyIdx]);
      page = doc.addPage(templatePage);
    } else {
      page = doc.addPage([PAGE_W, PAGE_H]);
    }

    const pen = new Pen(page, fonts.regular);
    const isFirst = p === 0;

    if (templateDoc) {
      // 🎯 تفريغ وإبادة شاملة للصفحة عشان نبني على نضافة
      if (isFirst) {
        // مسح من تحت تفاصيل الحساب لحد الفوتر
        pen.rect(20, 95, PAGE_W - 40, PAGE_H - 350, WHITE);
      } else {
        // مسح عملاق في الصفحة التانية بياخد الهيدر القديم وكل حاجة لحد الفوتر
        pen.rect(20, 95, PAGE_W - 40, PAGE_H - 120, WHITE);
      }
      // مسح رقم الصفحة القديم فقط
      pen.rect(PAGE_W / 2 - 80, 75, 160, 20, WHITE);
    } else {
      pen.rect(0, 0, PAGE_W, PAGE_H, WHITE);
      pen.rect(0, PAGE_H - 48, PAGE_W, 48, INK);
      pen.text(shapeArabic("بنك الرياض"), PAGE_W - 36, PAGE_H - 32, 16, WHITE, "right");
      pen.text("RIYAD BANK", 36, PAGE_H - 32, 11, WHITE, "left");
      pen.rect(0, PAGE_H - 52, PAGE_W, 3, GOLD);
    }

    if (isFirst) {
      let curY = PAGE_H - 140;

      pen.rect(30, curY, 810, 24, INK);
      pen.text(shapeArabic("الحساب الجاري"), 830, curY + 8, 10, WHITE, "right");

      curY -= 72;
      pen.rect(30, curY, 810, 72, WHITE);
      pen.rect(30, curY, 810, 72, undefined, INK); 

      pen.text(shapeArabic("اسم العميل"), 830, curY + 52, 9, INK, "right");
      pen.text(safeShape(finalCustName), 435, curY + 52, 9, INK, "center", 435);
      pen.line(30, curY + 48, 840, curY + 48, GRID, 0.5);

      pen.text(shapeArabic("اسم الحساب"), 830, curY + 28, 9, INK, "right");
      pen.text(safeShape(m.accountName || "—"), 435, curY + 28, 9, INK, "center", 435);
      pen.line(30, curY + 24, 840, curY + 24, GRID, 0.5);

      pen.text(shapeArabic("الاسم المختصر للحساب"), 830, curY + 4, 9, INK, "right");
      pen.text("—", 435, curY + 4, 9, INK, "center", 435);

      curY -= 20;

      pen.rect(30, curY, 810, 24, INK);
      pen.text(shapeArabic("تصفية"), 830, curY + 8, 10, WHITE, "right");

      curY -= 72;
      pen.rect(30, curY, 810, 72, WHITE);
      pen.rect(30, curY, 810, 72, undefined, INK); 

      pen.line(435, curY, 435, curY + 72, GRID, 0.5);
      pen.line(30, curY + 48, 840, curY + 48, GRID, 0.5);
      pen.line(30, curY + 24, 840, curY + 24, GRID, 0.5);

      pen.text(shapeArabic("نوع العملية"), 830, curY + 52, 9, INK, "right");
      pen.text(shapeArabic("الكل"), 637.5, curY + 52, 9, INK, "center", 637.5);
      pen.text(shapeArabic("مدين / دائن"), 425, curY + 52, 9, INK, "right");
      pen.text(shapeArabic("الكل"), 232.5, curY + 52, 9, INK, "center", 232.5);

      pen.text(shapeArabic("تاريخ الفاتورة إلى"), 830, curY + 28, 9, INK, "right");
      pen.text(safeShape(m.toDate), 637.5, curY + 28, 9, INK, "center", 637.5);
      pen.text(shapeArabic("من تاريخ"), 425, curY + 28, 9, INK, "right");
      pen.text(safeShape(m.fromDate), 232.5, curY + 28, 9, INK, "center", 232.5);

      pen.text(shapeArabic("رقم الحساب"), 830, curY + 4, 9, INK, "right");
      pen.text(safeShape(finalAccNum), 637.5, curY + 4, 9, INK, "center", 637.5);
      pen.text(shapeArabic("رصيد الحساب"), 425, curY + 4, 9, INK, "right");
      pen.text(safeMoney(m.accountBalance || m.closingBalance), 232.5, curY + 4, 9, INK, "center", 232.5);
    }

    // نزلنا الجدول شوية في الصفحة التانية عشان المربع الأبيض العملاق يغطي الهيدر القديم
    const bodyTop = isFirst ? PAGE_H - 360 : PAGE_H - 80;
    const headerH = 24; 
    const titleH = 24;  
    const rowH = 32; 
    const tableLeft = X.left;
    const tableW = X.right - X.left;

    // 🎯 بناء الهيدر الجديد بالكامل (بلوك واحد)
    pen.rect(tableLeft, bodyTop - headerH, tableW, titleH + headerH, INK);

    // كلمة "العمليات الأخيرة" باللون الأبيض
    pen.text(shapeArabic("العمليات الأخيرة"), X.right - 10, bodyTop + 8, 10, WHITE, "right");

    // خط أبيض أفقي بيفصل
    pen.line(tableLeft, bodyTop, X.right, bodyTop, WHITE, 0.5);

    // 🎯 العناوين (رقم الشيك، التاريخ، إلخ) كلها باللون الأبيض الصريح
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      // لاحظ هنا استخدمت WHITE صراحة
      pen.text(shapeArabic(col.title), col.x0 + (col.x1 - col.x0)/2, bodyTop - 16, 8.5, WHITE, "center", col.x0 + (col.x1 - col.x0)/2);

      // الخطوط الرأسية البيضاء
      if (i > 0) {
        pen.line(col.x0, bodyTop - headerH, col.x0, bodyTop, WHITE, 0.5);
      }
    }

    let y = bodyTop - headerH;
    const pageRows = pages[p] || [];

    const xs = [X.left, X.balance, X.debit, X.credit, X.type, X.check, X.ref, X.details, X.right];
    for (const x of xs) pen.line(x, bodyTop - headerH, x, bodyTop, WHITE, 0.5);

    pageRows.forEach((row, idx) => {
      y -= rowH;
      pen.rect(tableLeft, y, tableW, rowH, idx % 2 === 0 ? WASH : WHITE);
      pen.line(tableLeft, y, X.right, y, GRID, 0.4);

      for (const col of COLS) {
        let value = (row[col.key as keyof Transaction] as string) || "";
        if (['debit', 'credit', 'balance'].includes(col.key)) {
           value = safeMoney(value);
        } else if (col.key === 'date') {
           value = value ? value.slice(0, 10) : "";
        }

        const size = col.key === "details" ? 6.5 : 7.5;
        const shaped = safeShape(value);

        const width = col.x1 - col.x0 - 8;
        const lines = pen.wrap(shaped, width, size).slice(0, 3);

        let textY = y + rowH/2 + ((lines.length - 1) * 4); 

        lines.forEach((line) => {
           pen.text(line, col.x0 + (col.x1 - col.x0)/2, textY - 3, size, INK, "center", col.x0 + (col.x1 - col.x0)/2);
           textY -= 9;
        });
      }

      for (const x of xs) pen.line(x, y, x, y + rowH, GRID, 0.5);
    });

    pen.line(tableLeft, y, X.right, y, INK, 1); 

    // ترقيم يكتب "رقم الصفحة X" زي ما طلبت
    pen.text(shapeArabic(`رقم الصفحة ${p + 1}`), PAGE_W / 2, 80, 8.5, INK, "center", PAGE_W / 2);

    onProgress?.((p + 1) / totalPages, `Composing page ${p + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
