import base64
import io
import json
import logging
import struct
import sys
import wave
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.events_store import EventsStore

FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'azure_speech'
OPENAI_FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'openai_responses'


def load_azure_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


def load_openai_fixture(name: str = 'answer_success.json') -> dict:
    return json.loads((OPENAI_FIXTURES / name).read_text(encoding='utf-8'))


def make_responses_payload(content_item: dict, *, status: str = 'completed', prefix_items: list[dict] | None = None) -> dict:
    payload = load_openai_fixture('answer_success.json')
    payload['status'] = status
    message = payload['output'][0]
    message['content'] = [content_item]
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


@pytest.fixture
def voice(tmp_path, monkeypatch):
    from app import event_voice
    store = EventsStore(tmp_path / 'events.json')
    common = dict(title='Ngày hội Mây', club='CLB Mây', description='Thử làm diều.',
                  locationId='room1', startsAt='2026-12-05T04:30:00Z', endsAt='2026-12-05T06:00:00Z',
                  stops=[dict(id='s1', label='Gấp diều', locationId='room2', note='Nhận giấy & xem <mẫu>.')])
    store.save_event(dict(common, id='may', status='published'), actor={'id': 'owner-private'})
    store.save_event(dict(common, id='nhap', status='draft', title='Sự kiện nội bộ'))
    calls = []

    def provider(url, *, headers, json, timeout):
        calls.append({'url': url, 'headers': headers, 'json': json, 'timeout': timeout})
        return httpx.Response(200, request=httpx.Request('POST', url), json=load_openai_fixture())

    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    monkeypatch.delenv('AZURE_SPEECH_KEY', raising=False)
    monkeypatch.delenv('AZURE_SPEECH_REGION', raising=False)
    monkeypatch.setattr(event_voice.httpx, 'post', provider)
    app = FastAPI()
    app.include_router(event_voice.event_voice_router(
        lambda: store, lambda: {'room1': 'Sảnh Mây', 'room2': 'Sân hoa'}))
    return TestClient(app), calls


@pytest.fixture
def stt(tmp_path, monkeypatch):
    from app import event_voice
    store = EventsStore(tmp_path / 'events.json')
    common = dict(title='Ngày hội Mây', club='CLB Mây', description='Thử làm diều.',
                  locationId='room1', startsAt='2026-12-05T04:30:00Z', endsAt='2026-12-05T06:00:00Z',
                  stops=[dict(id='s1', label='Gấp diều', locationId='room2', note='Nhận giấy & xem <mẫu>.')])
    store.save_event(dict(common, id='may', status='published'), actor={'id': 'owner-private'})
    store.save_event(dict(common, id='nhap', status='draft', title='Sự kiện nội bộ'))
    calls = []

    def provider(url, **kwargs):
        calls.append({'url': url, **kwargs})
        if 'openai.com' in url:
            return httpx.Response(200, request=httpx.Request('POST', url), json=load_openai_fixture())
        if '.tts.' in url:
            return httpx.Response(200, request=httpx.Request('POST', url),
                                  content=b'ID3-answer', headers={'Content-Type': 'audio/mpeg'})
        return httpx.Response(200, request=httpx.Request('POST', url),
                              json=load_azure_fixture('recognition_success.json'))

    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    monkeypatch.setenv('AZURE_SPEECH_KEY', 'azure-test-key')
    monkeypatch.setenv('AZURE_SPEECH_REGION', 'southeastasia')
    monkeypatch.setattr(event_voice.httpx, 'post', provider)
    app = FastAPI()
    app.include_router(event_voice.event_voice_router(
        lambda: store, lambda: {'room1': 'Sảnh Mây', 'room2': 'Sân hoa'}))
    return TestClient(app), calls, tmp_path


