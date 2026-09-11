import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont } from "pdf-lib";

let cachedBytes: ArrayBuffer | null = null;

export type EmbeddedFonts = {
  regular: PDFFont;
};

export async function loadFontBytes(): Promise<ArrayBuffer> {
  if (cachedBytes) return cachedBytes;
  
  // تحديد المسار الكامل عشان السيرفر ميطيرش مننا
  const baseUrl = typeof window !== "undefined" ? "" : "http://localhost:8080";
  const fontUrl = `${baseUrl}/fonts/arial.ttf`;

  try {
    const res = await fetch(fontUrl);
    if (!res.ok) {
      throw new Error(`Arabic font failed to load with status: ${res.status}`);
    }
    cachedBytes = await res.arrayBuffer();
    return cachedBytes;
  } catch (error) {
    console.error("Font Loading Error:", error);
    throw error;
  }
}

export async function createPdf(): Promise<{ doc: PDFDocument; fonts: EmbeddedFonts }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const regular = await doc.embedFont(bytes, { subset: false });
  return { doc, fonts: { regular } };
}