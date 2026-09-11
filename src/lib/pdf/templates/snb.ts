/**
 * SNB Bank Statement PDF Generator (Perfect Parsing Integration & Small File Size)
 * 
 * @module renderSnb
 */
import { Pen, chunk, type Triplet } from "../pen";
import { pageLabel, yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib";

// --- Constants & Layout Configuration ---
const PAGE_WIDTH = 842; // Landscape for SNB
const PAGE_HEIGHT = 595;
const TEXT_COLOR: Triplet = [0.08, 0.08, 0.08];
const RED: Triplet = [0.72, 0.10, 0.10]; // لون المدين الأحمر

// إحداثيات عواميد الجدول (تقريبية وقابلة للتعديل بسهولة)
const TABLE_TEXT_X = {
  date: 785,     
  details: 680,  
  notes: 440,
  ref: 350,
  type: 275,
  credit: 200,       
  debit: 120,        
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

const cleanMetadata = (value: any, regex?: RegExp): string => {
  const s = extractStr(value);
  if (!s) return "-";
  if (regex) {
    return s.split(regex)[0].trim() || "-";
  }
  return s;
};

// --- Main Render Function ---
export async function renderSnb({ doc, fonts, statement, onProgress }: TemplateArgs) {
  // 1. Filter out invalid rows
  const validRows = statement.rows.filter((row) => {
    const dateStr = String(row.date || "");
    const detailsStr = String(row.details || "");
    const hasInvalidKeyword = 
        dateStr.includes("ميلادي") || 
        detailsStr.includes("ميلادي") || 
        dateStr.includes("هجري") || 
        detailsStr.includes("هجري");
    return !hasInvalidKeyword;
  });

  // 2. Calculations for the final summary page (عدد ومجموع العمليات)
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
  const ROWS_FIRST_PAGE = 12; // الصفحة الأولى بتاخد عمليات أقل عشان الميتا داتا اللي فوق
  const ROWS_MIDDLE_PAGE = 18; // الصفحة المتكررة بتاخد عمليات أكتر
  
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

  // 4. Load & EMBED Templates (عشان الحجم يفضل بالكيلوبايت)
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
    throw new Error("ملفات القوالب غير موجودة. تأكد من وجود snb_first_page.pdf و snb_middle_page.pdf و snb_last_page.pdf في مجلد public/templates");
  }

  // 5. Extract and Clean Metadata
  const meta = (statement.meta as any) || {};
  const customerName = cleanMetadata(meta.customer || meta.accountName);
  const username = cleanMetadata(meta.username || meta.shortName || "-");
  const accountNumber = cleanMetadata(meta.accountNumber, /الفترة|الفرع|رقم|:/);
  
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === totalPages - 1;
    
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    
    // سحب القالب المناسب للصفحة
    let templateToDraw = embeddedMiddlePage;
    if (isFirstPage) templateToDraw = embeddedFirstPage;
    // لو دي آخر صفحة والملف أكتر من صفحة، حط قالب المجاميع
    if (isLastPage && totalPages > 1) templateToDraw = embeddedLastPage;
    // لو الملف كله صفحة واحدة، هيطبع قالب الصفحة الأولى، والمجاميع هتنزل تحت الجدول
    if (isFirstPage && isLastPage) templateToDraw = embeddedFirstPage; 

    page.drawPage(templateToDraw, {
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    });
    
    const pen = new Pen(page, fonts.regular); // هيستخدم الفونت NeoSans اللي هتحطه
    const currentPageRows = paginatedGroups[pageIndex] ?? [];
    
    // --- طباعة الميتا داتا في الصفحة الأولى ---
    if (isFirstPage) {
      const VAL_R_X = 730; // إحداثيات القيم اليمين
      const VAL_L_X = 400; // إحداثيات القيم الشمال
      
      const metaY = 460; // ارتفاع البلوك الأول
      
      pen.text(safeShapeText(customerName), VAL_R_X, metaY, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(username), VAL_R_X, metaY - 18, 8.5, TEXT_COLOR, "right");
      
      const dateStr = (meta.fromDate && meta.toDate) ? `${meta.fromDate} - ${meta.toDate}` : (meta.reportDate || "-");
      pen.text(safeShapeText(dateStr), VAL_L_X, metaY, 8.5, TEXT_COLOR, "right");
      
      const filterY = metaY - 55; // ارتفاع بلوك المرشحات
      
      pen.text(shapeArabic("تنازلي"), VAL_R_X, filterY, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.toDate || "-"), VAL_R_X, filterY - 18, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(accountNumber), VAL_R_X, filterY - 36, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), VAL_R_X, filterY - 54, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), VAL_R_X, filterY - 72, 8.5, TEXT_COLOR, "right");

      pen.text("500", VAL_L_X, filterY, 8.5, TEXT_COLOR, "right");
      pen.text(safeShapeText(meta.fromDate || "-"), VAL_L_X, filterY - 18, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("الحالي"), VAL_L_X, filterY - 36, 8.5, TEXT_COLOR, "right");
      pen.text(shapeArabic("الكل"), VAL_L_X, filterY - 54, 8.5, TEXT_COLOR, "right");
    }

    // --- طباعة صفوف الجدول ---
    // الصفحة الأولى بتبدأ من تحت شوية عشان الميتا داتا
    const ROW_START_Y = isFirstPage ? 260 : 480; 
    const FIXED_ROW_STEP = 23; // مسافة نزول السطر عشان يجي في الرمادي والأبيض بالمللي
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

      // دمج التفاصيل والوصف في عمود "التفاصيل"
      const detailLines: string[] = [];
      if (rDetails) detailLines.push(rDetails);
      if (rDesc) detailLines.push(rDesc);

      pen.text(safeShapeText(dateVal), TABLE_TEXT_X.date, rowY, 8, TEXT_COLOR, "center");
      pen.text(safeShapeText(rNotes), TABLE_TEXT_X.notes, rowY, 8, TEXT_COLOR, "center");
      pen.text(safeShapeText(rRef), TABLE_TEXT_X.ref, rowY, 8, TEXT_COLOR, "center");
      pen.text(safeShapeText(rType), TABLE_TEXT_X.type, rowY, 8, TEXT_COLOR, "center");
      
      pen.text(safeShapeText(debitVal ? "-" + debitVal : ""), TABLE_TEXT_X.debit, rowY, 8.5, RED, "center");
      pen.text(safeShapeText(creditVal), TABLE_TEXT_X.credit, rowY, 8.5, TEXT_COLOR, "center");
      pen.text(safeShapeText(balanceVal), TABLE_TEXT_X.balance, rowY, 8.5, TEXT_COLOR, "center");

      // طباعة التفاصيل سطور تحت بعضها
      let currentDetailY = rowY + 2; 
      for (const line of detailLines) {
        let safeLine = line.length > 55 ? line.substring(0, 52) + "..." : line;
        pen.text(safeShapeText(safeLine), TABLE_TEXT_X.details, currentDetailY, 7.5, TEXT_COLOR, "right");
        currentDetailY -= 9; 
      }
      
      rowY -= FIXED_ROW_STEP;
    }
    
    // --- طباعة المجاميع (في الصفحة الأخيرة فقط) ---
    if (isLastPage) {
      const SUMMARY_Y = 60; // إحداثيات السطر الأخير خالص في الصفحة
      const formatNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      // مسح الأرقام القديمة بمربعات بيضاء دقيقة
      page.drawRectangle({ x: 630, y: SUMMARY_Y - 10, width: 80, height: 25, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 440, y: SUMMARY_Y - 10, width: 120, height: 25, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 250, y: SUMMARY_Y - 10, width: 80, height: 25, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 80,  y: SUMMARY_Y - 10, width: 120, height: 25, color: rgb(1, 1, 1) });

      // طباعة الأرقام الجديدة المحسوبة من الكود
      pen.text(safeShapeText(String(depositCount)), 670, SUMMARY_Y, 9, TEXT_COLOR, "center"); // عدد معاملات الدائن
      pen.text(safeShapeText(formatNum(totalDeposits)), 500, SUMMARY_Y, 9, TEXT_COLOR, "center"); // إجمالي الدائن
      pen.text(safeShapeText(String(withdrawalCount)), 290, SUMMARY_Y, 9, TEXT_COLOR, "center"); // عدد معاملات المدين
      pen.text(safeShapeText("-" + formatNum(totalWithdrawals)), 140, SUMMARY_Y, 9, RED, "center"); // إجمالي المدين
    }
    
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
