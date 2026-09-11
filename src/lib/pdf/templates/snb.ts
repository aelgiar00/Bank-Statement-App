/**
 * SNB Bank Statement PDF Generator (Dynamic Font & Configurable Layout)
 * 
 * @module renderSnb
 */
import { Pen, chunk, type Triplet } from "../pen";
import { pageLabel, yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib";

// ==========================================
// 🛠️ لوحة التحكم (السر هنا عشان تظبطها بإيدك)
// ==========================================
const LAYOUT = {
  // 1. ارتفاع أول سطر في الجدول (لو السطر نازل، كبّر الرقم.. لو طالع لفوق، صغّر الرقم)
  FIRST_PAGE_START_Y: 410, // بداية الجدول في الصفحة الأولى
  MIDDLE_PAGE_START_Y: 505, // بداية الجدول في باقي الصفحات
  
  // 2. المسافة بين كل سطر والتاني (عشان ينزل في الأبيض والرمادي بالظبط)
  ROW_STEP: 23, 

  // 3. إحداثيات العواميد (لو أي عمود داخل في التاني، زق الرقم بتاعه يمين أو شمال)
  COL_X: {
    date: 790,     
    details: 745,  
    notes: 435,    
    ref: 350,      
    type: 275,     
    credit: 200,   
    debit: 115,    
    balance: 50    
  }
};
// ==========================================

const PAGE_WIDTH = 842;  // SNB Landscape
const PAGE_HEIGHT = 595;
const TEXT_COLOR: Triplet = [0.08, 0.08, 0.08];
const RED: Triplet = [0.72, 0.10, 0.10]; 

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

// دالة القص الذكية مع تصغير الخط
function formatDetails(text: string): { lines: string[], fontSize: number } {
  if (!text) return { lines: [], fontSize: 7.5 };
  // لو النص طويل جداً، هنصغر الخط
  const fontSize = text.length > 40 ? 6 : 7.5;
  const maxLen = text.length > 40 ? 55 : 42; 

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
  return { lines: lines.slice(0, 2), fontSize }; // بناخد سطرين كحد أقصى
}

export async function renderSnb({ doc, fonts, statement, onProgress }: TemplateArgs) {
  const validRows = statement.rows.filter((row) => {
    const dateStr = String(row.date || "");
    const detailsStr = String(row.details || "");
    return !(dateStr.includes("ميلادي") || detailsStr.includes("التفاصيل") || dateStr.includes("التاريخ") || dateStr.includes("الرصيد"));
  });

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
    throw new Error("تأكد من رفع القوالب: snb_first_page.pdf, snb_middle_page.pdf, snb_last_page.pdf");
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
    
    // طباعة الميتا داتا
    if (isFirstPage) {
      const VAL_R_X = 730; 
      const VAL_L_X = 350; 
      
      pen.text(safeShapeText(meta.customer || meta.accountName || ""), VAL_R_X, 480, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.username || meta.shortName || "demo"), VAL_R_X, 465, 8.5, TEXT_COLOR, "right");
      
      const dateStr = (meta.fromDate && meta.toDate) ? `${meta.fromDate} - ${meta.toDate}` : (meta.reportDate || "-");
      pen.text(safeShapeText(dateStr), 420, 500, 8.5, TEXT_COLOR, "center");
      
      // التواريخ والحساب
      pen.text(safeShapeText(meta.toDate || ""), VAL_R_X, 400, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.accountNumber || ""), VAL_R_X, 385, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), VAL_R_X, 370, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), VAL_R_X, 355, 8, TEXT_COLOR, "right");

      pen.text("500", VAL_L_X, 400, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.fromDate || ""), VAL_L_X, 385, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), VAL_L_X, 370, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), VAL_L_X, 355, 8, TEXT_COLOR, "right");
    }

    // طباعة صفوف الجدول
    let rowY = isFirstPage ? LAYOUT.FIRST_PAGE_START_Y : LAYOUT.MIDDLE_PAGE_START_Y;
    
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

      // تصغير الخط أوتوماتيك للقيم العادية لو طويلة
      pen.text(safeShapeText(dateVal), LAYOUT.COL_X.date, rowY, 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rNotes), LAYOUT.COL_X.notes, rowY, rNotes.length > 15 ? 6 : 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rRef), LAYOUT.COL_X.ref, rowY, rRef.length > 15 ? 6 : 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(rType), LAYOUT.COL_X.type, rowY, 7.5, TEXT_COLOR, "center");
      
      if (debitVal) pen.text(safeShapeText("-" + debitVal), LAYOUT.COL_X.debit, rowY, 7.5, RED, "center");
      if (creditVal) pen.text(safeShapeText(creditVal), LAYOUT.COL_X.credit, rowY, 7.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(balanceVal), LAYOUT.COL_X.balance, rowY, 7.5, TEXT_COLOR, "center");

      // التفاصيل
      const fullDetails = `${rDetails} ${rDesc}`.trim();
      const { lines, fontSize } = formatDetails(fullDetails);
      
      let currentDetailY = rowY; 
      for (const line of lines) {
        pen.text(safeShapeText(line), LAYOUT.COL_X.details, currentDetailY, fontSize, TEXT_COLOR, "right");
        currentDetailY -= (fontSize + 1.5); 
      }
      
      rowY -= LAYOUT.ROW_STEP;
    }
    
    // طباعة المجاميع (في الصفحة الأخيرة)
    if (isLastPage) {
      // المجاميع هتنزل تحت آخر سطر بـ 15 بيكسل
      const SUMMARY_Y = rowY - 15; 
      const formatNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      pen.text(shapeArabic("إجمالي معاملات المدين"), 820, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("إجمالي المبلغ المدين"), 820, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
      
      pen.text(safeShapeText(String(withdrawalCount)), 710, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText("-" + formatNum(totalWithdrawals)), 710, SUMMARY_Y - 15, 8.5, RED, "right");

      pen.text(shapeArabic("إجمالي معاملات الدائن"), 550, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("إجمالي المبلغ الدائن"), 550, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
      
      pen.text(safeShapeText(String(depositCount)), 440, SUMMARY_Y, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(formatNum(totalDeposits)), 440, SUMMARY_Y - 15, 8.5, TEXT_COLOR, "right");
    }
    
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
