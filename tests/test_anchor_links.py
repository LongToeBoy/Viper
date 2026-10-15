import pytest

from viper.app import ViperApp
from viper.models import Project
from viper.serializer import deserialize_project, serialize_project


def link(reference, dependent, **changes):
    return {'id': reference + dependent, 'a': {'body': reference, 'edge': 'right'},
        'b': {'body': dependent, 'edge': 'left'}, 'axis': 'both', 'distance_x': .1, 'distance_y': 0, **changes}


def test_links_and_modes_round_trip():
    project = ViperApp().project
    c = project.components[0]
    c.box = {'x': 100, 'y': 50, 'width': 100, 'height': 50, 'reference_width': 960, 'reference_height': 640}
    c.size_mode = 'stretch'
    project.links = [link('$window', c.id)]
    restored = deserialize_project(serialize_project(project))
    assert restored.links == project.links and restored.components[0].box == c.box
    assert restored.components[0].size_mode == 'stretch'
    assert 'springs' not in serialize_project(restored)['project']
    assert 'physics' not in restored.components[0].to_dict()


@pytest.mark.parametrize('changes', [{'distance_x': float('nan')}, {'axis': 'bad'},
    {'a': {'body': 'missing', 'edge': 'left'}}, {'a': {'body': '$window', 'edge': 'center'}}])
def test_invalid_link_is_rejected(changes):
    data = ViperApp().project.get_window().to_dict()
    data['links'] = [link('$window', data['components'][0]['id'], **changes)]
    with pytest.raises(ValueError):
        Project.from_dict(data)


def test_dependency_cycle_is_rejected():
    data = ViperApp().project.get_window().to_dict()
    a, b = [c['id'] for c in data['components'][:2]]
    data['links'] = [link(a, b), link(b, a)]
    with pytest.raises(ValueError, match='cycle'):
        Project.from_dict(data)


def test_previous_project_keeps_rectangles_and_discards_dynamics():
    data = ViperApp().project.get_window().to_dict()
    data['canvas_width'] = 800
    data['components'][0]['physics'] = {'x': 70, 'y': 80, 'width': 100, 'height': 50, 'mass': 2, 'pinned': False}
    data['components'][0].pop('box')
    data['springs'] = [{'old': 'definition'}]
    project = Project.from_dict(data)
    assert project.components[0].box['x'] == 70
    assert project.components[0].box['reference_width'] == 800
    assert project.links == []
