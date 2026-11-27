"""VinUni Wayfinder API (FastAPI). Chạy: uvicorn app.main:app --port 8000"""
from __future__ import annotations

import io
import secrets
import tempfile
import time
import unicodedata
from pathlib import Path

import cv2
import numpy as np
from fastapi import Body, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from PIL import Image, ImageOps

from . import auth_store as auth_mod
from . import events_store as ev_mod
from .event_album import Album, album_router
from .event_voice import event_voice_router
from .mascot_generator import mascot_router
from . import store, supa
from .embedder import DIM, MODEL_NAME, embedder
from .index import VectorIndex
from .routing import SiteGraph
from .store import DATA, MAPS_SRC, SAFE_NAME, SiteConflict, load_site, save_site

app = FastAPI(title='VinUni Wayfinder')
REMOTE = supa.client() if supa.ENABLED else None
index = VectorIndex(DATA / 'index.npz', DIM, MODEL_NAME, remote=REMOTE)
events_store = ev_mod.EventsStore(DATA / 'events.json', remote=REMOTE)
auth_store = auth_mod.AuthStore(DATA / 'auth.json', remote=REMOTE)
try:
    auth_store.ensure_admin_from_env()
except Exception:
    pass
_map_cache: dict[str, tuple[bytes, str]] = {}

K = 10
POOL_M = 8.0
AUTO_P, PICKER_P = 0.7, 0.5          # ngưỡng heuristic, chưa hiệu chỉnh trên dữ liệu thật
PHOTO_TTL = 600                       # giây giữ vector ảnh để sửa sai / gộp ảnh thứ 2
FRAMES_PER_VIDEO = 40
MAX_UPLOAD = 200 * 1024 * 1024

_photos: dict[str, dict] = {}
_graph_cache: dict = {'key': None, 'graph': None}


def graph() -> SiteGraph:
    site = load_site()
    key = hash(repr(site['nodes']) + repr(site['edges']) + repr(site['maps']))
    if _graph_cache['key'] != key:
        _graph_cache.update(key=key, graph=SiteGraph(site))
    return _graph_cache['graph']


def _fold(s: str) -> str:
    """Bỏ dấu tiếng Việt để tìm kiếm ('bai do' khớp 'Bãi đỗ')."""
    s = unicodedata.normalize('NFD', s or '').replace('đ', 'd').replace('Đ', 'D')
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().strip()


def err(status, code, message):
    raise HTTPException(status, {'code': code, 'message': message})


@app.exception_handler(supa.SupabaseError)
async def _supabase_error(request, exc):
    return JSONResponse(status_code=502, content={'detail': {
        'code': 'offline' if exc.code == 'offline' else 'supabase',
        'message': f'Lỗi Supabase: {exc.message}'}})


# ---------------- trạng thái & dữ liệu bản đồ ----------------
@app.get('/api/health')
def health():
    return {'ok': True, 'indexSize': len(index), 'model': MODEL_NAME, 'modelLoaded': embedder.loaded,
            'storage': store.mode()}


@app.get('/api/site')
def get_site():
    """Toàn bộ dữ liệu — CHỈ dùng cho chế độ Thu thập."""
    g = graph()
    site = load_site()
    site['mapInfo'] = {mid: tf.info() for mid, tf in g.tf.items()}
    return site


@app.put('/api/site')
def put_site(site: dict = Body(...)):
    site.pop('mapInfo', None)
    try:
        saved = save_site(site)
        return {'ok': True, 'nodes': len(saved['nodes']), 'version': saved.get('version')}
    except SiteConflict:
        err(409, 'version_conflict',
            'Người khác vừa lưu thay đổi. Hãy tải lại trang để lấy bản mới nhất rồi sửa lại (bản sửa chưa lưu của bạn sẽ mất).')
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    except (ValueError, KeyError, TypeError) as e:
        err(400, 'invalid_site', str(e))


