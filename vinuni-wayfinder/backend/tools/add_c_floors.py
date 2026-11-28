"""Thêm sơ đồ tầng 3 và tầng 4 Tòa C: VẼ LẠI từ bảng thoát hiểm (không dùng ảnh gốc), rồi gộp vào dữ liệu bản đồ.

Chạy trong backend/:
    python -m tools.add_c_floors --dry          # chỉ vẽ ảnh ra maps/ và in tóm tắt
    python -m tools.add_c_floors                # vẽ + lưu site (Supabase nếu có .env, không thì backend/data/site.json)
                                                # + tải ảnh lên kho 'maps'

Toạ độ dưới đây là toạ độ trên bảng thoát hiểm (tờ ảnh 2000x1500), dịch lên bằng DY để bỏ phần lề.
Mọi điểm `verified: false`; `metersPerPx` là ước tính.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MAPS_SRC = ROOT / 'maps'
DY = 330
W, H = 2000, 1000
SS = 2                                         # siêu lấy mẫu để nét mịn
METERS_PER_PX = 0.035                          # (tự ước tính) bề ngang tòa ~64 m

BG, FLOOR, ROOM, WALL = '#eef1f5', '#fffdf8', '#e8eefb', '#1d2330'
GREEN, BLUE, RED = '#1f9d55', '#1f3fa6', '#d33b2c'
FLOORS = {'C3': 3, 'C4': 4}


def P(x, y):
    return x, y - DY


def _poly(pts):
    return [P(*p) for p in pts]


# ---------- hình học ----------
FOOTPRINT = [(85, 385), (385, 385), (385, 445), (1625, 445), (1625, 395), (1915, 395), (1915, 690), (1860, 690),
             (1860, 1005), (1915, 1005), (1915, 1300), (1620, 1300), (1620, 1240), (380, 1240), (380, 1295),
             (80, 1295), (80, 1010), (110, 1010), (110, 675), (85, 675)]

CORES = {      # (hộp, nhãn, màu viền)
    'st_w': ((85, 385, 230, 675), 'Thang bộ', GREEN),
    'st_m': ((1170, 460, 1325, 690), 'Thang bộ', WALL),
    'st_e': ((1770, 395, 1915, 690), 'Thang bộ', GREEN),
}
SMALL = [(1330, 490, 1400, 690), (1500, 465, 1595, 555), (1500, 560, 1595, 612)]
WCS = [((1630, 400, 1765, 610), (1698, 505)), ((1500, 640, 1595, 785), (1548, 712)),
       ((1630, 615, 1765, 785), (1698, 700))]

ROOMS3 = {
    'C304': [(235, 385), (385, 385), (385, 445), (710, 445), (710, 780), (235, 780)],
    'C305': [(718, 450), (1165, 450), (1165, 780), (718, 780)],
    'C301': [(150, 900), (625, 900), (625, 1235), (380, 1235), (380, 1295), (80, 1295), (80, 1010), (150, 1010)],
    'C302': [(630, 905), (1130, 905), (1130, 1235), (630, 1235)],
    'C303': [(1365, 905), (1855, 905), (1855, 1005), (1910, 1005), (1910, 1300), (1620, 1300), (1620, 1240),
             (1365, 1240)],
}
ROOMS4 = {
    'C401': [(228, 385), (360, 385), (360, 445), (1160, 445), (1160, 1240), (378, 1240), (378, 1295), (80, 1295),
             (80, 1065), (228, 1065)],
    'C402': [(1355, 905), (1855, 905), (1855, 1005), (1905, 1005), (1905, 1300), (1620, 1300), (1620, 1240),
             (1355, 1240)],
}
LABEL_AT = {'C301': (370, 1070), 'C302': (880, 1070), 'C303': (1640, 1090), 'C304': (470, 610),
            'C305': (940, 610), 'C401': (655, 835), 'C402': (1630, 1060)}
EXITS = [(25, 820, 'L'), (1888, 830, 'R')]
UPPER_CURVE = [(290, 680), (380, 718), (440, 690), (520, 610), (620, 555), (740, 560), (820, 590), (860, 520), (880, 460)]
LOWER_CURVE = [(290, 975), (330, 960), (400, 955), (480, 1040), (600, 1120), (720, 1110), (820, 1060), (900, 990),
               (930, 910), (1055, 885)]
TABLES = [(523, 520), (638, 497), (752, 517), (435, 575), (365, 660), (593, 613), (708, 610), (498, 668), (804, 670),
          (930, 640), (650, 715), (438, 755), (551, 757), (751, 757), (864, 757), (977, 740),
          (440, 912), (552, 910), (738, 912), (865, 920), (978, 935), (652, 955), (500, 1005), (366, 1008),
          (594, 1055), (708, 1055), (930, 1030), (437, 1095), (525, 1150), (638, 1170), (752, 1160), (850, 1110)]


def _font(size, bold=True):
    for name in ('arialbd.ttf' if bold else 'arial.ttf', 'segoeuib.ttf', 'DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw(floor: str) -> Image.Image:
    """Vẽ lại mặt bằng một tầng ('C3' hoặc 'C4') từ dữ liệu hình học ở trên."""
    s = SS
    im = Image.new('RGB', (W * s, H * s), BG)
    d = ImageDraw.Draw(im)

    def sc(pts):
        return [(x * s, y * s) for x, y in pts]

    def line(pts, w=7, fill=WALL):
        d.line(sc(_poly(pts)), fill=fill, width=w * s, joint='curve')

    def text(xy, t, size, fill=WALL, bold=True):
        x, y = P(*xy)
        d.text((x * s, y * s), t, font=_font(size * s, bold), fill=fill, anchor='mm')

    def rect(box, fill, outline, w=6):
        x0, y0, x1, y1 = box
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        d.polygon(sc(_poly(pts)), fill=fill)
        line(pts + [pts[0]], w, outline)

    d.polygon(sc(_poly(FOOTPRINT)), fill=FLOOR)
    for name, pts in (ROOMS3 if floor == 'C3' else ROOMS4).items():
        d.polygon(sc(_poly(pts)), fill=ROOM)
        line(pts + [pts[0]], 6)
        if floor == 'C3' or name == 'C402':
            text(LABEL_AT[name], name, 30, '#3a4560', False)
    line(FOOTPRINT + [FOOTPRINT[0]], 9)

    for box, label, col in CORES.values():
        rect(box, '#f0faf3' if col == GREEN else FLOOR, col, 7 if col == GREEN else 6)
        x0, y0, x1, y1 = box
        for i in range(10):                     # bậc cầu thang
            yy = y0 + 30 + i * 14
            line([(x0 + 18, yy), (x1 - 18, yy)], 3)
    for box in SMALL:
        rect(box, FLOOR, WALL, 5)
    ex0, ey0, ex1, ey1 = SMALL[1]               # thang máy
    line([(ex0 + 20, ey0 + 15), (ex1 - 20, ey1 - 15)], 3)
    line([(ex0 + 20, ey1 - 15), (ex1 - 20, ey0 + 15)], 3)
    text(((ex0 + ex1) // 2, ey1 + 22), 'Thang máy', 17, '#3a4560', False)
    for box, (cx, cy) in WCS:
        rect(box, '#e5ecf7', WALL, 5)
        d.rounded_rectangle([(cx - 34) * s, (P(0, cy)[1] - 18) * s, (cx + 34) * s, (P(0, cy)[1] + 18) * s],
                            radius=4 * s, fill=BLUE)
        text((cx, cy), 'WC', 24, 'white')

    if floor == 'C4':                           # hội trường C401: tường cong + bàn tròn
        line(UPPER_CURVE, 7)
        line(LOWER_CURVE, 7)
        text((655, 870), 'C401', 30, '#3a4560', False)
        for tx, ty in TABLES:
            cx, cy = P(tx, ty)
            for k in range(8):
                a = k * math.pi / 4
                x, y = cx + 33 * math.cos(a), cy + 33 * math.sin(a)
                d.ellipse([(x - 8) * s, (y - 8) * s, (x + 8) * s, (y + 8) * s], outline='#7b8497', width=2 * s)
            d.ellipse([(cx - 22) * s, (cy - 22) * s, (cx + 22) * s, (cy + 22) * s], outline='#7b8497', fill='white',
                      width=2 * s)

    for x, y, side in EXITS:                    # biển EXIT
        d.rectangle([x * s, P(0, y)[1] * s, (x + 78) * s, (P(0, y)[1] + 34) * s], fill=GREEN)
        text((x + 39, y + 17), 'EXIT', 20, 'white')
    for (x, y) in [(160, 625), (1840, 625)]:
        d.rectangle([(x - 40) * s, (P(0, y)[1]) * s, (x + 40) * s, (P(0, y)[1] + 32) * s], fill=GREEN)
        text((x, y + 16), 'EXIT', 19, 'white')
    # lối đi chính (đường thoát hiểm)
    line([(175, 840), (1810, 840)], 3, BLUE)

    text((1000, 362), f'Tòa C – Tầng {FLOORS[floor]} (vẽ lại từ sơ đồ thoát hiểm)', 26, '#5a6378', False)
    return im.resize((W, H), Image.LANCZOS)


# ---------- dữ liệu đồ thị ----------
def _n(fid, key, x, y, typ, label):
    return {'id': f'{fid.lower()}_{key}', 'map': fid, 'x': x, 'y': y - DY, 'type': typ, 'label': label,
            'verified': False}


def _floor_nodes(fid):
    t = FLOORS[fid]
    suf = f' (tầng {t})'
    N = [_n(fid, 'exit_w', 65, 835, 'entrance', f'Cửa thoát hiểm phía Tây Tòa C{suf}'),
         _n(fid, 'exit_e', 1925, 835, 'entrance', f'Cửa thoát hiểm phía Đông Tòa C{suf}'),
         _n(fid, 'st_w', 160, 600, 'landmark', f'Cầu thang bộ phía Tây Tòa C{suf}'),
         _n(fid, 'st_m', 1245, 600, 'landmark', f'Cầu thang bộ giữa Tòa C{suf}'),
         _n(fid, 'st_e', 1840, 600, 'landmark', f'Cầu thang bộ phía Đông Tòa C{suf}'),
         _n(fid, 'elev', 1545, 515, 'landmark', f'Thang máy Tòa C{suf}'),
         _n(fid, 'wc_n', 1698, 505, 'room', f'Nhà vệ sinh phía Bắc{suf}'),
         _n(fid, 'wc_l', 1548, 712, 'room', f'Nhà vệ sinh phía Tây Nam{suf}'),
         _n(fid, 'wc_r', 1698, 700, 'room', f'Nhà vệ sinh phía Đông Nam{suf}')]
    xs = {'3': [('a', 175), ('b', 305), ('c', 575), ('d', 670), ('e', 750), ('f', 1100), ('g', 1245), ('h', 1405),
                ('i', 1545), ('j', 1700), ('k', 1805)],
          '4': [('a', 180), ('b', 500), ('d', 900), ('f', 1140), ('g', 1245), ('h', 1405), ('i', 1545), ('j', 1700),
                ('k', 1805)]}[str(t)]
    for key, x in xs:
        N.append(_n(fid, f'h_{key}', x, 840, 'hallway', f'Hành lang tầng {t}, Tòa C'))
    return N, [k for k, _ in xs]


def build_floors():
    maps, nodes, edges, rooms = [], [], [], []
    for fid, t in FLOORS.items():
        maps.append({'id': fid, 'name': f'Tòa C – tầng {t}', 'kind': 'indoor', 'building': 'Tòa C',
                     'image': f'/maps/toa-C-tang-{t}.webp', 'floor': t, 'width': W, 'height': H,
                     'metersPerPx': METERS_PER_PX, 'anchors': []})
        N, keys = _floor_nodes(fid)
        p = fid.lower()
        E = lambda a, b, kind='walk': edges.append({'a': a, 'b': b, 'kind': kind, 'verified': False})  # noqa: E731
        for a, b in zip(keys, keys[1:]):
            E(f'{p}_h_{a}', f'{p}_h_{b}')
        E(f'{p}_exit_w', f'{p}_h_a')
        E(f'{p}_exit_e', f'{p}_h_k')
        E(f'{p}_st_w', f'{p}_h_a')
        E(f'{p}_st_m', f'{p}_h_g')
        E(f'{p}_st_e', f'{p}_h_k')
        E(f'{p}_elev', f'{p}_h_i')
        E(f'{p}_wc_n', f'{p}_h_j')
        E(f'{p}_wc_l', f'{p}_h_i')
        E(f'{p}_wc_r', f'{p}_h_j')
        if t == 3:
            spec = {'C301': ((350, 1050), ['c']), 'C302': ((880, 1050), ['d', 'f']),
                    'C303': ((1640, 1080), ['h']), 'C304': ((470, 610), ['b', 'd']),
                    'C305': ((940, 610), ['e', 'f'])}
        else:
            spec = {'C401': ((700, 780), ['b', 'd']), 'C402': ((1630, 1060), ['h'])}
        for code, ((x, y), links) in spec.items():
            nid = f'{p}_{code[1:].lower()}'
            N.append(_n(fid, code[1:].lower(), x, y, 'room', f'Phòng {code}'))
            for k in links:
                E(nid, f'{p}_h_{k}')
            rooms.append({'id': code, 'code': code, 'name': f'Phòng {code}', 'node': nid,
                          'aliases': [code[1:]], 'verified': False})
        rooms.append({'id': f'wc_C{t}', 'code': '', 'name': f'Nhà vệ sinh (Tòa C, tầng {t})', 'node': f'{p}_wc_l',
                      'aliases': [f'wc tầng {t}', f'toilet tầng {t}'], 'verified': False})
        rooms.append({'id': f'elev_C{t}', 'code': '', 'name': f'Thang máy (Tòa C, tầng {t})', 'node': f'{p}_elev',
                      'aliases': [f'thang máy tầng {t}'], 'verified': False})
        nodes += N
    for k in ('st_w', 'st_m', 'st_e', 'elev'):          # nối hai tầng
        edges.append({'a': f'c3_{k}', 'b': f'c4_{k}', 'kind': 'walk', 'verified': False})
    # Tầng trệt Tòa C chưa có sơ đồ: tạm nối cửa Tòa C (ngoài trời) vào thang máy tầng 3.
    edges.append({'a': 'c_door', 'b': 'c3_elev', 'kind': 'door', 'verified': False})
    return maps, nodes, edges, rooms


def merge(site: dict) -> dict:
    """Gộp tầng 3/4 vào site (chạy lại nhiều lần vẫn cho kết quả như nhau)."""
    maps, nodes, edges, rooms = build_floors()
    mine = {m['id'] for m in maps}
    site['maps'] = [m for m in site['maps'] if m['id'] not in mine] + maps
    gone = {n['id'] for n in site['nodes'] if n['map'] in mine}
    site['nodes'] = [n for n in site['nodes'] if n['map'] not in mine] + nodes
    site['edges'] = [e for e in site['edges'] if e['a'] not in gone and e['b'] not in gone] + edges
    new_rooms = {r['id'] for r in rooms}
    site['rooms'] = [r for r in site['rooms'] if r['id'] not in new_rooms] + rooms
    return site


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='chỉ vẽ ảnh, không lưu dữ liệu')
    args = ap.parse_args()
    MAPS_SRC.mkdir(exist_ok=True)
    for fid, t in FLOORS.items():
        out = MAPS_SRC / f'toa-C-tang-{t}.webp'
        draw(fid).save(out, quality=92)
        print('ve', out.name)
    if args.dry:
        return
    from app import store, supa
    site = merge(store.load_site())
    store.save_site(site)
    print('đã lưu site:', store.mode(), '| điểm', len(site['nodes']), '| cạnh', len(site['edges']))
    if supa.ENABLED:
        db = supa.client()
        for t in FLOORS.values():
            name = f'toa-C-tang-{t}.webp'
            db.upload('maps', name, (MAPS_SRC / name).read_bytes(), 'image/webp')
            print('tải lên kho maps:', name)
    else:
        (store.DATA / 'maps').mkdir(parents=True, exist_ok=True)


if __name__ == '__main__':
    main()
