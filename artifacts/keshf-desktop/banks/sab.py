from reportlab.pdfgen.canvas import Canvas
from utils.pdf import FONT_NAME, Pen, Statement, chunk, register_font, rgb

NAVY = rgb((0.04, 0.24, 0.3))
TEAL = rgb((0.12, 0.52, 0.55))
WASH = rgb((0.93, 0.96, 0.97))
WHITE = rgb((1, 1, 1))
INK = rgb((0.06, 0.12, 0.16))
W, H = 595, 842


def render(statement: Statement, output_path: str, progress=None) -> str:
    register_font()
    pages = chunk(statement.rows, 22)
    c = Canvas(output_path, pagesize=(W, H))
    total = len(pages)
    for idx, rows in enumerate(pages):
        pen = Pen(c, FONT_NAME)
        pen.rect(0, 0, W, H, fill=WHITE)
        pen.rect(0, H - 54, W, 54, fill=NAVY)
        pen.rect(W - 8, 0, 8, H, fill=TEAL)
        pen.text("البنك السعودي الأول", W - 40, H - 28, 13, WHITE, "right")
        pen.text("SAUDI AWWAL BANK", 28, H - 30, 9, WHITE)
        header_y = 720 if idx == 0 else 750
        pen.rect(24, header_y, 543, 22, fill=NAVY)
        for title, x0, x1 in [("التاريخ", 430, 567), ("الوصف", 200, 430), ("مدين", 130, 200), ("دائن", 70, 130), ("الرصيد", 24, 70)]:
            pen.text(title, x0, header_y + 7, 8, WHITE, "center", x1)
        y = header_y
        for i, row in enumerate(rows):
            y -= 24
            pen.rect(24, y, 543, 24, fill=WASH if i % 2 == 0 else WHITE)
            pen.text(row.date[:10], 430, y + 8, 7.5, INK, "center", 567)
            pen.text((row.details or "")[:38], 424, y + 8, 7, INK, "right")
            pen.text(row.debit, 130, y + 8, 7.5, INK, "center", 200)
            pen.text(row.credit, 70, y + 8, 7.5, INK, "center", 130)
            pen.text(row.balance, 24, y + 8, 7, INK, "center", 70)
        pen.line(24, y, 567, y, TEAL, 1.2)
        pen.text(f"صفحة {idx + 1} من {total}", W / 2, 32, 8, NAVY, "center")
        if progress:
            progress((idx + 1) / total, f"page {idx + 1}/{total}")
        c.showPage()
    c.save()
    return output_path
