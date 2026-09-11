/**
 * SNB Bank Statement PDF Generator (Final Rescue - Pixel Perfect strictly bounded)
 * 
 * @module renderSnb
 */
import { Pen, chunk, type Triplet } from "../pen";
import { pageLabel, yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib";

// ==========================================
// 🛠️ لوحة التحكم الدقيقة للإحداثيات 
// ==========================================
const LAYOUT = {
  // 1. ارتفاع أول سطر (الرقم كل ما يزيد، السطر يطلع لفوق)
  FIRST_PAGE_START_Y: 362,  
  MIDDLE_PAGE_START_Y: 512, 
  
  // 2. المسافة الدقيقة بين السطور
  ROW_STEP: 18.5, 

  // 3. مسطرة الأعمدة (X)
  COL_X: {
    date: 795,     // التاريخ
    details: 730,  // التفاصيل (يطبع من اليمين)
    notes: 490,    // ملاحظات
    ref: 400,      // المرجع
    type: 310,     // رمز العملية
    credit: 220,   // دائن
    debit: 130,    // مدين
    balance: 50    // الرصيد
  },

  // 4. مسطرة الميتا داتا (الصفحة الأولى)
  META_R_X: 720, // يمين
  META_L_X: 430, // يسار
};
// ==========================================

const PAGE_WIDTH = 842; 
const PAGE_HEIGHT = 595;
const TEXT_COLOR: Triplet = [0.08, 0.08, 0.08];
const RED: Triplet = [0.72, 0.10, 0.10]; 

// دالة العربي الذكية اللي بتحافظ على الإنجليزي سليم
const safeShape = (txt: any) => {
  if (!txt || String(txt).trim() === "" || String(txt).toLowerCase() === "nan") return "";
  const str = String(txt).trim();
  if (str === "-") return str;

  const hasArabic = /[\u0600-\u06FF]/.test(str);
  if (!hasArabic) return str; 

  const tokens = str.split(/([^\u0600-\u06FF]+)/).filter((t) => t !== "");
  tokens.reverse();
  let final = "";
  for (const t of tokens) {
    final += /[\u0600-\u06FF]/.test(t) ? shapeArabic(t) : t;
  }
  return final;
};

const extractStr = (val: any) => {
  if (!val) return "";
  const str = String(val).trim();
  if (str === "-" || str.toLowerCase() === "undefined" || str.toLowerCase() === "nan" || str.toLowerCase() === "null") return "";
  return str;
};

// مقص النصوص الصارم
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
  return lines.slice(0, 2); 
}

