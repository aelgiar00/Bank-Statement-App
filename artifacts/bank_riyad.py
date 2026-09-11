import io
import os
import re
import zipfile
import xml.etree.ElementTree as ET

import pandas as pd
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
except ImportError as exc:
    raise ImportError(
        "Missing Arabic PDF packages. Run:\n"
        "pip install arabic-reshaper python-bidi"
    ) from exc


PAGE_W = 870.0
PAGE_H = 842.0

X = {
    "left": 30.0,
    "balance": 118.0,
    "debit": 196.0,
    "credit": 278.0,
    "type": 381.0,
    "check": 455.0,
    "ref": 529.0,
    "details": 753.0,
    "right": 840.0,
}

PURPLE = (0.13725, 0.03137, 0.44314)
CELL_BG = (0.95686, 0.95294, 0.97255)
GRID = (0.82745, 0.84314, 0.84314)
TEXT = PURPLE
FONT_SIZE = 8.0
LEADING = 9.6
MIN_ROW_HEIGHT = 47.0
ROW_PADDING = 4.4


def clean(value):
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    s = str(value).strip()
    return "" if not s or s.lower() == "nan" else s


def process_arabic_text(value):
    s = clean(value)
    if not s:
        return ""
    return get_display(arabic_reshaper.reshape(s))


def format_amount(value, balance=False):
    s = clean(value).replace(",", "")
    if not s:
        return ""
    try:
        number = float(s)
    except Exception:
        return clean(value)
    if abs(number) < 1e-12:
        return ""
    if balance:
        return f"SAR {number:,.2f}"
    return f"{number:,.2f}".rstrip("0").rstrip(".")


def format_identifier(value):
    s = clean(value)
    if not s:
        return ""
    if re.fullmatch(r"[-+]?\d+\.0+", s):
        return s.split(".", 1)[0]
    return s


def format_date(value):
    return clean(value)


def register_template_font(font_path=None):
    candidates = []
    if font_path:
        candidates.append(font_path)
    base = os.path.dirname(os.path.abspath(__file__))
    candidates.extend([
        os.path.join(base, "arial.ttf"),
        os.path.join(base, "Arial.ttf"),
    ])
    for path in candidates:
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont("RiyadData", path))
            return "RiyadData"
    raise FileNotFoundError(
        "لم أجد ملف الخط العربي. ضع arial.ttf بجانب السكربت."
    )


# ------------------------------------------------------------------
# Excel reader WITHOUT pandas/openpyxl.
# The supplied .xls file is actually an OOXML/ZIP workbook despite
# the .xls extension. pandas/openpyxl can recurse in its style loader.
# We read only the values from sheet1.xml/sharedStrings.xml instead.
# ------------------------------------------------------------------
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"m": MAIN_NS, "r": REL_NS}


def _col_to_index(ref):
    letters = re.match(r"[A-Za-z]+", ref).group(0)
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _shared_strings(z):
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall("m:si", NS):
        parts = []
        for t in si.iter(f"{{{MAIN_NS}}}t"):
            parts.append(t.text or "")
        out.append("".join(parts))
    return out


def _cell_value(cell, shared):
    value_node = cell.find("m:v", NS)
    raw = value_node.text if value_node is not None else None
    if raw is None:
        inline = cell.find("m:is", NS)
        if inline is not None:
            return "".join((t.text or "") for t in inline.iter(f"{{{MAIN_NS}}}t"))
        return ""
    if cell.attrib.get("t") == "s":
        try:
            return shared[int(raw)]
        except Exception:
            return raw
    return raw


def read_xlsx_values(path):
    with zipfile.ZipFile(path, "r") as z:
        names = set(z.namelist())
        if "xl/worksheets/sheet1.xml" not in names:
            raise ValueError("ملف Excel غير متوقع: sheet1.xml غير موجود.")
        shared = _shared_strings(z) if "xl/sharedStrings.xml" in names else []
        root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

        rows = []
        max_col = 0
        for row in root.findall(".//m:sheetData/m:row", NS):
            row_dict = {}
            for cell in row.findall("m:c", NS):
                ref = cell.attrib.get("r", "")
                if not ref:
                    continue
                idx = _col_to_index(ref)
                max_col = max(max_col, idx + 1)
                row_dict[idx] = _cell_value(cell, shared)
            rows.append((int(row.attrib.get("r", len(rows) + 1)), row_dict))

        matrix = []
        for row_num, row_dict in rows:
            values = [""] * max_col
            for idx, value in row_dict.items():
                values[idx] = value
            matrix.append((row_num, values))
        return matrix


