import base64
import io
import json
import logging
import struct
import sys
import time
import wave
from pathlib import Path

import httpx
import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routing import SiteGraph

AZURE_FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'azure_speech'
OPENAI_FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'openai_responses'


def load_azure_fixture(name: str) -> dict:
    return json.loads((AZURE_FIXTURES / name).read_text(encoding='utf-8'))


def load_nav_fixture(name: str = 'voice_nav_directions.json') -> dict:
    return json.loads((OPENAI_FIXTURES / name).read_text(encoding='utf-8'))


def make_intent_payload(
    intent: str = 'directions',
    start_clue: str | None = None,
    destination_clue: str | None = None,
    *,
    status: str = 'completed',
    prefix_items: list[dict] | None = None,
) -> dict:
    payload = load_nav_fixture()
    payload['status'] = status
    message = payload['output'][0]
    message['content'] = [{
        'type': 'output_text',
        'text': json.dumps({
            'intent': intent,
            'startClue': start_clue,
            'destinationClue': destination_clue,
        }, ensure_ascii=False),
        'annotations': [],
    }]
    payload['output'] = [*(prefix_items or []), message]
    return payload


def make_wav(duration_s: float = 0.1, sample_rate: int = 16000, channels: int = 1, sampwidth: int = 2) -> bytes:
    frames = int(round(duration_s * sample_rate))
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sampwidth)
        wf.setframerate(sample_rate)
        wf.writeframes(b'\x00' * (frames * channels * sampwidth))
    return buf.getvalue()


