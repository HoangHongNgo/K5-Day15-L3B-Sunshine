"""Staged chunked video uploads (<= 2 MiB binary chunks over same-origin /api/spots)."""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
import hashlib
from pathlib import Path
import re
import tempfile
import threading
import time
from typing import Callable

MAX_UPLOAD = 200 * 1024 * 1024
CHUNK_SIZE = 2 * 1024 * 1024
MAX_ACTIVE_UPLOADS = 8
UPLOAD_TTL_SECONDS = 900.0
COMPLETED_TTL_SECONDS = 3600.0
MAX_COMPLETED_UPLOADS = 128

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)
_SAFE_SUFFIX_RE = re.compile(r'^\.[A-Za-z0-9]{1,8}$')


class UploadError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def normalize_upload_id(raw: object) -> str:
    if not isinstance(raw, str) or not _UUID_RE.fullmatch(raw):
        raise UploadError(400, 'invalid_upload_id', 'Mã phiên tải video không hợp lệ')
    return raw.lower()


def normalize_suffix(filename: object) -> str:
    if filename is None or filename == '':
        return '.mp4'
    if not isinstance(filename, str):
        raise UploadError(400, 'invalid_metadata', 'Tên tệp video không hợp lệ')
    suffix = Path(filename).suffix.lower()
    return suffix if _SAFE_SUFFIX_RE.fullmatch(suffix) else '.mp4'


def validate_total_size(size: object, max_upload: int = MAX_UPLOAD) -> int:
    if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        raise UploadError(400, 'invalid_size', 'Kích thước video không hợp lệ')
    if size > max_upload:
        raise UploadError(413, 'too_large', 'Video quá lớn (tối đa 200 MiB)')
    return size


def total_parts_for(total_size: int, chunk_size: int) -> int:
    return (total_size + chunk_size - 1) // chunk_size


def expected_part_length(total_size: int, chunk_size: int, part: int) -> int:
    parts = total_parts_for(total_size, chunk_size)
    if part < 0 or part >= parts:
        raise UploadError(400, 'invalid_part', 'Chỉ số phần video không hợp lệ')
    if part < parts - 1:
        return chunk_size
    return total_size - part * chunk_size


@dataclass
class _UploadSession:
    node_id: str
    total_size: int
    chunk_size: int
    total_parts: int
    suffix: str
    tmp_path: Path | None
    updated_at: float
    next_part: int = 0
    received_bytes: int = 0
    part_digests: list[tuple[int, bytes]] = field(default_factory=list)
    completed_at: float | None = None
    job_id: str | None = None