def read_excel_statement(excel_path):
    matrix = read_xlsx_values(excel_path)
    if not matrix:
        raise ValueError("Excel فارغ.")

    by_row = {row_num: values for row_num, values in matrix}
    header = by_row.get(12)
    if not header:
        raise ValueError("صف عناوين المعاملات (Excel row 12) غير موجود.")

    # Header names are in B,D,E,G,H,I,K,N; blanks are intentional merged cells.
    header_map = {
        1: "الرصيد",
        3: "مبلغ الخصم",
        4: "مبلغ الإيداع ",
        6: "نوع العملية",
        7: "رقم الشيك",
        8: "رقم المرجع",
        10: "التفاصيل",
        13: "تاريخ ",
    }

    records = []
    for row_num in sorted(k for k in by_row if k >= 13):
        vals = by_row[row_num]
        record = {name: clean(vals[idx] if idx < len(vals) else "") for idx, name in header_map.items()}
        # Real transaction rows have a transaction date and/or operation type.
        # Footer rows in the exported worksheet contain bank legal text only,
        # so using balance/amount as a condition would incorrectly include them.
        if record["تاريخ "] or record["نوع العملية"]:
            if record["تاريخ "] != "تاريخ " and record["نوع العملية"] != "نوع العملية":
                records.append(record)

    df = pd.DataFrame(records, columns=list(header_map.values()))

    # Read summary metadata from the first rows.
    metadata = {}
    label_to_key = {
        "تاريخ التقرير": "report_date",
        "تاريخ  التقرير": "report_date",
        "اسم العميل": "customer",
        "اسم الحساب": "account_name",
        "الاسم المختصر للحساب": "short_name",
        "رقم الحساب": "account_number",
        "تاريخ من": "from_date",
        "تاريخ الى": "to_date",
        "رصيد الحساب": "account_balance",
        "الرصيد الافتتاحي للكشف": "opening_balance",
        "الرصيد الختامي للكشف": "closing_balance",
    }

    for row_num in range(1, 12):
        vals = by_row.get(row_num, [])
        present = [(i, clean(v)) for i, v in enumerate(vals) if clean(v)]
        for i, label in present:
            key = label_to_key.get(re.sub(r"\s+", " ", label).strip())
            if not key:
                continue
            previous = [v for j, v in present if j < i]
            if previous:
                metadata[key] = previous[-1]

    metadata.setdefault("report_date", clean(by_row.get(2, [""] * 10)[9] if len(by_row.get(2, [])) > 9 else ""))
    metadata.setdefault("customer", clean(by_row.get(3, [""] * 10)[9] if len(by_row.get(3, [])) > 9 else ""))
    metadata.setdefault("account_name", clean(by_row.get(4, [""] * 10)[9] if len(by_row.get(4, [])) > 9 else ""))
    metadata.setdefault("account_number", clean(by_row.get(6, [""] * 10)[9] if len(by_row.get(6, [])) > 9 else ""))
    metadata.setdefault("from_date", clean(by_row.get(7, [""] * 10)[9] if len(by_row.get(7, [])) > 9 else ""))
    metadata.setdefault("to_date", clean(by_row.get(8, [""] * 10)[9] if len(by_row.get(8, [])) > 9 else ""))
    metadata.setdefault("account_balance", clean(by_row.get(9, [""] * 10)[9] if len(by_row.get(9, [])) > 9 else ""))
    metadata.setdefault("opening_balance", clean(by_row.get(10, [""] * 10)[9] if len(by_row.get(10, [])) > 9 else ""))
    metadata.setdefault("closing_balance", clean(by_row.get(11, [""] * 10)[9] if len(by_row.get(11, [])) > 9 else ""))
    metadata.setdefault("short_name", "")

    return df.reset_index(drop=True), metadata


