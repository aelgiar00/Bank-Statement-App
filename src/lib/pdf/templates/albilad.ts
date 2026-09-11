/**
 * Albilad Bank Statement PDF Generator
 * 
 * This module is responsible for rendering the Albilad bank statement template.
 * It carefully masks the original template's metadata section while preserving 
 * the original table headers (including the English/Arabic red layout).
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

// Column Box Coordinates (Widths and X-positions)
const TABLE_COLUMNS = {
  balance: { x: 40, w: 68 },
  credit:  { x: 108, w: 70 },
  debit:   { x: 178, w: 70 },
  details: { x: 248, w: 194 },
  date:    { x: 442, w: 113 },
};

// Text X-Coordinates for Table Data (Right-aligned usually)
const TABLE_TEXT_X = {
  date: 545,     
  details: 437,    
  debit: 243,        
  credit: 173,        
  balance: 103       
};

// --- Utility Functions ---
/**
 * Safely shapes Arabic text for PDF rendering.
 * @param {any} str - The input string to process
 * @returns {string} - The processed string ready for pdf-lib
 */
const safeShapeText = (str: any): string => {
  const s = String(str || "").trim();
  if (!s || s === "-") return s;
  // Apply Arabic shaping only if Arabic characters are detected
  if (/[\u0600-\u06FF]/.test(s)) {
    return shapeArabic(s);
  }
  return s;
};