def test_answer_uses_responses_api_with_gpt_6_luna_and_published_facts(voice):
    from app import event_voice
    client, calls = voice
    result = client.post('/api/events/may/ask', json={'question': 'Trạm đầu có gì?'})
    assert result.status_code == 200
    assert result.json() == {
        'answer': 'Trạm đầu tiên là Gấp diều tại Sân hoa, bạn có thể nhận giấy & xem <mẫu> ở đó.',
    }
    assert len(calls) == 1
    call = calls[0]
    assert call['url'] == 'https://api.openai.com/v1/responses'
    assert call['headers']['Authorization'] == 'Bearer test-only'
    body = call['json']
    assert body['model'] == 'gpt-6-luna'
    assert body['store'] is False
    assert 'tools' not in body
    assert 'messages' not in body
    assert isinstance(body['max_output_tokens'], int) and 0 < body['max_output_tokens'] <= 300

    fmt = body['text']['format']
    assert fmt['type'] == 'json_schema'
    assert fmt['strict'] is True
    schema = fmt['schema']
    assert schema['type'] == 'object'
    assert schema['additionalProperties'] is False
    assert set(schema['required']) == {'answer', 'facts'}
    assert schema['properties']['answer']['type'] == 'string'
    assert schema['properties']['facts']['type'] == 'array'
    assert schema['properties']['facts']['items']['type'] == 'string'

    instructions = body['instructions']
    assert 'tiếng Việt' in instructions
    assert 'facts' in instructions
    assert event_voice.UNKNOWN in instructions
    assert 'bỏ qua' in instructions.lower()

    sent_input = json.loads(body['input'])
    assert sent_input['question'] == 'Trạm đầu có gì?'
    sent_facts = json.dumps(sent_input['facts'], ensure_ascii=False)
    assert '11:30' in sent_facts and '05/12/2026' in sent_facts
    assert 'Sảnh Mây' in sent_facts and 'Gấp diều' in sent_facts
    assert 'owner-private' not in body['input'] and 'Sự kiện nội bộ' not in body['input']


def test_answer_supports_reasoning_item_before_message_in_responses_output(voice, monkeypatch):
    from app import event_voice
    client, _ = voice
    payload = make_responses_payload(
        {'type': 'output_text', 'text': json.dumps({'answer': 'Sự kiện diễn ra tại Sảnh Mây.', 'facts': ['location']}), 'annotations': []},
        prefix_items=[{'id': 'rs_01', 'type': 'reasoning', 'summary': []}],
    )
    monkeypatch.setattr(event_voice.httpx, 'post', lambda url, **kw: httpx.Response(
        200, request=httpx.Request('POST', url), json=payload))
    res = client.post('/api/events/may/ask', json={'question': 'Sự kiện tổ chức ở đâu?'})
    assert res.status_code == 200
    assert res.json() == {'answer': 'Sự kiện diễn ra tại Sảnh Mây.'}


def test_answer_synthesizes_only_the_reply_in_a_vietnamese_voice(stt):
    client, calls, _ = stt
    reply = client.post('/api/events/may/ask?voice=1', json={'question': 'Trạm đầu ở đâu?'})
    assert reply.status_code == 200
    assert set(reply.json()) == {'answer', 'audioBase64'}
    assert base64.b64decode(reply.json()['audioBase64']) == b'ID3-answer'
    tts = calls[1]
    assert tts['url'] == 'https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1'
    assert tts['headers']['X-Microsoft-OutputFormat'] == 'audio-24khz-48kbitrate-mono-mp3'
    ssml = tts['content'].decode()
    assert 'xml:lang="vi-VN"' in ssml and 'name="vi-VN-HoaiMyNeural"' in ssml
    assert 'nhận giấy &amp; xem &lt;mẫu&gt; ở đó.' in ssml
    assert 'Trạm đầu ở đâu?' not in ssml