def wrap_rtl(text, max_width, font_name, size=FONT_SIZE):
    text = clean(text)
    if not text:
        return []
    lines = []
    for paragraph in text.splitlines() or [text]:
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = ""
        for word in words:
            candidate = word if not current else current + " " + word
            if pdfmetrics.stringWidth(process_arabic_text(candidate), font_name, size) <= max_width:
                current = candidate
                continue
            if current:
                lines.append(current)
                current = ""
            if pdfmetrics.stringWidth(process_arabic_text(word), font_name, size) > max_width:
                buf = ""
                for ch in word:
                    candidate2 = buf + ch
                    if pdfmetrics.stringWidth(process_arabic_text(candidate2), font_name, size) <= max_width:
                        buf = candidate2
                    else:
                        if buf:
                            lines.append(buf)
                        buf = ch
                current = buf
            else:
                current = word
        if current:
            lines.append(current)
    return lines or [""]


def row_values(row):
    return {
        "balance": format_amount(row.get("الرصيد", ""), balance=True),
        "debit": format_amount(row.get("مبلغ الخصم", "")),
        "credit": format_amount(row.get("مبلغ الإيداع ", "")),
        "type": clean(row.get("نوع العملية", "")),
        "check": format_identifier(row.get("رقم الشيك", "")),
        "ref": clean(row.get("رقم المرجع", "")),
        "details": clean(row.get("التفاصيل", "")),
        "date": format_date(row.get("تاريخ ", "")),
    }


def measure_row(row, font_name):
    v = row_values(row)
    detail_lines = wrap_rtl(v["details"], X["details"] - X["ref"] - 12, font_name)
    ref_lines = wrap_rtl(v["ref"], X["ref"] - X["check"] - 10, font_name)
    type_lines = wrap_rtl(v["type"], X["check"] - X["type"] - 10, font_name)
    check_lines = wrap_rtl(v["check"], X["type"] - X["check"] - 10, font_name)
    max_lines = max(len(detail_lines), len(ref_lines), len(type_lines), len(check_lines), 1)
    height = max(MIN_ROW_HEIGHT, max_lines * LEADING + ROW_PADDING)
    return height, v, detail_lines, ref_lines, type_lines, check_lines


def paginate(df, font_name, first_page_rows=5, body_capacity=667.0):
    rows = []
    for idx, (_, row) in enumerate(df.iterrows()):
        h, values, detail_lines, ref_lines, type_lines, check_lines = measure_row(row, font_name)
        rows.append({
            "height": h,
            "values": values,
            "detail_lines": detail_lines,
            "ref_lines": ref_lines,
            "type_lines": type_lines,
            "check_lines": check_lines,
            "excel_index": idx,
        })

    pages = [rows[:first_page_rows]]
    pos = first_page_rows
    while pos < len(rows):
        used = 0.0
        page_rows = []
        while pos < len(rows):
            h = rows[pos]["height"]
            if page_rows and used + h > body_capacity + 0.01:
                break
            page_rows.append(rows[pos])
            used += h
            pos += 1
        pages.append(page_rows)
    return pages


def draw_centered(c, text, x0, x1, y, font_name, size=FONT_SIZE):
    s = process_arabic_text(text)
    if s:
        c.setFont(font_name, size)
        c.setFillColorRGB(*TEXT)
        c.drawCentredString((x0 + x1) / 2, y, s)


def draw_right(c, text, right_x, y, font_name, size=FONT_SIZE):
    s = process_arabic_text(text)
    if s:
        c.setFont(font_name, size)
        c.setFillColorRGB(*TEXT)
        c.drawRightString(right_x, y, s)


def draw_multiline_right(c, lines, right_x, center_y, font_name, size=FONT_SIZE):
    if not lines:
        return
    start_y = center_y + ((len(lines) - 1) * LEADING) / 2.0 - 4.0
    for i, line in enumerate(lines):
        draw_right(c, line, right_x, start_y - i * LEADING, font_name, size)


