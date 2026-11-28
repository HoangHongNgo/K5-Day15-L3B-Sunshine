import json
from pathlib import Path

import pytest

from app.routing import SiteGraph
from tools import add_c_floors as cf

SITE = Path(__file__).resolve().parents[1] / 'data' / 'site.json'


@pytest.fixture()
def site():
    base = json.loads(SITE.read_text(encoding='utf-8'))
    return cf.merge(base)


def test_merge_adds_two_indoor_floors_of_building_c(site):
    maps = {m['id']: m for m in site['maps']}
    for fid in ('C3', 'C4'):
        assert maps[fid]['kind'] == 'indoor' and maps[fid]['building'] == 'Tòa C'
        assert maps[fid]['image'] == f'/maps/toa-C-tang-{fid[1]}.webp'
    nodes = {n['id']: n for n in site['nodes']}
    assert all(n['map'] in maps for n in nodes.values())
    assert all(e['a'] in nodes and e['b'] in nodes for e in site['edges'])


def test_merge_is_idempotent(site):
    again = cf.merge(json.loads(json.dumps(site)))
    assert len(again['nodes']) == len(site['nodes'])
    assert len(again['edges']) == len(site['edges'])
    assert len(again['rooms']) == len(site['rooms'])
    assert len({n['id'] for n in again['nodes']}) == len(again['nodes'])


@pytest.mark.parametrize('code,floor', [('C301', 'C3'), ('C302', 'C3'), ('C303', 'C3'), ('C304', 'C3'),
                                        ('C305', 'C3'), ('C401', 'C4'), ('C402', 'C4')])
def test_rooms_exist_on_right_floor(site, code, floor):
    g = SiteGraph(site)
    node, _ = g.resolve_target(code)
    assert node and g.nodes[node]['map'] == floor


def test_every_floor_node_is_connected_to_campus(site):
    g = SiteGraph(site)
    for n in site['nodes']:
        if n['map'] in ('C3', 'C4'):
            assert g.route('c_door', n['id'])['steps'], n['id']


def test_route_between_floors_goes_through_vertical_link(site):
    g = SiteGraph(site)
    start, _ = g.resolve_target('C301')
    dest, _ = g.resolve_target('C401')
    maps_seen = [g.nodes[n]['map'] for n in g.route(start, dest)['path']]
    assert maps_seen[0] == 'C3' and maps_seen[-1] == 'C4'
    steps = g.route(start, dest)['steps']
    assert any('tầng 4' in s['text'].lower() for s in steps)


def test_floor_images_are_redrawn_not_copied():
    for floor in ('C3', 'C4'):
        im = cf.draw(floor)
        assert im.size == (cf.W, cf.H)
        assert len(im.getcolors(maxcolors=100000) or []) > 5


def test_floor_change_steps_read_naturally(site):
    g = SiteGraph(site)
    dest, _ = g.resolve_target('C401')
    texts = [s['text'] for s in g.route('c_door', dest)['steps']]
    assert texts[0] == 'Vào Tòa C rồi đi thang máy lên tầng 3'
    assert texts[1] == 'Đi thang máy lên tầng 4'
    start, _ = g.resolve_target('C401')
    down = [s['text'] for s in g.route(start, g.resolve_target('C301')[0])['steps']]
    assert 'Đi thang máy xuống tầng 3' in down or 'Đi cầu thang bộ xuống tầng 3' in down
