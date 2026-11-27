"""Lưu trữ sự kiện CLB (`club_events`) và mascot tự tạo (`club_mascots`).

- Có SUPABASE_URL + SUPABASE_SERVICE_KEY: lưu trực tiếp trên Supabase (bật RLS, chỉ service key đọc/ghi).
- Thiếu cấu hình Supabase: dự phòng lưu JSON cục bộ trong `backend/data/events.json`.
"""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from .mascot_recipe import valid_recipe

SAFE_ID_RE = re.compile(r'^[A-Za-z0-9_-]{1,80}$')
IMAGE_DATA_URI_RE = re.compile(r'^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$')
MAX_IMAGE_LEN = 800_000
MAX_EVENTS = 50
MASCOT_PAGE_SIZE = 100
MAX_STOPS = 12
FORBIDDEN_MSG = 'Bạn chỉ có thể chỉnh sửa/xoá dữ liệu do tài khoản CLB của mình tạo.'


class ValidationError(ValueError):
    """Dữ liệu sự kiện hoặc mascot không hợp lệ."""


def _parse_iso(ts: str) -> datetime | None:
    if not ts or not isinstance(ts, str):
        return None
    try:
        return datetime.fromisoformat(ts.replace('Z', '+00:00'))
    except ValueError:
        return None


def _check_owner(existing_owner_id: str | None, actor: dict | None) -> None:
    if actor is None:
        return
    if existing_owner_id and existing_owner_id != actor.get('id') and actor.get('role') != 'admin_truong':
        raise PermissionError(FORBIDDEN_MSG)