def test_answer_remains_readable_if_synthesis_fails(stt, monkeypatch):
    from app import event_voice
    client, calls, _ = stt
    forward = event_voice.httpx.post

    def failing(url, **kwargs):
        if '.tts.' in url:
            calls.append({'url': url})
            return httpx.Response(503, request=httpx.Request('POST', url))
        return forward(url, **kwargs)

    monkeypatch.setattr(event_voice.httpx, 'post', failing)
    reply = client.post('/api/events/may/ask?voice=1', json={'question': 'Trạm đầu ở đâu?'})
    assert reply.status_code == 200
    assert set(reply.json()) == {'answer'}
    assert 'Sân hoa' in reply.json()['answer']
    assert len(calls) == 2
    assert client.post('/api/events/nhap/ask?voice=1', json={'question': 'Ở đâu?'}).status_code == 404
    assert len(calls) == 2


@pytest.mark.parametrize('event_id', ['nhap', 'unknown'])
def test_reject_unpublished_or_unknown_without_model_call(voice, event_id):
    client, calls = voice
    assert client.post(f'/api/events/{event_id}/ask', json={'question': 'Ai tổ chức?'}).status_code == 404
    assert calls == []


@pytest.mark.parametrize('body', [{'question': ' '}, {'question': 'a' * 501},
                                  {'question': 'Ở đâu?', 'event': {'status': 'published'}}])
def test_reject_invalid_questions_and_client_context(voice, body):
    client, calls = voice
    assert client.post('/api/events/may/ask', json=body).status_code == 422
    assert calls == []


def test_reject_oversized_raw_request(voice):
    client, calls = voice
    assert client.post('/api/events/may/ask', content=b' ' * 9000).status_code == 413
    assert calls == []


@pytest.mark.parametrize('response_payload', [
    make_responses_payload({'type': 'output_text', 'text': json.dumps({'answer': 'Giá vé 200 nghìn.', 'facts': ['ticket_price']}), 'annotations': []}),
    make_responses_payload({'type': 'output_text', 'text': json.dumps({'answer': 'Ở Sân hoa, vé 200 nghìn.', 'facts': ['stop1', 'ticket_price']}), 'annotations': []}),
    make_responses_payload({'type': 'output_text', 'text': json.dumps({'answer': 'Giá vé 200 nghìn.', 'facts': []}), 'annotations': []}),
    make_responses_payload({'type': 'output_text', 'text': json.dumps({'answer': 'Giá vé 200 nghìn.', 'facts': 'stop1'}), 'annotations': []}),
    make_responses_payload({'type': 'output_text', 'text': json.dumps({'answer': 'Giá vé 200 nghìn.', 'facts': [123]}), 'annotations': []}),
    make_responses_payload({'type': 'output_text', 'text': json.dumps({'answer': '   ', 'facts': ['stop1']}), 'annotations': []}),
    make_responses_payload({'type': 'refusal', 'refusal': 'I cannot help with that request.'}),
])
def test_unsupported_evidence_or_refusal_returns_unknown(voice, monkeypatch, response_payload):
    from app import event_voice
    client, _ = voice
    monkeypatch.setattr(event_voice.httpx, 'post', lambda url, **kw: httpx.Response(
        200, request=httpx.Request('POST', url), json=response_payload))
    res = client.post('/api/events/may/ask', json={'question': 'Giá vé?'})
    assert res.status_code == 200
    assert res.json() == {'answer': event_voice.UNKNOWN}


@pytest.mark.parametrize('behavior', [
    'http_500',
    'timeout',
    'status_failed',
    'status_incomplete',
    'bad_json_output',
    'missing_output',
])
def test_responses_provider_failures_return_503_without_leaking_key(voice, monkeypatch, behavior):
    from app import event_voice
    client, _ = voice

    def failing(url, **kw):
        req = httpx.Request('POST', url)
        if behavior == 'http_500':
            return httpx.Response(500, request=req, text='error test-only')
        if behavior == 'timeout':
            raise httpx.ReadTimeout('timeout test-only', request=req)
        if behavior == 'status_failed':
            return httpx.Response(200, request=req, json=make_responses_payload(
                {'type': 'output_text', 'text': '{"answer":"a","facts":["stop1"]}'}, status='failed'))
        if behavior == 'status_incomplete':
            return httpx.Response(200, request=req, json=make_responses_payload(
                {'type': 'output_text', 'text': '{"answer":"cắt cụt'}, status='incomplete'))
        if behavior == 'bad_json_output':
            return httpx.Response(200, request=req, json=make_responses_payload(
                {'type': 'output_text', 'text': 'không phải json'}))
        return httpx.Response(200, request=req, json={'id': 'resp_1', 'status': 'completed', 'output': []})

    monkeypatch.setattr(event_voice.httpx, 'post', failing)
    res = client.post('/api/events/may/ask', json={'question': 'Trạm đầu có gì?'})
    assert res.status_code == 503
    assert 'test-only' not in res.text


