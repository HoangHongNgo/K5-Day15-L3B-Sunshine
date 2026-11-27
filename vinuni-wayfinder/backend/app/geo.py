"""Toạ độ: mỗi bản đồ (campus, mặt bằng tòa) dùng pixel của ảnh riêng.

Neo GPS (anchor) = cặp (pixel, lat/lng). Với >= 2 neo, khớp phép đồng dạng
(tỉ lệ + xoay + tịnh tiến) pixel -> mét cục bộ (Đông, Bắc) bằng bình phương tối thiểu
trên số phức. Chưa đủ neo thì chỉ dùng `metersPerPx` ước tính để tính khoảng cách.
"""
from __future__ import annotations

import math

R_EARTH = 6371008.8


def ll_to_en(lat, lng, lat0, lng0):
    """lat/lng -> mét (Đông, Bắc) quanh gốc (lat0, lng0)."""
    e = math.radians(lng - lng0) * R_EARTH * math.cos(math.radians(lat0))
    n = math.radians(lat - lat0) * R_EARTH
    return e, n


def en_to_ll(e, n, lat0, lng0):
    lat = lat0 + math.degrees(n / R_EARTH)
    lng = lng0 + math.degrees(e / (R_EARTH * math.cos(math.radians(lat0))))
    return lat, lng


def haversine(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


class MapTransform:
    """pixel <-> lat/lng cho một bản đồ."""

    def __init__(self, map_def: dict):
        self.id = map_def['id']
        self.meters_per_px = float(map_def.get('metersPerPx') or 0.1)
        anchors = [a for a in map_def.get('anchors', [])
                   if all(k in a for k in ('x', 'y', 'lat', 'lng'))]
        self.geo = len(anchors) >= 2
        self.residual_m = None
        if not self.geo:
            return
        self.lat0, self.lng0 = anchors[0]['lat'], anchors[0]['lng']
        src = [complex(a['x'], -a['y']) for a in anchors]           # y ảnh hướng xuống -> đảo dấu
        dst = [complex(*ll_to_en(a['lat'], a['lng'], self.lat0, self.lng0)) for a in anchors]
        n = len(src)
        ms, md = sum(src) / n, sum(dst) / n
        num = sum((d - md) * (s - ms).conjugate() for s, d in zip(src, dst))
        den = sum(abs(s - ms) ** 2 for s in src)
        if den == 0:
            self.geo = False
            return
        self.a = num / den
        self.b = md - self.a * ms
        self.meters_per_px = abs(self.a)
        if n > 2:
            errs = [abs(self.a * s + self.b - d) for s, d in zip(src, dst)]
            self.residual_m = round(math.sqrt(sum(e * e for e in errs) / n), 2)

    def to_ll(self, x, y):
        if not self.geo:
            return None
        z = self.a * complex(x, -y) + self.b
        return en_to_ll(z.real, z.imag, self.lat0, self.lng0)

    def to_px(self, lat, lng):
        if not self.geo:
            return None
        z = (complex(*ll_to_en(lat, lng, self.lat0, self.lng0)) - self.b) / self.a
        return z.real, -z.imag

    def info(self):
        return {'geo': self.geo, 'metersPerPx': round(self.meters_per_px, 4),
                'residualM': self.residual_m}
