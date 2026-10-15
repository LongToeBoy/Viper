"""Exercise the shipped example through Viper's real saved-source dispatcher."""
from pathlib import Path
import zipfile

import pytest

pytest.importorskip('numpy')  # An example dependency, not a Viper requirement.

from viper.build import export_project
from viper.runtime import Runtime
from viper.serializer import load_project


EXAMPLE = Path(__file__).resolve().parents[1] / 'examples' / 'numpy_studio'


def session():
    project = load_project(EXAMPLE / 'project.json')
    runtime = Runtime(project)
    return project, runtime, runtime._control_state.controls(runtime.form)


def dispatch(runtime, sender='Analyze', *, text=None, checked=None):
    values = {}
    if text is not None:
        values['DataInput'] = {'text': text}
    if checked is not None:
        values['Standardize'] = {'checked': checked}
    replies = []
    runtime.receive({'id': 1, 'command': 'event', 'payload': {
        'window_id': 'studio', 'component_id': sender,
        'event': 'change' if sender in {'DataInput', 'Standardize'} else 'click',
        'values': values}}, replies.append)
    assert 'error' not in replies[0], replies[0]
    return replies[0]['result']


def test_editable_data_has_known_statistics_and_property_change_notifications():
    project, runtime, controls = session()
    original = project.to_dict()
    dispatch(runtime, text='10, 20; 30 40')
    assert [controls[name].Text for name in ('CountValue', 'MeanValue', 'MedianValue', 'SpreadValue')] == ['4', '25', '25', '11.18']
    assert controls.RangeValue.Text == '10  →  40'
    assert sum(int(controls[f'Frequency{i}'].Text) for i in range(8)) == 4
    assert 'mean change event' in controls.FooterStatus.Text
    assert project.to_dict() == original


def test_outlier_preset_and_standardizing_keep_original_input():
    _, runtime, controls = session()
    dispatch(runtime, 'PresetOutlier')
    assert controls.CountValue.Text == '16'
    assert controls.MeanValue.Text == '18.5'
    assert controls.MedianValue.Text == '13.5'
    assert '1 potential outlier' in controls.InsightText.Text
    raw = controls.DataInput.Text
    dispatch(runtime, 'Standardize', checked=True)
    assert controls.MeanValue.Text == '0' and controls.SpreadValue.Text == '1'
    assert controls.DataInput.Text == raw
    dispatch(runtime, 'Standardize', checked=False)
    assert controls.MeanValue.Text == '18.5'


@pytest.mark.parametrize('text', ['x, 20', '', '4', 'nan, 2', '1, inf', '1e13, 2', '1, ' * 2001])
def test_bad_input_keeps_the_last_valid_analysis_and_recovers(text):
    _, runtime, controls = session()
    dispatch(runtime, text='10 20 30 40')
    dispatch(runtime, text=text)
    assert controls.ErrorMessage.Visible and not controls.InputStatus.Visible
    assert controls.MeanValue.Text == '25'
    assert controls.DataInput.Text == text
    dispatch(runtime, text='-4, -2, 0, 2, 4')
    assert not controls.ErrorMessage.Visible and controls.InputStatus.Visible
    assert controls.MeanValue.Text == '0'


def test_constant_and_scientific_data_and_random_generation():
    _, runtime, controls = session()
    dispatch(runtime, text='7 7 7', checked=True)
    assert controls.MeanValue.Text == '0' and controls.SpreadValue.Text == '0'
    assert 'Constant data' in controls.InputStatus.Text
    assert sum(int(controls[f'Frequency{i}'].Text) for i in range(8)) == 3
    dispatch(runtime, text='1e-4 2e-4 3e-4', checked=False)
    assert controls.MeanValue.Text == '2.00e-04'
    dispatch(runtime, text='1e-12 2e-12 3e-12')
    assert controls.MeanValue.Text == '2.00e-12'
    assert 'Every value is the same' not in controls.InsightText.Text
    dispatch(runtime, 'Generate')
    assert controls.CountValue.Text == '32'
    assert len(controls.DataInput.Text.split(',')) == 32
    assert not controls.ErrorMessage.Visible


def test_python_export_preserves_demo_and_collects_numpy(tmp_path):
    project, _, _ = session()
    archive_path = export_project(project, tmp_path / 'studio.zip', format='python')
    with zipfile.ZipFile(archive_path) as archive:
        requirements = next(name for name in archive.namelist() if name.endswith('/requirements.txt'))
        assert 'numpy==' in archive.read(requirements).decode()
        css = next(name for name in archive.namelist() if name.endswith('/themes/studio.css'))
        assert archive.read(css).decode() == project.themes['studio.css']['css']