def synthetic_site() -> dict:
    """Synthetic multi-building, multi-floor SiteGraph (never touches real maps or Supabase)."""
    return {
        'version': 1,
        'maps': [
            {'id': 'campus', 'name': 'Campus', 'kind': 'outdoor', 'image': '/maps/campus.webp',
             'width': 1000, 'height': 1000, 'metersPerPx': 0.5, 'anchors': []},
            {'id': 'I1', 'name': 'Tòa I – tầng 1', 'kind': 'indoor', 'building': 'Tòa I', 'floor': 1,
             'image': '/maps/i1.webp', 'width': 1000, 'height': 1000, 'metersPerPx': 0.05, 'anchors': []},
            {'id': 'C3', 'name': 'Tòa C – tầng 3', 'kind': 'indoor', 'building': 'Tòa C', 'floor': 3,
             'image': '/maps/c3.webp', 'width': 1000, 'height': 1000, 'metersPerPx': 0.05, 'anchors': []},
            {'id': 'C4', 'name': 'Tòa C – tầng 4', 'kind': 'indoor', 'building': 'Tòa C', 'floor': 4,
             'image': '/maps/c4.webp', 'width': 1000, 'height': 1000, 'metersPerPx': 0.05, 'anchors': []},
        ],
        'nodes': [
            # Outdoor campus
            {'id': 'gate_main', 'map': 'campus', 'x': 100, 'y': 500, 'type': 'entrance', 'label': 'Cổng chính'},
            {'id': 'out_j1', 'map': 'campus', 'x': 200, 'y': 500, 'type': 'hallway', 'label': 'Ngã rẽ'},
            {'id': 'i_door', 'map': 'campus', 'x': 200, 'y': 300, 'type': 'entrance', 'label': 'Cửa Tòa I'},
            {'id': 'c_door', 'map': 'campus', 'x': 400, 'y': 500, 'type': 'entrance', 'label': 'Cửa Tòa C'},
            # Building I floor 1
            {'id': 'i1_entry', 'map': 'I1', 'x': 100, 'y': 500, 'type': 'entrance', 'label': 'Sảnh Tòa I'},
            {'id': 'i1_h1', 'map': 'I1', 'x': 400, 'y': 500, 'type': 'hallway', 'label': 'Ngã rẽ'},
            {'id': 'i1_lib', 'map': 'I1', 'x': 400, 'y': 420, 'type': 'room', 'label': 'Thư viện'},
            {'id': 'i1_elev', 'map': 'I1', 'x': 600, 'y': 500, 'type': 'landmark', 'label': 'Thang máy'},
            # Building C floor 3
            {'id': 'c3_elev', 'map': 'C3', 'x': 600, 'y': 500, 'type': 'landmark', 'label': 'Thang máy'},
            {'id': 'c3_h1', 'map': 'C3', 'x': 400, 'y': 500, 'type': 'hallway', 'label': 'Hành lang tầng 3, Tòa C'},
            {'id': 'c3_h2', 'map': 'C3', 'x': 200, 'y': 500, 'type': 'hallway', 'label': 'Hành lang tầng 3, Tòa C'},
            {'id': 'c3_301', 'map': 'C3', 'x': 200, 'y': 420, 'type': 'room', 'label': 'Phòng C301'},
            {'id': 'c3_wc', 'map': 'C3', 'x': 500, 'y': 420, 'type': 'room', 'label': 'Nhà vệ sinh'},
            # Building C floor 4
            {'id': 'c4_elev', 'map': 'C4', 'x': 600, 'y': 500, 'type': 'landmark', 'label': 'Thang máy'},
            {'id': 'c4_h1', 'map': 'C4', 'x': 300, 'y': 500, 'type': 'hallway', 'label': 'Hành lang tầng 4, Tòa C'},
            {'id': 'c4_401', 'map': 'C4', 'x': 300, 'y': 420, 'type': 'room', 'label': 'Hội trường C401'},
            {'id': 'c4_wc', 'map': 'C4', 'x': 500, 'y': 420, 'type': 'room', 'label': 'Nhà vệ sinh'},
            # Disconnected island node for no-path testing
            {'id': 'iso_lab', 'map': 'I1', 'x': 900, 'y': 900, 'type': 'room', 'label': 'Phòng Lab Kín'},
        ],
        'edges': [
            {'a': 'gate_main', 'b': 'out_j1'},
            {'a': 'out_j1', 'b': 'i_door'},
            {'a': 'out_j1', 'b': 'c_door'},
            {'a': 'i_door', 'b': 'i1_entry', 'kind': 'door'},
            {'a': 'i1_entry', 'b': 'i1_h1'},
            {'a': 'i1_h1', 'b': 'i1_lib'},
            {'a': 'i1_h1', 'b': 'i1_elev'},
            {'a': 'c_door', 'b': 'c3_elev', 'kind': 'door'},
            {'a': 'c3_elev', 'b': 'c3_h1'},
            {'a': 'c3_h1', 'b': 'c3_h2'},
            {'a': 'c3_h2', 'b': 'c3_301'},
            {'a': 'c3_h1', 'b': 'c3_wc'},
            {'a': 'c3_elev', 'b': 'c4_elev'},
            {'a': 'c4_elev', 'b': 'c4_h1'},
            {'a': 'c4_h1', 'b': 'c4_401'},
            {'a': 'c4_h1', 'b': 'c4_wc'},
        ],
        'rooms': [
            {'id': 'lib', 'code': 'I101', 'name': 'Thư viện', 'node': 'i1_lib', 'aliases': ['Library', 'Thư viện chính']},
            {'id': 'C301', 'code': 'C301', 'name': 'Phòng C301', 'node': 'c3_301', 'aliases': ['301']},
            {'id': 'C401', 'code': 'C401', 'name': 'Hội trường C401', 'node': 'c4_401', 'aliases': ['401', 'C401']},
            {'id': 'wc_C3', 'code': '', 'name': 'Nhà vệ sinh', 'node': 'c3_wc', 'aliases': ['WC', 'toilet']},
            {'id': 'wc_C4', 'code': '', 'name': 'Nhà vệ sinh', 'node': 'c4_wc', 'aliases': ['WC', 'toilet']},
            {'id': 'iso_room', 'code': 'I999', 'name': 'Phòng Lab Kín', 'node': 'iso_lab', 'aliases': ['Lab kín']},
        ],
    }


