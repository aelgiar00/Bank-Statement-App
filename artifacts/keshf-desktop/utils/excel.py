"""Parse bank statement workbooks (.xlsx / .xls / .csv) into a Statement."""

from __future__ import annotations

import csv
import re
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import load_workbook

from utils.pdf import Statement, StatementMeta, Transaction, empty_meta


HEADER_ALIASES = {
    "date": [r"تاريخ", r"date", r"value\s*date"],
    "details": [r"تفاصيل", r"الوصف", r"details?", r"desc", r"narration"],
    "debit": [r"مدين", r"خصم", r"سحب", r"debit", r"withdraw"],
    "credit": [r"دائن", r"إيداع", r"ايداع", r"credit", r"deposit"],
    "balance": [r"رصيد", r"balance"],
    "type": [r"نوع", r"operation", r"type"],
    "checkNo": [r"شيك", r"cheque", r"check"],
    "ref": [r"مرجع", r"reference", r"\bref\b"],
    "amount": [r"المبلغ", r"amount", r"قيمة"],
}

META_LABELS = {
    "report_date": [r"تاريخ التقرير", r"report\s*date"],
    "customer": [r"اسم العميل", r"customer", r"client"],
    "account_name": [r"اسم الحساب", r"account\s*name"],
    "short_name": [r"الاسم المختصر", r"short\s*name"],
    "account_number": [r"رقم الحساب", r"account\s*(no|number|#)"],
    "iban": [r"iban", r"آيبان", r"ايبان"],
    "from_date": [r"تاريخ من", r"from", r"من تاريخ"],
    "to_date": [r"تاريخ الى", r"تاريخ إلى", r"to date"],
    "account_balance": [r"رصيد الحساب", r"account balance"],
    "opening_balance": [r"رصيد.*افتتاح", r"opening"],
    "closing_balance": [r"رصيد.*ختام", r"closing"],
    "currency": [r"العملة", r"currency"],
}


def _clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "undefined"}:
        return ""
    if re.fullmatch(r"\d{5}(\.0+)?", text):
        serial = int(float(text))
        if 20000 < serial < 80000:
            epoch = datetime(1899, 12, 30) + timedelta(days=serial)
            return epoch.strftime("%Y-%m-%d")
    return text


def _looks_like_header(cells: list[str]) -> bool:
    joined = " ".join(cells)
    has_date = any(re.search(p, joined, re.I) for p in HEADER_ALIASES["date"])
    has_money = any(
        re.search(p, joined, re.I)
        for p in [*HEADER_ALIASES["debit"], *HEADER_ALIASES["credit"], *HEADER_ALIASES["balance"]]
    )
    return bool(has_date and has_money)


def _map_headers(cells: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, cell in enumerate(cells):
        for field, patterns in HEADER_ALIASES.items():
            if field in mapping:
                continue
            if any(re.search(p, cell, re.I) for p in patterns):
                mapping[field] = idx
                break
    return mapping


def _read_matrix(path: Path) -> list[list[str]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return [[_clean(c) for c in row] for row in csv.reader(handle)]
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    matrix = []
    for row in ws.iter_rows(values_only=True):
        matrix.append([_clean(c) for c in row])
    wb.close()
    return matrix


def parse_statement(path: str | Path) -> Statement:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    matrix = _read_matrix(file_path)
    if len(matrix) < 2:
        raise ValueError("The file does not contain enough rows to be a statement.")

    header_index = next((i for i, row in enumerate(matrix) if _looks_like_header(row)), -1)
    if header_index < 0:
        header_index = next((i for i, row in enumerate(matrix) if sum(1 for c in row if c) >= 4), -1)
    if header_index < 0:
        raise ValueError("Could not find a transaction header row.")

    col = _map_headers(matrix[header_index])
    meta = _extract_meta(matrix[:header_index])
    rows: list[Transaction] = []
    for line in matrix[header_index + 1 :]:
        pick = lambda field: _clean(line[col[field]]) if field in col and col[field] < len(line) else ""
        tx = Transaction(
            date=pick("date"),
            details=pick("details"),
            debit=pick("debit"),
            credit=pick("credit"),
            balance=pick("balance"),
            type=pick("type"),
            check_no=pick("checkNo"),
            ref=pick("ref"),
        )
        if not tx.debit and not tx.credit and "amount" in col:
            raw = pick("amount").replace(",", "")
            try:
                amount = float(raw)
                if amount < 0:
                    tx.debit = f"{abs(amount):,.2f}"
                elif amount > 0:
                    tx.credit = f"{amount:,.2f}"
            except ValueError:
                pass
        if not any([tx.date, tx.details, tx.debit, tx.credit, tx.balance]):
            continue
        if tx.date in {"تاريخ", "Date"}:
            continue
        rows.append(tx)

    if not rows:
        raise ValueError("No transactions were found under the header row.")

    if not meta.closing_balance and rows[-1].balance:
        meta.closing_balance = rows[-1].balance
    if not meta.from_date and rows[0].date:
        meta.from_date = rows[0].date
    if not meta.to_date and rows[-1].date:
        meta.to_date = rows[-1].date
    if not meta.report_date:
        meta.report_date = datetime.now().strftime("%Y-%m-%d")

    return Statement(meta=meta, rows=rows, source_name=file_path.name)


def _extract_meta(rows: list[list[str]]) -> StatementMeta:
    meta = empty_meta()
    for row in rows:
        present = [(i, c) for i, c in enumerate(row) if c]
        for p, (i, label) in enumerate(present):
            for key, patterns in META_LABELS.items():
                if getattr(meta, key):
                    continue
                if not any(re.search(pat, label, re.I) for pat in patterns):
                    continue
                prev = present[p - 1][1] if p else ""
                nxt = present[p + 1][1] if p + 1 < len(present) else ""
                candidate = prev or nxt
                if candidate:
                    setattr(meta, key, candidate)
    return meta
