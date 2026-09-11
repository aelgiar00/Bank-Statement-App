"use client";

import { useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  FolderOpen,
  Languages,
  ShieldCheck,
} from "lucide-react";
import { BANKS } from "@/lib/banks/registry";
import type { BankId, Statement } from "@/lib/banks/types";
import { COPY, type Locale } from "@/lib/copy";
import { parseStatement } from "@/lib/excel/parse";
import { buildSampleStatement } from "@/lib/excel/sample";
import { generateStatementPdf, suggestedFilename } from "@/lib/pdf/generate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const ACCEPT = ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export function AtelierApp() {
  const [locale, setLocale] = useState<Locale>("en");
  const t = COPY[locale];
  const rtl = locale === "ar";

  const [bankId, setBankId] = useState<BankId>("riyad");
  const [statement, setStatement] = useState<Statement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const bank = BANKS.find((b) => b.id === bankId)!;

  async function ingest(file: File) {
    setError(null);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setBusy(true);
    setStatus(rtl ? "قراءة الملف…" : "Reading file…");
    setProgress(8);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseStatement(buf, file.name);
      setStatement(parsed);
      setFileName(suggestedFilename(parsed, bankId));
      setProgress(0);
      setStatus("");
    } catch (err) {
      setStatement(null);
      setError(err instanceof Error ? err.message : t.parseFail);
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    setError(null);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const { statement: sample } = buildSampleStatement();
      setStatement(sample);
      setFileName(suggestedFilename(sample, bankId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.parseFail);
    }
  }

  async function compose() {
    if (!statement) {
      setError(t.missingFile);
      return;
    }
    setError(null);
    setBusy(true);
    setProgress(4);
    setStatus(t.composing);
    try {
      const bytes = await generateStatementPdf(statement, bankId, (ratio, label) => {
        setProgress(Math.round(ratio * 100));
        setStatus(label);
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      const name = fileName || suggestedFilename(statement, bankId);
      await savePdf(blob, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.pdfFail);
    } finally {
      setBusy(false);
      setProgress(0);
      setStatus("");
    }
  }

  function reset() {
    setStatement(null);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFileName("");
    setError(null);
  }

  const previewRows = useMemo(() => statement?.rows.slice(0, 8) ?? [], [statement]);

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className="paper-grain min-h-dvh px-4 py-6 sm:px-8 sm:py-10"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.22em] text-accent uppercase">{t.kicker}</p>
            <h1 className="font-display mt-1 text-5xl leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-ink sm:text-6xl">
              {t.mark}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-[var(--leading-normal)] text-muted">
              {t.lede}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLocale(rtl ? "en" : "ar")}
              aria-label={t.lang}
            >
              <Languages />
              {t.lang}
            </Button>
          </div>
        </header>

        <section className="atelier-window rise rise-2 overflow-hidden rounded-[var(--radius-2xl)] bg-card">
          <div className="flex h-12 items-center gap-3 border-b border-border px-4">
            <span className="flex gap-1.5" aria-hidden="true">
              <i className="block size-2.5 rounded-full bg-[#e8c4c8]" />
              <i className="block size-2.5 rounded-full bg-[#e4d5b3]" />
              <i className="block size-2.5 rounded-full bg-[#c9d6c4]" />
            </span>
            <span className="font-display text-sm text-muted">
              {t.mark} — {rtl ? bank.nameAr : bank.nameEn}
            </span>
          </div>

          <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
            {/* هنا عدلنا الـ aside عشان يبقى Grid متجاوب على الموبايل ويفصل بخط من تحت */}
            <aside className="border-b border-border bg-surface/70 p-4 lg:border-b-0 lg:border-e">
              <p className="mb-3 text-[11px] tracking-[0.18em] text-subtle uppercase">{t.banks}</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col lg:overflow-visible">
                {BANKS.map((b) => {
                  const active = b.id === bankId;
                  return (
                    <li key={b.id} className="shrink-0 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setBankId(b.id);
                          if (statement) setFileName(suggestedFilename(statement, b.id));
                        }}
                        className={cn(
                          "flex w-full min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5 text-start transition-[background-color,box-shadow] duration-[var(--motion-quick)]",
                          active
                            ? "bg-card shadow-[var(--shadow-border-hover)]"
                            : "hover:bg-surface-hover",
                        )}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: b.accentHex }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{rtl ? b.nameAr : b.nameEn}</span>
                          <span className="block truncate text-[11px] text-subtle">
                            {b.city} · {b.established}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="flex flex-col gap-5 p-5 sm:p-7">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void ingest(file);
                  e.target.value = "";
                }}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void ingest(file);
                }}
                className={cn(
                  "rounded-[var(--radius-xl)] bg-surface p-6 transition-[box-shadow] duration-[var(--motion-quick)]",
                  dragOver ? "shadow-[var(--shadow-border-hover)]" : "shadow-[var(--shadow-border)]",
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-paper-deep text-accent">
                      <FileSpreadsheet className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">{t.dropTitle}</p>
                      <p className="mt-1 max-w-md text-xs leading-[var(--leading-normal)] text-muted">
                        {t.dropHint}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
                      <FolderOpen />
                      {t.choose}
                    </Button>
                    <Button type="button" variant="secondary" onClick={loadSample}>
                      {t.sample}
                    </Button>
                  </div>
                </div>
              </div>

              {statement ? (
                <Ledger
                  statement={statement}
                  rows={previewRows}
                  t={t}
                  rtl={rtl}
                />
              ) : (
                <div className="rounded-[var(--radius-xl)] bg-surface px-6 py-10 text-center shadow-[var(--shadow-border)]">
                  <p className="font-display text-2xl text-ink">{t.empty}</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t.emptyHint}</p>
                </div>
              )}

              <div className="rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-border)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block min-w-0 flex-1">
                    <span className="text-[11px] tracking-[0.16em] text-subtle uppercase">{t.filename}</span>
                    <input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="Keshf_Statement.pdf"
                      className="mt-1.5 h-11 w-full rounded-[var(--radius-md)] bg-card px-3 text-sm text-ink shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="mt-1.5 block text-xs text-subtle">{t.outputHint}</span>
                  </label>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {pdfUrl ? (
                      <>
                        <Button asChild>
                          <a href={pdfUrl} download={fileName || "statement.pdf"}>
                            {t.download}
                          </a>
                        </Button>
                        <Button variant="secondary" onClick={reset}>
                          {t.another}
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => void compose()} disabled={busy || !statement}>
                        {busy ? t.composing : t.convert}
                      </Button>
                    )}
                  </div>
                </div>
                {(busy || progress > 0) && (
                  <div className="mt-4">
                    <Progress value={progress} />
                    <p className="mt-2 text-xs text-muted">{status}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <footer className="rise rise-4 flex flex-wrap items-center justify-between gap-3 pb-4 text-xs text-subtle">
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            {t.privacy}
          </p>
          <a
            href="/keshf-desktop.zip"
            download="keshf-desktop.zip"
            className="text-accent underline-offset-4 hover:underline"
          >
            {t.desktop}
          </a>
        </footer>
      </div>

      <Dialog open={Boolean(error)} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogTitle>{t.errorTitle}</DialogTitle>
          <DialogDescription>{error}</DialogDescription>
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={() => setError(null)}>
              {t.errorClose}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Ledger({
  statement,
  rows,
  t,
  rtl,
}: {
  statement: Statement;
  rows: Statement["rows"];
  t: (typeof COPY)[Locale];
  rtl: boolean;
}) {
  const m = statement.meta;
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-border)]">
      <div className="grid gap-3 border-b border-border px-5 py-4 sm:grid-cols-3">
        <Meta label={t.metaCustomer} value={m.customer || statement.sourceName} />
        <Meta label={t.metaAccount} value={m.accountNumber || m.iban || "—"} />
        <Meta
          label={t.metaPeriod}
          value={`${m.fromDate || "—"}  →  ${m.toDate || "—"}  ·  ${statement.rows.length} ${t.rows}`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-start text-sm">
          <thead className="text-[11px] tracking-[0.14em] text-subtle uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">{t.colDate}</th>
              <th className="px-5 py-3 font-medium">{t.colDetails}</th>
              <th className="px-5 py-3 font-medium">{t.colDebit}</th>
              <th className="px-5 py-3 font-medium">{t.colCredit}</th>
              <th className="px-5 py-3 font-medium">{t.colBalance}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.date}-${i}`} className="border-t border-border">
                <td className="px-5 py-2.5 whitespace-nowrap tabular-nums text-ink">{row.date}</td>
                <td className={cn("max-w-xs truncate px-5 py-2.5 text-muted", rtl && "text-end")}>
                  {row.details}
                </td>
                <td className="px-5 py-2.5 tabular-nums text-ink">{row.debit || "—"}</td>
                <td className="px-5 py-2.5 tabular-nums text-ink">{row.credit || "—"}</td>
                <td className="px-5 py-2.5 tabular-nums text-ink">{row.balance || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">{label}</p>
      <p className="mt-1 truncate text-sm text-ink">{value}</p>
    </div>
  );
}

async function savePdf(blob: Blob, name: string) {
  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
  };
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}