@pytest.fixture
def graph() -> SiteGraph:
    return SiteGraph(synthetic_site())


@pytest.fixture
def nav_env(tmp_path, monkeypatch, graph):
    from app import event_voice, voice_navigation

    photos: dict[str, dict] = {}
    calls: list[dict] = []
    state = {'intent_payload': load_nav_fixture()}

    def provider(url, **kwargs):
        calls.append({'url': url, **kwargs})
        if 'openai.com' in url:
            return httpx.Response(200, request=httpx.Request('POST', url), json=state['intent_payload'])
        if '.tts.' in url:
            return httpx.Response(
                200, request=httpx.Request('POST', url),
                content=b'ID3-nav-voice', headers={'Content-Type': 'audio/mpeg'},
            )
        return httpx.Response(
            200, request=httpx.Request('POST', url),
            json=load_azure_fixture('recognition_success.json'),
        )

    monkeypatch.setenv('OPENAI_API_KEY', 'nav-openai-secret')
    monkeypatch.setenv('AZURE_SPEECH_KEY', 'nav-azure-secret')
    monkeypatch.setenv('AZURE_SPEECH_REGION', 'southeastasia')
    monkeypatch.setattr(event_voice.httpx, 'post', provider)
    monkeypatch.setattr(voice_navigation.httpx, 'post', provider)

    app = FastAPI()
    app.include_router(voice_navigation.voice_navigation_router(
        get_graph=lambda: graph,
        get_photo=lambda pid: photos.get(pid),
        get_quota_dir=lambda: tmp_path,
        photo_ttl=600,
    ))
    return TestClient(app), calls, photos, state, tmp_path


# ---------- 1. Unit tests: normalization & place resolution ----------

def test_normalize_vietnamese_speech_and_spaced_room_codes(graph):
    from app import voice_navigation

    assert voice_navigation.resolve_place(graph, 'phòng C 301').candidate.place_id == 'C301'
    assert voice_navigation.resolve_place(graph, 'c 3 0 1').candidate.place_id == 'C301'
    assert voice_navigation.resolve_place(graph, 'C-301').candidate.place_id == 'C301'
    assert voice_navigation.resolve_place(graph, 'Phòng C ba lẻ một').candidate.place_id == 'C301'
    assert voice_navigation.resolve_place(graph, 'thu vien').candidate.place_id == 'lib'
    assert voice_navigation.resolve_place(graph, 'I 101').candidate.place_id == 'lib'
    assert voice_navigation.resolve_place(graph, 'library').candidate.place_id == 'lib'
    assert voice_navigation.resolve_place(graph, 'Cổng chính').candidate.node_id == 'gate_main'


def test_resolve_named_landmark_with_building_and_floor(graph):
    from app import voice_navigation

    elev_c3 = voice_navigation.resolve_place(graph, 'Thang máy Tòa C tầng 3')
    assert elev_c3.status == 'resolved'
    assert elev_c3.candidate.node_id == 'c3_elev'

    elev_c4 = voice_navigation.resolve_place(graph, 'thang may tang bon toa c')
    assert elev_c4.status == 'resolved'
    assert elev_c4.candidate.node_id == 'c4_elev'

    wc_c3 = voice_navigation.resolve_place(graph, 'nhà vệ sinh tầng 3 tòa C')
    assert wc_c3.status == 'resolved'
    assert wc_c3.candidate.place_id == 'wc_C3'


def test_ambiguous_or_weak_clues_never_guess(graph):
    from app import voice_navigation

    for ambiguous in ('Thang máy', 'Nhà vệ sinh', 'Nhà vệ sinh tòa C', 'WC'):
        res = voice_navigation.resolve_place(graph, ambiguous)
        assert res.status == 'ambiguous', ambiguous
        assert len(res.candidates) >= 2

    for weak in ('Tòa C', 'phòng', 'cửa', 'tầng 3', 'Ngã rẽ'):
        res = voice_navigation.resolve_place(graph, weak)
        assert res.status != 'resolved', weak

    assert voice_navigation.resolve_place(graph, 'ở giữa Thư viện và Cổng chính').status == 'ambiguous'


