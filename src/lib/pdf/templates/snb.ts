import type { Transaction } from "@/lib/banks/types";
import { Pen, type Triplet } from "../pen";
import { yieldPaint, type TemplateArgs } from "./shared";
import { shapeArabic } from "../arabic";
import { PDFDocument } from "pdf-lib";

const PORTAL_LIGHT: Triplet = [0.87, 0.92, 0.89];
const RED: Triplet = [0.72, 0.10, 0.10];
const GREEN_TEXT: Triplet = [0.05, 0.50, 0.16];
const GREEN: Triplet = [0.043, 0.42, 0.227];
const DEEP: Triplet = [0.02, 0.18, 0.1];
const WASH: Triplet = [0.97, 0.98, 0.97];
const WHITE: Triplet = [1, 1, 1];
const INK: Triplet = [0.08, 0.08, 0.08];
const GRID: Triplet = [0.78, 0.83, 0.80];

const safeShape = (txt: any) => {
  if (!txt || String(txt).trim() === "" || String(txt).toLowerCase() === "nan") return "—";
  const str = String(txt).trim();
  if (str === "—") return str;
  if (str.toLowerCase().includes("customer") || str.includes("العميل") || str.includes("emaN")) return "—";

  const hasArabic = /[\u0600-\u06FF]/.test(str);
  if (!hasArabic) return "\u200E" + str;

  const tokens = str.split(/([^\u0600-\u06FF]+)/).filter((t) => t !== "");
  tokens.reverse();
  let final = "";
  for (const t of tokens) {
    final += /[\u0600-\u06FF]/.test(t) ? shapeArabic(t) : t;
  }
  return "\u200E" + final;
};