def test_public_cost_quota_checked_before_provider(voice, monkeypatch):
    from app import event_voice
    client, calls = voice
    monkeypatch.setattr(event_voice, 'HOURLY_LIMIT', 2)
    for code in [200, 200, 429]:
        assert client.post('/api/events/may/ask', json={'question': 'Có mấy trạm?'}).status_code == code
    assert len(calls) == 2


def test_missing_key_reports_service_unavailable_without_provider(voice, monkeypatch):
    client, calls = voice
    monkeypatch.delenv('OPENAI_API_KEY')
    assert client.post('/api/events/may/ask', json={'question': 'Ở đâu?'}).status_code == 503
    assert calls == []


def test_contact_details_are_masked_in_question_facts_and_model_answer(tmp_path, monkeypatch):
    from app import event_voice
    store = EventsStore(tmp_path / 'events.json')
    store.save_event(dict(
        id='may', status='published', title='Ngày hội Mây', club='CLB Mây',
        description='Liên hệ btc@vinuni.edu.vn hoặc +84 912 345 678.',
        locationId='room1', startsAt='2026-12-05T04:30:00Z', endsAt='2026-12-05T06:00:00Z',
        stops=[],
    ))
    calls = []

    def provider(url, *, headers, json, timeout):
        calls.append(json)
        payload = make_responses_payload({
            'type': 'output_text',
            'text': '{"answer":"Bạn xem tại Sảnh Mây, không cần gọi 0901234567 hay gửi leaked@example.com.","facts":["location"]}',
            'annotations': [],
        })
        return httpx.Response(200, request=httpx.Request('POST', url), json=payload)

    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    monkeypatch.delenv('AZURE_SPEECH_KEY', raising=False)
    monkeypatch.delenv('AZURE_SPEECH_REGION', raising=False)
    monkeypatch.setattr(event_voice.httpx, 'post', provider)
    app = FastAPI()
    app.include_router(event_voice.event_voice_router(lambda: store, lambda: {'room1': 'Sảnh Mây'}))
    client = TestClient(app)

    res = client.post('/api/events/may/ask', json={'question': 'Gửi lịch qua test@example.com, 0901234567?'})
    assert res.status_code == 200
    sent = json.dumps(calls[0], ensure_ascii=False)
    assert 'test@example.com' not in sent and '0901234567' not in sent
    assert 'btc@vinuni.edu.vn' not in sent and '912 345 678' not in sent
    answer = res.json()['answer']
    assert '0901234567' not in answer and 'leaked@example.com' not in answer
    assert '[đã ẩn liên hệ]' in answer


def test_store_fetch_published_filters_remote_query(tmp_path):
    class Remote:
        def select(self, table, params):
            assert table == 'club_events' and params['id'] == 'eq.may' and params['status'] == 'eq.published'
            return [dict(id='may', status='published', title='Ngày hội Mây')]
    store = EventsStore(tmp_path / 'events.json', Remote())
    assert store.get_published('may')['title'] == 'Ngày hội Mây'


