import { Pen, chunk, type Triplet } from "../pen";
import { yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib";

const W = 612;
const H = 792;
const INK: Triplet = [0.05, 0.15, 0.25];
const WASH: Triplet = [0.906, 0.898, 0.969]; 
const WHITE: Triplet = [1, 1, 1];
const TEAL: Triplet = [0.15, 0.45, 0.48];

const H_RUST: Triplet = [0.75, 0.42, 0.32]; 
const H_PEACH: Triplet = [0.96, 0.90, 0.85]; 

// 🎯 الأقواس اليدوية المضبوطة عشان ما تتعارضش مع أي تعريب
const COLS = [
  { key: "date", x: 498.9, w: 74.8, title: "التاريخ" },
  { key: "details", x: 242.7, w: 252.7, title: "تفاصيل العملية" },
  { key: "debit", x: 166.8, w: 72.3, title: "سحب )مدين(" },
  { key: "credit", x: 95.3, w: 67.9, title: "إيداع )دائن(" },
  { key: "balance", x: 22.1, w: 69.9, title: "الرصيد" },
];

// 🎯 دالة ذكية لتنظيف وتشكيل النصوص ومنع تشقلب الإنجليزي
const safeShape = (txt: any) => {
  if (!txt || String(txt).trim() === "" || String(txt).toLowerCase() === "nan") return "—";
  const str = String(txt).trim();
  
  if (str === "—") return str;
  // منع ظهور أي كلمات وهمية أو أسماء العناوين جوه الخانات
  if (str.includes("emaN") || str.toLowerCase().includes("customer") || str.includes("العميل")) return "—";
  
  const hasArabic = /[\u0600-\u06FF]/.test(str);
  if (!hasArabic) return "\u200E" + str; // علامة لمنع شقلبة النصوص الإنجليزية
  
  let shaped = shapeArabic(str);
  // عدل الكلمات الإنجليزية والأرقام اللي جوه النصوص العربية
  shaped = shaped.replace(/[a-zA-Z0-9_.-]+/g, (match) => match.split('').reverse().join(''));
  
  return "\u200E" + shaped;
};

const safeMoney = (val: any) => {
  if (!val || String(val).toLowerCase() === 'nan') return "—";
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return "—";
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export async function renderAlinma({ doc, fonts, statement, onProgress }: TemplateArgs) {
  const maxRowsPerPage = 17; 
  const groups = chunk(statement.rows, maxRowsPerPage);
  const total = Math.max(groups.length, 1);

  let templateDoc: PDFDocument | null = null;
  try {
    const templateBytes = await fetch("/alinma.pdf").then(res => {
      if (!res.ok) throw new Error("File not found");
      return res.arrayBuffer();
    });
    templateDoc = await PDFDocument.load(templateBytes);
  } catch (error) {
    console.warn("⚠️ قالب alinma.pdf غير موجود.");
  }

  // ==========================================
  // 1. الغلاف (الصفحة الأولى) - إعادة رسم وتعبئة ذكية
  // ==========================================
  if (templateDoc && templateDoc.getPageCount() > 0) {
    const [coverPage] = await doc.copyPages(templateDoc, [0]);
    const page = doc.addPage(coverPage);
    const coverPen = new Pen(page, fonts.regular);
    
    // 🧽 مسح شامل لنص الغلاف عشان الجدول ينزل نضيف
    coverPen.rect(20, 220, 572, 460, WHITE);

    const m = statement.meta;
    
    // 💡 الرادار الذكي الأخير المانع للأخطاء
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

        // استخراج رقم الحساب حصرياً (أرقام فقط وتتعدى 10 أرقام)
        if (isBadAcc(finalAccNum)) {
            const acc = allStrs.find(s => /^\d{10,24}$/.test(s));
            if (acc) finalAccNum = acc;
        }

        // استخراج الاسم حصرياً (خالي من الأرقام الصريحة والتواريخ والكلمات الممنوعة)
        if (isBadName(finalCustName)) {
            const name = allStrs.find(s => 
                s.length > 1 && 
                !/^\d/.test(s) && // لا يبدأ برقم
                !s.includes("/") && // ليس تاريخاً
                !s.toLowerCase().includes("sar") && // ليس عملة
                !s.toLowerCase().includes("date") &&
                !isBadName(s)
            );
            if (name) finalCustName = name;
        }
    }

    if (isBadAcc(finalAccNum)) finalAccNum = "—";
    if (isBadName(finalCustName)) finalCustName = "—";

    let numDep = 0, sumDep = 0, numWd = 0, sumWd = 0;
    statement.rows.forEach(r => {
      const c = parseFloat(String(r.credit).replace(/,/g, ''));
      const d = parseFloat(String(r.debit).replace(/,/g, ''));
      if (!isNaN(c) && c > 0) { numDep++; sumDep += c; }
      if (!isNaN(d) && d > 0) { numWd++; sumWd += d; }
    });

    const drawTopRow = (y: number, enLbl: string, arLbl: string, val: string) => {
      coverPen.text(enLbl, 40, y, 9, INK, "left");
      coverPen.text(shapeArabic(arLbl), 572, y, 9, INK, "right");
      coverPen.text(safeShape(val), 306, y, 9, INK, "center", 306);
    };

    drawTopRow(660, "Alinma ID", "رقم الإنماء", finalAccNum);
    drawTopRow(630, "Date", "التاريخ", (m.fromDate && m.toDate) ? `From ${m.fromDate} to ${m.toDate}` : "—");
    drawTopRow(600, "Ref. No.", "الرقم المرجعي", "—");

    coverPen.rect(40, 555, 532, 24, INK);
    coverPen.text("Statement Details", 295, 563, 10, WHITE, "right");
    coverPen.text(shapeArabic("تفاصيل الكشف"), 317, 563, 10, WHITE, "left");

    let y = 515;
    const drawTableRow = (enLbl: string, arLbl: string, val: string, isLast = false) => {
      coverPen.text(enLbl, 40, y, 9, INK, "left");
      coverPen.text(shapeArabic(arLbl), 572, y, 9, INK, "right");
      coverPen.text(safeShape(val), 306, y, 9, INK, "center", 306);
      
      if (isLast) {
        coverPen.line(40, y + 20, 572, y + 20, INK, 1.5); 
      } else {
        coverPen.line(40, y - 12, 572, y - 12, INK, 0.5); 
      }
      y -= 30;
    };

    drawTableRow("Customer Name", "اسم العميل", finalCustName);
    drawTableRow("Account Number", "رقم الحساب", finalAccNum);
    drawTableRow("Account Currency", "عملة الحساب", m.currency || "SAR");
    drawTableRow("Opening Balance", "رصيد الحساب الافتتاحي", m.openingBalance ? safeMoney(m.openingBalance) : "—");
    drawTableRow("Closing Balance", "رصيد الإقفال", m.closingBalance ? safeMoney(m.closingBalance) : "—");
    drawTableRow("Number Of Deposits", "عدد الإيداعات", numDep > 0 ? numDep.toString() : "—");
    drawTableRow("Totals Deposits", "إجمالي الإيداعات", sumDep > 0 ? safeMoney(sumDep) : "—");
    drawTableRow("Number Of Withdraws", "عدد السحوبات", numWd > 0 ? numWd.toString() : "—");
    drawTableRow("Total Withdraws", "إجمالي السحوبات", sumWd > 0 ? safeMoney(sumWd) : "—", true);
  }

  // ==========================================
  // 2. رسم صفحات الجداول
  // ==========================================
  for (let p = 0; p < total; p++) {
    let page;
    if (templateDoc) {
      const pageIdx = templateDoc.getPageCount() > 1 ? 1 : 0;
      const [templatePage] = await doc.copyPages(templateDoc, [pageIdx]);
      page = doc.addPage(templatePage);
      
      const pen = new Pen(page, fonts.regular);
      pen.rect(15, 135, 580, 560, WHITE);
      pen.rect(280, 15, 52, 30, WHITE);
    } else {
      page = doc.addPage([W, H]);
    }

    const pen = new Pen(page, fonts.regular);

    if (!templateDoc) {
      pen.rect(0, 0, W, H, WHITE);
      pen.rect(0, H - 56, W, 56, INK);
      pen.text(shapeArabic("مصرف الإنماء"), W - 28, H - 28, 14, WHITE, "right");
      pen.text("ALINMA BANK", 28, H - 28, 10, WHITE);
      pen.rect(0, H - 60, W, 4, TEAL);
    }
    
    const headerY = 660; 
    for (const col of COLS) {
      let bg = INK;
      let fg: Triplet = WHITE;
      
      if (col.key === 'credit') { bg = H_PEACH; fg = [0, 0, 0]; }
      if (col.key === 'debit') { bg = H_RUST; fg = WHITE; }

      pen.rect(col.x, headerY, col.w, 36, bg);
      pen.text(shapeArabic(col.title), col.x + col.w / 2, headerY + 14, 8, fg, "center", col.x + col.w / 2);
    }

    const rows = groups[p] ?? [];
    rows.forEach((row, i) => {
      const yTop = headerY - i * 30.5; 
      const cellH = 29.5;

      for (const col of COLS) {
        pen.rect(col.x, yTop - cellH, col.w, cellH, WASH);
      }

      const dateVal = row.date ? row.date.slice(0, 10) : "";
      const debitVal = row.debit && String(row.debit).toLowerCase() !== 'nan' ? String(row.debit) : "";
      const creditVal = row.credit && String(row.credit).toLowerCase() !== 'nan' ? String(row.credit) : "";
      const balanceVal = row.balance && String(row.balance).toLowerCase() !== 'nan' ? String(row.balance) : "";

      const yCenter = yTop - 16;
      
      pen.text(safeShape(dateVal), COLS[0].x + COLS[0].w / 2, yCenter, 7.5, [0, 0, 0], "center", COLS[0].x + COLS[0].w / 2);
      pen.text(safeShape(debitVal), COLS[2].x + COLS[2].w / 2, yCenter, 7.5, [0, 0, 0], "center", COLS[2].x + COLS[2].w / 2);
      pen.text(safeShape(creditVal), COLS[3].x + COLS[3].w / 2, yCenter, 7.5, [0, 0, 0], "center", COLS[3].x + COLS[3].w / 2);
      pen.text(safeShape(balanceVal), COLS[4].x + COLS[4].w / 2, yCenter, 7.5, [0, 0, 0], "center", COLS[4].x + COLS[4].w / 2);

      const shapedDetails = shapeArabic(row.details || "");
      const detLines = pen.wrap(shapedDetails, COLS[1].w - 10, 6).slice(0, 3);
      const descRx = COLS[1].x + COLS[1].w - 5;

      let startYText = yCenter;
      if (detLines.length === 2) startYText = yTop - 13;
      else if (detLines.length === 3) startYText = yTop - 10;

      detLines.forEach((line, li) => {
        pen.text(line, descRx, startYText - li * 7, 6, [0, 0, 0], "right");
      });
    });

    const pageNumText = `${p + 2}`; 
    pen.text(shapeArabic(pageNumText), W / 2, 25, 8, INK, "center", W / 2);

    onProgress?.((p + 1) / total, `Composing page ${p + 1} of ${total}`);
    await yieldPaint();
  }
}