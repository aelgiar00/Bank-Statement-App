/**
 * SNB Bank Statement PDF Generator (Pixel-Perfect with Pre-wiped Templates)
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
const RED: Triplet = [0.72, 0.10, 0.10]; // لون المدين الأحمر

// إحداثيات الأعمدة (متوسطة بالمللي عشان تنزل جوه الجداول)
const TABLE_TEXT_X = {
  date: 785,     
  details: 745,  // زقيناها يمين عشان تفرد براحتها للشمال جوه الخانة بس
  notes: 435,    
  ref: 345,      
  type: 275,     
  credit: 195,   
  debit: 115,    
  balance: 45    
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

// دالة القص الصارمة: مستحيل النص يخرج بره خانة التفاصيل
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
    return !(dateStr.includes("ميلادي") || detailsStr.includes("التفاصيل") || dateStr.includes("التاريخ") || dateStr.includes("الرصيد"));
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

  // 3. Chunk rows into pages (تظبيط العدد عشان مايخرجش بره الجدول)
  const ROWS_FIRST_PAGE = 10; 
  const ROWS_MIDDLE_PAGE = 20; 
  
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
    throw new Error("ملفات القوالب غير موجودة في public/templates");
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
    // (شيلنا العناوين وطبعنا الداتا بس في أماكنها)
    if (isFirstPage) {
      const VAL_R_X = 730; 
      const VAL_L_X = 350; 
      
      pen.text(safeShapeText(meta.customer || meta.accountName || ""), VAL_R_X, 475, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.username || meta.shortName || "demo"), VAL_R_X, 460, 8.5, TEXT_COLOR, "right");
      
      const dateStr = (meta.fromDate && meta.toDate) ? `${meta.fromDate} - ${meta.toDate}` : (meta.reportDate || "-");
      pen.text(safeShapeText(dateStr), 420, 485, 8.5, TEXT_COLOR, "center");
      
      // المرشحات اليمين (مظبوطة بالمللي)
      pen.text(safeShapeText(meta.toDate || ""), VAL_R_X, 396, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.accountNumber || ""), VAL_R_X, 381, 8, TEXT_COLOR, "right");

      // المرشحات الشمال (مظبوطة بالمللي)
      pen.text(safeShapeText(meta.fromDate || ""), VAL_L_X, 396, 8, TEXT_COLOR, "right");
    }

    // --- طباعة صفوف الجدول ---
    // رفعنا بداية الجدول عشان يظبط مع أول سطر رمادي/أبيض
    const ROW_START_Y = isFirstPage ? 290 : 515; 
    const FIXED_ROW_STEP = 22; // المسافة الدقيقة بين السطور في SNB
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

      // طباعة التفاصيل: قص صارم لـ 38 حرف عشان ما يدخلش في المرجع والملاحظات
      const fullDetails = `${rDetails} ${rDesc}`.trim();
      const detailLines = splitText(fullDetails, 38); 
      
      let currentDetailY = rowY; 
      for (let i = 0; i < Math.min(detailLines.length, 2); i++) { // سطرين كحد أقصى
        pen.text(safeShapeText(detailLines[i]), TABLE_TEXT_X.details, currentDetailY, 7, TEXT_COLOR, "right");
        currentDetailY -= 9; 
      }
      
      rowY -= FIXED_ROW_STEP;
    }
    
    // --- طباعة المجاميع (في الصفحة الأخيرة في مكانها المخصص) ---
    if (isLastPage) {
      const SUMMARY_Y_COUNT = 115; // إحداثيات السطر اللي فيه "عدد المعاملات"
      const SUMMARY_Y_AMOUNT = 98; // إحداثيات السطر اللي فيه "إجمالي المبلغ"
      const formatNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      // رفعناهم فوق عشان ينزلوا جنب الكلام الأخضر المطبوع في القالب
      pen.text(safeShapeText(String(withdrawalCount)), 120, SUMMARY_Y_COUNT, 8.5, TEXT_COLOR, "center");
      pen.text(safeShapeText("-" + formatNum(totalWithdrawals)), 120, SUMMARY_Y_AMOUNT, 8.5, RED, "center");

      pen.text(safeShapeText(String(depositCount)), 470, SUMMARY_Y_COUNT, 8.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(formatNum(totalDeposits)), 470, SUMMARY_Y_AMOUNT, 8.5, TEXT_COLOR, "center");
    }
    
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
