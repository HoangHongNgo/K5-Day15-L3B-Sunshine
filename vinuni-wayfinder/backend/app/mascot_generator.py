"""Generate bounded 3D geometry as a preview for a signed-in event organizer."""
import json
import os
import time
import uuid
from collections import deque
from threading import Lock

import httpx
from fastapi import APIRouter, Body, Header, HTTPException

from .mascot_recipe import SHAPES, valid_recipe

ART_DIRECTION = """Design an original, cute, full-body 3D mascot from this organizer's brief.
You design the actual geometry, silhouette, face, clothing and accessories to match the requested species and theme.
Return the four mesh arrays required by the schema, with about 18 to 26 solid meshes in total.
Each part has EXACTLY these fields:
shape: ellipsoid, box, cone (tip up), cylinder (vertical), or torus (hole facing viewer).
Put each part in the appropriate group. Body includes head, legs, eyes, highlights and accessories.
Make expressive eyes, a contrasting mouth clearly visible on the FRONT surface, and attach arms/wings on opposite sides.
Color each part with color (six-digit #RRGGBB). Give each part three numeric arrays:
position [x,y,z] is the global CENTER. Feet at y=0, top around y=2.6, face front is +Z, rightArm on +X.
size [width,height,depth] is the FULL bounding size (not radius), each between 0.01 and 5 units.
rotation [x,y,z] is Euler rotation in DEGREES. Keep all positions within [-5,5] and rotations within [-360,360].
Sculpt one coherent figure. Place paired features symmetrically and overlap solid parts at joints.
Make the mouth a dedicated narrow dark oval or lower beak whose vertical scale can animate while speaking.
Use only numeric geometry and colors. No executable code, URLs or text labels."""


def vector_schema(low, high):
    return {'type': 'array', 'minItems': 3, 'maxItems': 3,
            'items': {'type': 'number', 'minimum': low, 'maximum': high}}


def object_schema(fields):
    return {'type': 'object', 'additionalProperties': False, 'required': list(fields), 'properties': fields}


PART_SCHEMA = object_schema({
    'shape': {'type': 'string', 'enum': list(SHAPES)},
    'color': {'type': 'string', 'pattern': '^#[a-fA-F0-9]{6}$'},
    'position': vector_schema(-5, 5), 'size': vector_schema(.01, 5), 'rotation': vector_schema(-360, 360),
})
OUTPUT_SCHEMA = object_schema({
    group: {'type': 'array', 'minItems': 1, 'maxItems': limit, 'items': {'$ref': '#/$defs/part'}}
    for group, limit in [('body', 30), ('rightArm', 7), ('leftArm', 7), ('mouth', 4)]
})
OUTPUT_SCHEMA['$defs'] = {'part': PART_SCHEMA}


def problem(status, code, message):
    return HTTPException(status, detail={'code': code, 'message': message})


def generate_preview(name: str, brief: str, club: str) -> dict:
    key = (os.getenv('OPENAI_API_KEY') or '').strip()
    if not key:
        raise problem(503, 'missing_key', 'Máy chủ chưa cấu hình OPENAI_API_KEY để tạo mascot 3D.')
    try:
        response = httpx.post('https://api.openai.com/v1/chat/completions',
                              headers={'Authorization': f'Bearer {key}'}, timeout=95,
                              json={
                                  'model': os.getenv('MASCOT_3D_MODEL') or 'gpt-4.1-mini',
                                  'messages': [{'role': 'system', 'content': ART_DIRECTION}, {'role': 'user', 'content': json.dumps(
                                      dict(name=name, brief=brief, club=club), ensure_ascii=False)}],
                                  'response_format': {'type': 'json_schema', 'json_schema': {
                                      'name': 'club_mascot_geometry', 'strict': True, 'schema': OUTPUT_SCHEMA}},
                                  'max_completion_tokens': 4800,
                              })
    except httpx.RequestError as exc:
        raise problem(502, 'provider_offline', 'Kết nối tạo mascot bị ngắt hoặc quá thời gian chờ.') from exc
    if response.status_code == 429:
        raise problem(429, 'provider_quota', 'OpenAI đang giới hạn lượt gọi hoặc tài khoản đã hết hạn mức.')
    if response.status_code != 200:
        raise problem(502, 'provider_error', f'OpenAI chưa hoàn tất yêu cầu tạo mascot (HTTP {response.status_code}).')
    try:
        groups = json.loads(response.json()['choices'][0]['message']['content'])
        recipe = {'version': 1, 'parts': [
            {**part, 'group': group} for group in OUTPUT_SCHEMA['required'] for part in groups[group]
        ]}
    except (ValueError, TypeError, KeyError, IndexError):
        recipe = None
    if not valid_recipe(recipe):
        raise problem(502, 'invalid_recipe', 'Thiết kế AI trả về chưa đủ hình khối để dựng và chuyển động.')
    return dict(id=str(uuid.uuid4()), name=name, brief=brief, kind='model3d', recipe=recipe)


def mascot_router(require_btc):
    router = APIRouter()
    # Preserve the demo's limit of three paid generation attempts per ten minutes, per server process.
    attempts = deque()
    lock = Lock()

    @router.post('/api/club-mascots/generate')
    def generate(body: dict = Body(...), authorization: str | None = Header(default=None)):
        require_btc(authorization)
        name, brief, club = (body.get(k, '') for k in ('name', 'brief', 'club'))
        if (not all(isinstance(x, str) for x in (name, brief, club)) or not 1 <= len(name.strip()) <= 40
                or not 15 <= len(brief.strip()) <= 600 or len(club) > 80):
            raise problem(422, 'invalid_brief', 'Nhập tên mascot và mô tả từ 15 đến 600 ký tự.')
        with lock:
            now = time.monotonic()
            while attempts and attempts[0] <= now - 600:
                attempts.popleft()
            if len(attempts) >= 3:
                raise problem(429, 'generation_limit', 'Bản thử đã dùng 3 lượt tạo trong 10 phút. Vui lòng thử lại sau.')
            attempts.append(now)
        return {'mascot': generate_preview(name.strip(), brief.strip(), club.strip())}

    return router