def test_explicit_unknown_room_or_place_returns_not_found(graph):
    from app import voice_navigation

    for unknown in ('Phòng C999', 'C309', 'Quán cà phê Sao Hỏa', 'c3_301'):
        res = voice_navigation.resolve_place(graph, unknown)
        assert res.status == 'not_found', unknown


# ---------- 2. OpenAI GPT-6 Luna Responses strict JSON contract ----------

def test_directions_uses_gpt_6_luna_strict_json_and_real_site_graph_route(nav_env, graph):
    client, calls, _, _, _ = nav_env
    res = client.post('/api/voice/directions', json={'question': 'Từ phòng C 301 đến Thư viện đi thế nào?'})
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {'answer', 'route'}
    assert body['route'] == {
        'startId': 'C301',
        'startLabel': 'Phòng C301',
        'destinationId': 'lib',
    }
    expected_steps = [s['text'] for s in graph.route('c3_301', 'i1_lib', 'Thư viện')['steps'] if s['kind'] != 'arrive']
    assert expected_steps[0] in body['answer']
    assert expected_steps[1] in body['answer']
    assert body['answer'].index(expected_steps[0]) < body['answer'].index(expected_steps[1])
    assert 'liên kết' in body['answer'].lower() or 'xem đầy đủ' in body['answer'].lower()

    assert len(calls) == 1
    sent = calls[0]
    assert sent['url'] == 'https://api.openai.com/v1/responses'
    assert sent['headers']['Authorization'] == 'Bearer nav-openai-secret'
    req_json = sent['json']
    assert req_json['model'] == 'gpt-6-luna'
    assert req_json['store'] is False
    assert 'tools' not in req_json
    assert 'messages' not in req_json
    assert isinstance(req_json['max_output_tokens'], int) and 0 < req_json['max_output_tokens'] <= 250

    fmt = req_json['text']['format']
    assert fmt['type'] == 'json_schema'
    assert fmt['strict'] is True
    schema = fmt['schema']
    assert schema['type'] == 'object'
    assert schema['additionalProperties'] is False
    assert set(schema['required']) == {'intent', 'startClue', 'destinationClue'}
    assert set(schema['properties']['intent']['enum']) >= {'directions', 'position'}
    # Must NOT leak graph nodes/coordinates or accept model-invented node ids/turns
    assert 'c3_301' not in req_json['input']
    assert 'i1_lib' not in req_json['input']
    assert 'nodeId' not in json.dumps(schema)
    assert 'steps' not in json.dumps(schema)
    assert 'turns' not in json.dumps(schema)


def test_directions_rejects_model_invented_clue_not_in_question(nav_env):
    client, _, _, state, _ = nav_env
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue='c3_301',
        destination_clue='Thư viện',
    )
    res = client.post('/api/voice/directions', json={'question': 'Chỉ đường tới Thư viện'})
    assert res.status_code == 200
    body = res.json()
    assert 'route' not in body
    assert 'vị trí' in body['answer'].lower() or 'đứng' in body['answer'].lower()


def test_directions_supports_reasoning_item_and_masks_contacts(nav_env):
    client, calls, _, state, _ = nav_env
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue='C301',
        destination_clue='Thư viện',
        prefix_items=[{'id': 'rs_01', 'type': 'reasoning', 'summary': []}],
    )
    res = client.post('/api/voice/directions', json={
        'question': 'Từ C301 đến Thư viện, gọi 0901234567 hoặc mail user@vinuni.edu.vn?',
    })
    assert res.status_code == 200
    assert res.json()['route']['destinationId'] == 'lib'
    sent_input = calls[0]['json']['input']
    assert '0901234567' not in sent_input
    assert 'user@vinuni.edu.vn' not in sent_input