@app.get('/api/destinations')
def destinations():
    """Danh sách điểm đến cho người dùng (không lộ toạ độ/sơ đồ)."""
    g = graph()
    return {'rooms': [{'id': r['id'], 'code': r.get('code', ''), 'name': r['name'],
                       'aliases': r.get('aliases', []),
                       'building': g.maps.get(g.nodes[r['node']]['map'], {}).get('building')}
                      for r in g.rooms if r['node'] in g.nodes],
            'outdoorGeo': any(tf.geo for mid, tf in g.tf.items()
                              if g.maps[mid].get('kind') == 'outdoor')}


_MIME = {'.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}


@app.get('/maps/{name}')
def map_image(name: str):
    if not SAFE_NAME.match(name):
        err(404, 'not_found', 'Không có ảnh bản đồ này')
    if REMOTE is not None:                       # ảnh sơ đồ nằm trong kho riêng tư 'maps' của Supabase
        if name not in _map_cache:
            try:
                data = REMOTE.download('maps', name)
            except supa.SupabaseError as e:
                err(502, 'supabase', f'Lỗi Supabase: {e.message}')
            if data is not None:
                _map_cache[name] = (data, _MIME.get(Path(name).suffix.lower(), 'application/octet-stream'))
        if name in _map_cache:
            data, mime = _map_cache[name]
            return Response(data, media_type=mime, headers={'Cache-Control': 'private, max-age=300'})
    for base in (DATA / 'maps', MAPS_SRC):       # dự phòng: file cục bộ
        p = (base / name).resolve()
        if p.parent == base.resolve() and p.is_file():
            return FileResponse(p)
    err(404, 'not_found', 'Không có ảnh bản đồ này')


@app.post('/api/maps/{map_id}/image')
async def upload_map_image(map_id: str, image: UploadFile = File(...)):
    site = load_site()
    m = next((m for m in site['maps'] if m['id'] == map_id), None)
    if not m:
        err(404, 'no_map', 'Không có bản đồ này')
    raw = await image.read()
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
    name = f'{map_id}-{int(time.time())}.jpg'
    if REMOTE is not None:
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=90)
        try:
            REMOTE.upload('maps', name, buf.getvalue(), 'image/jpeg')
        except supa.SupabaseError as e:
            err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    else:
        (DATA / 'maps').mkdir(parents=True, exist_ok=True)
        im.save(DATA / 'maps' / name, quality=90)
    m.update(image=f'/maps/{name}', width=im.width, height=im.height)
    try:
        save_site(site)
    except SiteConflict:
        err(409, 'version_conflict', 'Người khác vừa lưu thay đổi. Hãy tải lại trang rồi thử đổi ảnh lại.')
    return {'ok': True, 'image': m['image'], 'width': im.width, 'height': im.height}


# ---------------- thu thập ảnh cho nhận diện ----------------
def _extract_frames(path: str, n_out: int):
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frames = []
    if total > 0:
        for idx in np.linspace(0, total - 1, min(total, int(n_out * 1.5))).astype(int):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ok, f = cap.read()
            if ok:
                frames.append(f)
    else:  # một số video không báo số khung: đọc tuần tự
        allf = []
        while True:
            ok, f = cap.read()
            if not ok:
                break
            allf.append(f)
        step = max(1, len(allf) // int(n_out * 1.5))
        frames = allf[::step]
    cap.release()
    scored = []
    for f in frames:
        h, w = f.shape[:2]
        s = 640 / max(h, w)
        f = cv2.resize(f, (int(w * s), int(h * s))) if s < 1 else f
        sharp = cv2.Laplacian(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()
        scored.append((sharp, f))
    if not scored:
        return [], 0
    cut = np.percentile([s for s, _ in scored], 25)
    kept = [f for s, f in scored if s >= cut and s > 15][:n_out]
    return [Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)) for f in kept], len(scored)


