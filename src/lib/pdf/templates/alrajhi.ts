import { Pen, chunk, type Triplet } from "../pen";
import { yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument } from "pdf-lib";

const W = 595;
const H = 842;
const BLUE: Triplet = [0.08, 0.1, 0.85];
const WHITE: Triplet = [1, 1, 1];
const GRAY: Triplet = [0.95, 0.95, 0.95];
const BOX_BG: Triplet = [0.93, 0.94, 0.95];
const BLACK: Triplet = [0.05, 0.05, 0.08];

// 🎯 دالة ذكية لتنظيف وتشكيل النصوص ومنع تشقلب الإنجليزي
const safeShape = (txt: any) => {
  if (!txt || String(txt).trim() === "" || String(txt).toLowerCase() === "nan") return "—";
  const str = String(txt).trim();
  
  if (str === "—") return str;
  // منع ظهور أي كلمات وهمية أو أسماء العناوين جوه الخانات
  if (str.includes("emaN") || str.toLowerCase().includes("customer") || str.includes("العميل")) return "—";
  
  const hasArabic = /[\u0600-\u06FF]/.test(str);
  if (!hasArabic) return "\u200E" + str; 
  
  let shaped = shapeArabic(str);
  // عدل الكلمات الإنجليزية والأرقام اللي جوه النصوص العربية
  shaped = shaped.replace(/[a-zA-Z0-9_.-]+/g, (match) => match.split('').reverse().join(''));
  
  return "\u200E" + shaped;
};

