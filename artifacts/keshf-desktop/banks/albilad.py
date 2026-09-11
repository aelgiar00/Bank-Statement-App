from reportlab.pdfgen.canvas import Canvas
from utils.pdf import FONT_NAME, Pen, Statement, chunk, register_font, rgb

INK = rgb((0.08, 0.08, 0.08))
WASH = rgb((0.99, 0.97, 0.94))
GOLD = rgb((0.72, 0.55, 0.22))
WHITE = rgb((1, 1, 1))
W, H = 595, 842
BOXES = {"balance": (40, 68), "credit": (108, 70), "debit": (178, 70), "details": (248, 194), "date": (442, 113)}


def render(statement: Statement, output_path: str, progress=None) -> str:
    register_font()
    pages = chunk(statement.rows, 20)
    c = Canvas(output_path, pagesize=(W, H))
    total = len(pages)
    for idx, rows in enumerate(pages):
        pen = Pen(c, FONT_NAME)
        pen.rect(0, 0, W, H, fill=WHITE)
        pen.rect(0, H - 50, W, 50, fill=INK)
        pen.text("بنك البلاد", W - 32, H - 28, 14, WHITE, "right")
        pen.text("BANK ALBILAD", 32, H - 28, 10, WHITE)
        pen.rect(0, H - 54, W, 3, fill=GOLD)
        row_h, top_y, start_y = 24, 582, 565
        table_h = len(rows) * row_h + 18
        box_bottom = top_y - table_h
        for x, w in BOXES.values():
            pen.rect(x, box_bottom, w, table_h, fill=WASH, stroke=INK)
        y = start_y
        for row in rows:
            pen.text(row.date[:10], 550, y, 8, INK, "right")
            pen.text((row.details or "")[:40], 437, y, 7.5, INK, "right")
            pen.text(row.debit, 243, y, 8, INK, "right")
            pen.text(row.credit, 173, y, 8, INK, "right")
            pen.text(row.balance, 103, y, 8, INK, "right")
            y -= row_h
        pen.text(f"صفحة {idx + 1} من {total}", W / 2, 36, 8, INK, "center")
        if progress:
            progress((idx + 1) / total, f"page {idx + 1}/{total}")
        c.showPage()
    c.save()
    return output_path
