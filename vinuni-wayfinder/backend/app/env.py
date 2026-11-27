"""Nạp biến môi trường từ file .env ở gốc repo (ưu tiên trước backend/.env cũ).

Thứ tự ưu tiên:
1. Biến môi trường đã có sẵn trong tiến trình (`os.environ`).
2. File `.env` ở thư mục gốc repo (`<repo>/.env`).
3. Fallback: `vinuni-wayfinder/backend/.env` (nếu máy dev cũ còn giữ).
"""
from __future__ import annotations

import os
from collections.abc import Iterable, MutableMapping
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]


def load_env_files(
    paths: Iterable[Path],
    environ: MutableMapping[str, str] | None = None,
) -> None:
    target = os.environ if environ is None else environ
    for path in paths:
        if not path.is_file():
            continue
        for raw_line in path.read_text(encoding='utf-8-sig').splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            k = key.strip()
            v = value.strip().strip('"').strip("'")
            if k and v:
                target.setdefault(k, v)


def load_root_env() -> None:
    load_env_files([REPO_ROOT / '.env', BACKEND_DIR / '.env'])