const safeMoney = (val: any) => {
  if (val === null || val === undefined || String(val).toLowerCase() === "nan") return "—";
  const num = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const safeAccount = (val: any) => {
  if (!val) return "—";
  const s = String(val);
  if (s.includes("E+") || s.includes("e+")) {
    return Number(s).toLocaleString("fullwide", { useGrouping: false });
  }
  return s.replace(/\.0+$/, "").replace(/,/g, "");
};

// 🎯 استشعار ذكي للقالب
function detectIsPortal(m: any): boolean {
  if (String((m as any).templateType) === "2") return true;
  if (String((m as any).templateType) === "1") return false;
  const customer = String(m.customer || m.accountName || "").toLowerCase();
  if (customer.includes("demo") || customer.includes("الدانة")) return true; 
  return true; 
}

export async function renderSnb({ doc, fonts, statement, onProgress }: TemplateArgs) {
  const m = statement.meta;
  const rows = statement.rows;
  const isPortal = detectIsPortal(m);
  const templateFileName = isPortal ? "/snb-2.pdf" : "/snb-1.pdf";

  let templateDoc: PDFDocument | null = null;
  try {
    const bytes = await fetch(templateFileName).then((r) => {
      if (!r.ok) throw new Error("template not found");
      return r.arrayBuffer();
    });
    templateDoc = await PDFDocument.load(bytes);
  } catch (e) {
    console.warn("Template missing:", templateFileName);
  }

  const PAGE_W = isPortal ? 842 : 595;
  const PAGE_H = isPortal ? 595 : 842;

  const firstCount = isPortal ? 10 : 0; 
  const rest = rows.slice(firstCount);
  const perPage = isPortal ? 20 : 24;
  const totalPages = 1 + Math.ceil(rest.length / Math.max(perPage, 1));

  const pages: Transaction[][] = isPortal ? [rows.slice(0, firstCount)] : [[]];
  for (let i = 0; i < rest.length; i += perPage) {
    pages.push(rest.slice(i, i + perPage));
  }

  const portalCols = [
    { t: "التاريخ",     x0: 750, x1: 820 },
    { t: "التفاصيل",    x0: 480, x1: 750 },
    { t: "ملاحظات",     x0: 380, x1: 480 },
    { t: "المرجع",      x0: 300, x1: 380 },
    { t: "رمز العملية", x0: 240, x1: 300 },
    { t: "دائن",        x0: 160, x1: 240 },
    { t: "مدين",        x0: 80,  x1: 160 },
    { t: "الرصيد",      x0: 15,  x1: 80  },
  ];

  const branchCols = [
    { t: "التاريخ\nDate", x0: 495, x1: 565 },
    { t: "نوع العملية\nTransaction Type", x0: 395, x1: 495 },
    { t: "الوصف\nDescription", x0: 215, x1: 395 },
    { t: "المدين\nDebit", x0: 155, x1: 215 },
    { t: "الدائن\nCredit", x0: 90, x1: 155 },
    { t: "الرصيد\nBalance", x0: 30, x1: 90 },
  ];

  for (let p = 0; p < pages.length; p++) {
    let page;
    if (templateDoc) {
      const copyIdx = p === 0 ? 0 : (templateDoc.getPageCount() > 1 ? 1 : 0);
      const [tplPage] = await doc.copyPages(templateDoc, [copyIdx]);
      page = doc.addPage(tplPage);
    } else {
      page = doc.addPage([PAGE_W, PAGE_H]);
    }

    const pen = new Pen(page, fonts.regular);
    const isFirst = p === 0;
    const pageRows = pages[p] || [];

    // =====================================================
    // ☢️ الإبادة الذكية الدقيقة (السر كله هنا)
    // =====================================================
    if (templateDoc) {
      if (isPortal) {
        if (isFirst) {
          // 🧽 1. مسح من تحت اللوجو مباشرة لحد الفوتر (هتطير خط الديمو والتاريخ المزعج تماماً)
          pen.rect(10, 75, PAGE_W - 20, PAGE_H - 140, WHITE);
          
          // 🧽 2. مسح الزاوية اليمين العلوية للسقف (تمسح الحسابات الجارية القديمة المكررة)
          pen.rect(PAGE_W - 250, PAGE_H - 90, 240, 90, WHITE);
          
          // 🧽 3. مسح الزاوية الشمال العلوية للسقف (تمسح التاريخ القديم المطبوع)
          pen.rect(5, PAGE_H - 90, 250, 90, WHITE);
        } else {
          // مسح الصفحة التانية من السقف للحفاظ على الفوتر الأخضر فقط
          pen.rect(10, 75, PAGE_W - 20, PAGE_H - 75, WHITE);
        }
      } else {
        if (isFirst) {
          pen.rect(170, PAGE_H - 280, 220, 140, WHITE); 
          pen.rect(25, PAGE_H - 460, PAGE_W - 50, 110, WHITE);
        } else {
          pen.rect(20, 80, PAGE_W - 40, PAGE_H - 240, WHITE);
        }
      }

      // مسح أرقام الصفحات القديمة يميناً ويساراً في الأسفل فقط
      pen.rect(5, 5, 150, 30, WHITE);
      pen.rect(PAGE_W - 155, 5, 150, 30, WHITE);
    }

    // =====================================================
    // 🏗️ بناء الداتا في القالب الأونلاين (2)
    // =====================================================
    if (isPortal) {
      const rowH = 22;
      let y = PAGE_H - 60;

      if (isFirst) {
        const hTop = PAGE_H - 80; 
        
        pen.text(shapeArabic("الحسابات الجارية"), 820, hTop, 10, INK, "right");
        pen.line(15, hTop - 10, 820, hTop - 10, GRID, 0.5); 
        
        const infoY = hTop - 25;
        
        // إسم العميل
        pen.text(shapeArabic("إسم العميل:"), 820, infoY, 8.5, INK, "right");
        pen.text(safeShape(m.customer || m.accountName || "—"), 740, infoY, 8.5, INK, "right");
        
        // اسم المستخدم
        pen.text(shapeArabic("اسم المستخدم:"), 820, infoY - 16, 8.5, INK, "right");
        pen.text(safeShape((m as any).username || "—"), 740, infoY - 16, 8.5, INK, "right");

        // رقم الحساب
        pen.text(safeAccount(m.accountNumber), 740, infoY - 32, 8.5, INK, "right");

        // التاريخ
        pen.text(shapeArabic("التاريخ:"), 480, infoY, 8.5, INK, "right");
        const dateStr = (m.fromDate && m.toDate) ? `${m.fromDate} - ${m.toDate}` : (m.toDate || m.fromDate || "—");
        pen.text(safeShape(dateStr), 420, infoY, 8.5, INK, "right");

        // --- 🎯 قسم المرشحات (مضغوط وصغير ومفيش تحته داتا بايظة) ---
        const fTop = infoY - 48; 
        pen.text(shapeArabic("المرشحات"), 820, fTop, 9, INK, "right");
        pen.line(15, fTop - 8, 820, fTop - 8, GRID, 0.5); 

        const fStep = 14;

        // عمود المرشحات 1
        pen.text(shapeArabic("ترتيب التاريخ:"), 820, fTop - 20, 7.5, INK, "right");
        pen.text(shapeArabic("تنازلي"), 730, fTop - 20, 7.5, INK, "right");

        pen.text(shapeArabic("إلى تاريخ:"), 820, fTop - 20 - fStep, 7.5, INK, "right");
        pen.text(safeShape(m.toDate || ""), 730, fTop - 20 - fStep, 7.5, INK, "right");

        pen.text(shapeArabic("رقم الحساب:"), 820, fTop - 20 - fStep * 2, 7.5, INK, "right");
        pen.text(safeAccount(m.accountNumber), 730, fTop - 20 - fStep * 2, 7.5, INK, "right");

        pen.text(shapeArabic("وقت التنفيذ:"), 820, fTop - 20 - fStep * 3, 7.5, INK, "right");
        pen.text(shapeArabic("الحالي"), 730, fTop - 20 - fStep * 3, 7.5, INK, "right");

        pen.text(shapeArabic("نوع العملية:"), 820, fTop - 20 - fStep * 4, 7.5, INK, "right");
        pen.text(shapeArabic("الكل"), 730, fTop - 20 - fStep * 4, 7.5, INK, "right");

        // عمود المرشحات 2
        pen.text(shapeArabic("عدد النتائج في كل صفحة:"), 480, fTop - 20, 7.5, INK, "center");
        pen.text("500", 350, fTop - 20, 7.5, INK, "right");

        pen.text(shapeArabic("من تاريخ:"), 480, fTop - 20 - fStep, 7.5, INK, "center");
        pen.text(safeShape(m.fromDate || ""), 350, fTop - 20 - fStep, 7.5, INK, "right");

        pen.text(shapeArabic("نطاق التاريخ:"), 480, fTop - 20 - fStep * 2, 7.5, INK, "center");
        pen.text(shapeArabic("الحالي"), 350, fTop - 20 - fStep * 2, 7.5, INK, "right");

        pen.text(shapeArabic("دائن/مدين:"), 480, fTop - 20 - fStep * 3, 7.5, INK, "center");
        pen.text(shapeArabic("الكل"), 350, fTop - 20 - fStep * 3, 7.5, INK, "right");

        // بداية الجدول للصفحة الأولى
        y = fTop - 20 - (fStep * 4) - 15;
      } else {
        // بداية الجدول لباقي الصفحات 
        y = PAGE_H - 40;
      }

      // هيدر الجدول الملون
      pen.rect(15, y, PAGE_W - 30, rowH, PORTAL_LIGHT);
      for (const col of portalCols) {
        const cx = col.x0 + (col.x1 - col.x0) / 2;
        pen.text(shapeArabic(col.t), cx, y + 6, 7.5, INK, "center");
      }

      const xs = [15, 80, 160, 240, 300, 380, 480, 750, 820];
      const tableHeaderY = y + rowH;

      pageRows.forEach((row, idx) => {
        y -= rowH;
        pen.rect(15, y, PAGE_W - 30, rowH, idx % 2 === 0 ? WHITE : WASH);

        pen.text(row.date ? String(row.date).slice(0, 10) : "—", portalCols[0].x0 + 35, y + 6, 7.5, INK, "center");

        const det = pen.wrap(safeShape(row.details), 260, 7)[0] ?? "—";
        pen.text(det, portalCols[1].x1 - 5, y + 6, 7, INK, "right");

        const notes = (row as any).notes ? safeShape((row as any).notes) : "—";
        pen.text(pen.wrap(notes, 95, 6.5)[0] ?? "—", portalCols[2].x1 - 3, y + 6, 6.5, INK, "right");

        const ref = String((row as any).reference || (row as any).ref || "—");
        pen.text(pen.wrap(ref, 75, 6.5)[0] ?? "—", portalCols[3].x0 + 40, y + 6, 6.5, INK, "center");

        const typ = (row as any).description ? safeShape((row as any).description) : "—";
        pen.text(pen.wrap(typ, 55, 6.5)[0] ?? "—", portalCols[4].x1 - 3, y + 6, 6.5, INK, "right");

        // الأرقام الملونة
        const cr = safeMoney(row.credit);
        if (cr !== "—") {
          pen.text(cr, portalCols[5].x0 + 40, y + 6, 7.5, GREEN_TEXT, "center");
        } else {
          pen.text("—", portalCols[5].x0 + 40, y + 6, 7.5, INK, "center");
        }

        const db = safeMoney(row.debit);
        if (db !== "—") {
          pen.text("-" + db, portalCols[6].x0 + 40, y + 6, 7.5, RED, "center");
        } else {
          pen.text("—", portalCols[6].x0 + 40, y + 6, 7.5, INK, "center");
        }

        pen.text(safeMoney(row.balance), portalCols[7].x0 + 32, y + 6, 7.5, INK, "center");

        pen.line(15, y, 820, y, GRID, 0.4);
      });

      // تقفيل الجدول
      pen.line(15, y, 820, y, GRID, 1.0);
      for (const x of xs) {
        pen.line(x, y, x, tableHeaderY, GRID, 0.9);
      }
    } 
    // =====================================================
    // 🏗️ بناء الداتا في قالب الفروع (1)
    // =====================================================
    else {
      if (isFirst) {
        const customerName = safeShape(m.customer || m.accountName);
        const accNumber = safeShape(m.accountNumber);
        pen.text(customerName, PAGE_W / 2, PAGE_H - 140, 9, INK, "center");
        pen.text(accNumber, PAGE_W / 2, PAGE_H - 205, 9, INK, "center");
        
        const moveY = PAGE_H - 390;
        pen.rect(30, moveY + 35, PAGE_W - 60, 20, WASH);
        pen.rect(30, moveY + 35, PAGE_W - 60, 20, undefined, GRID, 0.5);
        pen.text(shapeArabic("عدد الصفحات"), 110, moveY + 42, 8, INK, "center");
        pen.text(shapeArabic("تاريخ (ميلادي)"), 480, moveY + 42, 8, INK, "center");
        
        pen.rect(30, moveY + 15, PAGE_W - 60, 20, WHITE);
        pen.rect(30, moveY + 15, PAGE_W - 60, 20, undefined, GRID, 0.5);
        pen.text(String(totalPages), 110, moveY + 22, 8, INK, "center");
        pen.text(safeShape(m.toDate || m.fromDate), 480, moveY + 22, 8, INK, "center");

        pen.rect(30, moveY - 15, PAGE_W - 60, 20, WASH);
        pen.rect(30, moveY - 15, PAGE_W - 60, 20, undefined, GRID, 0.5);
        pen.text(shapeArabic("الرصيد النهائي"), 110, moveY - 8, 8, INK, "center");
        pen.text(shapeArabic("الرصيد الابتدائي"), 480, moveY - 8, 8, INK, "center");
        
        pen.rect(30, moveY - 35, PAGE_W - 60, 20, WHITE);
        pen.rect(30, moveY - 35, PAGE_W - 60, 20, undefined, GRID, 0.5);
        pen.text(safeMoney(m.closingBalance || m.accountBalance), 110, moveY - 28, 8, INK, "center");
        pen.text(safeMoney(m.openingBalance), 480, moveY - 28, 8, INK, "center");
      } else {
        const topBoxY = PAGE_H - 110;
        pen.rect(30, topBoxY, 260, 25, WASH);
        pen.rect(30, topBoxY, 260, 25, undefined, GREEN, 0.5);
        pen.text(shapeArabic("رقم الحساب Account Number"), 160, topBoxY + 14, 7.5, INK, "center");
        pen.text(safeShape(m.accountNumber), 160, topBoxY + 4, 7.5, INK, "center");

        pen.rect(305, topBoxY, 260, 25, WASH);
        pen.rect(305, topBoxY, 260, 25, undefined, GREEN, 0.5);
        pen.text(shapeArabic("تاريخ (ميلادي) Date (Gregorian)"), 435, topBoxY + 14, 7.5, INK, "center");
        pen.text(safeShape(m.toDate), 435, topBoxY + 4, 7.5, INK, "center");

        const headerY = topBoxY - 15;
        const rowH = 22;

        pen.rect(30, headerY - rowH, PAGE_W - 60, rowH, GREEN);
        for (const col of branchCols) {
          const [ar, en] = col.t.split('\n');
          pen.text(shapeArabic(ar!), col.x0 + (col.x1 - col.x0)/2, headerY - 10, 7, WHITE, "center");
          pen.text(en!, col.x0 + (col.x1 - col.x0)/2, headerY - 18, 6.5, WHITE, "center");
          if (col.x0 > 30) pen.line(col.x0, headerY - rowH, col.x0, headerY, WHITE, 0.5);
        }

        let y = headerY - rowH;
        const xs = [30, 90, 155, 215, 395, 495, 565];

        pageRows.forEach((row) => {
          y -= rowH;
          pen.rect(30, y, PAGE_W - 60, rowH, WHITE);
          pen.text(row.date ? String(row.date).slice(0, 10) : "—", branchCols[0]!.x0 + 35, y + 7, 7, INK, "center");
          pen.text(pen.wrap(row.details ? safeShape(row.details) : "—", 90, 7)[0] ?? "—", branchCols[1]!.x1 - 4, y + 7, 7, INK, "right");
          pen.text(pen.wrap((row as any).description ? safeShape((row as any).description) : "—", 170, 7)[0] ?? "—", branchCols[2]!.x1 - 4, y + 7, 7, INK, "right");
          pen.text(safeMoney(row.debit), branchCols[3]!.x0 + 30, y + 7, 7, INK, "center");
          pen.text(safeMoney(row.credit), branchCols[4]!.x0 + 32, y + 7, 7, INK, "center");
          pen.text(safeMoney(row.balance), branchCols[5]!.x0 + 30, y + 7, 7, INK, "center");
          pen.line(30, y, 565, y, GREEN, 0.5);
          for (const x of xs) pen.line(x, y, x, y + rowH, GREEN, 0.5);
        });
        pen.line(30, y, 565, y, GREEN, 1); 
        for (const x of [30, 565]) pen.line(x, y, x, headerY - rowH, GREEN, 1);
      }
    }

    // 📄 ترقيم الصفحات في الأطراف
    pen.text(shapeArabic(`Page ${p + 1} of ${totalPages}`), 30, 20, 8, INK, "left");
    pen.text(shapeArabic(`${totalPages} من ${p + 1} الصفحة`), PAGE_W - 30, 20, 8, INK, "right");

    onProgress?.((p + 1) / totalPages, `Page ${p + 1}/${totalPages}`);
    await yieldPaint();
  }
}