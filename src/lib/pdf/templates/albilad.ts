/**
 * Albilad Bank Statement PDF Generator (Final Perfection: Coordinates & Margins)
 * 
 * @module renderAlbilad
 */
import { Pen, chunk, type Triplet } from "../pen";
import { pageLabel, yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib";

// --- Constants & Layout Configuration ---
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const TEXT_COLOR: Triplet = [0.08, 0.08, 0.08];

// Text X-Coordinates for Table Data (Right-aligned)
const TABLE_TEXT_X = {
  date: 545,     
  details: 425,  
  debit: 243,        
  credit: 173,       
  balance: 103       
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
export async function renderAlbilad({ doc, fonts, statement, onProgress }: TemplateArgs) {
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

  // 2. Calculations for the final summary page
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  
  for (const r of validRows) {
    const credit = parseFloat(String(r.credit).replace(/,/g, ''));
    const debit = parseFloat(String(r.debit).replace(/,/g, ''));
    if (!isNaN(credit)) totalDeposits += credit;
    if (!isNaN(debit)) totalWithdrawals += Math.abs(debit);
  }

  // 3. Chunk rows into pages (14 rows perfectly fills the Albilad table layout)
  const MAX_ROWS_PER_PAGE = 14;
  const paginatedGroups = chunk(validRows, MAX_ROWS_PER_PAGE);
  const totalPages = Math.max(paginatedGroups.length, 1);

  // 4. Load & EMBED Templates
  let embeddedFirstPage: any;
  let embeddedLastPage: any;
  try {
    const firstBuffer = await fetch("/templates/albilad_first_page.pdf").then(res => res.arrayBuffer());
    const lastBuffer = await fetch("/templates/albilad_last_page.pdf").then(res => res.arrayBuffer());
    
    const [firstPageForm] = await doc.embedPdf(firstBuffer);
    const [lastPageForm] = await doc.embedPdf(lastBuffer);
    
    embeddedFirstPage = firstPageForm;
    embeddedLastPage = lastPageForm;
  } catch (error) {
    console.error("⚠️ Failed to load Albilad templates", error);
    throw new Error("ملفات القوالب غير موجودة. تأكد من وجود albilad_first_page.pdf و albilad_last_page.pdf في مجلد public/templates");
  }

  // 5. Extract and Clean Metadata
  const meta = (statement.meta as any) || {};
  
  let rawAccType = cleanMetadata(meta.accountType);
  const accountType = (rawAccType.toUpperCase() === "CA" || !rawAccType) ? "حساب جاري" : rawAccType;
  
  const accountNumber = cleanMetadata(meta.accountNumber, /الفترة|الفرع|رقم|:/);
  const ibanNumber = cleanMetadata(meta.iban, /الفرع|رقم|:/);
  const branchName = cleanMetadata(meta.branch, /العملة|رقم/);
  const currencyStr = cleanMetadata(meta.currency).replace(/ةلمعلا|العملة|:/g, '').trim() || "SAR";
  
  let periodStr = "-";
  if (meta.period) {
      periodStr = cleanMetadata(meta.period, /هجري|ميلادي|:/);
  } else if (meta.fromDate && meta.toDate) {
      periodStr = `${meta.fromDate} - ${meta.toDate}`;
  }
  const openingBalance = meta.openingBalance != null ? cleanMetadata(meta.openingBalance, /رصيد|:/) : "-";

  // 6. Render Pages Loop
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const isLastPage = pageIndex === totalPages - 1;
    
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawPage(isLastPage ? embeddedLastPage : embeddedFirstPage, {
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    });
    
    const pen = new Pen(page, fonts.regular);
    const currentPageRows = paginatedGroups[pageIndex] ?? [];
    
    // --- Print Metadata ---
    const VALUE_X = 440; // زقة يمين سنة بسيطة
    let currentTextY = 718; // زقة لتحت سنة بسيطة عشان تبعد عن الخط
    const LINE_SPACING = 13.5; // تقليل المسافة سنة بسيطة عشان السطر الأخير يترفع عن الأحمر
    const FONT_SIZE = 9; 

    pen.text(safeShapeText(accountType), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;
    
    pen.text(safeShapeText(accountNumber), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right"); 
    currentTextY -= LINE_SPACING;

    pen.text(safeShapeText(ibanNumber), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    pen.text(safeShapeText(branchName), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    pen.text(safeShapeText(currencyStr), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    pen.text(shapeArabic(`${pageIndex + 1} من ${totalPages}`), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    pen.text(safeShapeText(periodStr), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    pen.text(safeShapeText(openingBalance), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");

    // --- Print Table Rows ---
    const ROW_START_Y = 555; 
    const FIXED_ROW_STEP = 31; 
    let rowY = ROW_START_Y;
    
    for (const row of currentPageRows) {
      const dateVal = (row.date || "").slice(0, 10);
      const debitVal = extractStr(row.debit);
      const creditVal = extractStr(row.credit);
      const balanceVal = extractStr(row.balance);
      
      const rawRow = row as any;
      const rDetails = extractStr(rawRow.details);
      const rDesc = extractStr(rawRow.description);
      const rRef = extractStr(rawRow.ref);
      
      const detailLines: string[] = [];
      if (rDetails) detailLines.push(rDetails);
      if (rDesc) detailLines.push(rDesc);
      if (rRef) detailLines.push(rRef);

      pen.text(safeShapeText(dateVal), TABLE_TEXT_X.date, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(debitVal), TABLE_TEXT_X.debit, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(creditVal), TABLE_TEXT_X.credit, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(balanceVal), TABLE_TEXT_X.balance, rowY, 9, TEXT_COLOR, "right");

      let currentDetailY = rowY;
      for (const line of detailLines) {
        let safeLine = line.length > 45 ? line.substring(0, 42) + "..." : line;
        pen.text(safeShapeText(safeLine), TABLE_TEXT_X.details, currentDetailY, 8, TEXT_COLOR, "right");
        currentDetailY -= 10; 
      }
      
      rowY -= FIXED_ROW_STEP;
    }
    
    // --- Print Summary (Only on Last Page) ---
    if (isLastPage) {
      const WIPE_Y = 112;
      const WIPE_HEIGHT = 20;
      
      page.drawRectangle({ x: 45, y: WIPE_Y, width: 60, height: WIPE_HEIGHT, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 115, y: WIPE_Y, width: 60, height: WIPE_HEIGHT, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 185, y: WIPE_Y, width: 60, height: WIPE_HEIGHT, color: rgb(1, 1, 1) });

      const SUMMARY_Y = 120;
      const formatNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      pen.text(safeShapeText(formatNum(totalDeposits)), TABLE_TEXT_X.credit, SUMMARY_Y, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText("-" + formatNum(totalWithdrawals)), TABLE_TEXT_X.debit, SUMMARY_Y, 9, TEXT_COLOR, "right");
      
      const finalBalStr = validRows.length > 0 ? validRows[validRows.length - 1].balance : "0.00";
      pen.text(safeShapeText(String(finalBalStr)), TABLE_TEXT_X.balance, SUMMARY_Y, 9, TEXT_COLOR, "right");
    }
    
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    await yieldPaint();
  }
}
