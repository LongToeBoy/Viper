import json

from viper.app import ViperApp
from viper.serializer import deserialize_project, serialize_project


def test_project_serialization_round_trip(tmp_path):
    app = ViperApp()
    destination = tmp_path / "project.json"
    dumped = serialize_project(app.project)

    assert dumped["schema_version"] == 2
    assert "project" in dumped

    destination.write_text(json.dumps(dumped), encoding="utf-8")
    reloaded = deserialize_project(json.loads(destination.read_text(encoding="utf-8")))

    assert reloaded.name == app.project.name
    assert len(reloaded.components) == len(app.project.components)
    assert reloaded.components[0].text == app.project.components[0].text
