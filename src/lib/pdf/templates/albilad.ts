import { Pen, chunk, type Triplet } from "../pen";
import { pageLabel, yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument, rgb } from "pdf-lib"; // ضفنا مكتبة pdf-lib هنا

const W = 595;
const H = 842;
const INK: Triplet = [0.08, 0.08, 0.08];

const BOXES = {
  balance: { x: 40, w: 68 },
  credit: { x: 108, w: 70 },
  debit: { x: 178, w: 70 },
  details: { x: 248, w: 194 },
  date: { x: 442, w: 113 },
};

const TEXT_X = {
  date: 550,     
  details: 437,    
  debit: 243,        
  credit: 173,        
  balance: 103       
};

export async function renderAlbilad({ doc, fonts, statement, onProgress }: TemplateArgs) {
  const groups = chunk(statement.rows, 20);
  const total = Math.max(groups.length, 1);

  // 1. تحميل قالب البنك الأصلي باللوجو والـ QR
  let templateDoc: PDFDocument;
  try {
    const templateBytes = await fetch("/147091696091307.PDF").then(res => res.arrayBuffer());
    templateDoc = await PDFDocument.load(templateBytes);
  } catch (error) {
    console.error("⚠️ ملف القالب غير موجود في فولدر public!");
    return;
  }

  for (let p = 0; p < total; p++) {
    // 2. نسخ الصفحة الأصلية كخلفية
    const [templatePage] = await doc.copyPages(templateDoc, [0]);
    const page = doc.addPage(templatePage);
    const pen = new Pen(page, fonts.regular);

    const rows = groups[p] ?? [];
    const wipeBottomY = 80;
    const topY = 582;
    const startY = 565;
    const rowHeight = 24;
    const tableHeight = (rows.length * rowHeight) + 15;
    const boxBottomY = topY - tableHeight;

    // 3. مسح الجدول القديم بمربع أبيض (زي كود البايثون بالظبط)
    page.drawRectangle({
      x: 35,
      y: wipeBottomY,
      width: 530,
      height: topY - wipeBottomY,
      color: rgb(1, 1, 1),
    });

    // 4. رسم مربعات الإطارات الجديدة 
    for (const [boxName, box] of Object.entries(BOXES)) {
      page.drawRectangle({
        x: box.x,
        y: boxBottomY,
        width: box.w,
        height: tableHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
    }

    // 5. كتابة الداتا الجديدة فوق القالب
    let y = startY;
    for (const row of rows) {
      const dateVal = (row.date || "").slice(0, 10);
      
      let detailsVal = row.details || "";
      if (detailsVal.length > 42) {
        detailsVal = detailsVal.substring(0, 40) + "..";
      }

      const debitVal = row.debit && String(row.debit).toLowerCase() !== "nan" ? String(row.debit) : "";
      const creditVal = row.credit && String(row.credit).toLowerCase() !== "nan" ? String(row.credit) : "";
      const balanceVal = row.balance || "";

      pen.text(shapeArabic(dateVal), TEXT_X.date, y, 9, INK, "right");
      pen.text(shapeArabic(detailsVal), TEXT_X.details, y, 8, INK, "right");
      pen.text(shapeArabic(debitVal), TEXT_X.debit, y, 9, INK, "right");
      pen.text(shapeArabic(creditVal), TEXT_X.credit, y, 9, INK, "right");
      pen.text(shapeArabic(balanceVal), TEXT_X.balance, y, 9, INK, "right");

      y -= rowHeight;
    }
    
    onProgress?.((p + 1) / total, `Composing page ${p + 1} of ${total}`);
  }
}