@app.post('/api/spots/{node_id}/video')
async def add_spot_video(node_id: str, video: UploadFile = File(...)):
    g = graph()
    if node_id not in g.nodes:
        err(404, 'no_node', 'Không có điểm này trên bản đồ')
    with tempfile.NamedTemporaryFile(suffix=Path(video.filename or 'v.mp4').suffix, delete=False) as tmp:
        size = 0
        while chunk := await video.read(1 << 20):
            size += len(chunk)
            if size > MAX_UPLOAD:
                err(413, 'too_large', 'Video quá lớn (tối đa 200 MB)')
            tmp.write(chunk)
        tmp_path = tmp.name
    try:
        images, seen = _extract_frames(tmp_path, FRAMES_PER_VIDEO)
    finally:
        Path(tmp_path).unlink(missing_ok=True)   # không giữ video gốc
    if len(images) < 5:
        err(422, 'few_frames', f'Chỉ lấy được {len(images)} khung rõ nét; hãy quay lại chậm hơn, đủ sáng')
    vid = f'v{int(time.time())}_{secrets.token_hex(2)}'
    t0 = time.time()
    vecs = embedder(images)
    try:
        index.add(vecs, node_id, 'video', vid)
        thumb_set = images[:: max(1, len(images) // 4)][:4]
        if REMOTE is not None:
            rows = []
            for j, im in enumerate(thumb_set):
                buf = io.BytesIO()
                im.copy().resize((im.width // 2, im.height // 2)).save(buf, 'JPEG', quality=70)
                name = f'{vid}_{j}.jpg'
                REMOTE.upload('frames', f'{node_id}/{name}', buf.getvalue(), 'image/jpeg')
                rows.append({'spot': node_id, 'name': name})
            REMOTE.insert('frame_thumbs', rows, on_conflict='spot,name')
        else:
            thumbs = DATA / 'frames' / node_id
            thumbs.mkdir(parents=True, exist_ok=True)
            for j, im in enumerate(thumb_set):
                im.copy().resize((im.width // 2, im.height // 2)).save(thumbs / f'{vid}_{j}.jpg', quality=70)
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    return {'ok': True, 'video': vid, 'frames': len(images), 'seen': seen,
            'embedMs': round((time.time() - t0) * 1000), 'indexSize': len(index),
            'spot': index.counts().get(node_id)}


@app.get('/api/spots')
def spots():
    index.sync_if_stale(20)                      # lấy vector người khác vừa thêm
    c = index.counts()
    thumbs = {}
    if REMOTE is not None:
        try:
            for r in REMOTE.select('frame_thumbs', {'select': 'spot,name', 'order': 'created_at.asc,name.asc'}):
                thumbs.setdefault(r['spot'], []).append(r['name'])
        except supa.SupabaseError:
            pass
        thumbs = {k: v[-4:] for k, v in thumbs.items()}
    else:
        base = DATA / 'frames'
        if base.exists():
            for d in base.iterdir():
                thumbs[d.name] = sorted(p.name for p in d.glob('*.jpg'))[-4:]
    return {'counts': c, 'thumbs': thumbs, 'indexSize': len(index)}


@app.get('/api/frames/{node_id}/{name}')
def frame(node_id: str, name: str):
    if not (SAFE_NAME.match(node_id) and SAFE_NAME.match(name)):
        err(404, 'not_found', 'Không có khung hình')
    if REMOTE is not None:
        try:
            data = REMOTE.download('frames', f'{node_id}/{name}')
        except supa.SupabaseError as e:
            err(502, 'supabase', f'Lỗi Supabase: {e.message}')
        if data is None:
            err(404, 'not_found', 'Không có khung hình')
        return Response(data, media_type='image/jpeg', headers={'Cache-Control': 'private, max-age=300'})
    base = (DATA / 'frames').resolve()
    p = (base / node_id / name).resolve()
    if p.parent.parent != base or not p.is_file():
        err(404, 'not_found', 'Không có khung hình')
    return FileResponse(p)


@app.delete('/api/spots/{node_id}')
def clear_spot(node_id: str):
    try:
        removed = index.remove(label=node_id)
        if REMOTE is not None:
            rows = REMOTE.select('frame_thumbs', {'select': 'name', 'spot': f'eq.{node_id}'})
            REMOTE.remove('frames', [f'{node_id}/{r["name"]}' for r in rows])
            REMOTE.delete('frame_thumbs', {'spot': f'eq.{node_id}'})
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    d = DATA / 'frames' / node_id
    if d.exists():
        for p in d.glob('*.jpg'):
            p.unlink()
    return {'ok': True, 'removed': removed, 'indexSize': len(index)}


# ---------------- định vị bằng ảnh ----------------
def _gc_photos():
    now = time.time()
    for pid in [p for p, v in _photos.items() if now - v['t'] > PHOTO_TTL]:
        _photos.pop(pid, None)


def _pool(tally, g: SiteGraph):
    pooled = {}
    for s in tally:
        near = g.near_spots(s, POOL_M) if s in g.nodes else {s}
        pooled[s] = sum(t['votes'] for x, t in tally.items() if x in near)
    return pooled


def _label(g, s):
    n = g.nodes.get(s)
    return n['label'] if n else s


def indoor_room_ids(g: SiteGraph, spot: str) -> list[str]:
    node = g.nodes.get(spot)
    if not node or g.maps.get(node.get('map'), {}).get('kind') != 'indoor':
        return []
    return [room['id'] for room in g.rooms if room.get('node') == spot]


@app.post('/api/locate')
async def locate(image: UploadFile = File(...), previous: str | None = Form(None)):
    index.sync_if_stale(20)
    if len(index) == 0:
        err(409, 'no_index', 'Chưa có dữ liệu ảnh. Hãy quay video ở các điểm trong chế độ Thu thập trước.')
    _gc_photos()
    raw = await image.read()
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
    except Exception:
        err(400, 'bad_image', 'Không đọc được ảnh')
    del raw                                    # ảnh gốc không lưu lại
    t0 = time.time()
    q = embedder([im])[0]
    tally, top_sim = index.vote(q, K)
    denom = K
    prev = _photos.get(previous) if previous else None
    if prev:
        for s, t in prev['tally'].items():
            c = tally.setdefault(s, {'votes': 0.0, 'sim': 0.0, 'nearest': False})
            c['votes'] += t['votes']
            c['sim'] += t['sim']
        denom = 2 * K
    g = graph()
    pooled = _pool(tally, g)
    ranked = sorted(tally, key=lambda s: (tally[s]['nearest'], pooled[s], tally[s]['votes'],
                                          tally[s]['sim']), reverse=True)
    best = ranked[0]
    conf = min(1.0, pooled[best] / denom)
    if prev:
        tier = 'auto' if conf >= 0.8 else 'picker'    # không bao giờ xin ảnh thứ 3
    else:
        tier = 'auto' if conf >= AUTO_P else 'picker' if conf >= PICKER_P else 'second'
    pid = 'p_' + secrets.token_hex(6)
    _photos[pid] = {'vec': q, 'tally': tally, 't': time.time(), 'pred': best}
    return {'photoId': pid, 'spot': best, 'label': _label(g, best), 'confidence': round(conf, 2),
            'tier': tier, 'roomIds': indoor_room_ids(g, best), 'topSim': round(top_sim, 3),
            'top3': [{'spot': s, 'label': _label(g, s), 'votes': tally[s]['votes']} for s in ranked[:3]],
            'combined': bool(prev), 'ms': round((time.time() - t0) * 1000)}


@app.post('/api/correct')
def correct(body: dict = Body(...)):
    p = _photos.get(body.get('photoId'))
    spot = body.get('trueSpot')
    if not p:
        err(410, 'expired', 'Ảnh đã hết hạn (10 phút), hãy chụp lại')
    if spot not in graph().nodes:
        err(404, 'no_node', 'Không có điểm này')
    if p.get('corrected'):
        return {'ok': True, 'indexSize': len(index), 'duplicate': True}
    try:
        index.add(p['vec'][None, :], spot, 'correction', body.get('photoId'))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    p['corrected'] = spot
    return {'ok': True, 'indexSize': len(index)}


@app.get('/api/spots/search')
def spot_search(q: str = ''):
    """Cho màn top-3/chọn thủ công: tên dễ hiểu của các điểm trong nhà."""
    g = graph()
    q = _fold(q)
    out = [{'spot': n['id'], 'label': n['label']} for n in g.nodes.values()
           if g.maps.get(n['map'], {}).get('kind') == 'indoor' and (not q or q in _fold(n['label']))]
    return {'spots': out[:30]}


# ---------------- chỉ đường ----------------
@app.get('/api/route')
def route(to: str, start: str | None = None, lat: float | None = None, lng: float | None = None):
    g = graph()
    dest, dest_name = g.resolve_target(to)
    if not dest:
        err(404, 'no_dest', f'Không tìm thấy điểm đến "{to}"')
    start_ll = None
    if start:
        sid, _ = g.resolve_target(start)
        if not sid:
            err(404, 'no_start', f'Không tìm thấy điểm xuất phát "{start}"')
    elif lat is not None and lng is not None:
        sid, d = g.nearest_geo_node(lat, lng)
        if not sid:
            if d is None:
                err(409, 'no_geo', 'Bản đồ ngoài trời chưa được neo GPS, chưa dùng được vị trí GPS')
            err(409, 'too_far', f'Bạn đang cách campus khoảng {round(d)} m')
        start_ll = (lat, lng)
    else:
        err(400, 'no_start', 'Thiếu điểm xuất phát')
    try:
        r = g.route(sid, dest, dest_name, start_ll)
    except Exception:
        err(409, 'no_path', 'Chưa có đường nối tới điểm đến này')
    r.pop('path')                               # không gửi toạ độ/đồ thị cho người dùng
    r['destination'] = dest_name
    r['start'] = g.nodes[sid]['label']
    return r


# ---------------- vết đi bộ, sao lưu ----------------
@app.post('/api/traces')
def add_trace(trace: dict = Body(...)):
    try:
        return {'ok': True, 'id': store.add_trace(trace)}
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')


@app.get('/api/export')
def export():
    site = load_site()
    return JSONResponse(site, headers={'Content-Disposition': 'attachment; filename="wayfinder-site.json"'})


@app.post('/api/import')
async def import_site(file: UploadFile = File(...)):
    import json
    try:
        site = json.loads(await file.read())
        if REMOTE is not None:                   # nhập file = chủ động thay toàn bộ dữ liệu hiện tại
            site['version'] = load_site().get('version')
        save_site(site)
    except SiteConflict:
        err(409, 'version_conflict', 'Có người vừa lưu trong lúc nhập. Hãy thử nhập lại.')
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    except (ValueError, KeyError, TypeError) as e:
        err(400, 'invalid_site', f'File không hợp lệ: {e}')
    return {'ok': True}


# ---------------- đăng nhập & phân quyền BTC ----------------
def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(None, 1)
    if len(parts) == 2 and parts[0].lower() == 'bearer' and parts[1].strip():
        return parts[1].strip()
    return None


def _require_btc(authorization: str | None) -> dict:
    token = _bearer_token(authorization)
    if not token:
        err(401, 'unauthorized', 'Vui lòng đăng nhập tài khoản BTC để thực hiện thao tác này.')
    try:
        account = auth_store.get_session(token)
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    if account is None:
        err(401, 'unauthorized', 'Vui lòng đăng nhập tài khoản BTC để thực hiện thao tác này.')
    return account


album = Album(DATA / 'event-photos.sqlite', REMOTE)
app.include_router(album_router(album, lambda eid: events_store.get_published(eid), _require_btc))
app.include_router(mascot_router(_require_btc))
app.include_router(event_voice_router(lambda: events_store, lambda: {
    room['id']: room['name'] for room in graph().rooms if room.get('name')
}))


@app.post('/api/auth/register')
def auth_register(body: dict = Body(...)):
    payload = dict(body or {})
    try:
        res = auth_store.register(
            username=payload.get('username', ''),
            password=payload.get('password', ''),
            display_name=payload.get('displayName', ''),
            club_name=payload.get('clubName', ''),
            role='clb',
        )
        return {'ok': True, 'account': res['account'], 'token': res['token']}
    except auth_mod.ValidationError as e:
        err(422, 'invalid_auth', str(e))
    except auth_mod.ConflictError as e:
        err(409, 'username_taken', str(e))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')


@app.post('/api/auth/login')
def auth_login(body: dict = Body(...)):
    payload = dict(body or {})
    try:
        res = auth_store.login(
            username=payload.get('username', ''),
            password=payload.get('password', ''),
        )
        return {'ok': True, 'account': res['account'], 'token': res['token']}
    except auth_mod.AuthError as e:
        err(401, 'invalid_credentials', str(e))
    except auth_mod.ValidationError as e:
        err(422, 'invalid_auth', str(e))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')


@app.get('/api/auth/me')
def auth_me(authorization: str | None = Header(default=None)):
    token = _bearer_token(authorization)
    if not token:
        return {'authenticated': False, 'account': None}
    try:
        account = auth_store.get_session(token)
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    if account is None:
        return {'authenticated': False, 'account': None}
    return {'authenticated': True, 'account': account}


@app.post('/api/auth/logout')
def auth_logout(authorization: str | None = Header(default=None)):
    token = _bearer_token(authorization)
    try:
        auth_store.logout(token)
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    return {'ok': True}


# ---------------- sự kiện CLB & mascot (Supabase / cục bộ) ----------------
@app.get('/api/events')
def list_events():
    try:
        return events_store.list_all()
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')


@app.put('/api/events/{event_id}')
def upsert_event(event_id: str, body: dict = Body(...), authorization: str | None = Header(default=None)):
    actor = _require_btc(authorization)
    payload = dict(body or {})
    payload['id'] = event_id
    g = graph()
    valid_locations = {r['id'] for r in g.rooms if r.get('node') in g.nodes}
    try:
        saved = events_store.save_event(payload, valid_locations=valid_locations, actor=actor)
        return {'ok': True, 'event': saved, 'storage': events_store.storage_mode}
    except PermissionError as e:
        err(403, 'forbidden', str(e))
    except ev_mod.ValidationError as e:
        err(422, 'invalid_event', str(e))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')


@app.delete('/api/events/{event_id}')
def remove_event(event_id: str, authorization: str | None = Header(default=None)):
    actor = _require_btc(authorization)
    try:
        events_store.delete_event(event_id, actor=actor)
        album.clear_local(event_id)
        return {'ok': True}
    except PermissionError as e:
        err(403, 'forbidden', str(e))
    except ev_mod.ValidationError as e:
        err(422, 'invalid_event', str(e))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')


@app.post('/api/events/{event_id}/metrics')
def record_event_metric(event_id: str, body: dict = Body(...)):
    metric = str((body or {}).get('metric') or '').strip()
    try:
        counts = events_store.increment_metric(event_id, metric)
    except ev_mod.ValidationError as e:
        err(422, 'invalid_metric', str(e))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
    if counts is None:
        err(404, 'not_found', 'Không tìm thấy sự kiện này.')
    return {'ok': True, 'viewsCount': counts['viewsCount'], 'navigationsCount': counts['navigationsCount']}


@app.put('/api/club-mascots/{mascot_id}')
def upsert_club_mascot(mascot_id: str, body: dict = Body(...), authorization: str | None = Header(default=None)):
    actor = _require_btc(authorization)
    payload = dict(body or {})
    payload['id'] = mascot_id
    try:
        saved = events_store.save_mascot(payload, actor=actor)
        return {'ok': True, 'mascot': saved, 'storage': events_store.storage_mode}
    except PermissionError as e:
        err(403, 'forbidden', str(e))
    except ev_mod.ValidationError as e:
        err(422, 'invalid_mascot', str(e))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')


@app.delete('/api/club-mascots/{mascot_id}')
def remove_club_mascot(mascot_id: str, authorization: str | None = Header(default=None)):
    actor = _require_btc(authorization)
    try:
        events_store.delete_mascot(mascot_id, actor=actor)
        return {'ok': True}
    except PermissionError as e:
        err(403, 'forbidden', str(e))
    except ev_mod.ValidationError as e:
        err(422, 'invalid_mascot', str(e))
    except supa.SupabaseError as e:
        err(502, 'supabase', f'Lỗi Supabase: {e.message}')