def test_directions_handles_refusal_and_other_intent(nav_env):
    client, _, _, state, _ = nav_env
    refusal = load_nav_fixture()
    refusal['output'][0]['content'] = [{'type': 'refusal', 'refusal': 'cannot help'}]
    state['intent_payload'] = refusal
    res = client.post('/api/voice/directions', json={'question': 'Hôm nay trời mấy độ?'})
    assert res.status_code == 200
    assert 'route' not in res.json()

    state['intent_payload'] = make_intent_payload(intent='other', start_clue=None, destination_clue=None)
    res2 = client.post('/api/voice/directions', json={'question': 'Kể chuyện cười đi'})
    assert res2.status_code == 200
    assert 'route' not in res2.json()


@pytest.mark.parametrize('behavior', [
    'http_500', 'timeout', 'status_failed', 'status_incomplete', 'bad_json', 'missing_output',
])
def test_directions_provider_failures_return_503_without_leaking_key(nav_env, monkeypatch, behavior):
    from app import voice_navigation

    client, _, _, _, _ = nav_env

    def failing(url, **kw):
        req = httpx.Request('POST', url)
        if behavior == 'http_500':
            return httpx.Response(500, request=req, text='error nav-openai-secret')
        if behavior == 'timeout':
            raise httpx.ReadTimeout('timeout nav-openai-secret', request=req)
        if behavior == 'status_failed':
            return httpx.Response(200, request=req, json=make_intent_payload(status='failed'))
        if behavior == 'status_incomplete':
            return httpx.Response(200, request=req, json=make_intent_payload(status='incomplete'))
        if behavior == 'bad_json':
            bad = load_nav_fixture()
            bad['output'][0]['content'] = [{'type': 'output_text', 'text': 'not-json'}]
            return httpx.Response(200, request=req, json=bad)
        return httpx.Response(200, request=req, json={'id': 'resp_1', 'status': 'completed', 'output': []})

    monkeypatch.setattr(voice_navigation.httpx, 'post', failing)
    res = client.post('/api/voice/directions', json={'question': 'Từ C301 đến Thư viện'})
    assert res.status_code == 503
    assert 'nav-openai-secret' not in res.text


# ---------- 3. Verified photo, freshness, tier, node check, conflict ----------

def test_verified_auto_photo_used_for_directions_and_position(nav_env):
    client, _, photos, state, _ = nav_env
    photos['p_auto'] = {'pred': 'c3_elev', 'tier': 'auto', 't': time.time()}

    # Directions using verified photo + default destinationId
    state['intent_payload'] = make_intent_payload(intent='directions', start_clue=None, destination_clue=None)
    res = client.post('/api/voice/directions', json={
        'question': 'Chỉ đường giúp mình tới đó',
        'photoId': 'p_auto',
        'destinationId': 'C401',
    })
    assert res.status_code == 200
    body = res.json()
    assert body['route'] == {
        'startId': 'c3_elev',
        'startLabel': 'Thang máy (Tòa C, tầng 3)',
        'destinationId': 'C401',
    }
    assert 'tầng 4' in body['answer'].lower()

    # Position-only intent using verified photo
    state['intent_payload'] = make_intent_payload(intent='position', start_clue=None, destination_clue=None)
    pos = client.post('/api/voice/directions', json={'question': 'Tôi đang ở đâu?', 'photoId': 'p_auto'})
    assert pos.status_code == 200
    pos_body = pos.json()
    assert 'route' not in pos_body
    assert 'Thang máy' in pos_body['answer']
    assert 'Tòa C' in pos_body['answer']
    assert 'tầng 3' in pos_body['answer'].lower()


