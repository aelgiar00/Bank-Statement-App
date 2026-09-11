/**
 * SNB Bank Statement PDF Generator (Pixel-Perfect Template Integration)
 * 
 * @module renderSnb
 */
import { Pen, chunk, type Triplet } from "../pen";
import { pageLabel, yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib";

// --- Constants & Layout Configuration ---
const PAGE_WIDTH = 842;  // SNB Landscape
const PAGE_HEIGHT = 595;
const TEXT_COLOR: Triplet = [0.08, 0.08, 0.08];
const RED: Triplet = [0.72, 0.10, 0.10]; // لون المدين

// إحداثيات الأعمدة (متوسطة بالمللي على القالب الأصلي)
const TABLE_TEXT_X = {
  date: 785,     // التاريخ (منتصف)
  details: 735,  // التفاصيل (يمين عشان الكلام ياخد راحته للشمال)
  notes: 430,    // ملاحظات (منتصف)
  ref: 340,      // المرجع (منتصف)
  type: 270,     // رمز العملية (منتصف)
  credit: 195,   // دائن (منتصف)
  debit: 120,    // مدين (منتصف)
  balance: 50    // الرصيد (منتصف)
};

// --- Utility Functions ---
const safeShapeText = (str: any): string => {
  const s = String(str || "").trim();
  if (!s || s === "-") return s;
  if (/[\u0600-\u06FF]/.test(s)) {
    return shapeArabic(s);
  }
  return s;
};

const extractStr = (val: any) => {
  if (!val) return "";
  const str = String(val).trim();
  if (str === "-" || str.toLowerCase() === "undefined" || str.toLowerCase() === "nan" || str.toLowerCase() === "null") return "";
  return str;
};

// دالة لقص النصوص الطويلة عشان ماتدخلش في العواميد التانية
function splitText(text: string, maxLen: number): string[] {
  if (!text) return [];
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
  return lines;
}

// --- Main Render Function ---
export async function renderSnb({ doc, fonts, statement, onProgress }: TemplateArgs) {
  // 1. Filter out invalid rows
  const validRows = statement.rows.filter((row) => {
    const dateStr = String(row.date || "");
    const detailsStr = String(row.details || "");
    return !(dateStr.includes("ميلادي") || detailsStr.includes("التفاصيل") || dateStr.includes("التاريخ"));
  });

  // 2. Calculations for the final summary page
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let depositCount = 0;
  let withdrawalCount = 0;
  
  for (const r of validRows) {
    const credit = parseFloat(String(r.credit).replace(/,/g, ''));
    const debit = parseFloat(String(r.debit).replace(/,/g, ''));
    if (!isNaN(credit) && credit > 0) {
      totalDeposits += credit;
      depositCount++;
    }
    if (!isNaN(debit) && Math.abs(debit) > 0) {
      totalWithdrawals += Math.abs(debit);
      withdrawalCount++;
    }
  }

  // 3. Chunk rows into pages
  const ROWS_FIRST_PAGE = 11; // عشان الميتا داتا واخدة مساحة
  const ROWS_MIDDLE_PAGE = 22; // الجدول كامل
  
  const paginatedGroups: any[][] = [];
  if (validRows.length > 0) {
    paginatedGroups.push(validRows.slice(0, Math.min(ROWS_FIRST_PAGE, validRows.length)));
    let index = ROWS_FIRST_PAGE;
    while (index < validRows.length) {
      paginatedGroups.push(validRows.slice(index, index + ROWS_MIDDLE_PAGE));
      index += ROWS_MIDDLE_PAGE;
    }
  } else {
    paginatedGroups.push([]);
  }
  
  const totalPages = Math.max(paginatedGroups.length, 1);

  // 4. Load & EMBED Templates
  let embeddedFirstPage: any;
  let embeddedMiddlePage: any;
  let embeddedLastPage: any;
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
    console.error("⚠️ Failed to load SNB templates", error);
    throw new Error("تأكد من رفع القوالب: snb_first_page.pdf, snb_middle_page.pdf, snb_last_page.pdf");
  }

  const meta = (statement.meta as any) || {};

  // 5. Render Pages Loop
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
    
    // --- طباعة الميتا داتا (الصفحة الأولى فقط) ---
    if (isFirstPage) {
      // الأسماء فوق
      pen.text(safeShapeText(meta.customer || meta.accountName || ""), 730, 480, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.username || meta.shortName || "demo"), 730, 465, 8.5, TEXT_COLOR, "right");
      
      // التاريخ والوقت
      pen.text(safeShapeText(meta.reportDate || ""), 420, 510, 8.5, TEXT_COLOR, "center");
      
      // المرشحات اليمين
      pen.text(shapeArabic("تنازلي"), 730, 400, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.toDate || ""), 730, 385, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.accountNumber || ""), 730, 370, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), 730, 355, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), 730, 340, 8, TEXT_COLOR, "right");

      // المرشحات الشمال
      pen.text("500", 350, 400, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.fromDate || ""), 350, 385, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), 350, 370, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), 350, 355, 8, TEXT_COLOR, "right");
    }

    // --- طباعة صفوف الجدول ---
    // إحداثيات البداية متقاسة عشان تنزل على أول سطر جراي/أبيض بالظبط
    const ROW_START_Y = isFirstPage ? 290 : 500; 
    const FIXED_ROW_STEP = 20; // المسافة المثالية لسطور SNB
    let rowY = ROW_START_Y;
    
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

      // طباعة الأعمدة العادية متسنتّرة
      pen.text(safeShapeText(dateVal), TABLE_TEXT_X.date, rowY, 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rNotes), TABLE_TEXT_X.notes, rowY, 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rRef), TABLE_TEXT_X.ref, rowY, 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rType), TABLE_TEXT_X.type, rowY, 7.5, TEXT_COLOR, "center");
      
      if (debitVal) {
        pen.text(safeShapeText("-" + debitVal), TABLE_TEXT_X.debit, rowY, 7.5, RED, "center");
      }
      if (creditVal) {
        pen.text(safeShapeText(creditVal), TABLE_TEXT_X.credit, rowY, 7.5, TEXT_COLOR, "center");
      }
      pen.text(safeShapeText(balanceVal), TABLE_TEXT_X.balance, rowY, 7.5, TEXT_COLOR, "center");

      // طباعة التفاصيل: دمج الوصف مع التفاصيل وقصهم لو السطر طويل عشان ما يضربش في العمود اللي جنبه
      const fullDetails = `${rDetails} ${rDesc}`.trim();
      const detailLines = splitText(fullDetails, 42); // أقصى حد للسطر 42 حرف
      
      let currentDetailY = rowY; 
      for (let i = 0; i < Math.min(detailLines.length, 2); i++) { // أقصى حاجة سطرين عشان ما يخرجش بره الخلية
        pen.text(safeShapeText(detailLines[i]), TABLE_TEXT_X.details, currentDetailY, 7.5, TEXT_COLOR, "right");
        currentDetailY -= 9; 
      }
      
      rowY -= FIXED_ROW_STEP;
    }
    
    // --- طباعة المجاميع (في الصفحة الأخيرة تحت الجدول مباشرة) ---
    if (isLastPage) {
      // نحسب الـ Y بتاع المجاميع بحيث يكون تحت آخر سطر وقفنا عنده بمسافة شيك
      const SUMMARY_Y = rowY - 15; 
      const formatNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      // بلوك المدين (يمين)
      pen.text(shapeArabic("إجمالي معاملات المدين"), 820, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("إجمالي المبلغ المدين"), 820, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
      
      pen.text(safeShapeText(String(withdrawalCount)), 710, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText("-" + formatNum(totalWithdrawals)), 710, SUMMARY_Y - 15, 8.5, RED, "right");

      // بلوك الدائن (شمال شوية)
      pen.text(shapeArabic("إجمالي معاملات الدائن"), 550, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("إجمالي المبلغ الدائن"), 550, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
      
      pen.text(safeShapeText(String(depositCount)), 440, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(formatNum(totalDeposits)), 440, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
    }
    
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
