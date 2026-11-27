"""Dựng sơ đồ campus VinUni từ OpenStreetMap và ghép vào site.json.

Chạy (trong backend/, dùng venv):
    python -m tools.build_osm_campus --dry      # chỉ dựng + vẽ ảnh xem trước, không ghi site.json
    python -m tools.build_osm_campus            # ghi site.json (có sao lưu site.pre-osm.json)

Làm gì:
  1. Tải từ Overpass (cache ở backend/data/osm-cache.json): ranh giới trường, tòa nhà, đường đi bộ,
     lối vào, cổng.
  2. Vẽ ảnh nền maps/campus-osm.webp (hướng Bắc lên) và neo GPS 4 góc -> khớp chính xác pixel <-> lat/lng.
  3. Dựng đồ thị đi bộ ngoài trời từ way OSM (cắt trong ranh giới + vùng đệm), rút gọn đỉnh thẳng hàng.
  4. Đặt lại các điểm có tên (cổng, cửa tòa, Quảng trường) lên đồ thị; GIỮ nguyên id mà phòng/cửa trong
     nhà đang trỏ tới. Nối cửa Tòa G theo toạ độ GPS thật (từ neo của Tòa G).
Dữ liệu © OpenStreetMap contributors (ODbL) — giữ ghi nguồn khi hiển thị. Ảnh và đồ thị sinh ra nằm
trong thư mục bị .gitignore, không commit.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.geo import MapTransform, en_to_ll, haversine, ll_to_en
from app.store import DATA, MAPS_SRC, SITE, SEED

CENTER = (20.9893, 105.9449)             # quanh các tòa A–I
BOUNDARY_WAY = 777888670                 # "Trường Đại học VinUni" (amenity=university)
RADIUS_M = 700
OVERPASS = 'https://overpass-api.de/api/interpreter'
UA = 'vinuni-wayfinder-hackathon/0.1'
CACHE = DATA / 'osm-cache.json'

MPP = 0.35                               # mét / pixel của ảnh nền
MARGIN_M = 30
BUFFER_M = 35                            # giữ đường nằm ngoài ranh giới tối đa bấy nhiêu mét (lối ra cổng)
SIMPLIFY_DEG = 20                        # bỏ đỉnh bậc 2 lệch < 20°
SHORT_SEG_M = 15                         # đoạn kề ngắn hơn 15 m và lệch < 110° cũng bỏ
SHORT_SEG_DEG = 110
WALK_HW = {'footway', 'pedestrian', 'path', 'steps', 'track', 'cycleway', 'service'}

# Nút cổng trong OSM (do tôi suy ra từ vị trí; cần đi bộ xác nhận):
#  - Cổng chính: barrier=gate ở đầu Nam, cạnh nút "Trường Đại Học VinUni"
#  - Cổng San Hô: barrier=lift_gate ở cuối trục đường thẳng từ Tòa G lên phía Bắc
MAIN_GATE_NODE = 7972661011
SANHO_GATE_NODE = 10991194448

BUILDING_NAMES = {            # tên OSM -> mã tòa
    'Nhà A': 'A', 'Nhà B (Hội trường)': 'B', 'Nhà C': 'C', 'Nhà D': 'D', 'Nhà E': 'E', 'Nhà F': 'F',
    'Nhà G': 'G', 'Nhà H': 'H', 'Nhà I': 'I', 'Ký túc xá VinUni': 'J',
}


# ---------------------------------------------------------------- tải OSM
def fetch(refresh=False):
    if CACHE.exists() and not refresh:
        return json.loads(CACHE.read_text(encoding='utf-8'))
    la, ln = CENTER
    around = f'(around:{RADIUS_M},{la},{ln})'
    q = (f'[out:json][timeout:90];(way(id:{BOUNDARY_WAY});way["highway"]{around};way["building"]{around};'
         f'way["amenity"="parking"]{around};node["entrance"]{around};node["barrier"~"gate"]{around};'
         f'node["name"~"Quảng trường"]{around};);out tags geom;')
    req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({'data': q}).encode(),
                                 headers={'User-Agent': UA, 'Accept': 'application/json'})
    data = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:           # 429/502/504: Overpass đang bận, thử lại
            if e.code not in (429, 502, 503, 504) or attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    DATA.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return data


# ---------------------------------------------------------------- hình học
O_LAT, O_LNG = CENTER


def en(lat, lng):
    return ll_to_en(lat, lng, O_LAT, O_LNG)


def in_poly(pt, poly):
    x, y = pt
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))


def poly_dist(p, poly):
    """Khoảng cách từ p tới đa giác (0 nếu nằm trong)."""
    if in_poly(p, poly):
        return 0.0
    return min(seg_dist(p, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


def centroid(poly):
    return sum(x for x, _ in poly) / len(poly), sum(y for _, y in poly) / len(poly)


def bearing_diff(a, b):
    d = abs(math.degrees(math.atan2(a[1], a[0]) - math.atan2(b[1], b[0])))
    return min(d, 360 - d)


# ---------------------------------------------------------------- đọc dữ liệu OSM
class Osm:
    def __init__(self, raw):
        els = raw['elements']
        self.boundary = None
        self.buildings = {}          # mã tòa -> đa giác (mét)
        self.other_buildings = []
        self.walk = []               # (tags, [(lat, lng)])
        self.roads = []
        self.parking = []
        self.entrances = []          # (id, lat, lng)
        self.gates = []
        self.square = None
        for e in els:
            t = e.get('tags', {})
            if e['type'] == 'node':
                if t.get('entrance'):
                    self.entrances.append((e['id'], e['lat'], e['lon']))
                if t.get('barrier') and 'gate' in t['barrier']:
                    self.gates.append((e['id'], e['lat'], e['lon'], t))
                if 'Quảng trường' in (t.get('name') or ''):
                    self.square = (e['lat'], e['lon'])
                continue
            geom = [(p['lat'], p['lon']) for p in e.get('geometry', [])]
            if len(geom) < 2:
                continue
            if e['id'] == BOUNDARY_WAY:
                self.boundary = geom
            elif 'building' in t:
                poly = [en(*p) for p in geom]
                code = BUILDING_NAMES.get(t.get('name'))
                if code:
                    self.buildings[code] = poly
                else:
                    self.other_buildings.append(poly)
            elif t.get('amenity') == 'parking':
                self.parking.append([en(*p) for p in geom])
            elif t.get('highway') in WALK_HW:
                if t.get('service') == 'parking_aisle' or t.get('access') in ('no', 'customers'):
                    continue
                self.walk.append((t, geom))
            elif 'highway' in t:
                self.roads.append((t, geom))
        if not self.boundary:
            raise SystemExit('Không thấy ranh giới trường trong dữ liệu OSM')
        self.bpoly = [en(*p) for p in self.boundary]


# ---------------------------------------------------------------- ảnh nền + biến đổi
class Frame:
    """Ảnh nền hướng Bắc lên, pixel <-> lat/lng chính xác qua 4 neo ở góc."""

    def __init__(self, osm: Osm):
        xs = [x for x, _ in osm.bpoly]
        ys = [y for _, y in osm.bpoly]
        self.e0, self.e1 = min(xs) - MARGIN_M, max(xs) + MARGIN_M
        self.n0, self.n1 = min(ys) - MARGIN_M, max(ys) + MARGIN_M
        self.w = math.ceil((self.e1 - self.e0) / MPP)
        self.h = math.ceil((self.n1 - self.n0) / MPP)
        corners = [(0, 0), (self.w, 0), (0, self.h), (self.w, self.h)]
        anchors = []
        for x, y in corners:
            lat, lng = en_to_ll(self.e0 + x * MPP, self.n1 - y * MPP, O_LAT, O_LNG)
            anchors.append({'x': x, 'y': y, 'lat': lat, 'lng': lng, 'acc': 0.5, 'n': 0, 'src': 'osm-corner'})
        self.map_def = {'id': 'campus', 'name': 'Campus (OpenStreetMap)', 'kind': 'outdoor',
                        'image': '/maps/campus-osm.webp', 'width': self.w, 'height': self.h,
                        'metersPerPx': MPP, 'anchors': anchors,
                        'attribution': '© OpenStreetMap contributors (ODbL)'}
        self.tf = MapTransform(self.map_def)

    def px(self, e, n):                                   # mét (Đông, Bắc từ CENTER) -> pixel
        return (e - self.e0) / MPP, (self.n1 - n) / MPP

    def px_ll(self, lat, lng):
        x, y = self.tf.to_px(lat, lng)
        return x, y


def _font(size):
    for f in ('arial.ttf', 'segoeui.ttf', 'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_base(osm: Osm, fr: Frame, path: Path):
    im = Image.new('RGB', (fr.w, fr.h), (247, 246, 240))
    d = ImageDraw.Draw(im)
    P = lambda poly: [fr.px(*p) for p in poly]
    d.polygon(P(osm.bpoly), fill=(252, 251, 247))
    for t, geom in osm.roads:
        d.line([fr.px(*en(*p)) for p in geom], fill=(215, 215, 215), width=max(3, int(5 / MPP * 0.35)))
    for poly in osm.parking:
        d.polygon(P(poly), fill=(236, 236, 242), outline=(190, 190, 205))
    for poly in osm.other_buildings:
        d.polygon(P(poly), fill=(228, 228, 224), outline=(170, 170, 165))
    for t, geom in osm.walk:
        w = 5 if t['highway'] == 'service' else 3
        d.line([fr.px(*en(*p)) for p in geom], fill=(120, 170, 130) if w == 3 else (150, 150, 190), width=w)
    f = _font(34)
    for code, poly in osm.buildings.items():
        d.polygon(P(poly), fill=(205, 205, 200), outline=(90, 90, 90))
        cx, cy = fr.px(*centroid(poly))
        txt = f'Tòa {code}'
        bb = d.textbbox((0, 0), txt, font=f)
        d.text((cx - (bb[2] - bb[0]) / 2, cy - (bb[3] - bb[1]) / 2), txt, fill=(30, 30, 30), font=f)
    d.line(P(osm.bpoly) + [fr.px(*osm.bpoly[0])], fill=(190, 60, 190), width=3)
    small = _font(22)
    d.text((12, fr.h - 34), '© OpenStreetMap contributors', fill=(90, 90, 90), font=small)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, quality=88)
    return im


# ---------------------------------------------------------------- đồ thị
class Graph:
    def __init__(self):
        self.pos = {}                       # id -> (lat, lng)
        self.adj = defaultdict(set)
        self.name = {}                      # id đã đặt tên -> (label, type)
        self._k = {}

    def vid(self, lat, lng):
        key = (round(lat, 7), round(lng, 7))
        if key not in self._k:
            i = f'o{len(self._k)}'
            self._k[key] = i
            self.pos[i] = (lat, lng)
        return self._k[key]

    def link(self, a, b):
        if a != b:
            self.adj[a].add(b)
            self.adj[b].add(a)

    def m(self, a, b):
        return haversine(*self.pos[a], *self.pos[b])

    def components(self):
        seen, comps = set(), []
        for s in self.pos:
            if s in seen:
                continue
            stack, comp = [s], set()
            while stack:
                x = stack.pop()
                if x in comp:
                    continue
                comp.add(x)
                stack.extend(self.adj[x] - comp)
            seen |= comp
            comps.append(comp)
        return comps

    def nearest(self, lat, lng, within=None, exclude=()):
        best, bd = None, None
        for i, p in self.pos.items():
            if i in exclude or not self.adj[i]:
                continue
            dd = haversine(lat, lng, *p)
            if bd is None or dd < bd:
                best, bd = i, dd
        return (best, bd) if best and (within is None or bd <= within) else (None, bd)


def build_graph(osm: Osm):
    g = Graph()
    keep = {}

    def ok(lat, lng):
        k = (lat, lng)
        if k not in keep:
            p = en(lat, lng)
            keep[k] = poly_dist(p, osm.bpoly) <= BUFFER_M
        return keep[k]

    for t, geom in osm.walk:
        for (a, b) in zip(geom, geom[1:]):
            if ok(*a) and ok(*b):
                g.link(g.vid(*a), g.vid(*b))
    return g


def simplify(g: Graph, protected: set):
    def deflection(a, b, c):
        pa, pb, pc = (en(*g.pos[x]) for x in (a, b, c))
        v1, v2 = (pb[0] - pa[0], pb[1] - pa[1]), (pc[0] - pb[0], pc[1] - pb[1])
        if v1 == (0, 0) or v2 == (0, 0):
            return 0
        return bearing_diff(v1, v2)

    changed = True
    while changed:
        changed = False
        for v in list(g.pos):
            if v in protected or len(g.adj[v]) != 2:
                continue
            a, c = tuple(g.adj[v])
            if c in g.adj[a]:                      # tránh tạo cạnh trùng
                continue
            defl = deflection(a, v, c)
            # khúc cua nhỏ: bỏ nếu lệch ít, hoặc nếu đoạn kề quá ngắn (tránh bước "rẽ 5 m")
            short = min(g.m(a, v), g.m(v, c)) < SHORT_SEG_M
            if defl < SIMPLIFY_DEG or (short and defl < SHORT_SEG_DEG):
                g.adj[a].discard(v)
                g.adj[c].discard(v)
                g.link(a, c)
                del g.adj[v]
                del g.pos[v]
                changed = True


# ---------------------------------------------------------------- điểm có tên
def place(g: Graph, nid: str, label: str, typ: str, lat: float, lng: float, taken: dict, max_snap=60):
    """Gắn điểm có tên `nid` vào đồ thị tại gần (lat,lng) nhất. Trả về id đỉnh dùng."""
    v, d = g.nearest(lat, lng, max_snap)
    if v is None:
        raise SystemExit(f'Điểm {nid} cách đồ thị đi bộ {d:.0f} m (> {max_snap} m)')
    if v not in taken and d <= 12:
        taken[v] = nid
        g.name[nid] = (label, typ)
        g.pos[nid] = g.pos[v]
        for nb in list(g.adj[v]):
            g.adj[nb].discard(v)
            g.link(nid, nb)
        del g.adj[v]
        del g.pos[v]
        taken[nid] = nid
        return nid, d
    g.pos[nid] = (lat, lng) if d > 12 else g.pos[v]
    g.name[nid] = (label, typ)
    g.link(nid, v)
    taken[nid] = nid
    return nid, d


def building_door(osm: Osm, g: Graph, code: str, toward: tuple | None = None, radius=35):
    """Đỉnh đi bộ sát tòa `code` (nếu có `toward`: ưu tiên phía hướng tới điểm đó)."""
    poly = osm.buildings[code]
    c = centroid(poly)
    cand = []
    for i, p in g.pos.items():
        if not g.adj[i]:
            continue
        pe = en(*p)
        dd = poly_dist(pe, poly)
        if dd <= radius:
            cand.append((i, dd, pe))
    if not cand:
        raise SystemExit(f'Không có đường đi bộ sát Tòa {code}')
    if toward:
        tv = (toward[0] - c[0], toward[1] - c[1])
        cand.sort(key=lambda x: (bearing_diff((x[2][0] - c[0], x[2][1] - c[1]), tv) * 0.5 + x[1]))
    else:
        cand.sort(key=lambda x: x[1])
    i, dd, pe = cand[0]
    return g.pos[i], dd


# ---------------------------------------------------------------- dựng + ghép
def build(site: dict, dry=False, refresh=False):
    raw = fetch(refresh)
    osm = Osm(raw)
    fr = Frame(osm)
    img_path = MAPS_SRC / 'campus-osm.webp'
    draw_base(osm, fr, img_path)
    g = build_graph(osm)
    if not g.pos:
        raise SystemExit('Không dựng được đường đi bộ')

    old_nodes = {n['id']: n for n in site['nodes']}
    maps = {m['id']: m for m in site['maps']}
    tfs = {mid: MapTransform(m) for mid, m in maps.items()}

    taken = {}
    report = []

    # --- Quảng trường (hoặc điểm giữa) để chọn thành phần liên thông chính
    sq = osm.square or CENTER
    # giữ thành phần liên thông chứa đỉnh gần quảng trường nhất
    comps = g.components()
    hub, _ = g.nearest(*sq)
    main = next(c for c in comps if hub in c)
    for c in comps:
        if c is not main:
            for v in c:
                for nb in g.adj[v]:
                    g.adj[nb].discard(v)
                g.adj.pop(v, None)
                g.pos.pop(v, None)

    # --- cổng: đỉnh liên thông xa nhất về phía Nam / Bắc trong ranh giới
    inside = [(i, en(*p)) for i, p in g.pos.items() if poly_dist(en(*p), osm.bpoly) <= 5]
    south = min(inside, key=lambda x: x[1][1])
    north = max(inside, key=lambda x: x[1][1])

    named = []   # (id, label, type, (lat,lng))
    named.append(('square', 'Quảng trường chính (Main Square)', 'landmark', sq))
    for code, nid, label in [('A', 'a_door', 'Cửa Tòa A (Thư viện)'), ('B', 'b_door', 'Cửa Tòa B (Hội trường)'),
                             ('C', 'c_door', 'Cửa Tòa C'), ('E', 'e_door', 'Cửa Tòa E (Nhà ăn)'),
                             ('F', 'f_door', 'Cửa Tòa F (Trung tâm Mô phỏng Y khoa)'),
                             ('H', 'h_door', 'Cửa Tòa H'), ('J', 'j_door', 'Cửa Tòa J (Ký túc xá)')]:
        if code in osm.buildings:
            ll, _ = building_door(osm, g, code)
            named.append((nid, label, 'entrance', ll))
    if osm.parking:
        pc = max(osm.parking, key=lambda p: -poly_dist(centroid(p), osm.bpoly))
        pcen = centroid(pc)
        named.append(('parking', 'Bãi đỗ xe', 'landmark', en_to_ll(*pcen, O_LAT, O_LNG)))
    # Cổng lấy từ nút OSM (nếu có), không thì đỉnh xa nhất về phía Nam/Bắc trong ranh giới
    gates = {gid: (lat, lng) for gid, lat, lng, _ in osm.gates}
    named.append(('gate_main', 'Cổng chính (Main Gate)', 'gate', gates.get(MAIN_GATE_NODE, g.pos[south[0]])))
    named.append(('gate_sanho', 'Cổng San Hô (San Ho Gate)', 'gate', gates.get(SANHO_GATE_NODE, g.pos[north[0]])))

    # Tòa I (chưa có neo GPS): chọn phía theo hướng tới tòa lân cận
    if 'I' in osm.buildings:
        ic = centroid(osm.buildings['I'])
        for nid, label, toward in [('i_west', 'Lối phía Tòa C (Tòa I)', 'C'), ('i_east', 'Lối phía Tòa E (Tòa I)', 'E'),
                                   ('lib_garden', 'Vườn Thư viện', 'A')]:
            if toward in osm.buildings:
                ll, _ = building_door(osm, g, 'I', centroid(osm.buildings[toward]), radius=40)
                named.append((nid, label, 'junction' if nid != 'lib_garden' else 'landmark', ll))

    # Tòa G: nối từng cửa theo GPS thật (neo của Tòa G)
    gdoor = {'g_d_w': 'g_w', 'g_d_n': 'r_n', 'g_d_e': 'g_east', 'g_d_ne': 'gd_ne', 'g_d_s': 'gd_s', 'g_d_nw': 'gd_nw'}
    door_links = []
    if tfs.get('G') and tfs['G'].geo:
        for did, cid in gdoor.items():
            dn = old_nodes.get(did)
            if not dn:
                continue
            ll = tfs['G'].to_ll(dn['x'], dn['y'])
            named.append((cid, 'Lối vào Tòa G', 'entrance', ll))
            door_links.append((did, cid))

    for nid, label, typ, ll in named:
        v, d = place(g, nid, label, typ, ll[0], ll[1], taken, max_snap=90 if typ == 'gate' else 60)
        report.append((nid, round(d, 1)))

    protected = set(g.name)
    simplify(g, protected)

    # nhãn cho đỉnh chưa đặt tên: "Ngã rẽ gần Tòa X"
    cents = {c: centroid(p) for c, p in osm.buildings.items()}
    nodes, edges = [], []
    for v, p in g.pos.items():
        if not g.adj[v]:
            continue
        if v in g.name:
            label, typ = g.name[v]
        else:
            pe = en(*p)
            near = min(((poly_dist(pe, poly), c) for c, poly in osm.buildings.items()), default=(999, ''))
            label = f'Ngã rẽ gần Tòa {near[1]}' if near[0] <= 30 else 'Ngã rẽ'
            typ = 'junction'
        x, y = fr.px_ll(*p)
        nodes.append({'id': v, 'map': 'campus', 'x': round(x, 2), 'y': round(y, 2), 'type': typ,
                      'label': label, 'verified': False})
    ids = {n['id'] for n in nodes}
    seen = set()
    for a, nb in g.adj.items():
        for b in nb:
            if a in ids and b in ids and (b, a) not in seen:
                seen.add((a, b))
                edges.append({'a': a, 'b': b, 'kind': 'walk', 'verified': False})

    # --- ghép vào site
    new = json.loads(json.dumps(site))
    old_campus = {n['id'] for n in new['nodes'] if n['map'] == 'campus'}
    new['nodes'] = [n for n in new['nodes'] if n['map'] != 'campus'] + nodes
    new_ids = {n['id'] for n in new['nodes']}
    new['edges'] = [e for e in new['edges'] if e['a'] not in old_campus and e['b'] not in old_campus] + edges
    new['maps'] = [fr.map_def if m['id'] == 'campus' else m for m in new['maps']]

    # cửa cũ của Tòa I trỏ tới i_west/i_east/lib_garden: dựng lại theo cạnh cũ
    for e in site['edges']:
        a, b = e['a'], e['b']
        ia, ib = old_nodes.get(a), old_nodes.get(b)
        if ia and ib and ia['map'] != ib['map'] and e.get('kind') == 'door':
            indoor, outdoor = (a, b) if ia['map'] != 'campus' else (b, a)
            if old_nodes[indoor]['map'] == 'G':
                continue                           # cửa Tòa G dựng lại theo GPS bên dưới
            if outdoor in new_ids:
                new['edges'].append({'a': indoor, 'b': outdoor, 'kind': 'door', 'verified': False})
            else:
                print('  ! mất cửa', indoor, '->', outdoor)
    for did, cid in door_links:
        if cid in new_ids:
            new['edges'].append({'a': did, 'b': cid, 'kind': 'door', 'verified': False})

    # phòng: bỏ phòng trỏ tới điểm không còn (Tòa K), Tòa H -> h_door
    dropped = []
    rooms = []
    for r in new['rooms']:
        if r['node'] == 'g_w' and r['id'] == 'bH' and 'h_door' in new_ids:
            r = dict(r, node='h_door')
        if r['node'] not in new_ids:
            dropped.append(r['id'])
            continue
        rooms.append(r)
    new['rooms'] = rooms

    summary = {'nodes': len(nodes), 'edges': len(edges), 'image': (fr.w, fr.h), 'snap_m': report,
               'dropped_rooms': dropped}
    return new, summary, fr, osm, g


def preview(new: dict, fr: Frame, osm: Osm, path: Path):
    im = Image.open(MAPS_SRC / 'campus-osm.webp').convert('RGB')
    d = ImageDraw.Draw(im)
    N = {n['id']: n for n in new['nodes']}
    for e in new['edges']:
        a, b = N[e['a']], N[e['b']]
        if a['map'] == b['map'] == 'campus':
            d.line([(a['x'], a['y']), (b['x'], b['y'])], fill=(0, 90, 220), width=3)
    f = _font(26)
    for n in N.values():
        if n['map'] != 'campus':
            continue
        named = n['type'] in ('gate', 'entrance', 'landmark') or n['id'] in ('i_west', 'i_east')
        r = 9 if named else 4
        d.ellipse((n['x'] - r, n['y'] - r, n['x'] + r, n['y'] + r), fill=(230, 40, 40) if named else (0, 60, 160))
        if named:
            d.text((n['x'] + 10, n['y'] - 14), n['id'], fill=(180, 0, 0), font=f)
    im.thumbnail((2400, 2400))
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--refresh', action='store_true', help='tải lại OSM, bỏ cache')
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    site = json.loads(SITE.read_text(encoding='utf-8')) if SITE.exists() else json.loads(SEED.read_text(encoding='utf-8'))
    new, summary, fr, osm, g = build(site, a.dry, a.refresh)
    print(json.dumps(summary, ensure_ascii=False))
    if a.preview:
        preview(new, fr, osm, Path(a.preview))
        print('preview ->', a.preview)
    if a.dry:
        return
    if SITE.exists():
        shutil.copy2(SITE, DATA / 'site.pre-osm.json')
    if SEED.exists() and not (MAPS_SRC / 'seed-site.pre-osm.json').exists():
        shutil.copy2(SEED, MAPS_SRC / 'seed-site.pre-osm.json')
    from app.store import save_site
    save_site(new)
    seed = json.loads(json.dumps(new))
    seed['traces'] = []
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding='utf-8')
    print('đã ghi', SITE, 'và cập nhật seed')


if __name__ == '__main__':
    sys.exit(main())