@pytest.mark.parametrize('photo_record', [
    None,
    {'pred': 'c3_elev', 'tier': 'picker', 't': time.time()},
    {'pred': 'c3_elev', 'tier': 'second', 't': time.time()},
    {'pred': 'c3_elev', 't': time.time()},  # missing tier
    {'pred': 'c3_elev', 'tier': 'auto', 't': time.time() - 601},  # expired
    {'pred': 'deleted_node_99', 'tier': 'auto', 't': time.time()},  # not in current graph
])
def test_unverified_expired_or_stale_photo_is_rejected(nav_env, photo_record):
    client, _, photos, state, _ = nav_env
    if photo_record is not None:
        photos['p_bad'] = photo_record
    state['intent_payload'] = make_intent_payload(intent='directions', start_clue=None, destination_clue='C401')
    res = client.post('/api/voice/directions', json={
        'question': 'Chỉ đường tới C401',
        'photoId': 'p_bad',
    })
    assert res.status_code == 200
    body = res.json()
    assert 'route' not in body
    assert 'ảnh' in body['answer'].lower() or 'mốc' in body['answer'].lower()


def test_spoken_and_verified_photo_disagreement_clarifies_conflict(nav_env):
    client, _, photos, state, _ = nav_env
    photos['p_c3'] = {'pred': 'c3_301', 'tier': 'auto', 't': time.time()}
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue='Thư viện',
        destination_clue='C401',
    )
    res = client.post('/api/voice/directions', json={
        'question': 'Mình đang ở Thư viện, chỉ đường tới C401',
        'photoId': 'p_c3',
    })
    assert res.status_code == 200
    body = res.json()
    assert 'route' not in body
    assert 'Phòng C301' in body['answer']
    assert 'Thư viện' in body['answer']


def test_spoken_and_verified_photo_agreement_routes_normally(nav_env):
    client, _, photos, state, _ = nav_env
    photos['p_c3'] = {'pred': 'c3_301', 'tier': 'auto', 't': time.time()}
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue='Phòng C 301',
        destination_clue='C401',
    )
    res = client.post('/api/voice/directions', json={
        'question': 'Mình đang ở Phòng C 301, chỉ đường tới C401',
        'photoId': 'p_c3',
    })
    assert res.status_code == 200
    body = res.json()
    assert body['route']['destinationId'] == 'C401'


# ---------- 4. Explicit unknown/ambiguous destination never falls back to default ----------

def test_explicit_unknown_destination_never_uses_default_destination_id(nav_env):
    client, _, photos, state, _ = nav_env
    photos['p_c3'] = {'pred': 'c3_301', 'tier': 'auto', 't': time.time()}
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue=None,
        destination_clue='Phòng Z999',
    )
    res = client.post('/api/voice/directions', json={
        'question': 'Chỉ đường tới Phòng Z999',
        'photoId': 'p_c3',
        'destinationId': 'lib',
    })
    assert res.status_code == 200
    body = res.json()
    assert 'route' not in body
    assert 'Z999' in body['answer'] or 'chưa tìm thấy' in body['answer'].lower()


def test_ambiguous_destination_asks_for_more_specific_landmark_without_default_fallback(nav_env):
    client, _, photos, state, _ = nav_env
    photos['p_c3'] = {'pred': 'c3_301', 'tier': 'auto', 't': time.time()}
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue=None,
        destination_clue='Thang máy',
    )
    res = client.post('/api/voice/directions', json={
        'question': 'Chỉ đường tới Thang máy',
        'photoId': 'p_c3',
        'destinationId': 'lib',
    })
    assert res.status_code == 200
    body = res.json()
    assert 'route' not in body
    assert 'tòa' in body['answer'].lower() or 'tầng' in body['answer'].lower() or 'cụ thể' in body['answer'].lower()


# ---------- 5. Routing edge cases: already there & no path ----------

