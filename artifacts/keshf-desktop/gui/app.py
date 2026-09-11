"""Lavender & soft-amethyst CustomTkinter shell for Keshf."""

from __future__ import annotations

import threading
from pathlib import Path
from tkinter import filedialog, messagebox

import customtkinter as ctk

from banks import BANKS, get_bank
from utils.excel import parse_statement

ROOT = Path(__file__).resolve().parent.parent
THEME = ROOT / "gui" / "lavender.json"

PAPER = "#F3EDF7"
CARD = "#FFFCFF"
INK = "#241B33"
MUTED = "#6E627F"
ACCENT = "#5C3D8F"
LILAC = "#C4B0E0"


def launch() -> None:
    ctk.set_appearance_mode("light")
    if THEME.exists():
        ctk.set_default_color_theme(str(THEME))
    app = Atelier()
    app.mainloop()


class Atelier(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Keshf — Statement Atelier")
        self.geometry("920x640")
        self.minsize(780, 560)
        self.configure(fg_color=PAPER)

        self.excel_path: Path | None = None
        self.output_dir = Path.home() / "Documents"
        self.bank_id = "riyad"

        self._build()

    def _build(self) -> None:
        shell = ctk.CTkFrame(self, fg_color=CARD, corner_radius=24)
        shell.pack(fill="both", expand=True, padx=22, pady=22)

        header = ctk.CTkFrame(shell, fg_color="transparent")
        header.pack(fill="x", padx=28, pady=(22, 8))
        ctk.CTkLabel(
            header,
            text="KESHF",
            font=ctk.CTkFont(family="Georgia", size=32, weight="bold"),
            text_color=ACCENT,
        ).pack(anchor="w")
        ctk.CTkLabel(
            header,
            text="A private atelier for Saudi bank statements.",
            font=ctk.CTkFont(size=13),
            text_color=MUTED,
        ).pack(anchor="w")

        body = ctk.CTkFrame(shell, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=28, pady=8)

        # File card
        file_card = ctk.CTkFrame(body, fg_color=PAPER, corner_radius=16)
        file_card.pack(fill="x", pady=(0, 12))
        ctk.CTkLabel(file_card, text="STATEMENT FILE", text_color=MUTED, font=ctk.CTkFont(size=11)).pack(
            anchor="w", padx=18, pady=(14, 4)
        )
        row = ctk.CTkFrame(file_card, fg_color="transparent")
        row.pack(fill="x", padx=18, pady=(0, 16))
        self.file_label = ctk.CTkLabel(row, text="No file selected", text_color=INK, anchor="w")
        self.file_label.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(row, text="Browse", width=120, command=self._pick_file).pack(side="right")

        # Bank + output
        grid = ctk.CTkFrame(body, fg_color="transparent")
        grid.pack(fill="x", pady=(0, 12))

        bank_card = ctk.CTkFrame(grid, fg_color=PAPER, corner_radius=16)
        bank_card.pack(side="left", fill="both", expand=True, padx=(0, 8))
        ctk.CTkLabel(bank_card, text="HOUSE TEMPLATE", text_color=MUTED, font=ctk.CTkFont(size=11)).pack(
            anchor="w", padx=18, pady=(14, 6)
        )
        names = [f"{b.name_en}  ·  {b.name_ar}" for b in BANKS.values()]
        self.bank_ids = list(BANKS.keys())
        self.combo = ctk.CTkComboBox(
            bank_card,
            values=names,
            command=self._on_bank,
            width=360,
            dropdown_fg_color=CARD,
        )
        self.combo.set(names[0])
        self.combo.pack(anchor="w", padx=18, pady=(0, 16))

        out_card = ctk.CTkFrame(grid, fg_color=PAPER, corner_radius=16)
        out_card.pack(side="left", fill="both", expand=True, padx=(8, 0))
        ctk.CTkLabel(out_card, text="OUTPUT FOLDER", text_color=MUTED, font=ctk.CTkFont(size=11)).pack(
            anchor="w", padx=18, pady=(14, 6)
        )
        out_row = ctk.CTkFrame(out_card, fg_color="transparent")
        out_row.pack(fill="x", padx=18, pady=(0, 16))
        self.out_label = ctk.CTkLabel(out_row, text=str(self.output_dir), text_color=INK, anchor="w")
        self.out_label.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(out_row, text="Folder", width=100, fg_color=LILAC, text_color=INK, hover_color="#b49ed4", command=self._pick_dir).pack(
            side="right"
        )

        # Action
        action = ctk.CTkFrame(body, fg_color=PAPER, corner_radius=16)
        action.pack(fill="x", pady=(0, 12))
        self.status = ctk.CTkLabel(action, text="Ready.", text_color=MUTED, anchor="w")
        self.status.pack(fill="x", padx=18, pady=(16, 8))
        self.bar = ctk.CTkProgressBar(action, height=6)
        self.bar.set(0)
        self.bar.pack(fill="x", padx=18)
        self.convert_btn = ctk.CTkButton(
            action,
            text="Convert to PDF",
            height=44,
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self._convert,
        )
        self.convert_btn.pack(padx=18, pady=16, fill="x")

        ctk.CTkLabel(
            shell,
            text="Nothing is uploaded. Parsing and typesetting stay on this machine.",
            text_color=MUTED,
            font=ctk.CTkFont(size=11),
        ).pack(anchor="w", padx=28, pady=(0, 18))

    def _on_bank(self, value: str) -> None:
        idx = self.combo.cget("values").index(value) if value in self.combo.cget("values") else 0
        self.bank_id = self.bank_ids[idx]

    def _pick_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose a bank statement",
            filetypes=[
                ("Excel / CSV", "*.xlsx *.xls *.csv"),
                ("Excel", "*.xlsx *.xls"),
                ("CSV", "*.csv"),
                ("All files", "*.*"),
            ],
        )
        if not path:
            return
        self.excel_path = Path(path)
        self.file_label.configure(text=self.excel_path.name)
        self.status.configure(text="File ready.")

    def _pick_dir(self) -> None:
        path = filedialog.askdirectory(title="Choose output folder")
        if not path:
            return
        self.output_dir = Path(path)
        self.out_label.configure(text=str(self.output_dir))

    def _convert(self) -> None:
        if self.excel_path is None:
            messagebox.showwarning("Keshf", "Please choose a statement file first.")
            return
        if not self.output_dir.exists():
            messagebox.showwarning("Keshf", "Please choose a valid output folder.")
            return
        self.convert_btn.configure(state="disabled")
        self.bar.set(0.05)
        self.status.configure(text="Reading workbook…")
        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self) -> None:
        try:
            statement = parse_statement(self.excel_path)
            bank = get_bank(self.bank_id)
            out = self.output_dir / f"Keshf_{bank.name_en.replace(' ', '')}_{statement.meta.account_number or 'statement'}.pdf"

            def on_progress(ratio: float, label: str) -> None:
                self.after(0, lambda: self._tick(ratio, label))

            bank.render(statement, str(out), on_progress)
            self.after(0, lambda: self._done(out, len(statement.rows)))
        except Exception as exc:  # noqa: BLE001 — surface any press failure in the UI
            self.after(0, lambda: self._fail(exc))

    def _tick(self, ratio: float, label: str) -> None:
        self.bar.set(max(0.05, min(ratio, 1)))
        self.status.configure(text=label)

    def _done(self, path: Path, count: int) -> None:
        self.bar.set(1)
        self.status.configure(text=f"Wrote {count} transactions → {path.name}")
        self.convert_btn.configure(state="normal")
        messagebox.showinfo("Keshf", f"Statement saved:\n{path}")

    def _fail(self, exc: Exception) -> None:
        self.bar.set(0)
        self.status.configure(text="Failed.")
        self.convert_btn.configure(state="normal")
        messagebox.showerror("Keshf", f"Could not finish:\n\n{exc}")