class VideoUploadStore:
    """Thread-safe staging store for sequential sliced video uploads."""

    def __init__(
        self,
        *,
        chunk_size: int = CHUNK_SIZE,
        max_upload: int = MAX_UPLOAD,
        max_active: int = MAX_ACTIVE_UPLOADS,
        ttl_seconds: float = UPLOAD_TTL_SECONDS,
        completed_ttl_seconds: float = COMPLETED_TTL_SECONDS,
        max_completed: int = MAX_COMPLETED_UPLOADS,
        temp_dir: Path | None = None,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.chunk_size = chunk_size
        self.max_upload = max_upload
        self.max_active = max_active
        self.ttl_seconds = ttl_seconds
        self.completed_ttl_seconds = completed_ttl_seconds
        self.max_completed = max_completed
        self.temp_dir = Path(temp_dir) if temp_dir is not None else None
        self.clock = clock
        self._lock = threading.Lock()
        self._active: dict[str, _UploadSession] = {}
        self._completed: OrderedDict[str, _UploadSession] = OrderedDict()

    def prune(self) -> int:
        with self._lock:
            return self._prune_locked()

    def _prune_locked(self) -> int:
        now = self.clock()
        expired = [uid for uid, session in self._active.items()
                   if now - session.updated_at > self.ttl_seconds]
        for uid in expired:
            self._discard_locked(uid)

        for uid, session in list(self._completed.items()):
            if session.completed_at is not None and now - session.completed_at > self.completed_ttl_seconds:
                del self._completed[uid]
        return len(expired)

    def _discard_locked(self, uid: str) -> None:
        session = self._active.pop(uid)
        if session.tmp_path is not None:
            session.tmp_path.unlink(missing_ok=True)

    def cleanup_all(self) -> None:
        with self._lock:
            for uid in list(self._active):
                self._discard_locked(uid)
            self._completed.clear()

    def init_upload(
        self,
        node_id: str,
        raw_upload_id: object,
        total_size: object,
        filename: object = None,
    ) -> dict:
        uid = normalize_upload_id(raw_upload_id)
        size = validate_total_size(total_size, self.max_upload)
        suffix = normalize_suffix(filename)

        with self._lock:
            self._prune_locked()
            session = self._active.get(uid) or self._completed.get(uid)
            if session is None:
                if len(self._active) >= self.max_active:
                    raise UploadError(429, 'too_many_uploads',
                                      'Đang có quá nhiều video tải lên cùng lúc. Hãy thử lại sau ít phút.')
                try:
                    if self.temp_dir is not None:
                        self.temp_dir.mkdir(parents=True, exist_ok=True)
                    with tempfile.NamedTemporaryFile(
                        prefix='wf_vid_', suffix=suffix, dir=self.temp_dir, delete=False,
                    ) as tmp:
                        tmp_path = Path(tmp.name)
                except OSError as exc:
                    raise UploadError(500, 'staging_failed', 'Không thể khởi tạo vùng lưu tạm video') from exc
                session = _UploadSession(
                    node_id=node_id,
                    total_size=size,
                    chunk_size=self.chunk_size,
                    total_parts=total_parts_for(size, self.chunk_size),
                    suffix=suffix,
                    tmp_path=tmp_path,
                    updated_at=self.clock(),
                )
                self._active[uid] = session
            elif (session.node_id, session.total_size, session.suffix) != (node_id, size, suffix):
                raise UploadError(409, 'upload_conflict', 'Phiên tải video bị xung đột thông tin')

            if session.completed_at is None:
                session.updated_at = self.clock()
            result = {
                'ok': True,
                'uploadId': uid,
                'chunkSize': session.chunk_size,
                'parts': session.total_parts,
                'received': session.received_bytes,
                'nextPart': session.next_part,
            }
            if session.job_id is not None:
                result['job'] = session.job_id
            return result

    def put_chunk(
        self,
        node_id: str,
        raw_upload_id: object,
        part: int,
        data: bytes,
        enqueue: Callable[[str, str], str],
    ) -> tuple[int, dict]:
        uid = normalize_upload_id(raw_upload_id)
        if len(data) > self.chunk_size:
            raise UploadError(413, 'chunk_too_large', 'Mỗi phần video tối đa 2 MiB')
        digest = hashlib.sha256(data).digest()

        with self._lock:
            self._prune_locked()
            session = self._active.get(uid) or self._completed.get(uid)
            if session is None:
                raise UploadError(404, 'no_upload', 'Không tìm thấy phiên tải video hoặc đã hết hạn. Hãy tải lại.')
            if session.node_id != node_id:
                raise UploadError(409, 'upload_conflict', 'Phiên tải video không thuộc điểm này')
            if not isinstance(part, int) or isinstance(part, bool) or not 0 <= part < session.total_parts:
                raise UploadError(400, 'invalid_part', 'Chỉ số phần video không hợp lệ')
            if part > session.next_part:
                raise UploadError(409, 'chunk_gap', f'Thiếu phần video số {session.next_part}')

            if part < session.next_part:
                if session.part_digests[part] != (len(data), digest):
                    raise UploadError(409, 'chunk_conflict', 'Dữ liệu phần video không khớp với phần đã gửi trước đó')
            else:
                expected = expected_part_length(session.total_size, session.chunk_size, part)
                if len(data) != expected:
                    raise UploadError(400, 'invalid_chunk_size', 'Kích thước phần video không khớp')
                tmp_path = session.tmp_path
                assert tmp_path is not None  # Chỉ phiên đang nhận video mới có phần chưa ghi.
                try:
                    with tmp_path.open('r+b') as file:
                        file.seek(session.received_bytes)
                        file.write(data)
                except OSError as exc:
                    self._discard_locked(uid)
                    raise UploadError(500, 'staging_failed', 'Không thể lưu tạm dữ liệu video') from exc
                session.part_digests.append((len(data), digest))
                session.next_part += 1
                session.received_bytes += len(data)

                if session.next_part == session.total_parts:
                    try:
                        session.job_id = enqueue(node_id, str(tmp_path))
                    except Exception as exc:
                        self._discard_locked(uid)
                        raise UploadError(500, 'enqueue_failed', 'Không thể khởi chạy xử lý video') from exc
                    session.tmp_path = None
                    session.completed_at = self.clock()
                    del self._active[uid]
                    self._completed[uid] = session
                    while len(self._completed) > self.max_completed:
                        self._completed.popitem(last=False)

            if session.completed_at is None:
                session.updated_at = self.clock()
            result = {
                'ok': True,
                'uploadId': uid,
                'part': part,
                'nextPart': session.next_part,
                'received': session.received_bytes,
                'total': session.total_size,
            }
            if part == session.total_parts - 1 and session.job_id is not None:
                result['job'] = session.job_id
                return 202, result
            return 200, result