def validate_mascot(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError('Thông tin mascot không hợp lệ.')
    mid = str(data.get('id') or '').strip()
    name = str(data.get('name') or '').strip()
    kind = str(data.get('kind') or 'image').strip()
    image = data.get('image')
    brief = data.get('brief')

    if not SAFE_ID_RE.match(mid) or mid in ('vini', 'boba', 'tia3d'):
        raise ValidationError('Mã mascot không hợp lệ hoặc trùng mascot mặc định.')
    if not name or len(name) > 40:
        raise ValidationError('Tên mascot phải từ 1 đến 40 ký tự.')
    if kind not in ('image', 'model3d'):
        raise ValidationError('Loại mascot không hợp lệ.')
    out = {'id': mid, 'name': name, 'kind': kind}
    if kind == 'model3d':
        if not valid_recipe(data.get('recipe')):
            raise ValidationError('Thông số mô hình mascot 3D không hợp lệ.')
        out['recipe'] = data['recipe']
    if kind == 'image' or image is not None:
        if not isinstance(image, str) or len(image) > MAX_IMAGE_LEN or not IMAGE_DATA_URI_RE.fullmatch(image):
            raise ValidationError('Ảnh mascot phải là PNG, WebP hoặc JPG dạng data URI hợp lệ (≤ 800 KB).')
        out['image'] = image
    if brief is not None:
        if not isinstance(brief, str) or len(brief) > 700:
            raise ValidationError('Mô tả mascot quá dài (tối đa 700 ký tự).')
        brief = brief.strip() or None

    if brief is not None:
        out['brief'] = brief
    return out


def _validate_stops(raw_stops, status: str, valid_locations: set[str] | None) -> list[dict]:
    if raw_stops is None:
        return []
    if not isinstance(raw_stops, list):
        raise ValidationError('Danh sách trạm dừng không hợp lệ.')
    if len(raw_stops) > MAX_STOPS:
        raise ValidationError(f'Sự kiện chỉ hỗ trợ tối đa {MAX_STOPS} trạm dừng.')

    cleaned: list[dict] = []
    for item in raw_stops:
        if not isinstance(item, dict):
            raise ValidationError('Thông tin trạm dừng không hợp lệ.')
        sid = str(item.get('id') or '').strip()
        label = str(item.get('label') or '').strip()
        loc_id = str(item.get('locationId') or '').strip()
        note = item.get('note')

        if not SAFE_ID_RE.match(sid):
            raise ValidationError('Mã trạm dừng không hợp lệ.')
        if len(label) > 80 or len(loc_id) > 80:
            raise ValidationError('Thông tin trạm dừng quá dài.')
        if note is not None:
            if not isinstance(note, str) or len(note) > 200:
                raise ValidationError('Ghi chú trạm dừng tối đa 200 ký tự.')
            note = note.strip()

        if status == 'published':
            if not label:
                raise ValidationError('Mỗi trạm dừng cần có tên hiển thị.')
            if not loc_id or (valid_locations is not None and loc_id not in valid_locations):
                raise ValidationError(f'Trạm dừng "{label}" cần chọn địa điểm trong danh mục.')

        stop: dict = {'id': sid, 'label': label, 'locationId': loc_id}
        if note:
            stop['note'] = note
        cleaned.append(stop)
    return cleaned


def validate_event(data: dict, valid_locations: set[str] | None = None) -> dict:
    if not isinstance(data, dict):
        raise ValidationError('Thông tin sự kiện không hợp lệ.')
    eid = str(data.get('id') or '').strip()
    title = str(data.get('title') or '').strip()
    club = str(data.get('club') or '').strip()
    description = str(data.get('description') or '').strip()
    location_id = str(data.get('locationId') or '').strip()
    starts_at = str(data.get('startsAt') or '').strip()
    ends_at = str(data.get('endsAt') or '').strip()
    mascot_id = str(data.get('mascotId') or 'vini').strip()
    status = str(data.get('status') or 'draft').strip()
    demo = bool(data.get('demo', False))

    if not SAFE_ID_RE.match(eid):
        raise ValidationError('Mã sự kiện không hợp lệ.')
    if not title or len(title) > 100:
        raise ValidationError('Hãy đặt tên cho sự kiện (tối đa 100 ký tự).')
    if len(club) > 80 or len(description) > 1500 or len(location_id) > 80 or len(starts_at) > 40 or len(ends_at) > 40 or len(mascot_id) > 80:
        raise ValidationError('Thông tin sự kiện quá dài.')
    if status not in ('draft', 'published'):
        raise ValidationError('Trạng thái sự kiện phải là draft hoặc published.')

    stops = _validate_stops(data.get('stops'), status, valid_locations)

    if status == 'published':
        if not club:
            raise ValidationError('Hãy nhập tên câu lạc bộ hoặc đơn vị tổ chức.')
        if not location_id or (valid_locations is not None and location_id not in valid_locations):
            raise ValidationError('Chọn địa điểm trong danh mục để có thể dẫn đường.')
        if not description:
            raise ValidationError('Thêm một mô tả ngắn để người tham dự hiểu sự kiện.')
        dt_start = _parse_iso(starts_at)
        dt_end = _parse_iso(ends_at)
        if dt_start is None or dt_end is None:
            raise ValidationError('Chọn đầy đủ thời gian bắt đầu và kết thúc.')
        if dt_end <= dt_start:
            raise ValidationError('Thời gian kết thúc phải sau thời gian bắt đầu.')

    anchor = data.get('arAnchor')
    if anchor is not None:
        if not isinstance(anchor, dict) or any(
            type(anchor.get(key)) not in (int, float) or not -limit <= anchor[key] <= limit
            for key, limit in [('lat', 90), ('lon', 180)]
        ):
            raise ValidationError('Toạ độ điểm gặp mascot không hợp lệ.')
        anchor = {key: anchor[key] for key in ('lat', 'lon')}
    return {
        'arAnchor': anchor,
        'id': eid,
        'title': title,
        'club': club,
        'description': description,
        'locationId': location_id,
        'startsAt': starts_at,
        'endsAt': ends_at,
        'mascotId': mascot_id or 'vini',
        'status': status,
        'demo': demo,
        'stops': stops,
    }


def _row_to_event(r: dict) -> dict:
    raw_stops = r.get('stops')
    out = {
        'id': r['id'],
        'title': r.get('title', ''),
        'club': r.get('club', ''),
        'description': r.get('description', ''),
        'locationId': r.get('location_id', ''),
        'startsAt': r.get('starts_at', ''),
        'endsAt': r.get('ends_at', ''),
        'mascotId': r.get('mascot_id', 'vini'),
        'status': r.get('status', 'draft'),
        'stops': list(raw_stops) if isinstance(raw_stops, list) else [],
        'arAnchor': r.get('ar_anchor'),
        'ownerId': r.get('owner_id'),
        'viewsCount': int(r.get('views_count') or 0),
        'navigationsCount': int(r.get('navigations_count') or 0),
    }
    if r.get('demo'):
        out['demo'] = True
    return out


def _event_to_row(e: dict, include_metrics: bool = True) -> dict:
    row = {
        'id': e['id'],
        'ar_anchor': e.get('arAnchor'),
        'title': e['title'],
        'club': e['club'],
        'description': e['description'],
        'location_id': e['locationId'],
        'starts_at': e['startsAt'],
        'ends_at': e['endsAt'],
        'mascot_id': e['mascotId'],
        'status': e['status'],
        'demo': bool(e.get('demo', False)),
        'stops': list(e.get('stops') or []),
        'owner_id': e.get('ownerId'),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    if include_metrics:
        row['views_count'] = int(e.get('viewsCount') or 0)
        row['navigations_count'] = int(e.get('navigationsCount') or 0)
    return row


def _row_to_mascot(r: dict) -> dict:
    out = {
        'id': r['id'],
        'name': r['name'],
        'kind': r.get('kind', 'image'),
        'ownerId': r.get('owner_id'),
    }
    if r.get('image'):
        out['image'] = r['image']
    if r.get('recipe'):
        out['recipe'] = r['recipe']
    if r.get('brief'):
        out['brief'] = r['brief']
    return out


def _mascot_to_row(m: dict) -> dict:
    return {
        'id': m['id'],
        'name': m['name'],
        'kind': m['kind'],
        'image': m.get('image'),
        **({'recipe': m['recipe']} if m['kind'] == 'model3d' else {}),
        'brief': m.get('brief'),
        'owner_id': m.get('ownerId'),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


class EventsStore:
    def __init__(self, path: Path, remote=None):
        self.path = path
        self.remote = remote
        self._lock = threading.Lock()

    @property
    def storage_mode(self) -> str:
        return 'supabase' if self.remote is not None else 'local'

    def _read_local(self) -> dict:
        if self.path.is_file():
            try:
                data = json.loads(self.path.read_text(encoding='utf-8'))
                if isinstance(data, dict):
                    return {
                        'events': list(data.get('events') or []),
                        'mascots': list(data.get('mascots') or []),
                    }
            except Exception:
                pass
        return {'events': [], 'mascots': []}

    def _write_local(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(self.path)

    def _get_remote_row(self, table: str, row_id: str) -> dict | None:
        rows = self.remote.select(table, {'select': '*', 'id': f'eq.{row_id}'})
        return next((r for r in rows if r.get('id') == row_id), None)

    def _upsert_remote_row(self, table: str, row_id: str, row: dict, exists: bool) -> None:
        if exists and hasattr(self.remote, '_send'):
            patch_body = {k: v for k, v in row.items() if k != 'id'}
            self.remote._send(
                'PATCH',
                f'/rest/v1/{table}',
                json=patch_body,
                params={'id': f'eq.{row_id}'},
                headers={'Prefer': 'return=minimal'},
            )
            return
        self.remote.insert(table, [row], on_conflict='id')

    def get_published(self, event_id: str) -> dict | None:
        if not SAFE_ID_RE.fullmatch(event_id):
            return None
        if self.remote is not None:
            rows = self.remote.select('club_events', {
                'select': '*', 'id': f'eq.{event_id}', 'status': 'eq.published', 'limit': '1',
            })
            return _row_to_event(rows[0]) if rows else None
        with self._lock:
            return next((event for event in self._read_local()['events']
                         if event.get('id') == event_id and event.get('status') == 'published'), None)

    def list_all(self) -> dict:
        if self.remote is not None:
            ev_rows = self.remote.select('club_events', {'select': '*', 'order': 'updated_at.desc'})
            m_rows = []
            while True:
                page = self.remote.select('club_mascots', {
                    'select': '*', 'order': 'created_at.asc,id.asc',
                    'offset': str(len(m_rows)), 'limit': str(MASCOT_PAGE_SIZE),
                })
                m_rows.extend(page)
                if len(page) < MASCOT_PAGE_SIZE:
                    break
            return {
                'events': [_row_to_event(r) for r in ev_rows][:MAX_EVENTS],
                'mascots': [_row_to_mascot(r) for r in m_rows],
                'storage': 'supabase',
            }
        with self._lock:
            local = self._read_local()
        return {
            'events': local['events'][:MAX_EVENTS],
            'mascots': local['mascots'],
            'storage': 'local',
        }

    def save_event(
        self,
        payload: dict,
        valid_locations: set[str] | None = None,
        actor: dict | None = None,
    ) -> dict:
        event = validate_event(payload, valid_locations=valid_locations)
        if self.remote is not None:
            existing = self._get_remote_row('club_events', event['id'])
            if existing is not None:
                _check_owner(existing.get('owner_id'), actor)
                event['ownerId'] = existing.get('owner_id') or (actor.get('id') if actor else None)
                event['viewsCount'] = int(existing.get('views_count') or 0)
                event['navigationsCount'] = int(existing.get('navigations_count') or 0)
                row = _event_to_row(event, include_metrics=not hasattr(self.remote, '_send'))
                self._upsert_remote_row('club_events', event['id'], row, exists=True)
            else:
                event['ownerId'] = actor.get('id') if actor else None
                event['viewsCount'] = 0
                event['navigationsCount'] = 0
                self._upsert_remote_row('club_events', event['id'], _event_to_row(event), exists=False)
            return event

        with self._lock:
            local = self._read_local()
            existing = next((e for e in local['events'] if e.get('id') == event['id']), None)
            if existing is not None:
                _check_owner(existing.get('ownerId'), actor)
                event['ownerId'] = existing.get('ownerId') or (actor.get('id') if actor else None)
                event['viewsCount'] = int(existing.get('viewsCount') or 0)
                event['navigationsCount'] = int(existing.get('navigationsCount') or 0)
            else:
                event['ownerId'] = actor.get('id') if actor else None
                event['viewsCount'] = 0
                event['navigationsCount'] = 0
            local['events'] = [event, *[e for e in local['events'] if e.get('id') != event['id']]][:MAX_EVENTS]
            self._write_local(local)
        return event

    def delete_event(self, event_id: str, actor: dict | None = None) -> None:
        if not SAFE_ID_RE.match(event_id):
            raise ValidationError('Mã sự kiện không hợp lệ.')
        if self.remote is not None:
            if actor is not None:
                existing = self._get_remote_row('club_events', event_id)
                if existing is not None:
                    _check_owner(existing.get('owner_id'), actor)
            self.remote.delete('club_events', {'id': f'eq.{event_id}'})
            return
        with self._lock:
            local = self._read_local()
            if actor is not None:
                existing = next((e for e in local['events'] if e.get('id') == event_id), None)
                if existing is not None:
                    _check_owner(existing.get('ownerId'), actor)
            local['events'] = [e for e in local['events'] if e.get('id') != event_id]
            self._write_local(local)

    def save_mascot(self, payload: dict, actor: dict | None = None) -> dict:
        mascot = validate_mascot(payload)
        if self.remote is not None:
            existing = self._get_remote_row('club_mascots', mascot['id'])
            if existing is not None:
                _check_owner(existing.get('owner_id'), actor)
                mascot['ownerId'] = existing.get('owner_id') or (actor.get('id') if actor else None)
                self._upsert_remote_row('club_mascots', mascot['id'], _mascot_to_row(mascot), exists=True)
            else:
                mascot['ownerId'] = actor.get('id') if actor else None
                self._upsert_remote_row('club_mascots', mascot['id'], _mascot_to_row(mascot), exists=False)
            return mascot

        with self._lock:
            local = self._read_local()
            existing = next((m for m in local['mascots'] if m.get('id') == mascot['id']), None)
            if existing is not None:
                _check_owner(existing.get('ownerId'), actor)
                mascot['ownerId'] = existing.get('ownerId') or (actor.get('id') if actor else None)
            else:
                mascot['ownerId'] = actor.get('id') if actor else None
            local['mascots'] = [*[m for m in local['mascots'] if m.get('id') != mascot['id']], mascot]
            self._write_local(local)
        return mascot

    def delete_mascot(self, mascot_id: str, actor: dict | None = None) -> None:
        if not SAFE_ID_RE.match(mascot_id) or mascot_id in ('vini', 'boba', 'tia3d'):
            raise ValidationError('Mã mascot không hợp lệ.')
        if self.remote is not None:
            if actor is not None:
                existing = self._get_remote_row('club_mascots', mascot_id)
                if existing is not None:
                    _check_owner(existing.get('owner_id'), actor)
            self.remote.delete('club_mascots', {'id': f'eq.{mascot_id}'})
            return
        with self._lock:
            local = self._read_local()
            if actor is not None:
                existing = next((m for m in local['mascots'] if m.get('id') == mascot_id), None)
                if existing is not None:
                    _check_owner(existing.get('ownerId'), actor)
            local['mascots'] = [m for m in local['mascots'] if m.get('id') != mascot_id]
            self._write_local(local)

    def increment_metric(self, event_id: str, metric: str) -> dict | None:
        if not SAFE_ID_RE.match(event_id):
            raise ValidationError('Mã sự kiện không hợp lệ.')
        if metric not in ('view', 'navigation'):
            raise ValidationError('Loại thống kê không hợp lệ (chỉ nhận view hoặc navigation).')
        if self.remote is not None:
            res = self.remote.rpc('increment_event_metric', {'p_event_id': event_id, 'p_metric': metric})
            if not res or not isinstance(res, dict):
                return None
            return {
                'viewsCount': int(res.get('viewsCount') or 0),
                'navigationsCount': int(res.get('navigationsCount') or 0),
            }
        with self._lock:
            local = self._read_local()
            target = next((e for e in local['events'] if e.get('id') == event_id), None)
            if target is None:
                return None
            if metric == 'view':
                target['viewsCount'] = int(target.get('viewsCount') or 0) + 1
            else:
                target['navigationsCount'] = int(target.get('navigationsCount') or 0) + 1
            target.setdefault('viewsCount', int(target.get('viewsCount') or 0))
            target.setdefault('navigationsCount', int(target.get('navigationsCount') or 0))
            self._write_local(local)
            return {
                'viewsCount': int(target['viewsCount']),
                'navigationsCount': int(target['navigationsCount']),
            }
