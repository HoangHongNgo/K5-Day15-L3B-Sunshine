"""Lưu bản đồ/điểm/đường nối/phòng/vết đi bộ.

- Có SUPABASE_URL + SUPABASE_SERVICE_KEY: dùng Supabase (chung cho cả nhóm).
- Không có: file cục bộ backend/data/site.json (như trước).
"""
from __future__ import annotations

import json
import os
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from . import supa

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
DATA = Path(os.getenv('WAYFINDER_DATA', BACKEND / 'data'))
MAPS_SRC = ROOT / 'maps'                     # ảnh nguồn + seed (không commit)
SEED = MAPS_SRC / 'seed-site.json'
SITE = DATA / 'site.json'

SITE_CACHE_SECONDS = 10
_lock = threading.Lock()
_cache: dict = {'t': 0.0, 'site': None}


class SiteConflict(Exception):
    """Người khác đã lưu bản đồ kể từ lúc client tải."""


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
    site['rooms'] = [r for r in site['rooms'] if r.get('node') in ids]
    return site


def mode() -> str:
    return 'supabase' if supa.ENABLED else 'local'


def load_site() -> dict:
    if supa.ENABLED:
        with _lock:
            if _cache['site'] is not None and time.monotonic() - _cache['t'] < SITE_CACHE_SECONDS:
                return json.loads(json.dumps(_cache['site']))      # bản sao, người gọi được sửa thoải mái
        s = supa.client().rpc('get_site', {})
        if not s.get('maps'):                                        # Supabase chưa có dữ liệu
            base = json.loads(SEED.read_text(encoding='utf-8')) if SEED.exists() else empty_site()
            base['version'] = s.get('version', 1)
            s = base
        with _lock:
            _cache.update(t=time.monotonic(), site=s)
        return json.loads(json.dumps(s))
    with _lock:
        if SITE.exists():
            return json.loads(SITE.read_text(encoding='utf-8'))
        if SEED.exists():
            return json.loads(SEED.read_text(encoding='utf-8'))
        return empty_site()


def invalidate_cache():
    with _lock:
        _cache.update(t=0.0, site=None)


def save_site(site: dict) -> dict:
    site = validate(site)
    if supa.ENABLED:
        base = site.get('version')
        if base is None:
            raise ValueError('Thiếu số phiên bản dữ liệu; hãy tải lại trang rồi sửa lại')
        payload = {k: site[k] for k in ('maps', 'nodes', 'edges', 'rooms')}
        try:
            site['version'] = supa.client().rpc('save_site', {'base_version': base, 'payload': payload})
        except supa.SupabaseError as e:
            if 'version_conflict' in e.message:
                raise SiteConflict(e.message) from e
            raise
        invalidate_cache()
        return site
    with _lock:
        DATA.mkdir(parents=True, exist_ok=True)
        tmp = SITE.with_suffix('.tmp')
        tmp.write_text(json.dumps(site, ensure_ascii=False, indent=1), encoding='utf-8')
        tmp.replace(SITE)
    return site


def add_trace(trace: dict) -> str:
    trace['id'] = 't' + secrets.token_hex(3)
    if supa.ENABLED:
        created = trace.get('created') or datetime.now(timezone.utc).isoformat()
        supa.client().insert('traces', [{'id': trace['id'], 'created_at': created,
                                         'points': trace.get('points', []), 'steps': trace.get('steps')}])
        invalidate_cache()
        return trace['id']
    site = load_site()
    site.setdefault('traces', []).append(trace)
    save_site(site)
    return trace['id']


SAFE_NAME = re.compile(r'^[A-Za-z0-9._\-]+$')
