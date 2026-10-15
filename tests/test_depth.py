import pytest

from viper.app import ViperApp
from viper.component_registry import create_component
from viper.models import Component
from viper.serializer import deserialize_project, serialize_project


def test_depth_round_trip_preserves_order_geometry_links_and_source():
    project = ViperApp().project
    before = project.to_dict()
    for component, depth in zip(project.components, [4, 0, 1, 3]):
        component.depth = depth
    restored = deserialize_project(serialize_project(project))
    assert [c.depth for c in restored.components] == [4, 0, 1, 3]
    after = restored.to_dict()
    for form in after['windows']:
        for component in form['components']:
            component['depth'] = 2
    assert after == before


def test_legacy_components_keep_same_default_depth():
    component = create_component('panel').to_dict()
    del component['depth']
    assert Component.from_dict(component).depth == 2
    assert create_component('button', depth=4).depth == 4
    assert 'depth' not in create_component('panel', depth=0).style


@pytest.mark.parametrize('depth', [-1, 5, 1.5, '2', True, None])
def test_invalid_depth_rejected_in_constructor_and_saved_data(depth):
    with pytest.raises(ValueError, match='depth'):
        create_component('button', depth=depth)
    record = create_component('button').to_dict()
    record['depth'] = depth
    with pytest.raises(ValueError, match='depth'):
        Component.from_dict(record)
