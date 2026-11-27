"""Quản lý tài khoản & phiên đăng nhập BTC (`club_accounts`, `club_sessions`).

- Có SUPABASE_URL + SUPABASE_SERVICE_KEY: lưu trực tiếp trên Supabase (bật RLS, chỉ service key đọc/ghi).
- Thiếu cấu hình Supabase: dự phòng lưu JSON cục bộ trong `backend/data/auth.json`.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

USERNAME_RE = re.compile(r'^[a-z0-9_.-]{3,40}$')
PBKDF2_ITERATIONS = 120_000
SESSION_TTL_DAYS = 7


class ValidationError(ValueError):
    """Dữ liệu đăng ký / đăng nhập không hợp lệ."""


class ConflictError(ValueError):
    """Tên đăng nhập đã tồn tại."""


class AuthError(ValueError):
    """Thông tin đăng nhập không đúng."""


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts or not isinstance(ts, str):
        return None
    try:
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
    return f'pbkdf2_sha256${salt.hex()}${digest.hex()}'


def _verify_password(password: str, stored: str) -> bool:
    if not isinstance(password, str) or not isinstance(stored, str):
        return False
    parts = stored.split('$')
    if len(parts) != 3 or parts[0] != 'pbkdf2_sha256':
        return False
    try:
        salt = bytes.fromhex(parts[1])
        expected = parts[2]
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS).hex()
    return hmac.compare_digest(digest, expected)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _public_account(row: dict) -> dict:
    return {
        'id': row['id'],
        'username': row['username'],
        'displayName': row.get('display_name') if 'display_name' in row else row.get('displayName', ''),
        'clubName': row.get('club_name') if 'club_name' in row else row.get('clubName', ''),
        'role': row.get('role', 'clb'),
    }


class AuthStore:
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
                        'accounts': list(data.get('accounts') or []),
                        'sessions': list(data.get('sessions') or []),
                    }
            except Exception:
                pass
        return {'accounts': [], 'sessions': []}

    def _write_local(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(self.path)

    def _find_account_by_username(self, username: str) -> dict | None:
        if self.remote is not None:
            rows = self.remote.select('club_accounts', {'select': '*', 'username': f'eq.{username}'})
            return next((r for r in rows if r.get('username') == username), None)
        with self._lock:
            local = self._read_local()
            return next((a for a in local['accounts'] if a.get('username') == username), None)

    def _find_account_by_id(self, account_id: str) -> dict | None:
        if self.remote is not None:
            rows = self.remote.select('club_accounts', {'select': '*', 'id': f'eq.{account_id}'})
            return next((r for r in rows if r.get('id') == account_id), None)
        with self._lock:
            local = self._read_local()
            return next((a for a in local['accounts'] if a.get('id') == account_id), None)

    def _insert_account(self, row: dict) -> None:
        if self.remote is not None:
            self.remote.insert('club_accounts', [row])
            return
        with self._lock:
            local = self._read_local()
            if any(a.get('username') == row['username'] for a in local['accounts']):
                raise ConflictError('Tên đăng nhập này đã được sử dụng.')
            local['accounts'].append(row)
            self._write_local(local)

    def _create_session(self, account_id: str) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        now = _now_utc()
        expires_at = (now + timedelta(days=SESSION_TTL_DAYS)).isoformat()
        row = {
            'token_hash': token_hash,
            'account_id': account_id,
            'expires_at': expires_at,
            'created_at': now.isoformat(),
        }
        if self.remote is not None:
            self.remote.insert('club_sessions', [row])
            return token
        with self._lock:
            local = self._read_local()
            local['sessions'] = [
                s for s in local['sessions']
                if (exp := _parse_iso(s.get('expires_at'))) is not None and exp > now
            ]
            local['sessions'].append(row)
            self._write_local(local)
        return token

    def ensure_admin_from_env(self) -> dict | None:
        password = (os.getenv('BTC_ADMIN_PASSWORD') or '').strip()
        if not password:
            return None
        existing = self._find_account_by_username('admin')
        if existing is not None:
            return _public_account(existing)
        row = {
            'id': 'admin',
            'username': 'admin',
            'password_hash': _hash_password(password),
            'display_name': 'Ban Tổ Chức VinUni',
            'club_name': 'VinUniversity',
            'role': 'admin_truong',
            'created_at': _now_utc().isoformat(),
        }
        try:
            self._insert_account(row)
        except ConflictError:
            existing = self._find_account_by_username('admin')
            return _public_account(existing) if existing else None
        return _public_account(row)

    def register(
        self,
        username: str,
        password: str,
        display_name: str,
        club_name: str = '',
        role: str = 'clb',
    ) -> dict:
        if role != 'clb':
            raise ValidationError('Không thể tự đăng ký quyền quản trị trường qua cổng công khai.')
        uname = str(username or '').strip().lower()
        dname = str(display_name or '').strip()
        cname = str(club_name or '').strip()

        if not USERNAME_RE.match(uname):
            raise ValidationError('Tên đăng nhập gồm 3–40 ký tự chữ thường, số hoặc . _ -')
        if not isinstance(password, str) or len(password) < 6 or len(password) > 128:
            raise ValidationError('Mật khẩu phải có từ 6 đến 128 ký tự.')
        if not dname or len(dname) > 80:
            raise ValidationError('Tên hiển thị phải từ 1 đến 80 ký tự.')
        if len(cname) > 80:
            raise ValidationError('Tên câu lạc bộ tối đa 80 ký tự.')

        if self._find_account_by_username(uname) is not None:
            raise ConflictError('Tên đăng nhập này đã được sử dụng.')

        row = {
            'id': f'acc_{secrets.token_hex(8)}',
            'username': uname,
            'password_hash': _hash_password(password),
            'display_name': dname,
            'club_name': cname,
            'role': 'clb',
            'created_at': _now_utc().isoformat(),
        }
        self._insert_account(row)
        token = self._create_session(row['id'])
        return {'account': _public_account(row), 'token': token}

    def login(self, username: str, password: str) -> dict:
        uname = str(username or '').strip().lower()
        if not uname or not isinstance(password, str) or not password:
            raise AuthError('Sai tên đăng nhập hoặc mật khẩu.')
        account = self._find_account_by_username(uname)
        if account is None or not _verify_password(password, account.get('password_hash', '')):
            raise AuthError('Sai tên đăng nhập hoặc mật khẩu.')
        token = self._create_session(account['id'])
        return {'account': _public_account(account), 'token': token}

    def get_session(self, token: str | None) -> dict | None:
        if not token or not isinstance(token, str):
            return None
        token_hash = _hash_token(token.strip())
        now = _now_utc()

        if self.remote is not None:
            rows = self.remote.select('club_sessions', {'select': '*', 'token_hash': f'eq.{token_hash}'})
            session = next((r for r in rows if r.get('token_hash') == token_hash), None)
        else:
            with self._lock:
                local = self._read_local()
                session = next((s for s in local['sessions'] if s.get('token_hash') == token_hash), None)

        if session is None:
            return None
        expires_at = _parse_iso(session.get('expires_at'))
        if expires_at is None or expires_at <= now:
            self.logout(token)
            return None

        account = self._find_account_by_id(session.get('account_id', ''))
        return _public_account(account) if account is not None else None

    def logout(self, token: str | None) -> None:
        if not token or not isinstance(token, str):
            return
        token_hash = _hash_token(token.strip())
        if self.remote is not None:
            self.remote.delete('club_sessions', {'token_hash': f'eq.{token_hash}'})
            return
        with self._lock:
            local = self._read_local()
            local['sessions'] = [s for s in local['sessions'] if s.get('token_hash') != token_hash]
            self._write_local(local)
