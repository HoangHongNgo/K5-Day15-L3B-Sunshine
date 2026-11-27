"""Supabase (PostgREST + Storage) bằng httpx. Chỉ chạy trong backend.

Cấu hình qua biến môi trường hoặc file `backend/.env` (đã bị gitignore):
    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_SERVICE_KEY=<secret key>      # khoá riêng, KHÔNG đưa vào frontend / Git / chat
Thiếu một trong hai thì backend chạy chế độ cục bộ (file trong backend/data/).

Mọi bảng đều bật RLS và không có policy: chỉ khoá service mới đọc/ghi được.
"""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote

import httpx

BACKEND = Path(__file__).resolve().parents[1]


def _load_env():
    p = BACKEND / '.env'
    if not p.exists():
        return
    for line in p.read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()
URL = (os.getenv('SUPABASE_URL') or '').strip().rstrip('/')
KEY = (os.getenv('SUPABASE_SERVICE_KEY') or '').strip()
ENABLED = bool(URL and KEY)


class SupabaseError(Exception):
    def __init__(self, status: int, code: str | None, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class Supa:
    def __init__(self):
        # Khoá mới (sb_secret_...) không phải JWT: chỉ gửi trong header apikey, cổng API tự đổi sang JWT nội bộ.
        # Khoá cũ (service_role, dạng JWT eyJ...) gửi cả hai header như trước.
        headers = {'apikey': KEY}
        if not KEY.startswith('sb_'):
            headers['Authorization'] = f'Bearer {KEY}'
        self.http = httpx.Client(base_url=URL, timeout=httpx.Timeout(60, connect=15), headers=headers)

    @staticmethod
    def _check(r: httpx.Response) -> httpx.Response:
        if r.status_code >= 400:
            try:
                body = r.json()
            except Exception:
                body = {}
            msg = (body.get('message') or body.get('error') or r.text[:200]) if isinstance(body, dict) else r.text[:200]
            raise SupabaseError(r.status_code, body.get('code') if isinstance(body, dict) else None, str(msg))
        return r

    def _send(self, method: str, url: str, **kw) -> httpx.Response:
        try:
            return self._check(self.http.request(method, url, **kw))
        except httpx.TransportError as e:
            raise SupabaseError(0, 'offline', f'Không kết nối được Supabase: {e.__class__.__name__}') from e

    # ---- database ----
    def rpc(self, fn: str, args: dict):
        return self._send('POST', f'/rest/v1/rpc/{fn}', json=args).json()

    def select(self, table: str, params: dict) -> list:
        return self._send('GET', f'/rest/v1/{table}', params=params).json()

    def insert(self, table: str, rows: list, returning: str | None = None, on_conflict: str | None = None):
        headers = {'Prefer': 'return=representation' if returning else 'return=minimal'}
        params = {}
        if returning:
            params['select'] = returning
        if on_conflict:
            params['on_conflict'] = on_conflict
            headers['Prefer'] += ',resolution=ignore-duplicates'
        r = self._send('POST', f'/rest/v1/{table}', json=rows, params=params, headers=headers)
        return r.json() if returning else None

    def delete(self, table: str, params: dict):
        self._send('DELETE', f'/rest/v1/{table}', params=params, headers={'Prefer': 'return=minimal'})

    # ---- storage (bucket riêng tư) ----
    def upload(self, bucket: str, path: str, data: bytes, content_type: str):
        self._send('POST', f'/storage/v1/object/{bucket}/{quote(path)}', content=data,
                   headers={'Content-Type': content_type, 'x-upsert': 'true'})

    def download(self, bucket: str, path: str) -> bytes | None:
        try:
            return self._send('GET', f'/storage/v1/object/authenticated/{bucket}/{quote(path)}').content
        except SupabaseError as e:
            if e.status in (400, 404):
                return None
            raise

    def remove(self, bucket: str, paths: list[str]):
        if paths:
            self._send('DELETE', f'/storage/v1/object/{bucket}', json={'prefixes': paths})


_client: Supa | None = None


def client() -> Supa:
    global _client
    if _client is None:
        _client = Supa()
    return _client