const safeMoney = (val: any) => {
  if (!val || String(val).toLowerCase() === 'nan') return "—";
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return "—";
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export async function renderAlrajhi({ doc, fonts, statement, onProgress }: TemplateArgs) {
  const maxRowsPerPage = 27;
  const groups = chunk(statement.rows, maxRowsPerPage);
  const total = Math.max(groups.length, 1);

  let templateDoc: PDFDocument | null = null;
  try {
    const templateBytes = await fetch("/alrajhi.pdf").then(res => {
      if (!res.ok) throw new Error("File not found");
      return res.arrayBuffer();
    });
    templateDoc = await PDFDocument.load(templateBytes);
  } catch (error) {
    console.warn("⚠️ قالب alrajhi.pdf غير موجود.");
  }

  // ==========================================
  // 1. الغلاف (الصفحة الأولى) - بناء ديناميكي بالكامل
  // ==========================================
  let coverPage;
  if (templateDoc && templateDoc.getPageCount() > 0) {
    const [cPage] = await doc.copyPages(templateDoc, [0]);
    coverPage = doc.addPage(cPage);
  } else {
    coverPage = doc.addPage([W, H]);
  }
  
  const coverPen = new Pen(coverPage, fonts.regular);

  if (templateDoc) {
    // 🧽 مسح كل البيانات الوهمية القديمة والإبقاء على اللوجو والـ QR فقط
    coverPen.rect(0, 0, W, 730, WHITE);
  } else {
    coverPen.rect(0, 0, W, H, WHITE);
    coverPen.rect(0, H - 60, W, 60, BLUE);
    coverPen.text(shapeArabic("مصرف الراجحي"), W - 32, H - 35, 16, WHITE, "right");
    coverPen.text("AL RAJHI BANK", 32, H - 35, 12, WHITE);
  }

  const m = statement.meta;
  const metaAny = m as any;

  // 💡 الرادار الذكي لاستخراج رقم الحساب والاسم والآيبان صح
  let finalAccNum = String(m.accountNumber || "").trim();
  let finalCustName = String(m.accountName || m.customer || "").trim();
  let finalIban = String(m.iban || "").trim();
  
  const isBadName = (s: string) => !s || /^\d+$/.test(s) || s === "NaN" || s.includes("emaN") || s.toLowerCase().includes("customer") || s === "—" || s === "";
  const isBadAcc = (s: string) => !s || !/^\d{10,}$/.test(s);

  if (isBadAcc(finalAccNum) || isBadName(finalCustName)) {
      const allStrs: string[] = [];
      for (const [k, v] of Object.entries(m)) {
          if (k) allStrs.push(String(k).trim());
          if (v) allStrs.push(String(v).trim());
      }
      if (isBadAcc(finalAccNum)) {
          const acc = allStrs.find(s => /^\d{10,24}$/.test(s));
          if (acc) finalAccNum = acc;
      }
      if (isBadName(finalCustName)) {
          const name = allStrs.find(s => 
              s.length > 1 && !/^\d/.test(s) && !s.includes("/") && !s.toLowerCase().includes("sar") && !s.toLowerCase().includes("date") && !isBadName(s)
          );
          if (name) finalCustName = name;
      }
  }

  if (isBadAcc(finalAccNum)) finalAccNum = "—";
  if (isBadName(finalCustName)) finalCustName = "—";
  if (!finalIban || finalIban === "NaN" || finalIban === "undefined") finalIban = "—";
  if (finalIban !== "—" && !finalIban.toUpperCase().startsWith("SA")) {
      const allStrs = Object.values(m).map(String);
      const iban = allStrs.find(s => s.toUpperCase().startsWith("SA") && s.length > 15);
      if (iban) finalIban = iban;
      else finalIban = "—";
  }

  let numDep = 0, sumDep = 0, numWd = 0, sumWd = 0;
  statement.rows.forEach(r => {
    const c = parseFloat(String(r.credit).replace(/,/g, ''));
    const d = parseFloat(String(r.debit).replace(/,/g, ''));
    if (!isNaN(c) && c > 0) { numDep++; sumDep += c; }
    if (!isNaN(d) && d > 0) { numWd++; sumWd += d; }
  });

  // دوال مساعدة لرسم صفوف الغلاف (خانات رمادية ونصوص)
  const drawInfoRow = (y: number, enLbl: string, arLbl: string, val: string) => {
    coverPen.text(enLbl, 40, y + 5, 9, BLACK, "left");
    coverPen.text(shapeArabic(arLbl), 555, y + 5, 9, BLACK, "right");
    coverPen.rect(182.5, y, 230, 18, BOX_BG);
    coverPen.text(safeShape(val), W / 2, y + 5, 8.5, BLACK, "center", W / 2);
  };

  const drawPeriodRow = (y: number, enLbl: string, arLbl: string, v1: string, v2: string) => {
    coverPen.text(enLbl, 40, y + 5, 9, BLACK, "left");
    coverPen.text(shapeArabic(arLbl), 555, y + 5, 9, BLACK, "right");
    coverPen.rect(182.5, y, 100, 18, BOX_BG);
    coverPen.text(safeShape(v1), 182.5 + 50, y + 5, 8.5, BLACK, "center", 182.5 + 50);
    coverPen.text("-", W / 2, y + 5, 10, BLACK, "center", W / 2);
    coverPen.rect(W / 2 + 12.5, y, 100, 18, BOX_BG);
    coverPen.text(safeShape(v2), W / 2 + 12.5 + 50, y + 5, 8.5, BLACK, "center", W / 2 + 12.5 + 50);
  };

  const drawBlueBar = (y: number, enLbl: string, arLbl: string) => {
    coverPen.rect(40, y, 515, 20, BLUE);
    coverPen.text(enLbl, 45, y + 6, 9.5, WHITE, "left");
    coverPen.text(shapeArabic(arLbl), 550, y + 6, 9.5, WHITE, "right");
    coverPen.line(W / 2, y + 3, W / 2, y + 17, WHITE, 1);
  };

  // رسم رأس الغلاف (Ref No, Date, Time)
  const topRef = metaAny.refNo || metaAny.referenceNumber || Math.floor(1000000 + Math.random() * 9000000).toString();
  const topDate = m.reportDate || m.toDate || "—";
  const topTime = metaAny.time || "10:00 AM";

  coverPen.text("Ref. No", 40, 710, 9, BLACK, "left");
  coverPen.text(shapeArabic("الرقم التسلسلي"), 555, 710, 9, BLACK, "right");
  coverPen.text(safeShape(topRef), W / 2, 710, 9, BLACK, "center", W / 2);

  coverPen.text("Date", 40, 690, 9, BLACK, "left");
  coverPen.text(shapeArabic("التاريخ"), 555, 690, 9, BLACK, "right");
  coverPen.text(safeShape(topDate), W / 2, 690, 9, BLACK, "center", W / 2);

  coverPen.text("Time", 40, 670, 9, BLACK, "left");
  coverPen.text(shapeArabic("الوقت"), 555, 670, 9, BLACK, "right");
  coverPen.text(safeShape(topTime), W / 2, 670, 9, BLACK, "center", W / 2);

  // رسم تفاصيل الكشف (Statement Details)
  let y = 640;
  drawBlueBar(y, "Statement Details", "تفاصيل الكشف");
  y -= 30;
  
  drawInfoRow(y, "Customer Name", "اسم العميل", finalCustName); y -= 30;
  drawInfoRow(y, "Account Number", "رقم الحساب", finalAccNum); y -= 30;
  drawInfoRow(y, "IBAN Number", "رقم الآيبان", finalIban); y -= 30;
  drawInfoRow(y, "Opening Balance", "رصيد الحساب الإفتتاحي", m.openingBalance ? `${safeMoney(m.openingBalance)} SAR` : "—"); y -= 30;
  drawInfoRow(y, "Closing Balance", "رصيد الإقفال", m.closingBalance ? `${safeMoney(m.closingBalance)} SAR` : "—"); y -= 30;
  drawInfoRow(y, "Number Of Deposits", "عدد الإيداعات", numDep > 0 ? numDep.toString() : "—"); y -= 30;
  drawInfoRow(y, "Number Of Withdrawals", "عدد السحوبات", numWd > 0 ? numWd.toString() : "—"); y -= 30;
  drawInfoRow(y, "Total Deposits", "إجمالي الإيداعات", sumDep > 0 ? `${safeMoney(sumDep)} SAR` : "—"); y -= 30;
  drawInfoRow(y, "Total Withdrawals", "إجمالي السحوبات", sumWd > 0 ? `${safeMoney(sumWd)} SAR` : "—"); y -= 30;

  const fDate = safeShape(m.fromDate || "—");
  const tDate = safeShape(m.toDate || "—");
  drawPeriodRow(y, "On The Period", "خلال الفترة", fDate, tDate); 
  
  // رسم العنوان الوطني (National Address)
  y = 300;
  drawBlueBar(y, "National Address", "العنوان الوطني");
  y -= 30;
  
  drawInfoRow(y, "City", "المدينة", metaAny.city || "—"); y -= 30;
  drawInfoRow(y, "Street", "الشارع", metaAny.street || "—"); y -= 30;
  drawInfoRow(y, "District", "الحي", metaAny.district || "—"); y -= 30;
  drawInfoRow(y, "Postal Code", "الرمز البريدي", metaAny.postalCode || "—"); y -= 30;
  drawInfoRow(y, "Building Number", "رقم المبنى", metaAny.buildingNumber || "—"); y -= 30;
  drawInfoRow(y, "Secondary Number", "الرقم الفرعي", metaAny.secondaryNumber || "—");

  // ترقيم صفحة الغلاف
  coverPen.text(shapeArabic("1"), W / 2, 30, 8, BLACK, "center", W / 2);

  // ==========================================
  // 2. رسم صفحات الجداول المتكررة
  // ==========================================
  for (let p = 0; p < total; p++) {
    let page;
    if (templateDoc) {
      const templatePageIdx = p + 1;
      const copyIdx = templatePageIdx < templateDoc.getPageCount() 
                      ? templatePageIdx 
                      : templateDoc.getPageCount() - 1;
      
      const [templatePage] = await doc.copyPages(templateDoc, [copyIdx]);
      page = doc.addPage(templatePage);
    } else {
      page = doc.addPage([W, H]);
    }

    const pen = new Pen(page, fonts.regular);

    if (templateDoc) {
      pen.rect(0, 0, W, 790, WHITE);
    } else {
      pen.rect(0, 0, W, H, WHITE);
      pen.rect(0, H - 52, W, 52, BLUE);
      pen.text(shapeArabic("مصرف الراجحي"), W - 32, H - 28, 14, WHITE, "right");
      pen.text("AL RAJHI BANK", 32, H - 28, 10, WHITE);
    }

    const headerY = 790;
    const rowH = 26;

    pen.rect(40, headerY, 515, 25, BLUE);
    
    const heads: Array<[string, number]> = [
      ["الرصيد", 87],
      ["دائن", 180],
      ["مدين", 270],
      ["تفاصيل العملية", 400],
      ["التاريخ", 520],
    ];
    for (const [title, x] of heads) {
      pen.text(shapeArabic(title), x, headerY + 8, 9, WHITE, "center", x);
    }

    for (const xLine of [135, 225, 315, 485]) {
      pen.line(xLine, headerY, xLine, headerY + 25, WHITE, 0.8);
    }

    let yLocal = headerY;
    const rows = groups[p] ?? [];
    
    rows.forEach((row, idx) => {
      yLocal -= rowH;
      
      pen.rect(40, yLocal, 445, rowH, idx % 2 === 0 ? GRAY : WHITE);
      pen.rect(485, yLocal, 70, rowH, BLUE);
      
      for (const xLine of [135, 225, 315, 485]) {
        pen.line(xLine, yLocal, xLine, yLocal + rowH, WHITE, 0.7);
      }

      const money = (v: string) => {
        if (!v || String(v).toLowerCase() === 'nan') return "";
        return /sar/i.test(v) ? v : `${v} SAR`;
      };

      const dateVal = row.date ? row.date.slice(0, 10) : "";
      pen.text(shapeArabic(dateVal), 520, yLocal + 9, 8, WHITE, "center", 520);
      pen.text(shapeArabic(money(row.debit)), 270, yLocal + 9, 8, BLACK, "center", 270);
      pen.text(shapeArabic(money(row.credit)), 180, yLocal + 9, 8, BLACK, "center", 180);
      pen.text(shapeArabic(money(row.balance)), 87, yLocal + 9, 8, BLACK, "center", 87);

      let detailsVal = row.details || "";
      if (detailsVal.length > 38) {
        detailsVal = detailsVal.substring(0, 36) + "..";
      }
      pen.text(shapeArabic(detailsVal), 475, yLocal + 9, 8, BLACK, "right");
    });

    pen.line(40, yLocal, 555, yLocal, BLUE, 1);
    
    // 🧽 التعديل هنا: يطبع رقم الصفحة فقط (بداية من 2 لأن الغلاف صفحة 1)
    pen.text(shapeArabic((p + 2).toString()), W / 2, 20, 8, BLACK, "center", W / 2);

    onProgress?.((p + 1) / total, `Composing page ${p + 1} of ${total}`);
    await yieldPaint();
  }
}