def draw_grid(c, row_heights, body_top_y, page_background_y_bottom):
    total_height = sum(row_heights)
    body_bottom_y = body_top_y - total_height

    c.setFillColorRGB(1, 1, 1)
    c.rect(X["left"], page_background_y_bottom, X["right"] - X["left"], body_top_y - page_background_y_bottom, fill=True, stroke=False)

    c.setFillColorRGB(*CELL_BG)
    y = body_top_y
    for h in row_heights:
        c.rect(X["left"], y - h, X["right"] - X["left"], h, fill=True, stroke=False)
        y -= h

    c.setStrokeColorRGB(*GRID)
    c.setLineWidth(0.5)
    y = body_top_y
    c.line(X["left"], y, X["right"], y)
    for h in row_heights:
        y -= h
        c.line(X["left"], y, X["right"], y)
    for xx in [X["left"], X["balance"], X["debit"], X["credit"], X["type"], X["check"], X["ref"], X["details"], X["right"]]:
        c.line(xx, body_top_y, xx, body_bottom_y)
    return body_bottom_y


def overlay_cell_background(c, x0, y0, x1, y1, inset=1.0):
    """Erase existing sample text WITHOUT creating a new-looking table.
    Uses the exact light cell background and stays inside the existing grid lines.
    """
    c.setFillColorRGB(*CELL_BG)
    x0 += inset
    y0 += inset
    x1 -= inset
    y1 -= inset
    if x1 > x0 and y1 > y0:
        c.rect(x0, y0, x1 - x0, y1 - y0, fill=True, stroke=False)


def overlay_white(c, x0, y0, x1, y1):
    c.setFillColorRGB(1, 1, 1)
    c.rect(x0, y0, x1 - x0, y1 - y0, fill=True, stroke=False)


def draw_transaction_rows(c, page_rows, body_top_y, font_name):
    y_top = body_top_y
    row_heights = [r["height"] for r in page_rows]
    body_bottom = draw_grid(c, row_heights, body_top_y, body_top_y - sum(row_heights))

    for r in page_rows:
        h = r["height"]
        v = r["values"]
        center_y = y_top - h / 2.0
        draw_centered(c, v["balance"], X["left"], X["balance"], center_y - 4.5, font_name)
        draw_centered(c, v["debit"], X["balance"], X["debit"], center_y - 4.5, font_name)
        draw_centered(c, v["credit"], X["debit"], X["credit"], center_y - 4.5, font_name)
        draw_centered(c, v["type"], X["credit"], X["type"], center_y - 4.5, font_name)
        draw_multiline_right(c, r["check_lines"], X["check"] - 6, center_y, font_name)
        draw_multiline_right(c, r["ref_lines"], X["ref"] - 6, center_y, font_name)
        draw_multiline_right(c, r["detail_lines"], X["details"] - 6, center_y, font_name)
        draw_centered(c, v["date"], X["details"], X["right"], center_y - 4.5, font_name)
        y_top -= h
    return body_bottom


