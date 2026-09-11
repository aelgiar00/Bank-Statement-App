import type { PDFDocument } from "pdf-lib";
import type { BankDefinition, Statement } from "@/lib/banks/types";
import type { EmbeddedFonts } from "../fonts";

export type ProgressFn = (ratio: number, label: string) => void;

export type TemplateArgs = {
  doc: PDFDocument;
  fonts: EmbeddedFonts;
  statement: Statement;
  bank: BankDefinition;
  onProgress?: ProgressFn;
};

export async function yieldPaint() {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export function pageLabel(page: number, total: number) {
  return `صفحة ${page} من ${total}`;
}

export function enPageLabel(page: number, total: number) {
  return `Page ${page} of ${total}`;
}

export function formatIban(iban: string) {
  const s = iban.replace(/\s+/g, "");
  if (s.length < 10) return iban;
  return s.replace(/(.{4})/g, "$1 ").trim();
}
