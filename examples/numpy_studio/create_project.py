"""Rebuild the bundled example from its readable design, CSS and event source.

Run from the repository root with: python -m examples.numpy_studio.create_project
This explicitly replaces project.json; save designer edits under another name.
"""
from pathlib import Path

from viper.component_registry import create_component
from viper.models import Project, WindowDefinition, WindowSettings
from viper.runtime import Runtime
from viper.serializer import save_project


HERE = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1200, 860


def create_project():
    components, links = [], []

    def add(kind, name, text, x, y, width, height, *, owner=None, action=False, visible=True):
        component = create_component(
            kind, id=name, name=name, text=text, depth=0 if kind == 'panel' else 2,
            size_mode='stretch', visible=visible,
            layout={'min_width': 1, 'min_height': 1},
            box={'x': x, 'y': y, 'width': width, 'height': height,
                 'reference_width': WIDTH, 'reference_height': HEIGHT},
            event_handlers={('change' if kind in {'checkbox', 'text_input'} else 'click'): 'studio_action'} if action else {},
        )
        components.append(component)
        # All coordinates are in window space. Directed links attach card contents
        # to their panel while preserving signed, dimensionless distances.
        if owner:
            reference = next(c for c in components if c.id == owner).box
            links.append({'id': f'link_{name}', 'axis': 'both',
                          'a': {'body': owner, 'edge': 'top'}, 'b': {'body': name, 'edge': 'top'},
                          'distance_x': (x + width / 2 - reference['x'] - reference['width'] / 2) / WIDTH,
                          'distance_y': (y - reference['y']) / HEIGHT})
        return component

    add('panel', 'Sidebar', '', 0, 0, 216, HEIGHT)
    add('label', 'BrandMark', '∷', 22, 30, 38, 38, owner='Sidebar')
    add('label', 'Brand', 'ARRAY', 72, 29, 126, 30, owner='Sidebar')
    add('label', 'BrandCaption', 'A small data playground', 24, 81, 176, 20, owner='Sidebar')
    add('label', 'SidebarTitle', 'Find the story\nin your numbers.', 24, 121, 176, 58, owner='Sidebar')
    add('label', 'PresetHeading', 'START WITH A SAMPLE', 24, 204, 176, 20, owner='Sidebar')
    for name, text, y in [('PresetSales', '01   Weekly sales', 242), ('PresetSensor', '02   Sensor readings', 296),
                          ('PresetOutlier', '03   Spot the outlier', 350), ('Generate', '↻    Generate new data', 424)]:
        add('button', name, text, 20, y, 176, 42, owner='Sidebar', action=True)
    add('label', 'SidebarIntro', 'Choose a sample, or make\nsomething of your own.', 24, 488, 172, 50, owner='Sidebar')
    add('panel', 'ModuleCard', '', 20, 616, 176, 154, owner='Sidebar')
    add('label', 'ModuleEyebrow', 'POWERED BY PYTHON', 34, 634, 150, 18, owner='ModuleCard')
    add('label', 'ImportCode', 'import numpy as np', 34, 667, 152, 24, owner='ModuleCard')
    add('label', 'ModuleNote', 'Real arrays. Real statistics.\nEditable Python events.', 34, 707, 150, 42, owner='ModuleCard')
    add('label', 'SidebarFoot', 'Made with Viper  /  Demo 01', 24, 812, 180, 20, owner='Sidebar')

    add('label', 'Eyebrow', 'NUMPY STUDIO  /  INTERACTIVE DEMO', 252, 28, 600, 22)
    add('label', 'Title', 'A little data. A lot of insight.', 252, 60, 710, 46)
    add('label', 'Subtitle', 'Explore a dataset, compare its shape, and let Python do the math.', 252, 116, 750, 22)
    add('label', 'ModuleBadge', 'NumPy  /  ready', 998, 32, 166, 28)

    for name, caption, note, x in [('Count', 'SAMPLE SIZE', 'observations in your array', 252),
                                  ('Mean', 'MEAN', 'the average value', 486),
                                  ('Median', 'MEDIAN', 'the middle of the dataset', 720),
                                  ('Spread', 'STANDARD DEVIATION', 'population spread · ddof=0', 954)]:
        card = f'{name}Card'
        add('panel', card, '', x, 158, 210, 112)
        add('label', f'{name}Caption', caption, x + 18, 173, 178, 18, owner=card)
        value = add('label', f'{name}Value', '—', x + 18, 196, 178, 40, owner=card)
        if name == 'Mean':
            value.event_handlers['change'] = 'mean_changed'
        add('label', f'{name}Note', note, x + 18, 243, 178, 15, owner=card)

    add('panel', 'DataCard', '', 252, 294, 912, 172)
    add('label', 'DataTitle', 'Your dataset', 274, 312, 240, 26, owner='DataCard')
    add('label', 'DataHint', 'COMMAS, SPACES OR SEMICOLONS', 868, 316, 276, 20, owner='DataCard')
    add('text_input', 'DataInput', '42, 48, 51, 45, 62, 58, 65, 71, 68, 74, 82, 77, 63, 59, 66, 72, 85, 91, 79, 83, 69, 76, 88, 94',
        274, 354, 700, 44, owner='DataCard', action=True)
    add('button', 'Analyze', 'Analyze data  →', 994, 354, 150, 44, owner='DataCard', action=True)
    add('label', 'InputStatus', '', 274, 417, 868, 26, owner='DataCard')
    add('label', 'ErrorMessage', '', 274, 417, 868, 26, owner='DataCard', visible=False)

    add('panel', 'ChartCard', '', 252, 490, 544, 298)
    add('label', 'ChartTitle', 'Distribution', 274, 508, 386, 26, owner='ChartCard')
    add('label', 'ChartHint', 'How often values fall in each range', 274, 538, 420, 20, owner='ChartCard')
    add('label', 'ChartAxis', 'VALUE RANGE', 274, 568, 112, 18, owner='ChartCard')
    add('label', 'CountAxis', 'COUNT', 734, 568, 42, 18, owner='ChartCard')
    for i in range(8):
        y = 595 + i * 22
        add('label', f'Bin{i}', '', 274, y, 136, 16, owner='ChartCard')
        add('label', f'Bar{i}', '', 418, y, 298, 16, owner='ChartCard')
        add('label', f'Frequency{i}', '', 736, y, 34, 16, owner='ChartCard')

    add('panel', 'InsightCard', '', 820, 490, 344, 298)
    add('label', 'InsightTitle', 'A closer look', 844, 508, 296, 28, owner='InsightCard')
    add('label', 'InsightText', '', 844, 553, 296, 78, owner='InsightCard')
    add('label', 'RangeHeading', 'MINIMUM  →  MAXIMUM', 844, 639, 296, 18, owner='InsightCard')
    add('label', 'RangeValue', '', 844, 663, 296, 30, owner='InsightCard')
    add('label', 'OperationCode', 'np.histogram(x, bins=8)', 844, 706, 296, 30, owner='InsightCard')
    add('checkbox', 'Standardize', 'Standardize values (z-score)', 844, 749, 296, 24, owner='InsightCard', action=True)
    add('label', 'FooterStatus', 'Ready to explore.', 252, 812, 600, 20)
    add('label', 'FooterCredit', 'PYTHON EVENTS  ·  SHARED VIPER RUNTIME', 856, 812, 308, 20)

    # Opposing window anchors keep the sidebar filling the client height.
    links.extend([
        {'id': f'sidebar_{edge}', 'axis': 'both', 'a': {'body': '$window', 'edge': edge},
         'b': {'body': 'Sidebar', 'edge': edge}, 'distance_x': (108 - WIDTH / 2) / WIDTH,
         'distance_y': 0} for edge in ('top', 'bottom')
    ])
    source = (HERE / 'events.py').read_text(encoding='utf-8')
    source, change_source = source.split('\n\ndef mean_changed', 1)
    change_source = 'def mean_changed' + change_source
    window = WindowDefinition(
        name='NumPy Studio', form_id='studio', canvas_width=WIDTH, canvas_height=HEIGHT,
        window=WindowSettings(name='NumPyStudio', title='Array — NumPy Studio',
                              min_width=1120, min_height=820, background_color='#f3f6f5'),
        imports='# Window-owned dependency, available to every saved handler.\nimport numpy as np\n',
        components=components, links=links,
    )
    project = Project(name='Array — NumPy Studio', description='An interactive NumPy data playground built entirely with Viper controls, anchors, CSS and saved Python events.',
                      windows=[window], startup_window_id='studio',
                      themes={'studio.css': {'name': 'NumPy Studio', 'css': (HERE / 'studio.css').read_text(encoding='utf-8')}},
                      active_theme='studio.css', event_code={'studio_action': source, 'mean_changed': change_source})
    # Save an already-populated dashboard, using the real dispatcher for initial
    # numbers. Opening a JSON file still never executes its handlers.
    replies = []
    Runtime(project).receive({'id': 1, 'command': 'event', 'payload': {
        'window_id': 'studio', 'component_id': 'Analyze', 'event': 'click'}}, replies.append)
    if 'error' in replies[0]:
        raise RuntimeError(replies[0]['error'])
    by_id = {component.id: component for component in components}
    for update in replies[0]['result'].get('updates', []):
        for key, value in update['properties'].items():
            setattr(by_id[update['component_id']], key, value)
    return project


if __name__ == '__main__':
    print(save_project(create_project(), HERE / 'project.json'))