def test_transcribe_calls_azure_short_audio_contract_and_persists_nothing(stt):
    client, calls, tmp_path = stt
    wav = make_wav(duration_s=0.25)
    result = client.post('/api/events/may/transcribe', content=wav, headers={'Content-Type': 'audio/wav'})
    assert result.status_code == 200
    assert result.json() == {'transcript': 'Trạm đầu tiên ở đâu?'}
    assert len(calls) == 1
    sent = calls[0]
    assert sent['url'] == (
        'https://southeastasia.stt.speech.microsoft.com/'
        'speech/recognition/conversation/cognitiveservices/v1?language=vi-VN&format=simple'
    )
    assert sent['headers']['Ocp-Apim-Subscription-Key'] == 'azure-test-key'
    assert sent['headers']['Content-Type'] == 'audio/wav; codecs=audio/pcm; samplerate=16000'
    assert sent['content'] == wav
    assert isinstance(sent['timeout'], (int, float)) and 0 < sent['timeout'] <= 30
    saved_names = {p.name for p in tmp_path.iterdir()}
    assert saved_names == {'events.json', 'event-voice-stt-quota.sqlite3'}
    assert 'Trạm đầu tiên ở đâu?' not in (tmp_path / 'events.json').read_text(encoding='utf-8')


def test_transcribe_accepts_exact_30_second_canonical_wav(stt):
    client, calls, _ = stt
    wav = make_wav(duration_s=30.0)
    assert len(wav) == 44 + 30 * 16000 * 2
    result = client.post('/api/events/may/transcribe', content=wav,
                         headers={'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'})
    assert result.status_code == 200
    assert result.json()['transcript'] == 'Trạm đầu tiên ở đâu?'
    assert len(calls) == 1


@pytest.mark.parametrize('payload', [
    load_azure_fixture('recognition_nomatch.json'),
    {'RecognitionStatus': 'InitialSilenceTimeout', 'Offset': 0, 'Duration': 0},
    {'RecognitionStatus': 'Success', 'DisplayText': '   ', 'Offset': 0, 'Duration': 100},
])
def test_transcribe_maps_no_match_or_blank_to_friendly_422(stt, monkeypatch, payload):
    from app import event_voice
    client, _, _ = stt
    monkeypatch.setattr(event_voice.httpx, 'post', lambda url, **kw: httpx.Response(
        200, request=httpx.Request('POST', url), json=payload))
    result = client.post('/api/events/may/transcribe', content=make_wav(), headers={'Content-Type': 'audio/wav'})
    assert result.status_code == 422
    assert isinstance(result.json().get('detail'), str) and result.json()['detail']


def test_transcribe_rejects_bad_content_type_without_azure_call(stt):
    client, calls, _ = stt
    for content_type in ('application/json', 'audio/webm', ''):
        headers = {'Content-Type': content_type} if content_type else {}
        res = client.post('/api/events/may/transcribe', content=make_wav(), headers=headers)
        assert res.status_code == 415
    assert calls == []


def test_transcribe_rejects_malformed_wrong_format_and_oversized_audio_without_azure_call(stt):
    client, calls, _ = stt
    valid = make_wav(duration_s=0.1)
    truncated_data_size = bytearray(valid)
    struct.pack_into('<I', truncated_data_size, 40, 100000)
    extra_trailing = valid + b'\x00\x00'
    bad_riff_size = bytearray(valid)
    struct.pack_into('<I', bad_riff_size, 4, 12)

    bad_payloads = [
        b'',
        b'not a wav file at all',
        make_wav(duration_s=0.0),
        make_wav(duration_s=0.1, channels=2),
        make_wav(duration_s=0.1, sample_rate=44100),
        make_wav(duration_s=0.1, sampwidth=1),
        bytes(truncated_data_size),
        extra_trailing,
        bytes(bad_riff_size),
        make_wav(duration_s=30.1),
    ]
    for payload in bad_payloads:
        res = client.post('/api/events/may/transcribe', content=payload, headers={'Content-Type': 'audio/wav'})
        assert res.status_code == 422

    oversized = client.post('/api/events/may/transcribe', content=b'\x00' * (1024 * 1024 + 64),
                            headers={'Content-Type': 'audio/wav'})
    assert oversized.status_code == 413
    assert calls == []


