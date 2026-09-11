import { PDFPage, rgb, type PDFFont, type RGB } from "pdf-lib";
import { shapeArabic } from "./arabic";

export type Triplet = [number, number, number];

export function c(t: Triplet): RGB {
  return rgb(t[0], t[1], t[2]);
}

export class Pen {
  constructor(
    public page: PDFPage,
    public font: PDFFont,
  ) {}

  w(text: string, size: number) {
    const s = shapeArabic(text);
    if (!s) return 0;
    try {
      return this.font.widthOfTextAtSize(s, size);
    } catch {
      // Glyph missing — measure a conservative fallback
      return s.length * size * 0.5;
    }
  }

  text(
    raw: string,
    x: number,
    y: number,
    size: number,
    color: Triplet,
    align: "left" | "right" | "center" = "left",
    boxRight?: number,
  ) {
    const s = shapeArabic(raw);
    if (!s) return;
    const width = this.w(raw, size);
    let drawX = x;
    if (align === "right") drawX = x - width;
    if (align === "center") {
      const right = boxRight ?? x;
      drawX = (x + right) / 2 - width / 2;
    }
    try {
      this.page.drawText(s, {
        x: drawX,
        y,
        size,
        font: this.font,
        color: c(color),
      });
    } catch {
      // Skip un-encodable glyph rather than crash the whole statement
    }
  }

  wrap(raw: string, maxWidth: number, size: number): string[] {
    const text = raw.trim();
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    const fits = (s: string) => this.w(s, size) <= maxWidth;
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (!fits(word)) {
        let buf = "";
        for (const ch of word) {
          if (fits(buf + ch)) buf += ch;
          else {
            if (buf) lines.push(buf);
            buf = ch;
          }
        }
        current = buf;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  rect(x: number, y: number, w: number, h: number, fill?: Triplet, stroke?: Triplet, thickness = 0.6) {
    this.page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: fill ? c(fill) : undefined,
      borderColor: stroke ? c(stroke) : undefined,
      borderWidth: stroke ? thickness : 0,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Triplet, thickness = 0.5) {
    this.page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      color: c(color),
      thickness,
    });
  }

  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill?: Triplet,
    stroke?: Triplet,
    thickness = 0.8,
  ) {
    this.page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: fill ? c(fill) : undefined,
      borderColor: stroke ? c(stroke) : undefined,
      borderWidth: stroke ? thickness : 0,
      borderOpacity: stroke ? 1 : 0,
    });
    void r;
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function dash(value: string) {
  return value?.trim() ? value : "—";
}
