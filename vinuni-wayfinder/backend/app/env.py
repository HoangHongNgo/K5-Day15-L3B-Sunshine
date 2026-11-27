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

def candidate_env_paths(module_file: Path | None = None) -> list[Path]:
    """Trả danh sách đường dẫn `.env` ứng viên (gốc repo trước, backend sau), an toàn trong Docker."""
    resolved = (module_file or Path(__file__)).resolve()
    parents = resolved.parents
    backend_dir = parents[1] if len(parents) > 1 else resolved.parent
    paths: list[Path] = []
    if len(parents) > 3:
        paths.append(parents[3] / '.env')
    backend_env = backend_dir / '.env'
    if backend_env not in paths:
        paths.append(backend_env)
    return paths


_DEFAULT_PARENTS = Path(__file__).resolve().parents
BACKEND_DIR = _DEFAULT_PARENTS[1] if len(_DEFAULT_PARENTS) > 1 else Path(__file__).resolve().parent
REPO_ROOT = _DEFAULT_PARENTS[3] if len(_DEFAULT_PARENTS) > 3 else BACKEND_DIR


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
    load_env_files(candidate_env_paths())