@pytest.mark.parametrize('event_id', ['nhap', 'unknown'])
def test_transcribe_rejects_draft_or_missing_event_without_azure_call(stt, event_id):
    client, calls, _ = stt
    res = client.post(f'/api/events/{event_id}/transcribe', content=make_wav(), headers={'Content-Type': 'audio/wav'})
    assert res.status_code == 404
    assert 'công bố' in res.json()['detail']
    assert calls == []


@pytest.mark.parametrize('env_update', [
    {'AZURE_SPEECH_KEY': None},
    {'AZURE_SPEECH_REGION': None},
    {'AZURE_SPEECH_REGION': 'https://evil.example#'},
    {'AZURE_SPEECH_REGION': 'east us'},
    {'AZURE_SPEECH_REGION': 'east.us'},
    {'AZURE_SPEECH_REGION': 'EASTUS'},
    {'AZURE_SPEECH_REGION': '../southeastasia'},
])
def test_transcribe_requires_valid_azure_credentials_and_region_slug(stt, monkeypatch, env_update):
    client, calls, _ = stt
    for key, val in env_update.items():
        if val is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, val)
    res = client.post('/api/events/may/transcribe', content=make_wav(), headers={'Content-Type': 'audio/wav'})
    assert res.status_code == 503
    assert calls == []


@pytest.mark.parametrize('behavior', [
    'http_500',
    'http_401',
    'timeout',
    'recognition_error',
    'bad_json',
    'list_status',
    'dict_status',
    'key_echo_status',
])
def test_transcribe_observes_provider_failure_without_leaking_key(stt, monkeypatch, caplog, behavior):
    from app import event_voice
    client, _, _ = stt

    def failing(url, **kw):
        req = httpx.Request('POST', url)
        if behavior == 'http_500':
            return httpx.Response(500, request=req, text='Internal error azure-test-key')
        if behavior == 'http_401':
            return httpx.Response(401, request=req, text='Unauthorized azure-test-key')
        if behavior == 'timeout':
            raise httpx.ReadTimeout('timeout with azure-test-key', request=req)
        if behavior == 'recognition_error':
            return httpx.Response(200, request=req, json=load_azure_fixture('recognition_error.json'))
        if behavior == 'list_status':
            return httpx.Response(200, request=req, json={'RecognitionStatus': ['NoMatch']})
        if behavior == 'dict_status':
            return httpx.Response(200, request=req, json={'RecognitionStatus': {'code': 'NoMatch'}})
        if behavior == 'key_echo_status':
            return httpx.Response(200, request=req, json={'RecognitionStatus': 'Error: azure-test-key'})
        return httpx.Response(200, request=req, text='not-json azure-test-key')

    monkeypatch.setattr(event_voice.httpx, 'post', failing)
    with caplog.at_level(logging.WARNING, logger=event_voice.__name__):
        res = client.post('/api/events/may/transcribe', content=make_wav(), headers={'Content-Type': 'audio/wav'})
    assert res.status_code == 503
    assert 'azure-test-key' not in res.text
    assert caplog.records
    assert all('azure-test-key' not in rec.getMessage() for rec in caplog.records)


def test_transcribe_uses_separate_quota_file_from_ask(stt, monkeypatch):
    from app import event_voice
    client, calls, tmp_path = stt
    monkeypatch.setattr(event_voice, 'HOURLY_LIMIT', 2)
    wav = make_wav()
    for code in (200, 200, 429):
        res = client.post('/api/events/may/transcribe', content=wav, headers={'Content-Type': 'audio/wav'})
        assert res.status_code == code
    assert len(calls) == 2
    ask_res = client.post('/api/events/may/ask', json={'question': 'Trạm đầu có gì?'})
    assert ask_res.status_code == 200
    assert (tmp_path / 'event-voice-stt-quota.sqlite3').exists()
    assert (tmp_path / 'event-voice-quota.sqlite3').exists()
