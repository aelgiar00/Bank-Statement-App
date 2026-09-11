"""Shared PDF canvas helpers and statement dataclasses."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
except ImportError as exc:  # pragma: no cover
    raise ImportError("Install arabic-reshaper and python-bidi") from exc


@dataclass
class Transaction:
    date: str = ""
    details: str = ""
    debit: str = ""
    credit: str = ""
    balance: str = ""
    type: str = ""
    check_no: str = ""
    ref: str = ""


@dataclass
class StatementMeta:
    customer: str = ""
    account_name: str = ""
    account_number: str = ""
    iban: str = ""
    from_date: str = ""
    to_date: str = ""
    opening_balance: str = ""
    closing_balance: str = ""
    account_balance: str = ""
    report_date: str = ""
    currency: str = "SAR"
    short_name: str = ""


@dataclass
class Statement:
    meta: StatementMeta
    rows: list[Transaction] = field(default_factory=list)
    source_name: str = ""


def empty_meta() -> StatementMeta:
    return StatementMeta()


def shape(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return ""
    return get_display(arabic_reshaper.reshape(s))


_FONT_REGISTERED = False
FONT_NAME = "KeshfArabic"


def register_font() -> str:
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return FONT_NAME
    here = Path(__file__).resolve().parent.parent
    candidates = [
        here / "assets" / "NotoNaskhArabic-Regular.ttf",
        here / "assets" / "arial.ttf",
        Path("arial.ttf"),
    ]
    for path in candidates:
        if path.exists():
            pdfmetrics.registerFont(TTFont(FONT_NAME, str(path)))
            _FONT_REGISTERED = True
            return FONT_NAME
    raise FileNotFoundError(
        "Arabic font missing. Place NotoNaskhArabic-Regular.ttf in the assets folder."
    )


def rgb(t: tuple[float, float, float]) -> Color:
    return Color(t[0], t[1], t[2])


class Pen:
    def __init__(self, canvas: Canvas, font: str = FONT_NAME):
        self.c = canvas
        self.font = font

    def text(self, raw: str, x: float, y: float, size: float, color, align: str = "left", x1: float | None = None):
        s = shape(raw)
        if not s:
            return
        self.c.setFillColor(color)
        self.c.setFont(self.font, size)
        if align == "right":
            self.c.drawRightString(x, y, s)
        elif align == "center":
            mid = x if x1 is None else (x + x1) / 2
            self.c.drawCentredString(mid, y, s)
        else:
            self.c.drawString(x, y, s)

    def rect(self, x, y, w, h, fill=None, stroke=None, width=0.6):
        if fill:
            self.c.setFillColor(fill)
            self.c.rect(x, y, w, h, fill=1, stroke=0)
        if stroke:
            self.c.setStrokeColor(stroke)
            self.c.setLineWidth(width)
            self.c.rect(x, y, w, h, fill=0, stroke=1)

    def line(self, x1, y1, x2, y2, color, width=0.5):
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.line(x1, y1, x2, y2)


def chunk(items, size):
    return [items[i : i + size] for i in range(0, len(items), size)] or [[]]