def make_overlay_page(template_page_index, page_rows, page_number, total_pages, metadata, font_name):
    packet = io.BytesIO()
    c = canvas.Canvas(packet, pagesize=(PAGE_W, PAGE_H))
    c.setFillColorRGB(*TEXT)

    if template_page_index == 0:
        overlay_cell_background(c, 605, PAGE_H - 78, 842, PAGE_H - 53, inset=1.5)
        draw_right(c, metadata.get("report_date", ""), 838, PAGE_H - 69, font_name, 8)

        # Replace ONLY the three value cells of the existing template table.
        # IMPORTANT: we do NOT draw a new table. We repaint only the cell interiors
        # with the original light-gray fill, leaving the template's borders/grid intact.
        value_x0, value_x1 = 40, 425
        account_rows = [
            (842 - 157, 842 - 133, metadata.get("customer", "")),
            (842 - 178, 842 - 154, metadata.get("account_name", "")),
            (842 - 199, 842 - 175, metadata.get("short_name", "")),
        ]
        for y0, y1, value in account_rows:
            overlay_cell_background(c, value_x0, y0, value_x1, y1, inset=1.2)
            # Template values are visually centered in the left value cell, not right-aligned.
            draw_centered(c, value, value_x0, value_x1, (y0 + y1) / 2.0 - 3.0, font_name)

        for y1, y2 in [(842 - 258, 842 - 238), (842 - 281, 842 - 260), (842 - 302, 842 - 281)]:
            overlay_cell_background(c, 35, y1, 225, y2, inset=1.2)
            overlay_cell_background(c, 435, y1, 625, y2, inset=1.2)

        draw_right(c, "الكل", 223, 842 - 255, font_name)
        draw_right(c, "الكل", 623, 842 - 255, font_name)
        draw_right(c, metadata.get("to_date", ""), 223, 842 - 276, font_name)
        draw_right(c, metadata.get("from_date", ""), 623, 842 - 276, font_name)
        draw_right(c, format_amount(metadata.get("account_balance", ""), balance=True), 223, 842 - 297, font_name)
        draw_right(c, metadata.get("account_number", ""), 623, 842 - 297, font_name)

        overlay_white(c, 385, 842 - 770, 485, 842 - 745)
        draw_centered(c, f"صفحة {page_number} من {total_pages}", 385, 485, 82, font_name, 8)

        body_top_y = 463
        overlay_white(c, X["left"], 842 - 691, X["right"], body_top_y)
        draw_transaction_rows(c, page_rows, body_top_y, font_name)
    else:
        body_top_y = 779
        overlay_white(c, X["left"], 842 - 731, X["right"], body_top_y)
        draw_transaction_rows(c, page_rows, body_top_y, font_name)
        overlay_white(c, 385, 842 - 770, 485, 842 - 745)
        draw_centered(c, f"صفحة {page_number} من {total_pages}", 385, 485, 82, font_name, 8)

    c.save()
    packet.seek(0)
    return PdfReader(packet).pages[0]


def generate_riyad_statement(excel_path, template_pdf_path, output_pdf_path, font_path=None):
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Excel غير موجود: {excel_path}")
    if not os.path.exists(template_pdf_path):
        raise FileNotFoundError(f"PDF template غير موجود: {template_pdf_path}")

    print("1/5 قراءة Excel بدون pandas/openpyxl...")
    df, metadata = read_excel_statement(excel_path)
    print(f"   transactions = {len(df)}")

    print("2/5 تسجيل الخط...")
    font_name = register_template_font(font_path)

    print("3/5 pagination...")
    pages = paginate(df, font_name)
    total_pages = len(pages)
    print(f"   output pages = {total_pages}")

    print("4/5 بناء الصفحات...")
    writer = PdfWriter()

    # IMPORTANT: do NOT deepcopy pypdf PageObject.
    # Deep-copying some PDF structures can recurse forever.
    for page_idx, page_rows in enumerate(pages, start=1):
        # Re-open the template for each output page so we get a fresh PageObject.
        fresh = PdfReader(template_pdf_path)
        base_page = fresh.pages[0 if page_idx == 1 else (1 if len(fresh.pages) > 1 else 0)]

        overlay = make_overlay_page(
            0 if page_idx == 1 else 1,
            page_rows,
            page_idx,
            total_pages,
            metadata,
            font_name,
        )
        base_page.merge_page(overlay)
        writer.add_page(base_page)

        if page_idx % 10 == 0 or page_idx == total_pages:
            print(f"   page {page_idx}/{total_pages}")

    print("5/5 كتابة PDF...")
    with open(output_pdf_path, "wb") as f:
        writer.write(f)

    print(f"DONE: {output_pdf_path}")
    return output_pdf_path, len(df), total_pages


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    excel_name = os.path.join(base_dir, "Account_Statement_2363341779940_TBC2608243518941.xls")
    template_name = os.path.join(base_dir, "AccountStatement2363341779940TBC2608132728001.pdf")
    output_name = os.path.join(base_dir, "Output_Riyad_Final_FIXED_v3.pdf")
    generate_riyad_statement(excel_name, template_name, output_name)
