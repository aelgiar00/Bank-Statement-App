/**
 * SNB Bank Statement PDF Generator (Clean & Strict Table Bounds)
 * 
 * @module renderSnb
 */
import { Pen, chunk, type Triplet } from "../pen";
import { pageLabel, yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib";

// ==========================================
// 🛠️ لوحة التحكم: أي حاجة مش في مكانها عدل الرقم بتاعها من هنا
// ==========================================
const CONFIG = {
  // 1. ارتفاع بداية الجدول (لو العمليات طالعة فوق الهيدر صغر الرقم، لو نازلة تحت كبر الرقم)
  START_Y_FIRST_PAGE: 330,  // بداية أول عملية في الصفحة الأولى
  START_Y_MIDDLE_PAGE: 480, // بداية أول عملية في باقي الصفحات
  
  // 2. المسافة بين كل عملية واللي تحتها (طول الخانة الرمادي أو الأبيض)
  ROW_HEIGHT: 23, 

  // 3. أماكن العواميد (من اليمين للشمال) - لو عمود داخل في التاني كبر أو صغر الرقم
  X: {
    date: 790,     // التاريخ
    details: 720,  // التفاصيل (بتطبع من اليمين للشمال)
    notes: 480,    // ملاحظات
    ref: 390,      // المرجع
    type: 310,     // رمز العملية
    credit: 230,   // دائن
    debit: 150,    // مدين
    balance: 70    // الرصيد
  },

  // 4. أماكن الميتا داتا في الصفحة الأولى
  META_Y_RIGHT: 500, // ارتفاع بلوك اسم العميل
  META_Y_LEFT: 460,  // ارتفاع بلوك المرشحات
};
// ==========================================

const PAGE_WIDTH = 842;  // SNB Landscape
const PAGE_HEIGHT = 595;
const TEXT_COLOR: Triplet = [0.08, 0.08, 0.08];
const RED: Triplet = [0.72, 0.10, 0.10]; 

// دالة العربي اللي نجحت في البلاد
const safeShapeText = (str: any): string => {
  const s = String(str || "").trim();
  if (!s || s === "-") return s;
  if (/[\u0600-\u06FF]/.test(s)) return shapeArabic(s);
  return s;
};

const extractStr = (val: any) => {
  if (!val) return "";
  const str = String(val).trim();
  if (str === "-" || str.toLowerCase() === "undefined" || str.toLowerCase() === "nan" || str.toLowerCase() === "null") return "";
  return str;
};

// دالة القص العنيفة: مستحيل النص يخرج بره الخانة
function formatStrictDetails(text: string): { lines: string[], fontSize: number } {
  if (!text) return { lines: [], fontSize: 7.5 };
  const maxLen = 40; // أقصى عدد حروف في السطر الواحد
  const fontSize = text.length > 35 ? 6.5 : 7.5; // تصغير تلقائي للخط

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
      if ((currentLine + " " + word).length > maxLen) {
          lines.push(currentLine);
          currentLine = word;
      } else {
          currentLine = currentLine ? currentLine + " " + word : word;
      }
  }
  if (currentLine) lines.push(currentLine);
  
  return { lines: lines.slice(0, 2), fontSize }; // بناخد سطرين بس كحد أقصى عشان الخانة
}

