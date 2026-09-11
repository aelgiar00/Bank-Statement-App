# Keshf — desktop edition

Private CustomTkinter atelier that turns bank Excel/CSV exports into typeset PDFs.

## Run from source (Windows)

```bat
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python main.py
```

Place `NotoNaskhArabic-Regular.ttf` in `assets/` (already bundled if you copied this folder complete).

## Build a single `.exe`

```bat
python -m pip install -r requirements.txt
python -m PyInstaller --noconfirm build_exe.spec
```

`dist\Keshf.exe` is standalone — fonts and the lavender theme travel inside it.

macOS / Linux work the same (`python3 main.py`); the spec still produces a one-file binary.

## Add another bank

1. Create `banks/newbank.py` with a `render(statement, output_path, progress=None)` function.
2. Register it in `banks/__init__.py` — the GUI reads the registry and needs no other edits.
