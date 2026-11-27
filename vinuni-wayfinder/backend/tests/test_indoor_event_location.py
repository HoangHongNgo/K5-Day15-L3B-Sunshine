from types import SimpleNamespace

from app import main


def test_recognized_indoor_spot_identifies_only_rooms_at_that_node():
    graph = SimpleNamespace(
        nodes={'door': {'map': 'first'}, 'other': {'map': 'second'}, 'quad': {'map': 'lawn'}},
        maps={'first': {'kind': 'indoor'}, 'second': {'kind': 'indoor'}, 'lawn': {'kind': 'outdoor'}},
        rooms=[{'id': 'art', 'node': 'door'}, {'id': 'lab', 'node': 'door'},
               {'id': 'upstairs', 'node': 'other'}, {'id': 'lawn', 'node': 'quad'}],
    )
    assert main.indoor_room_ids(graph, 'door') == ['art', 'lab']
    assert main.indoor_room_ids(graph, 'quad') == []
    assert main.indoor_room_ids(graph, 'unknown') == []
