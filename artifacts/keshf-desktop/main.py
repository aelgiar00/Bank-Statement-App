"""Keshf — entry point for the desktop statement atelier."""

from __future__ import annotations

import sys
import traceback
from pathlib import Path

# Allow `python main.py` from this folder without installing the package.
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _crash_guard(exc_type, exc, tb) -> None:
    """Last-resort UI so an uncaught exception never dies silently."""
    message = "".join(traceback.format_exception(exc_type, exc, tb))
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk._default_root  # noqa: SLF001
        if root is None:
            root = tk.Tk()
            root.withdraw()
        messagebox.showerror("Keshf", f"Something went wrong:\n\n{exc}")
    except Exception:
        sys.stderr.write(message)
    sys.__excepthook__(exc_type, exc, tb)


def main() -> None:
    sys.excepthook = _crash_guard
    from gui.app import launch

    launch()


if __name__ == "__main__":
    main()