def test_already_there_returns_friendly_answer_without_route(nav_env):
    client, _, _, state, _ = nav_env
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue='C301',
        destination_clue='phòng C 301',
    )
    res = client.post('/api/voice/directions', json={'question': 'Từ C301 đi tới phòng C 301'})
    assert res.status_code == 200
    body = res.json()
    assert 'route' not in body
    assert 'ngay' in body['answer'].lower() or 'đã ở' in body['answer'].lower()


def test_no_path_returns_friendly_answer_without_route(nav_env):
    client, _, _, state, _ = nav_env
    state['intent_payload'] = make_intent_payload(
        intent='directions',
        start_clue='C301',
        destination_clue='Phòng Lab Kín',
    )
    res = client.post('/api/voice/directions', json={'question': 'Từ C301 đi tới Phòng Lab Kín'})
    assert res.status_code == 200
    body = res.json()
    assert 'route' not in body
    assert 'chưa có đường' in body['answer'].lower()


# ---------- 6. TTS, validation, quotas, and /api/voice/transcribe ----------

def test_directions_voice_1_synthesizes_answer_with_hoai_my_and_survives_tts_failure(nav_env, monkeypatch):
    from app import event_voice

    client, calls, _, _, _ = nav_env
    res = client.post('/api/voice/directions?voice=1', json={'question': 'Từ phòng C 301 đến Thư viện?'})
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {'answer', 'audioBase64', 'route'}
    assert base64.b64decode(body['audioBase64']) == b'ID3-nav-voice'
    tts = calls[1]
    assert tts['url'] == 'https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1'
    ssml = tts['content'].decode('utf-8')
    assert 'vi-VN-HoaiMyNeural' in ssml
    assert 'xml:lang="vi-VN"' in ssml

    # TTS failure keeps 200 response readable without audioBase64
    orig_post = event_voice.httpx.post

    def failing_tts(url, **kw):
        if '.tts.' in url:
            return httpx.Response(503, request=httpx.Request('POST', url))
        return orig_post(url, **kw)

    monkeypatch.setattr(event_voice.httpx, 'post', failing_tts)
    res2 = client.post('/api/voice/directions?voice=1', json={'question': 'Từ phòng C 301 đến Thư viện?'})
    assert res2.status_code == 200
    assert set(res2.json()) == {'answer', 'route'}


@pytest.mark.parametrize('payload', [
    {'question': '   '},
    {'question': 'a' * 501},
    {'question': 'Từ C301 đến Thư viện', 'nodes': ['c3_301']},
    {'question': 'Từ C301 đến Thư viện', 'photoId': 123},
    {'question': 'Từ C301 đến Thư viện', 'destinationId': ['lib']},
    {'photoId': 'p_1'},
])
def test_directions_rejects_invalid_payloads_without_provider_call(nav_env, payload):
    client, calls, _, _, _ = nav_env
    assert client.post('/api/voice/directions', json=payload).status_code == 422
    assert calls == []


def test_directions_rejects_oversized_body_and_missing_key_and_enforces_quota(nav_env, monkeypatch):
    from app import event_voice

    client, calls, _, _, tmp_path = nav_env
    assert client.post('/api/voice/directions', content=b' ' * 5000).status_code == 413
    assert calls == []

    monkeypatch.delenv('OPENAI_API_KEY')
    assert client.post('/api/voice/directions', json={'question': 'Từ C301 đến Thư viện'}).status_code == 503
    assert calls == []

    monkeypatch.setenv('OPENAI_API_KEY', 'nav-openai-secret')
    monkeypatch.setattr(event_voice, 'HOURLY_LIMIT', 2)
    for code in (200, 200, 429):
        assert client.post('/api/voice/directions', json={'question': 'Từ phòng C 301 đến Thư viện'}).status_code == code
    assert len(calls) == 2
    assert (tmp_path / 'event-voice-quota.sqlite3').exists()


