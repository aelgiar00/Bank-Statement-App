import type { BankId, Statement } from "@/lib/banks/types";
import { getBank } from "@/lib/banks/registry";
import { createPdf } from "./fonts";
import { renderRiyad } from "./templates/riyad";
import { renderAlinma } from "./templates/alinma";
import { renderAlrajhi } from "./templates/alrajhi";
import { renderAlbilad } from "./templates/albilad";
import { renderSnb } from "./templates/snb";
import type { ProgressFn, TemplateArgs } from "./templates/shared";

const RENDERERS: Record<BankId, (args: TemplateArgs) => Promise<void>> = {
  riyad: renderRiyad,
  alinma: renderAlinma,
  alrajhi: renderAlrajhi,
  albilad: renderAlbilad,
  snb: renderSnb,
};

export async function generateStatementPdf(
  statement: Statement,
  bankId: BankId,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  try {
    onProgress?.(0.05, "Embedding typeface");
    const { doc, fonts } = await createPdf();
    const bank = getBank(bankId);
    
    if (!RENDERERS[bankId]) {
      throw new Error(`Unsupported bank renderer: ${bankId}`);
    }

    onProgress?.(0.12, `Drawing ${bank.nameEn} pages`);
    await RENDERERS[bankId]({ doc, fonts, statement, bank, onProgress });
    
    onProgress?.(0.92, "Writing PDF");
    const bytes = await doc.save();
    onProgress?.(1, "Ready");
    return bytes;
  } catch (error) {
    console.error("PDF Generation Error details:", error);
    throw error;
  }
}

export function suggestedFilename(statement: Statement, bankId: BankId) {
  const bank = getBank(bankId);
  const acct = (statement.meta.accountNumber || "statement").replace(/\s+/g, "");
  const date = statement.meta.toDate || statement.meta.reportDate || "export";
  return `Keshf_${bank.nameEn.replace(/\s+/g, "")}_${acct}_${date}.pdf`.replace(/[^\w.-]+/g, "_");
}