from reportlab.pdfgen.canvas import Canvas
from utils.pdf import FONT_NAME, Pen, Statement, chunk, register_font, rgb


INK = rgb((0.137, 0.031, 0.443))
WASH = rgb((0.957, 0.953, 0.973))
WHITE = rgb((1, 1, 1))
GOLD = rgb((0.72, 0.58, 0.28))
W, H = 870, 842


def render(statement: Statement, output_path: str, progress=None) -> str:
    register_font()
    pages = [statement.rows[:6]] + chunk(statement.rows[6:], 12)
    if pages and not pages[0]:
        pages = [[]]
    c = Canvas(output_path, pagesize=(W, H))
    total = len(pages)
    for idx, rows in enumerate(pages):
        c.setFillColor(WHITE)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        pen = Pen(c, FONT_NAME)
        pen.rect(0, H - 48, W, 48, fill=INK)
        pen.text("بنك الرياض", W - 36, H - 32, 16, WHITE, "right")
        pen.text("RIYAD BANK", 36, H - 32, 11, WHITE)
        pen.rect(0, H - 52, W, 3, fill=GOLD)
        if idx == 0:
            _meta(pen, statement)
        _table(pen, c, rows, 470 if idx == 0 else 760)
        pen.text(f"صفحة {idx + 1} من {total}", W / 2, 36, 8, INK, "center")
        if progress:
            progress((idx + 1) / total, f"page {idx + 1}/{total}")
        c.showPage()
    c.save()
    return output_path


def _meta(pen: Pen, statement: Statement):
    m = statement.meta
    pen.rect(30, 620, 400, 110, fill=WASH, stroke=rgb((0.83, 0.84, 0.84)))
    pairs = [
        ("اسم العميل", m.customer),
        ("اسم الحساب", m.account_name),
        ("رقم الحساب", m.account_number),
        ("الفترة", f"{m.from_date} — {m.to_date}"),
    ]
    for i, (label, value) in enumerate(pairs):
        y = 708 - i * 24
        pen.text(label, 410, y, 8, INK, "right")
        pen.text(value or "—", 250, y, 8, INK, "right")


def _table(pen: Pen, c: Canvas, rows, body_top: float):
    left, right = 30, 840
    cols = [
        (30, 118, "الرصيد", "balance"),
        (118, 196, "مبلغ الخصم", "debit"),
        (196, 278, "مبلغ الإيداع", "credit"),
        (278, 381, "نوع العملية", "type"),
        (381, 529, "المرجع", "ref"),
        (529, 753, "التفاصيل", "details"),
        (753, 840, "التاريخ", "date"),
    ]
    pen.rect(left, body_top - 22, right - left, 22, fill=INK)
    for x0, x1, title, _ in cols:
        pen.text(title, x0, body_top - 15, 7.5, WHITE, "center", x1)
    y = body_top - 22
    for i, row in enumerate(rows):
        y -= 28
        pen.rect(left, y, right - left, 28, fill=WASH if i % 2 == 0 else WHITE)
        for x0, x1, _, key in cols:
            value = getattr(row, key) if key != "ref" else (row.ref or row.check_no)
            if key == "details":
                value = (value or "")[:42]
            pen.text(value or "", x0, y + 10, 7, INK, "center", x1)
