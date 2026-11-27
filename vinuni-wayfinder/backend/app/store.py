"""Lưu site.json (bản đồ, điểm, cạnh, phòng, vết đi bộ) trong backend/data/ (không commit)."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
DATA = Path(os.getenv('WAYFINDER_DATA', BACKEND / 'data'))
MAPS_SRC = ROOT / 'maps'                     # ảnh nguồn + seed (không commit)
SEED = MAPS_SRC / 'seed-site.json'
SITE = DATA / 'site.json'

_lock = threading.Lock()


def empty_site():
    return {'version': 1, 'nodes': [], 'edges': [], 'rooms': [], 'traces': [],
            'maps': [
                {'id': 'campus', 'name': 'Campus', 'kind': 'outdoor', 'image': '/maps/campus-map.webp',
                 'width': 1700, 'height': 2000, 'metersPerPx': 0.4, 'anchors': []},
                {'id': 'I', 'name': 'Tòa I – tầng trệt', 'kind': 'indoor', 'building': 'Tòa I',
                 'image': '/maps/toa-I-tang-tret.webp', 'width': 2000, 'height': 1500,
                 'metersPerPx': 0.06, 'anchors': []},
            ]}


def validate(site: dict) -> dict:
    for key in ('maps', 'nodes', 'edges', 'rooms'):
        if not isinstance(site.get(key), list):
            raise ValueError(f'Thiếu danh sách "{key}"')
    site.setdefault('traces', [])
    ids = set()
    map_ids = {m['id'] for m in site['maps']}
    for n in site['nodes']:
        if n.get('id') in ids:
            raise ValueError(f'Trùng id điểm: {n.get("id")}')
        if n.get('map') not in map_ids:
            raise ValueError(f'Điểm {n.get("id")} trỏ tới bản đồ không tồn tại')
        ids.add(n['id'])
    site['edges'] = [e for e in site['edges'] if e.get('a') in ids and e.get('b') in ids]
    return site


def load_site() -> dict:
    with _lock:
        if SITE.exists():
            return json.loads(SITE.read_text(encoding='utf-8'))
        if SEED.exists():
            return json.loads(SEED.read_text(encoding='utf-8'))
        return empty_site()


def save_site(site: dict) -> dict:
    site = validate(site)
    with _lock:
        DATA.mkdir(parents=True, exist_ok=True)
        tmp = SITE.with_suffix('.tmp')
        tmp.write_text(json.dumps(site, ensure_ascii=False, indent=1), encoding='utf-8')
        tmp.replace(SITE)
    return site
