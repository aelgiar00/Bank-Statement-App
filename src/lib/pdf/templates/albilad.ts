/**
 * Albilad Bank Statement PDF Generator (Optimized Size & Layout)
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
  details: 435,  // زقناها شوية عشان تستوعب الكلام المدمج
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

const cleanMetadata = (value: any, regex?: RegExp): string => {
  const s = String(value || "-").trim();
  if (s === "-" || s.toLowerCase() === "undefined" || s.toLowerCase() === "null") return "-";
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

  // 3. Chunk rows into pages (Reduced to 12 rows for better spacing and long texts)
  const MAX_ROWS_PER_PAGE = 12;
  const paginatedGroups = chunk(validRows, MAX_ROWS_PER_PAGE);
  const totalPages = Math.max(paginatedGroups.length, 1);

  // 4. Load & EMBED Templates (This fixes the 35MB file size issue!)
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
  const accountType = cleanMetadata(meta.accountType);
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
    
    // Create blank page and draw the embedded template over it
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawPage(isLastPage ? embeddedLastPage : embeddedFirstPage, {
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    });
    
    const pen = new Pen(page, fonts.regular);
    const currentPageRows = paginatedGroups[pageIndex] ?? [];
    
    // --- Print Metadata (Values ONLY, no labels) ---
    const VALUE_X = 450; // إحداثيات الداتا عشان تنزل جنب الكلمات المطبوعة في القالب
    let currentTextY = 720; 
    const LINE_SPACING = 14;    
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
    const ROW_HEIGHT = 35; // كبرنا المسافة عشان الداتا متبقاش لازقة في بعض
    let rowY = ROW_START_Y;
    
    for (const row of currentPageRows) {
      const dateVal = (row.date || "").slice(0, 10);
      
      // دمج التفاصيل والوصف ورقم المرجع في سطر واحد
      const rDetails = String(row.details || "").trim();
      const rDesc = String((row as any).description || "").trim();
      const rRef = String((row as any).reference || (row as any).ref || "").trim();
      
      let combinedDetails = `${rDetails} ${rDesc !== "-" && rDesc !== "undefined" ? rDesc : ""} ${rRef !== "-" && rRef !== "undefined" ? rRef : ""}`.trim();
      
      // تقصير النص لو طويل جداً عشان ما يدخلش على الأرقام
      if (combinedDetails.length > 70) {
        combinedDetails = combinedDetails.substring(0, 68) + "..";
      }

      const debitVal = row.debit && String(row.debit).toLowerCase() !== "nan" ? String(row.debit) : "";
      const creditVal = row.credit && String(row.credit).toLowerCase() !== "nan" ? String(row.credit) : "";
      const balanceVal = row.balance || "";

      pen.text(safeShapeText(dateVal), TABLE_TEXT_X.date, rowY, 9, TEXT_COLOR, "right");
      // تصغير الفونت لـ 7 واستخدام النص المدمج
      pen.text(safeShapeText(combinedDetails), TABLE_TEXT_X.details, rowY, 7, TEXT_COLOR, "right");
      
      pen.text(safeShapeText(debitVal), TABLE_TEXT_X.debit, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(creditVal), TABLE_TEXT_X.credit, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(balanceVal), TABLE_TEXT_X.balance, rowY, 9, TEXT_COLOR, "right");

      rowY -= ROW_HEIGHT;
    }
    
    // --- Print Summary (Only on Last Page) ---
    if (isLastPage) {
      // نزلنا المجاميع لتحت عشان تنزل جوه المربعات بالظبط
      const SUMMARY_Y = 85; 
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
