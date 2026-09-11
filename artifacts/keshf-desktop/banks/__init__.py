"""Bank template registry.

Adding a seventh bank later: drop a module in this folder, then add one
entry to BANKS. The GUI reads this dict and never hard-codes bank names.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from banks import albilad, alinma, alrajhi, riyad, sab, snb
from utils.pdf import Statement


RenderFn = Callable[[Statement, str, Callable[[float, str], None] | None], str]


@dataclass(frozen=True)
class BankSpec:
    id: str
    name_en: str
    name_ar: str
    render: RenderFn


BANKS: dict[str, BankSpec] = {
    spec.id: spec
    for spec in (
        BankSpec("riyad", "Riyad Bank", "بنك الرياض", riyad.render),
        BankSpec("alinma", "Alinma Bank", "مصرف الإنماء", alinma.render),
        BankSpec("alrajhi", "Al Rajhi Bank", "مصرف الراجحي", alrajhi.render),
        BankSpec("albilad", "Bank Albilad", "بنك البلاد", albilad.render),
        BankSpec("snb", "Saudi National Bank", "البنك الأهلي السعودي", snb.render),
        BankSpec("sab", "Saudi Awwal Bank", "البنك السعودي الأول", sab.render),
    )
}


def get_bank(bank_id: str) -> BankSpec:
    try:
        return BANKS[bank_id]
    except KeyError as exc:
        raise ValueError(f"Unknown bank template: {bank_id}") from exc
