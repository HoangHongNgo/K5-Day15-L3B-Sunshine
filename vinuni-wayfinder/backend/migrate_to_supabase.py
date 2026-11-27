"""Chuyển dữ liệu cục bộ lên Supabase (chạy một lần, bởi người đang giữ dữ liệu).

    cd backend
    .\\.venv\\Scripts\\python.exe migrate_to_supabase.py            # chuyển, từ chối nếu Supabase đã có dữ liệu
    .\\.venv\\Scripts\\python.exe migrate_to_supabase.py --replace  # xoá vector/ảnh khung trên Supabase rồi chuyển lại

Cần file `.env` ở gốc repo (hoặc `backend/.env`) có SUPABASE_URL và SUPABASE_SERVICE_KEY. Không in khoá ra màn hình.
Thứ tự: bản đồ/điểm/đường nối/phòng -> vết đi bộ -> ảnh sơ đồ -> vector nhận diện -> ảnh khung nhỏ.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from pathlib import Path

import numpy as np

from app import supa
from app.embedder import DIM, MODEL_NAME
from app.index import INSERT_BATCH, _encode
from app.store import DATA, MAPS_SRC, SEED, SITE

ap = argparse.ArgumentParser()
ap.add_argument('--replace', action='store_true', help='xoá vector và ảnh khung đang có trên Supabase trước khi chuyển')
args = ap.parse_args()

if not supa.ENABLED:
    sys.exit('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong file .env ở gốc repo')
db = supa.client()

src = SITE if SITE.exists() else SEED
if not src.exists():
    sys.exit('Không tìm thấy site.json hay seed-site.json để chuyển')
site = json.loads(src.read_text(encoding='utf-8'))
print(f'Nguồn bản đồ: {src.name} ({len(site["nodes"])} điểm, {len(site["edges"])} đường nối, {len(site["rooms"])} phòng)')

state = db.rpc('get_site', {})
have_vec = len(db.select('embeddings', {'select': 'id', 'limit': '1'}))
if (state['nodes'] or have_vec) and not args.replace:
    sys.exit('Supabase đã có dữ liệu. Chạy lại với --replace nếu muốn ghi đè vector/ảnh khung '
             '(bản đồ sẽ được ghi đè theo phiên bản hiện tại).')

# 1) bản đồ, điểm, đường nối, phòng (một giao dịch)
payload = {k: site[k] for k in ('maps', 'nodes', 'edges', 'rooms')}
version = db.rpc('save_site', {'base_version': state['version'], 'payload': payload})
print(f'1. Bản đồ đã lưu, phiên bản {version}')

# 2) vết đi bộ
if args.replace:
    db.delete('traces', {'id': 'not.is.null'})
traces = site.get('traces') or []
if traces:
    rows = []
    for t in traces:
        row = {'id': t['id'], 'points': t.get('points', []), 'steps': t.get('steps')}
        if t.get('created'):
            row['created_at'] = t['created']
        rows.append(row)
    db.insert('traces', rows, on_conflict='id')
print(f'2. Vết đi bộ: {len(traces)}')

# 3) ảnh sơ đồ
n_img = 0
for m in site['maps']:
    name = (m.get('image') or '').split('/')[-1]
    if not name:
        continue
    f = next((b / name for b in (DATA / 'maps', MAPS_SRC) if (b / name).is_file()), None)
    if f is None:
        print(f'   (bỏ qua {name}: không có file cục bộ)')
        continue
    db.upload('maps', name, f.read_bytes(), mimetypes.guess_type(name)[0] or 'image/jpeg')
    n_img += 1
print(f'3. Ảnh sơ đồ: {n_img}')

# 4) vector nhận diện
node_ids = {n['id'] for n in site['nodes']}
if args.replace:
    db.delete('embeddings', {'id': 'gt.0'})
idx = DATA / 'index.npz'
n_vec = skipped = 0
if idx.exists():
    z = np.load(idx, allow_pickle=True)
    if str(z['model_name']) != MODEL_NAME:
        print(f'   (bỏ qua vector: index cục bộ dùng mô hình khác: {z["model_name"]})')
    else:
        rows = [{'spot': str(z['labels'][i]), 'source': str(z['source'][i]), 'video': str(z['video'][i]),
                 'model_name': MODEL_NAME, 'vec': _encode(z['vecs'][i])}
                for i in range(len(z['labels'])) if str(z['labels'][i]) in node_ids]
        skipped = len(z['labels']) - len(rows)
        for i in range(0, len(rows), INSERT_BATCH):
            db.insert('embeddings', rows[i:i + INSERT_BATCH])
            n_vec += len(rows[i:i + INSERT_BATCH])
print(f'4. Vector nhận diện: {n_vec} (bỏ qua {skipped} vector của điểm không còn trên bản đồ), {DIM} chiều')

# 5) ảnh khung nhỏ
if args.replace:
    db.delete('frame_thumbs', {'spot': 'not.is.null'})
n_th = 0
base = DATA / 'frames'
if base.exists():
    for d in sorted(p for p in base.iterdir() if p.is_dir() and p.name in node_ids):
        names = []
        for p in sorted(d.glob('*.jpg')):
            db.upload('frames', f'{d.name}/{p.name}', p.read_bytes(), 'image/jpeg')
            names.append({'spot': d.name, 'name': p.name})
        if names:
            db.insert('frame_thumbs', names, on_conflict='spot,name')
            n_th += len(names)
print(f'5. Ảnh khung nhỏ: {n_th}')
print('Xong. Kiểm tra: mở /api/health, storage phải là "supabase".')
