import json
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.events_store import EventsStore


@pytest.fixture
def voice(tmp_path, monkeypatch):
    from app import event_voice
    store = EventsStore(tmp_path / 'events.json')
    common = dict(title='Ngày hội Mây', club='CLB Mây', description='Thử làm diều.',
                  locationId='room1', startsAt='2026-12-05T04:30:00Z', endsAt='2026-12-05T06:00:00Z',
                  stops=[dict(id='s1', label='Gấp diều', locationId='room2', note='Nhận giấy.')])
    store.save_event(dict(common, id='may', status='published'), actor={'id': 'owner-private'})
    store.save_event(dict(common, id='nhap', status='draft', title='Sự kiện nội bộ'))
    calls = []
    def provider(url, *, headers, json, timeout):
        calls.append(json)
        return httpx.Response(200, request=httpx.Request('POST', url), json={
            'choices': [{'message': {'content': '{"facts":["stop1"]}'}}]})
    monkeypatch.setenv('OPENAI_API_KEY', 'test-only')
    monkeypatch.setattr(event_voice.httpx, 'post', provider)
    app = FastAPI()
    app.include_router(event_voice.event_voice_router(
        lambda: store, lambda: {'room1': 'Sảnh Mây', 'room2': 'Sân hoa'}))
    return TestClient(app), calls


def test_answer_uses_only_selected_published_facts(voice):
    client, calls = voice
    result = client.post('/api/events/may/ask', json={'question': 'Trạm đầu có gì?'})
    assert result.status_code == 200
    assert 'Sân hoa' in result.json()['answer']
    assert 'Nhận giấy' in result.json()['answer']
    sent = json.dumps(calls[0], ensure_ascii=False)
    assert '11:30' in sent and '05/12/2026' in sent
    assert 'Sảnh Mây' in sent and 'Gấp diều' in sent
    assert 'owner-private' not in sent and 'Sự kiện nội bộ' not in sent
    assert calls[0]['store'] is False and calls[0]['max_completion_tokens'] <= 200


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


def test_unsupported_model_facts_are_never_spoken(voice, monkeypatch):
    from app import event_voice
    client, _ = voice
    monkeypatch.setattr(event_voice.httpx, 'post', lambda url, **kw: httpx.Response(
        200, request=httpx.Request('POST', url), json={
            'choices': [{'message': {'content': '{"facts":["Giá vé 200 nghìn"]}'}}]}))
    answer = client.post('/api/events/may/ask', json={'question': 'Giá vé?'}).json()['answer']
    assert 'chưa' in answer.lower() and '200' not in answer


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


def test_question_removes_contact_details_before_provider(voice):
    client, calls = voice
    client.post('/api/events/may/ask', json={'question': 'Gửi lịch qua test@example.com, 0901234567?'})
    sent = json.dumps(calls[0])
    assert 'test@example.com' not in sent and '0901234567' not in sent


def test_store_fetch_published_filters_remote_query(tmp_path):
    class Remote:
        def select(self, table, params):
            assert table == 'club_events' and params['id'] == 'eq.may' and params['status'] == 'eq.published'
            return [dict(id='may', status='published', title='Ngày hội Mây')]
    store = EventsStore(tmp_path / 'events.json', Remote())
    assert store.get_published('may')['title'] == 'Ngày hội Mây'
