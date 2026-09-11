# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for a single-file Windows executable.

From this folder:

    python -m pip install -r requirements.txt
    python -m PyInstaller --noconfirm build_exe.spec

The result is dist/Keshf.exe — no console window, fonts bundled.
"""

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None
root = Path(SPECPATH)

datas = [
    (str(root / "gui" / "lavender.json"), "gui"),
    (str(root / "assets" / "NotoNaskhArabic-Regular.ttf"), "assets"),
]

hidden = collect_submodules("banks") + collect_submodules("utils") + collect_submodules("gui")
hidden += [
    "arabic_reshaper",
    "bidi",
    "openpyxl",
    "reportlab",
    "reportlab.pdfbase.ttfonts",
    "customtkinter",
]

a = Analysis(
    [str(root / "main.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas + collect_data_files("customtkinter"),
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="Keshf",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
