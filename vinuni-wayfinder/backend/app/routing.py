"""Đồ thị đường đi + sinh thẻ chỉ dẫn từng bước (tiếng Việt).

Quy tắc (CLAUDE.md ở gốc repo): rẽ khi góc >= 45°, >= 150° là quay lại; khúc cua nhỏ hơn gộp vào
bước trước; phòng đích dọc hành lang -> "ở bên trái/phải"; tối đa 3 mốc đi ngang qua.
"""
from __future__ import annotations

import math
import re

import networkx as nx

from .geo import MapTransform, haversine

TURN_DEG = 45
BACK_DEG = 150
SHORT_STEP_M = 15          # bước ngoài trời ngắn hơn mức này thì gộp với đoạn sau (tránh "rẽ trái 5 m")
DOOR_COST_M = 1.0
DOOR_PENALTY_M = 30.0
LANDMARK_TYPES = {'room', 'landmark'}


class SiteGraph:
    def __init__(self, site: dict):
        self.site = site
        self.maps = {m['id']: m for m in site['maps']}
        self.tf = {m['id']: MapTransform(m) for m in site['maps']}
        self.nodes = {n['id']: n for n in site['nodes']}
        self.rooms = site.get('rooms', [])
        self.g = nx.Graph()
        for n in site['nodes']:
            self.g.add_node(n['id'])
        for e in site['edges']:
            a, b = self.nodes.get(e['a']), self.nodes.get(e['b'])
            if not a or not b:
                continue
            m = self.edge_len(a, b)
            # Qua cửa (đổi bản đồ) bị phạt chi phí để tuyến không "ra ngoài rồi vào lại"
            # chỉ vì hai cửa cùng nối vào một điểm ngoài trời. Số mét hiển thị vẫn là m.
            cost = m + (DOOR_PENALTY_M if a['map'] != b['map'] else 0)
            self.g.add_edge(a['id'], b['id'], kind=e.get('kind', 'walk'), w=cost, m=m)
        self._near_cache = {}

    # ---------- hình học ----------
    def latlng(self, n):
        if n.get('lat') is not None and n.get('lng') is not None:
            return n['lat'], n['lng']
        tf = self.tf.get(n['map'])
        return tf.to_ll(n['x'], n['y']) if tf else None

    def edge_len(self, a, b):
        if a['map'] != b['map']:
            return DOOR_COST_M
        tf = self.tf[a['map']]
        if tf.geo:
            la, lb = self.latlng(a), self.latlng(b)
            return haversine(*la, *lb)
        return math.dist((a['x'], a['y']), (b['x'], b['y'])) * tf.meters_per_px

    @staticmethod
    def vec(a, b):
        """Vectơ trên ảnh, đổi sang trục Bắc-lên (y đảo dấu)."""
        return b['x'] - a['x'], -(b['y'] - a['y'])

    @staticmethod
    def angle(u, v):
        """Góc có dấu từ u sang v, độ; dương = rẽ trái."""
        cross = u[0] * v[1] - u[1] * v[0]
        dot = u[0] * v[0] + u[1] * v[1]
        return math.degrees(math.atan2(cross, dot))

    def map_label(self, map_id):
        m = self.maps.get(map_id, {})
        return m.get('building') or m.get('name') or map_id

    # ---------- tìm kiếm ----------
    def resolve_target(self, to):
        if to in self.nodes:
            return to, self.nodes[to]['label']
        key = to.strip().lower()
        for r in self.rooms:
            if key in {r['id'].lower(), (r.get('code') or '').lower()} | {a.lower() for a in r.get('aliases', [])}:
                return r['node'], r['name']
        return None, None

    def nearest_geo_node(self, lat, lng, max_m=150):
        best, best_d = None, None
        for n in self.nodes.values():
            if self.maps.get(n['map'], {}).get('kind') != 'outdoor':
                continue
            ll = self.latlng(n)
            if not ll or self.g.degree(n['id']) == 0:
                continue
            d = haversine(lat, lng, *ll)
            if best_d is None or d < best_d:
                best, best_d = n['id'], d
        if best is None or best_d > max_m:
            return None, best_d
        return best, best_d

    def near_spots(self, node_id, radius_m=8.0):
        """Các node cùng bản đồ trong bán kính đi bộ (để gộp phiếu nhận diện)."""
        if node_id not in self._near_cache:
            if node_id not in self.g:
                return {node_id}
            same = self.nodes[node_id]['map']
            sub = self.g.subgraph([n for n, d in self.nodes.items() if d['map'] == same])
            dist = nx.single_source_dijkstra_path_length(sub, node_id, cutoff=radius_m, weight='w')
            self._near_cache[node_id] = set(dist)
        return self._near_cache[node_id]

    # ---------- chỉ đường ----------
    def route(self, start, dest, dest_name=None, start_ll=None):
        path = nx.shortest_path(self.g, start, dest, weight='w')
        steps = self.steps(path, dest_name or self.nodes[dest]['label'])
        if start_ll:
            n0 = self.nodes[start]
            ll = self.latlng(n0)
            d = haversine(*start_ll, *ll) if ll else None
            if d and d > 8:
                where = 'lối đi gần nhất' if n0['label'] == 'Ngã rẽ' else n0['label']
                steps.insert(0, self._step('walk', f'Đi tới {where}', d, n0, approx=False))
        total = sum(s['meters'] for s in steps)
        return {'path': path, 'steps': steps, 'totalMeters': round(total),
                'estSeconds': round(total / 1.2)}

    def _step(self, kind, text, meters, target, approx, passes=None, side=None):
        ll = self.latlng(target)
        m = self.maps.get(target['map'], {})
        return {'kind': kind, 'text': text, 'meters': round(meters, 1), 'approx': approx,
                'mapKind': m.get('kind', 'outdoor'), 'building': m.get('building'),
                'target': {'node': target['id'], 'label': target['label'],
                           'lat': ll[0] if ll else None, 'lng': ll[1] if ll else None},
                'passes': passes or [], 'side': side}

    def _passes(self, nodes_on_step, direction, path_set):
        out = []
        for nid in nodes_on_step:
            a = self.nodes[nid]
            for nb in self.g.neighbors(nid):
                b = self.nodes[nb]
                if nb in path_set or b['type'] not in LANDMARK_TYPES or b['map'] != a['map']:
                    continue
                ang = self.angle(direction, self.vec(a, b))
                side = 'bên trái' if ang > 0 else 'bên phải'
                out.append({'name': b['label'], 'side': side})
                if len(out) >= 3:
                    return out
        return out

    def steps(self, path, dest_name):
        N = self.nodes
        path_set = set(path)
        steps = []
        cur = None  # bước đi bộ đang gộp

        def flush():
            nonlocal cur
            if cur:
                approx = not self.tf[cur['map']].geo
                verb = cur['verb']
                dist = self._fmt_m(cur['meters'], approx)
                if cur.get('arrive'):
                    text = f"{verb} {dist} — {cur['arrive']}"
                elif N[cur['to']]['label'] == 'Ngã rẽ':
                    text = f'{verb} {dist}'                # ngã rẽ không tên: không có mốc để nhắc
                else:
                    text = f"{verb} {dist} tới {N[cur['to']]['label']}"
                passes = self._passes(cur['nodes'][1:-1], cur['dir'], path_set)
                steps.append(self._step('walk', text, cur['meters'], N[cur['to']], approx, passes,
                                        side=cur.get('side')))
                cur = None

        last_i = len(path) - 2
        for i in range(len(path) - 1):
            a, b = N[path[i]], N[path[i + 1]]
            if a['map'] != b['map']:
                flush()
                bm, am = self.maps.get(b['map'], {}), self.maps.get(a['map'], {})
                if bm.get('kind') == 'indoor':
                    text = f"Vào {self.map_label(b['map'])} qua {self._door(b['label'])}"
                elif am.get('kind') == 'indoor':
                    text = f"Ra khỏi {self.map_label(a['map'])} qua {self._door(a['label'])}"
                else:
                    text = f"Đi qua {b['label']}"
                steps.append(self._step('door', text, 0, b, False))
                continue
            d = self.vec(a, b)
            length = self.g[a['id']][b['id']]['m']
            # phòng đích ở cạnh hành lang: nói bên trái/phải thay vì rẽ
            if i == last_i and b['type'] == 'room' and cur and cur['map'] == a['map'] and length < 15:
                ang = self.angle(cur['dir'], d)
                side = 'phía trước' if abs(ang) < 30 else ('bên trái' if ang > 0 else 'bên phải')
                cur['arrive'] = f'{dest_name} ở {side}'
                cur['side'] = side
                flush()
                break
            if cur and cur['map'] == a['map']:
                ang = self.angle(cur['dir'], d)
                # đoạn quá ngắn (< SHORT_STEP_M) không đáng thành một lần rẽ riêng: gộp tiếp
                if abs(ang) < TURN_DEG or cur['meters'] < SHORT_STEP_M:
                    cur['meters'] += length
                    cur['to'] = b['id']
                    cur['nodes'].append(b['id'])
                    cur['dir'] = d
                    continue
                flush()
                verb = ('Quay lại và đi' if abs(ang) >= BACK_DEG
                        else 'Rẽ trái và đi' if ang > 0 else 'Rẽ phải và đi')
            else:
                # đầu tuyến hoặc vừa qua cửa: chưa biết hướng người dùng đang nhìn
                verb = 'Đi'
            cur = {'map': a['map'], 'to': b['id'], 'meters': length, 'dir': d,
                   'nodes': [a['id'], b['id']], 'verb': verb}
        flush()
        if not steps or steps[-1].get('side') is None:
            steps.append(self._step('arrive', f'Bạn đã tới {dest_name}', 0, N[path[-1]], False))
        else:
            steps.append(self._step('arrive', f'Bạn đã tới {dest_name}', 0, N[path[-1]], False,
                                    side=steps[-1]['side']))
        return steps

    @staticmethod
    def _door(label):
        """'Cửa ra phía Tòa B' -> 'cửa phía Tòa B' (giữ hoa tên tòa); bỏ ghi chú '(bên phải)'."""
        label = re.sub(r'\s*\((?:bên trái|bên phải)\)', '', label)
        if label.startswith('Cửa ra '):
            return 'cửa ' + label[len('Cửa ra '):]
        return label[:1].lower() + label[1:] if label.startswith('Cửa') else label

    @staticmethod
    def _fmt_m(m, approx):
        m = max(1, round(m))
        return f'khoảng {m} m' if approx else f'{m} m'