export async function renderSnb({ doc, fonts, statement, onProgress }: TemplateArgs) {
  // 1. فلترة البيانات
  const validRows = statement.rows.filter((row) => {
    const dateStr = String(row.date || "");
    const detailsStr = String(row.details || "");
    return !(dateStr.includes("ميلادي") || detailsStr.includes("التفاصيل") || dateStr.includes("التاريخ") || dateStr.includes("الرصيد") || detailsStr.includes("الرصيد"));
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

  // 3. تقسيم الصفحات بدقة عشان ما تخبطش في الفوتر (12 للأولى و 23 للباقي)
  const ROWS_FIRST_PAGE = 12; 
  const ROWS_MIDDLE_PAGE = 23; 
  
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

  // 4. القوالب
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
    throw new Error("تأكد من وجود القوالب بالأسماء: snb_first_page.pdf, snb_middle_page.pdf, snb_last_page.pdf في مجلد public/templates");
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
    
    // --- طباعة الميتا داتا ---
    if (isFirstPage) {
      // إسم العميل والمستخدم
      pen.text(safeShape(meta.customer || meta.accountName || ""), LAYOUT.META_R_X, 515, 8.5, TEXT_COLOR, "right");
      pen.text(safeShape(meta.username || meta.shortName || "demo"), LAYOUT.META_R_X, 495, 8.5, TEXT_COLOR, "right");
      
      // التاريخ الفوقاني
      const dateStr = (meta.fromDate && meta.toDate) ? `${meta.fromDate} - ${meta.toDate}` : (meta.reportDate || "");
      pen.text(safeShape(dateStr), 420, 525, 8.5, TEXT_COLOR, "center");
      
      // يمين المرشحات
      pen.text(shapeArabic("تنازلي"), LAYOUT.META_R_X, 408, 8, TEXT_COLOR, "right");
      pen.text(safeShape(meta.toDate || ""), LAYOUT.META_R_X, 393, 8, TEXT_COLOR, "right");
      pen.text(safeShape(meta.accountNumber || ""), LAYOUT.META_R_X, 378, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), LAYOUT.META_R_X, 363, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), LAYOUT.META_R_X, 348, 8, TEXT_COLOR, "right");

      // شمال المرشحات
      pen.text("500", LAYOUT.META_L_X, 408, 8, TEXT_COLOR, "right");
      pen.text(safeShape(meta.fromDate || ""), LAYOUT.META_L_X, 393, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), LAYOUT.META_L_X, 378, 8, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), LAYOUT.META_L_X, 363, 8, TEXT_COLOR, "right");
    }

    // --- طباعة العمليات ---
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

      pen.text(safeShape(dateVal), LAYOUT.COL_X.date, rowY, 7, TEXT_COLOR, "center");
      pen.text(safeShape(rNotes), LAYOUT.COL_X.notes, rowY, rNotes.length > 12 ? 5.5 : 7, TEXT_COLOR, "center");
      pen.text(safeShape(rRef), LAYOUT.COL_X.ref, rowY, rRef.length > 12 ? 5.5 : 7, TEXT_COLOR, "center");
      pen.text(safeShape(rType), LAYOUT.COL_X.type, rowY, 7, TEXT_COLOR, "center");
      
      if (debitVal) pen.text(safeShape("-" + debitVal), LAYOUT.COL_X.debit, rowY, 7, RED, "center");
      if (creditVal) pen.text(safeShape(creditVal), LAYOUT.COL_X.credit, rowY, 7, TEXT_COLOR, "center");
      pen.text(safeShape(balanceVal), LAYOUT.COL_X.balance, rowY, 7, TEXT_COLOR, "center");

      // التفاصيل
      const fullDetails = `${rDetails} ${rDesc}`.trim();
      const lines = splitText(fullDetails, 42); 
      const fontSize = fullDetails.length > 35 ? 6 : 7;
      
      let currentDetailY = rowY; 
      for (const line of lines) {
        pen.text(safeShape(line), LAYOUT.COL_X.details, currentDetailY, fontSize, TEXT_COLOR, "right");
        currentDetailY -= (fontSize + 1.5); 
      }
      
      rowY -= LAYOUT.ROW_STEP;
    }
    
    // --- طباعة المجاميع النهائية ---
    if (isLastPage) {
      const formatNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      const SUMMARY_Y = 62; // ارتفاع الأرقام بالظبط جوه المستطيل اللي تحت
      
      // مسح الأرقام القديمة من القالب (مربعات بيضاء دقيقة جداً عشان ما تبوظش الخطوط)
      page.drawRectangle({ x: 100, y: SUMMARY_Y - 5, width: 100, height: 15, color: rgb(1, 1, 1) }); // مبلغ المدين
      page.drawRectangle({ x: 260, y: SUMMARY_Y - 5, width: 50,  height: 15, color: rgb(1, 1, 1) }); // عدد المدين
      page.drawRectangle({ x: 420, y: SUMMARY_Y - 5, width: 100, height: 15, color: rgb(1, 1, 1) }); // مبلغ الدائن
      page.drawRectangle({ x: 570, y: SUMMARY_Y - 5, width: 50,  height: 15, color: rgb(1, 1, 1) }); // عدد الدائن

      // طباعة القيم الجديدة
      pen.text(safeShape("-" + formatNum(totalWithdrawals)), 150, SUMMARY_Y, 8.5, RED, "center");
      pen.text(safeShape(String(withdrawalCount)), 285, SUMMARY_Y, 8.5, TEXT_COLOR, "center");
      
      pen.text(safeShape(formatNum(totalDeposits)), 470, SUMMARY_Y, 8.5, TEXT_COLOR, "center");
      pen.text(safeShape(String(depositCount)), 595, SUMMARY_Y, 8.5, TEXT_COLOR, "center");
    }
    
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