def test_voice_transcribe_reuses_canonical_wav_validation_azure_and_quota(nav_env, monkeypatch, caplog):
    from app import event_voice

    client, calls, _, _, tmp_path = nav_env
    wav = make_wav(duration_s=0.25)
    res = client.post('/api/voice/transcribe', content=wav, headers={'Content-Type': 'audio/wav'})
    assert res.status_code == 200
    assert res.json() == {'transcript': 'Trạm đầu tiên ở đâu?'}
    assert len(calls) == 1
    assert 'southeastasia.stt.speech.microsoft.com' in calls[0]['url']
    assert (tmp_path / 'event-voice-stt-quota.sqlite3').exists()

    # Exact 30s WAV accepted
    assert client.post('/api/voice/transcribe', content=make_wav(duration_s=30.0),
                       headers={'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'}).status_code == 200

    # Validation errors without calling Azure
    before = len(calls)
    assert client.post('/api/voice/transcribe', content=wav, headers={'Content-Type': 'audio/webm'}).status_code == 415
    assert client.post('/api/voice/transcribe', content=make_wav(sample_rate=44100),
                       headers={'Content-Type': 'audio/wav'}).status_code == 422
    assert client.post('/api/voice/transcribe', content=make_wav(duration_s=30.1),
                       headers={'Content-Type': 'audio/wav'}).status_code == 422
    assert client.post('/api/voice/transcribe', content=b'\x00' * (1024 * 1024 + 64),
                       headers={'Content-Type': 'audio/wav'}).status_code == 413
    assert len(calls) == before

    # Quota enforced on STT separately
    monkeypatch.setattr(event_voice, 'HOURLY_LIMIT', 2)
    assert client.post('/api/voice/transcribe', content=wav, headers={'Content-Type': 'audio/wav'}).status_code == 429

    # Provider failure returns 503 without leaking Azure key
    monkeypatch.setattr(event_voice, 'HOURLY_LIMIT', 10)
    monkeypatch.setattr(event_voice.httpx, 'post', lambda url, **kw: httpx.Response(
        500, request=httpx.Request('POST', url), text='boom nav-azure-secret'))
    with caplog.at_level(logging.WARNING, logger=event_voice.__name__):
        fail_res = client.post('/api/voice/transcribe', content=wav, headers={'Content-Type': 'audio/wav'})
    assert fail_res.status_code == 503
    assert 'nav-azure-secret' not in fail_res.text
    assert all('nav-azure-secret' not in rec.getMessage() for rec in caplog.records)


# ---------- 7. Integration with app.main: locate stores tier & routes are mounted ----------

def test_main_locate_saves_tier_in_photos_and_mounts_voice_routes(monkeypatch, graph):
    monkeypatch.setattr('app.supa.ENABLED', False)
    from app import main

    class FakeIndex:
        def __len__(self):
            return 10

        def sync_if_stale(self, _):
            pass

        def vote(self, q, k):
            return {'c3_301': {'votes': 9.0, 'sim': 0.92, 'nearest': True}}, 0.92

    monkeypatch.setattr(main, 'index', FakeIndex())
    monkeypatch.setattr(main, 'embedder', lambda imgs: np.ones((len(imgs), 4), dtype=np.float32))
    monkeypatch.setattr(main, 'graph', lambda: graph)
    monkeypatch.setattr(main, '_photos', {})

    buf = io.BytesIO()
    Image.new('RGB', (16, 16), (255, 255, 255)).save(buf, format='JPEG')
    client = TestClient(main.app)
    res = client.post('/api/locate', files={'image': ('shot.jpg', buf.getvalue(), 'image/jpeg')})
    assert res.status_code == 200
    data = res.json()
    pid = data['photoId']
    assert data['tier'] == 'auto'
    assert main._photos[pid]['tier'] == 'auto'
    assert main._photos[pid]['pred'] == 'c3_301'

    paths = set(main.app.openapi()['paths'])
    assert '/api/voice/directions' in paths
    assert '/api/voice/transcribe' in paths
    assert '/api/events/{event_id}/ask' in paths
    assert '/api/events/{event_id}/transcribe' in paths