export async function renderSnb({ doc, fonts, statement, onProgress }: TemplateArgs) {
  // 1. فلترة
  const validRows = statement.rows.filter((row) => {
    const dateStr = String(row.date || "");
    const detailsStr = String(row.details || "");
    return !(dateStr.includes("ميلادي") || detailsStr.includes("التفاصيل") || dateStr.includes("التاريخ") || dateStr.includes("الرصيد"));
  });

  // 2. المجاميع
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let depositCount = 0;
  let withdrawalCount = 0;
  
  for (const r of validRows) {
    const credit = parseFloat(String(r.credit).replace(/,/g, ''));
    const debit = parseFloat(String(r.debit).replace(/,/g, ''));
    if (!isNaN(credit) && credit > 0) { totalDeposits += credit; depositCount++; }
    if (!isNaN(debit) && Math.abs(debit) > 0) { totalWithdrawals += Math.abs(debit); withdrawalCount++; }
  }

  // 3. تقسيم الصفحات (11 صفحة أولى، 20 للباقي)
  const paginatedGroups: any[][] = [];
  if (validRows.length > 0) {
    paginatedGroups.push(validRows.slice(0, Math.min(11, validRows.length)));
    let index = 11;
    while (index < validRows.length) {
      paginatedGroups.push(validRows.slice(index, index + 20));
      index += 20;
    }
  } else {
    paginatedGroups.push([]);
  }
  
  const totalPages = Math.max(paginatedGroups.length, 1);

  // 4. دمج القوالب
  let embeddedFirstPage: any, embeddedMiddlePage: any, embeddedLastPage: any;
  try {
    const firstBuffer = await fetch("/templates/snb_first_page.pdf").then(res => res.arrayBuffer());
    const middleBuffer = await fetch("/templates/snb_middle_page.pdf").then(res => res.arrayBuffer());
    const lastBuffer = await fetch("/templates/snb_last_page.pdf").then(res => res.arrayBuffer());
    
    const [firstPageForm] = await doc.embedPdf(firstBuffer);
    const [middlePageForm] = await doc.embedPdf(middleBuffer);
    const [lastPageForm] = await doc.embedPdf(lastBuffer);
    
    embeddedFirstPage = firstPageForm;
    embeddedMiddlePage = middlePageForm;
    embeddedLastPage = lastPageForm;
  } catch (error) {
    throw new Error("تأكد من وجود القوالب بالأسماء المظبوطة في مجلد public/templates");
  }

  const meta = (statement.meta as any) || {};

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === totalPages - 1;
    
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    
    let templateToDraw = embeddedMiddlePage;
    if (isFirstPage) templateToDraw = embeddedFirstPage;
    if (isLastPage && totalPages > 1) templateToDraw = embeddedLastPage;
    if (isFirstPage && isLastPage) templateToDraw = embeddedFirstPage; 

    page.drawPage(templateToDraw, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
    
    const pen = new Pen(page, fonts.regular);
    const currentPageRows = paginatedGroups[pageIndex] ?? [];
    
    // --- الميتا داتا ---
    if (isFirstPage) {
      pen.text(safeShapeText(meta.customer || meta.accountName || ""), 760, CONFIG.META_Y_RIGHT, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.username || meta.shortName || "demo"), 760, CONFIG.META_Y_RIGHT - 15, 8.5, TEXT_COLOR, "right");
      
      pen.text(shapeArabic("تنازلي"), 760, CONFIG.META_Y_LEFT, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.toDate || ""), 760, CONFIG.META_Y_LEFT - 15, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.accountNumber || ""), 760, CONFIG.META_Y_LEFT - 30, 8, TEXT_COLOR, "right");
      
      pen.text("500", 420, CONFIG.META_Y_LEFT, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.fromDate || ""), 420, CONFIG.META_Y_LEFT - 15, 8, TEXT_COLOR, "right");
    }

    // --- طباعة الجدول ---
    let rowY = isFirstPage ? CONFIG.START_Y_FIRST_PAGE : CONFIG.START_Y_MIDDLE_PAGE;
    
    for (const row of currentPageRows) {
      const dateVal = (row.date || "").slice(0, 10);
      const debitVal = extractStr(row.debit);
      const creditVal = extractStr(row.credit);
      const balanceVal = extractStr(row.balance);
      
      const rawRow = row as any;
      const rDetails = extractStr(rawRow.details);
      const rDesc = extractStr(rawRow.description || rawRow.desc || rawRow['الوصف'] || "");
      const rNotes = extractStr(rawRow.notes || rawRow['ملاحظات'] || "");
      const rRef = extractStr(rawRow.ref || rawRow.reference || rawRow['المرجع'] || "");
      const rType = extractStr(rawRow.type || rawRow['رمز العملية'] || "");

      // القيم الأساسية متسنتّرة
      pen.text(safeShapeText(dateVal), CONFIG.X.date, rowY, 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rNotes), CONFIG.X.notes, rowY, rNotes.length > 10 ? 6 : 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rRef), CONFIG.X.ref, rowY, rRef.length > 10 ? 6 : 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rType), CONFIG.X.type, rowY, 7.5, TEXT_COLOR, "center");
      
      if (debitVal) pen.text(safeShapeText("-" + debitVal), CONFIG.X.debit, rowY, 7.5, RED, "center");
      if (creditVal) pen.text(safeShapeText(creditVal), CONFIG.X.credit, rowY, 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(balanceVal), CONFIG.X.balance, rowY, 7.5, TEXT_COLOR, "center");

      // التفاصيل
      const fullDetails = `${rDetails} ${rDesc}`.trim();
      const { lines, fontSize } = formatStrictDetails(fullDetails);
      
      let currentDetailY = rowY; 
      for (const line of lines) {
        pen.text(safeShapeText(line), CONFIG.X.details, currentDetailY, fontSize, TEXT_COLOR, "right");
        currentDetailY -= (fontSize + 2); 
      }
      
      rowY -= CONFIG.ROW_HEIGHT;
    }
    
    // --- طباعة المجاميع (دايناميك تحت آخر سطر) ---
    if (isLastPage) {
      const SUMMARY_Y = rowY - 20; // بتنزل 20 بيكسل تحت آخر عملية اتطبعت
      const formatNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      pen.text(shapeArabic("إجمالي معاملات المدين"), 800, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("إجمالي المبلغ المدين"), 800, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
      
      pen.text(safeShapeText(String(withdrawalCount)), 660, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText("-" + formatNum(totalWithdrawals)), 660, SUMMARY_Y - 15, 8.5, RED, "right");

      pen.text(shapeArabic("إجمالي معاملات الدائن"), 450, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("إجمالي المبلغ الدائن"), 450, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
      
      pen.text(safeShapeText(String(depositCount)), 330, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(formatNum(totalDeposits)), 330, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
    }
    
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
