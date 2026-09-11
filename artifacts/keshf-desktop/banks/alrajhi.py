from utils.pdf import FONT_NAME, Pen, Statement, chunk, register_font, rgb

BLUE = rgb((0.08, 0.1, 0.85))
WHITE = rgb((1, 1, 1))
GRAY = rgb((0.95, 0.95, 0.95))
BLACK = rgb((0.05, 0.05, 0.08))
W, H = 595, 842


def render(statement: Statement, output_path: str, progress=None) -> str:
    register_font()
    from reportlab.pdfgen.canvas import Canvas

    pages = chunk(statement.rows, 24)
    c = Canvas(output_path, pagesize=(W, H))
    total = len(pages)
    for idx, rows in enumerate(pages):
        pen = Pen(c, FONT_NAME)
        pen.rect(0, 0, W, H, fill=WHITE)
        pen.rect(0, H - 52, W, 52, fill=BLUE)
        pen.text("مصرف الراجحي", W - 32, H - 28, 14, WHITE, "right")
        pen.text("AL RAJHI BANK", 32, H - 28, 10, WHITE)
        header_y = 760
        pen.rect(40, header_y, 515, 25, fill=BLUE)
        for title, x in [("الرصيد", 87), ("دائن", 180), ("مدين", 270), ("تفاصيل العملية", 400), ("التاريخ", 520)]:
            pen.text(title, x, header_y + 8, 9, WHITE, "center")
        y = header_y
        for i, row in enumerate(rows):
            y -= 26
            pen.rect(40, y, 445, 26, fill=GRAY if i % 2 == 0 else WHITE)
            pen.rect(485, y, 70, 26, fill=BLUE)
            pen.text(row.date[:10], 520, y + 9, 8, WHITE, "center")
            pen.text(row.debit, 270, y + 9, 8, BLACK, "center")
            pen.text(row.credit, 180, y + 9, 8, BLACK, "center")
            pen.text(row.balance, 87, y + 9, 8, BLACK, "center")
            pen.text((row.details or "")[:38], 480, y + 9, 7, BLACK, "right")
        pen.text(f"صفحة {idx + 1} من {total}", W / 2, 32, 8, BLUE, "center")
        if progress:
            progress((idx + 1) / total, f"page {idx + 1}/{total}")
        c.showPage()
    c.save()
    return output_path
