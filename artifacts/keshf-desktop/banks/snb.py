from reportlab.pdfgen.canvas import Canvas
from utils.pdf import FONT_NAME, Pen, Statement, chunk, register_font, rgb

GREEN = rgb((0.043, 0.42, 0.227))
WASH = rgb((0.94, 0.97, 0.95))
WHITE = rgb((1, 1, 1))
INK = rgb((0.07, 0.12, 0.09))
W, H = 595, 842


def render(statement: Statement, output_path: str, progress=None) -> str:
    register_font()
    pages = chunk(statement.rows, 22)
    c = Canvas(output_path, pagesize=(W, H))
    total = len(pages)
    for idx, rows in enumerate(pages):
        pen = Pen(c, FONT_NAME)
        pen.rect(0, 0, W, H, fill=WHITE)
        pen.rect(0, H - 58, W, 58, fill=GREEN)
        pen.text("البنك الأهلي السعودي", W - 28, H - 28, 13, WHITE, "right")
        pen.text("SAUDI NATIONAL BANK", 28, H - 30, 9, WHITE)
        header_y = 660 if idx == 0 else 750
        if idx == 0:
            pen.rect(28, H - 150, 539, 70, fill=WASH)
            pen.text(statement.meta.customer or "—", 547, H - 100, 9, INK, "right")
            pen.text(statement.meta.account_number or "", 280, H - 100, 9, INK, "right")
        pen.rect(28, header_y, 539, 22, fill=GREEN)
        for title, x0, x1 in [("التاريخ", 430, 560), ("البيان", 210, 430), ("مدين", 140, 210), ("دائن", 80, 140), ("الرصيد", 28, 80)]:
            pen.text(title, x0, header_y + 7, 8, WHITE, "center", x1)
        y = header_y
        for i, row in enumerate(rows):
            y -= 24
            pen.rect(28, y, 539, 24, fill=WASH if i % 2 == 0 else WHITE)
            pen.text(row.date[:10], 430, y + 8, 7.5, INK, "center", 560)
            pen.text((row.details or "")[:36], 424, y + 8, 7, INK, "right")
            pen.text(row.debit, 140, y + 8, 7.5, INK, "center", 210)
            pen.text(row.credit, 80, y + 8, 7.5, INK, "center", 140)
            pen.text(row.balance, 28, y + 8, 7, INK, "center", 80)
        pen.text(f"صفحة {idx + 1} من {total}", W / 2, 32, 8, GREEN, "center")
        if progress:
            progress((idx + 1) / total, f"page {idx + 1}/{total}")
        c.showPage()
    c.save()
    return output_path
