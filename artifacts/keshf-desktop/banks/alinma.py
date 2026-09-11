from reportlab.pdfgen.canvas import Canvas
from utils.pdf import FONT_NAME, Pen, Statement, chunk, register_font, rgb

INK = rgb((0.05, 0.15, 0.25))
WASH = rgb((0.906, 0.898, 0.969))
WHITE = rgb((1, 1, 1))
W, H = 612, 792
COLS = [
    (498.9, 74.8, "التاريخ", "date"),
    (242.7, 252.7, "تفاصيل العملية", "details"),
    (166.8, 72.3, "سحب (مدين)", "debit"),
    (95.3, 67.9, "إيداع (دائن)", "credit"),
    (22.1, 69.9, "الرصيد", "balance"),
]


def render(statement: Statement, output_path: str, progress=None) -> str:
    register_font()
    pages = chunk(statement.rows, 15)
    c = Canvas(output_path, pagesize=(W, H))
    total = len(pages)
    for idx, rows in enumerate(pages):
        pen = Pen(c, FONT_NAME)
        pen.rect(0, 0, W, H, fill=WHITE)
        pen.rect(0, H - 56, W, 56, fill=INK)
        pen.text("مصرف الإنماء", W - 28, H - 28, 14, WHITE, "right")
        pen.text("ALINMA BANK", 28, H - 28, 10, WHITE)
        pen.rect(22, 620, 568, 28, fill=INK)
        for x, w, title, _ in COLS:
            pen.text(title, x, 629, 7.5, WHITE, "center", x + w)
        for i, row in enumerate(rows):
            y_top = 591.5 - i * 30.5
            for x, w, _, _ in COLS:
                pen.rect(x, y_top - 29.5, w, 29.5, fill=WASH)
            pen.text(row.date, 498.9, y_top - 18, 7.5, rgb((0, 0, 0)), "center", 498.9 + 74.8)
            pen.text((row.details or "")[:48], 242.7 + 252.7 - 6, y_top - 18, 6.5, rgb((0, 0, 0)), "right")
            pen.text(row.debit, 166.8, y_top - 18, 7.5, rgb((0, 0, 0)), "center", 166.8 + 72.3)
            pen.text(row.credit, 95.3, y_top - 18, 7.5, rgb((0, 0, 0)), "center", 95.3 + 67.9)
            pen.text(row.balance, 22.1, y_top - 18, 7.5, rgb((0, 0, 0)), "center", 22.1 + 69.9)
        pen.text(f"صفحة {idx + 1} من {total}", W / 2, 40, 8, INK, "center")
        if progress:
            progress((idx + 1) / total, f"page {idx + 1}/{total}")
        c.showPage()
    c.save()
    return output_path