/**
 * Cleans metadata fields from unwanted prefixes/suffixes often introduced by OCR or bad extraction.
 * @param {any} value - The raw value from excel
 * @param {RegExp} regex - The regex pattern to split by
 * @returns {string} - The cleaned string
 */
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
  // 1. Filter out invalid rows (e.g., rows containing metadata labels like 'هجري' or 'ميلادي' in date/details)
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

  // 2. Chunk rows into pages (20 rows max per page for Albilad layout)
  const MAX_ROWS_PER_PAGE = 20;
  const paginatedGroups = chunk(validRows, MAX_ROWS_PER_PAGE);
  const totalPages = Math.max(paginatedGroups.length, 1);

  // 3. Load the Template PDF
  let templateDoc: PDFDocument;
  try {
    const templateBuffer = await fetch("/147091696091307.PDF").then(res => res.arrayBuffer());
    templateDoc = await PDFDocument.load(templateBuffer);
  } catch (error) {
    console.error("⚠️ Failed to load Albilad template from /147091696091307.PDF", error);
    throw new Error("ملف القالب غير موجود. تأكد من وجوده في مجلد public.");
  }

  // 4. Extract and Clean Metadata
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
  
  const openingBalance = meta.openingBalance != null 
    ? cleanMetadata(meta.openingBalance, /رصيد|:/) 
    : "-";

  // 5. Render Pages
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    // Copy template page
    const [templatePage] = await doc.copyPages(templateDoc, [0]);
    const page = doc.addPage(templatePage);
    const pen = new Pen(page, fonts.regular);

    const currentPageRows = paginatedGroups[pageIndex] ?? [];
    
    // --- Layout Coordinates ---
    // Table bounds
    const TABLE_TOP_Y = 582; // Just below the red header
    const ROW_START_Y = 565; // First text row Y
    const ROW_HEIGHT = 24;
    const ACTUAL_TABLE_HEIGHT = (currentPageRows.length * ROW_HEIGHT) + 15;
    const TABLE_BOTTOM_Y = TABLE_TOP_Y - ACTUAL_TABLE_HEIGHT;
    const WIPE_BOTTOM_Y = Math.max(80, TABLE_BOTTOM_Y - 20);

    // Metadata Window Bounds (زقيناها من تحت نقطتين عشان متجيش على الخط الأحمر)
    const METADATA_WINDOW_Y = 604; 
    const METADATA_WINDOW_HEIGHT = 133; 

    // --- Step A: Wipe Old Metadata ---
    // Create a white window from far right to far left, exclusively in the metadata zone
    page.drawRectangle({
      x: 0, 
      y: METADATA_WINDOW_Y, 
      width: PAGE_WIDTH, 
      height: METADATA_WINDOW_HEIGHT, 
      color: rgb(1, 1, 1),
    });

    // --- Step B: Wipe Old Table Data ---
    // Clear the area below the red header to draw our own data
    page.drawRectangle({
      x: 35,
      y: WIPE_BOTTOM_Y,
      width: 530,
      height: TABLE_TOP_Y - WIPE_BOTTOM_Y,
      color: rgb(1, 1, 1),
    });

    // --- Step C: Write Clean Metadata ---
    // Carefully position text inside the new white window
    const LABEL_X = 540; 
    const VALUE_X = 450;   
    let currentTextY = 720; 
    const LINE_SPACING = 14;    
    const FONT_SIZE = 9; 

    // Account Type
    pen.text(shapeArabic("نوع الحساب:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(safeShapeText(accountType), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;
    
    // Account Number
    pen.text(shapeArabic("رقم الحساب:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(safeShapeText(accountNumber), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right"); 
    currentTextY -= LINE_SPACING;

    // IBAN
    pen.text(shapeArabic("رقم أيبان:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(safeShapeText(ibanNumber), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    // Branch
    pen.text(shapeArabic("الفرع:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(safeShapeText(branchName), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    // Currency
    pen.text(shapeArabic("العملة:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(safeShapeText(currencyStr), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    // Page Number (شيلنا كلمة من كذا وخليناها الرقم بس)
    pen.text(shapeArabic("رقم الصفحة:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(shapeArabic(`${pageIndex + 1}`), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    // Period
    pen.text(shapeArabic("الفترة:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(safeShapeText(periodStr), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    currentTextY -= LINE_SPACING;

    // Opening Balance
    pen.text(shapeArabic("رصيد بداية الفترة:"), LABEL_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");
    pen.text(safeShapeText(openingBalance), VALUE_X, currentTextY, FONT_SIZE, TEXT_COLOR, "right");

    // --- Step D: Draw Table Borders ---
    // Draw column lines for the table area
    for (const [boxName, boxConfig] of Object.entries(TABLE_COLUMNS)) {
      page.drawRectangle({
        x: boxConfig.x,
        y: TABLE_BOTTOM_Y,
        width: boxConfig.w,
        height: ACTUAL_TABLE_HEIGHT,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
    }

    // --- Step E: Populate Table Data ---
    let rowY = ROW_START_Y;
    for (const row of currentPageRows) {
      // Date
      const dateVal = (row.date || "").slice(0, 10);
      
      // Details with truncation
      let detailsVal = row.details || "";
      if (detailsVal.length > 42) {
        detailsVal = detailsVal.substring(0, 40) + "..";
      }

      // Amounts
      const debitVal = row.debit && String(row.debit).toLowerCase() !== "nan" ? String(row.debit) : "";
      const creditVal = row.credit && String(row.credit).toLowerCase() !== "nan" ? String(row.credit) : "";
      const balanceVal = row.balance || "";

      // Render text
      pen.text(safeShapeText(dateVal), TABLE_TEXT_X.date, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(detailsVal), TABLE_TEXT_X.details, rowY, 8, TEXT_COLOR, "right");
      pen.text(safeShapeText(debitVal), TABLE_TEXT_X.debit, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(creditVal), TABLE_TEXT_X.credit, rowY, 9, TEXT_COLOR, "right");
      pen.text(safeShapeText(balanceVal), TABLE_TEXT_X.balance, rowY, 9, TEXT_COLOR, "right");

      rowY -= ROW_HEIGHT;
    }
    
    // Progress callback
    onProgress?.((pageIndex + 1) / totalPages, `Composing page ${pageIndex + 1} of ${totalPages}`);
    
    // Yield execution to avoid blocking the main thread
    await yieldPaint();
  }
}