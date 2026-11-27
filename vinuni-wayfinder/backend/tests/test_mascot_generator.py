"""Club generation returns an editable preview; saving shares the complete 3D asset."""
import copy
import json
import math
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import events_store
from test_events_api import FakeRemoteSupa

BODY = dict(group='body', shape='box', color='#0088aa', position=[0, 1, 0], size=[1, 1, 1], rotation=[0, 0, 0])
RECIPE = {'version': 1, 'parts': [BODY, {**BODY, 'group': 'rightArm'}, {**BODY, 'group': 'leftArm'}, {**BODY, 'group': 'mouth'}]}
PROVIDER_OUTPUT = {p['group']: [{k: v for k, v in p.items() if k != 'group'}] for p in RECIPE['parts']}
PAYLOAD = {'name': 'Cánh xanh', 'brief': 'Chú chim xanh của CLB thử nghiệm', 'club': 'CLB thử nghiệm'}

@pytest.mark.parametrize('remote', [None, FakeRemoteSupa()])
def test_recipe_survives_storage_and_legacy_image_roundtrip(tmp_path, remote):
    store = events_store.EventsStore(tmp_path / 'events.json', remote=remote)
    model = dict(id='new-bird', name='Cánh xanh', kind='model3d', recipe=RECIPE)
    image = dict(id='old-bird', name='Chim cũ', kind='image', image='data:image/png;base64,AAAA')
    for asset in [model, image]:
        store.save_mascot(asset, actor={'id': 'club'})
    assert store.list_all()['mascots'] == [dict(model, ownerId='club'), dict(image, ownerId='club')]
    for bad in [dict(model, id='tia3d'), dict(model, recipe={}), dict(model, recipe={**RECIPE, 'parts': [dict(BODY, size=[math.inf, 1, 1]), *RECIPE['parts'][1:]]})]:
        with pytest.raises(events_store.ValidationError):
            store.save_mascot(bad)

def test_authenticated_preview_uses_provider_recipe_and_distinct_ids(monkeypatch):
    from app import main, mascot_generator
    from fastapi.testclient import TestClient
    import httpx

    monkeypatch.setenv('OPENAI_API_KEY', 'unit-test')
    monkeypatch.setattr(main.auth_store, 'get_session', lambda token: {'id': 'club'} if token == 'unit-session' else None)
    calls = []
    def provider(url, **kw):
        calls.append(kw['json'])
        return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(PROVIDER_OUTPUT)}}]})
    monkeypatch.setattr(mascot_generator.httpx, 'post', provider)
    client = TestClient(main.app)
    path = '/api/club-mascots/generate'
    assert client.post(path, json=PAYLOAD).status_code == 401
    headers = {'Authorization': 'Bearer unit-session'}
    assert client.post(path, json={**PAYLOAD, 'brief': 'x'}, headers=headers).status_code == 422
    assert not calls
    first = client.post(path, json=PAYLOAD, headers=headers).json()['mascot']
    second = client.post(path, json=PAYLOAD, headers=headers).json()['mascot']
    assert first['recipe'] == RECIPE and first['kind'] == 'model3d'
    assert first['brief'] == PAYLOAD['brief'] and first['id'] != second['id']
    assert PAYLOAD['brief'] in calls[0]['messages'][-1]['content']
    assert len(calls) == 2
    bad = copy.deepcopy(PROVIDER_OUTPUT)
    bad['body'][0]['shape'] = 'invalid'
    monkeypatch.setattr(mascot_generator.httpx, 'post', lambda *a, **kw: httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(bad)}}]}))
    assert client.post(path, json=PAYLOAD, headers=headers).status_code == 502

def test_provider_schema_requires_all_four_rig_groups(monkeypatch):
    from app import mascot_generator
    import httpx
    monkeypatch.setenv('OPENAI_API_KEY', 'unit-test')
    def provider(url, **kwargs):
        fmt = kwargs['json']['response_format']
        assert fmt['type'] == 'json_schema' and fmt['json_schema']['strict'] is True
        schema = fmt['json_schema']['schema']
        assert set(schema['required']) == {'body', 'mouth', 'leftArm', 'rightArm'}
        return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(PROVIDER_OUTPUT)}}]})
    monkeypatch.setattr(mascot_generator.httpx, 'post', provider)
    assert mascot_generator.generate_preview('X', PAYLOAD['brief'], '')['recipe'] == RECIPE


def test_later_clubs_can_save_and_retrieve_their_own_mascots(tmp_path):
    catalog = events_store.EventsStore(tmp_path / 'events.json')
    for i in range(15):
        uid = f'club-{i}'
        catalog.save_mascot(dict(id=uid, name='Mẫu', kind='image', image='data:image/png;base64,AAAA'), actor={'id': uid})
    assert [m['id'] for m in catalog.list_all()['mascots']] == [f'club-{i}' for i in range(15)]


def test_shared_library_reads_subsequent_database_pages():
    class Remote:
        def select(self, table, params):
            if table != 'club_mascots':
                return []
            rows = [dict(id=f'm-{i}', name='Mascot', kind='image', image='data:image/png;base64,AAAA') for i in range(210)]
            offset = int(params.get('offset', 0))
            size = min(int(params.get('limit', 100)), 100)
            return rows[offset:offset + size]

    catalog = events_store.EventsStore(Path('unused'), Remote())
    assert len(catalog.list_all()['mascots']) == 210
