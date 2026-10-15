"""Export a project with the existing runtime; platform packaging lives in hosts/."""
from __future__ import annotations

import argparse
import ast
import importlib.util
from importlib import metadata
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from .models import Project
from .serializer import load_project, save_project
from .event_imports import imported_modules, window_import_tree


RUNTIME_ASSETS = ('runtime.html', 'designer.css', 'host.js', 'theme-colors.js', 'appearance.js', 'components.js',
                  'control-session.js', 'anchor-layout.js', 'relative-layout.js', 'runtime.js')


def application_name(name):
    """Use a short portable filename, independent of the window's display title."""
    stem = re.sub(r'[^a-zA-Z0-9_-]+', '-', name).strip('-_')[:64] or 'Application'
    # These device names cannot be used as portable filenames.
    if stem.upper() in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(10)),
                        *(f'LPT{i}' for i in range(10))}:
        stem = 'App-' + stem
    return stem


def validate_project(project, *, registered_handlers=()):
    """Analyze saved code without executing it, including imports hidden in JSON."""
    if not project.windows:
        raise ValueError('Create a window before building an application.')
    project.get_window()
    imports = set()
    for form in project.windows:
        imports.update(imported_modules(window_import_tree(form.imports, form.window.name),
                                        f'Imports for window {form.window.name!r}'))
    mapped = {name for form in project.windows for component in form.components
              for name in component.event_handlers.values() if name}
    for name in sorted(mapped):
        if name in registered_handlers:
            raise ValueError(f'Handler {name!r} is registered outside the project. '
                             'Move its implementation into saved event code before building.')
        source = project.event_code.get(name)
        if not source or not source.strip():
            continue
        try:
            tree = ast.parse(source, filename=f'<event {name}>')
            compile(tree, f'<event {name}>', 'exec')
        except (SyntaxError, ValueError) as error:
            raise ValueError(f'Handler {name!r} cannot be built: {error}') from error
        imports.update(imported_modules(tree, f'Handler {name!r}'))
    for module in sorted(imports):
        if importlib.util.find_spec(module.split('.')[0]) is None:
            raise ValueError(f'Project imports {module!r}, which is not installed in the build environment.')
    return sorted(imports)


def python_requirements(imports):
    requirements = ['pywebview>=6.2.1; sys_platform == "win32"']
    distributions = metadata.packages_distributions()
    packages = set()
    for module in imports:
        root = module.split('.')[0]
        if root in sys.stdlib_module_names or root in {'viper', 'webview', 'gi'}:
            continue
        providers = distributions.get(root)
        if not providers:
            raise ValueError(f'Cannot export dependency {module!r} as a Python project: '
                             'install it as a Python package so it can be listed in requirements.txt.')
        packages.update(providers)
    requirements.extend(f'{package}=={metadata.version(package)}' for package in sorted(packages))
    return '\n'.join(requirements) + '\n'


def python_bundle(staging, name, requirements):
    bundle = staging / name
    bundle.mkdir()
    shutil.copyfile(staging / 'launch.py', bundle / 'app.py')
    shutil.copyfile(staging / 'project.json', bundle / 'project.json')
    if (staging / 'themes').is_dir():
        shutil.copytree(staging / 'themes', bundle / 'themes')
    runtime = bundle / 'viper'
    runtime.mkdir()
    source = Path(__file__).resolve().parent
    for path in source.glob('*.py'):
        shutil.copyfile(path, runtime / path.name)
    (runtime / 'hosts').mkdir()
    for path in (source / 'hosts').glob('*.py'):
        shutil.copyfile(path, runtime / 'hosts' / path.name)
    shutil.copytree(staging / 'assets', runtime / 'assets')
    (bundle / 'requirements.txt').write_text(requirements, encoding='utf-8')
    (bundle / 'README.txt').write_text(
        f'{name} — Python project\n\n'
        'Requires Python 3.11 or later. Viper and PyInstaller do not need to be installed.\n'
        'Extract the whole ZIP and open a terminal in this folder.\n\n'
        'Windows, first-time dependency setup:\n'
        '  py -m pip install -r requirements.txt\n'
        'Run:\n'
        '  py app.py\n\n'
        'Windows also requires Microsoft Edge WebView2 Runtime and .NET Framework 4.8.\n'
        'WebView2: https://developer.microsoft.com/microsoft-edge/webview2/\n\n'
        'Linux requires GTK 4, WebKitGTK 6.0 and PyGObject installed through your distribution.\n'
        'Install any additional requirements with your Python environment, then run python3 app.py.\n'
        'Linux native behavior remains unverified.\n\n'
        'Keep app.py, project.json and the viper folder together. Paths resolve relative to app.py,\n'
        'so launching from another working directory is supported. The configured startup window\n'
        'is used. Event source and window definitions are stored in project.json.\n'
        'Application CSS, when selected, is in themes/. Keep that folder with the project.\n', encoding='utf-8')
    return bundle


def export_project(project, destination, *, format='exe', builder=None, progress=None, overwrite=False, hidden_imports=()):
    from .hosts import create_builder

    report = progress or (lambda message: None)
    if format not in {'exe', 'python'}:
        raise ValueError('Choose exe or python as the export format.')
    snapshot = Project.from_dict(project.to_dict())
    imports = sorted(set(validate_project(snapshot)) | set(hidden_imports))
    requirements = python_requirements(imports) if format == 'python' else None
    target = Path(destination).resolve()
    if not target.suffix:
        target = target.with_suffix('.zip')
    if target.suffix.lower() != '.zip':
        raise ValueError('Choose a .zip destination for the application package.')
    if target.exists() and not overwrite:
        raise FileExistsError(f'{target.name} already exists. Choose a new name or use --overwrite.')
    if format == 'exe':
        builder = builder or create_builder()
        builder.check_available()
    name = application_name(snapshot.name)
    target.parent.mkdir(parents=True, exist_ok=True)
    report('Preparing project and runtime')
    with tempfile.TemporaryDirectory(prefix='viper-build-') as directory:
        staging = Path(directory)
        save_project(snapshot, staging / 'project.json')
        if snapshot.themes:
            (staging / 'themes').mkdir()
            for key, theme in snapshot.themes.items():
                (staging / 'themes' / key).write_text(theme['css'], encoding='utf-8', newline='')
        (staging / 'launch.py').write_text(
            'from pathlib import Path\nfrom viper.packaged import launch\n\n'
            'if __name__ == "__main__":\n'
            '    raise SystemExit(launch(Path(__file__).resolve().parent / "project.json"))\n', encoding='utf-8')
        assets = staging / 'assets'
        assets.mkdir()
        for filename in RUNTIME_ASSETS:
            shutil.copyfile(Path(__file__).parent / 'assets' / filename, assets / filename)
        if format == 'python':
            report('Collecting Python project and dependencies')
            bundle = python_bundle(staging, name, requirements)
        else:
            bundle = builder.build(staging, name, imports, snapshot.get_window().window, report)
        if not bundle.is_dir():
            raise RuntimeError('The packager did not produce an application folder.')
        if format == 'exe':
            (bundle / 'README.txt').write_text(
                f'{snapshot.name}\n\nExtract the entire ZIP, then open {name}.exe.\n'
                'Keep the executable and its _internal folder together.\n'
                'Python and Viper do not need to be installed.\n'
                'Requires Windows with Microsoft Edge WebView2 Runtime and .NET Framework 4.8.\n'
                'WebView2: https://developer.microsoft.com/microsoft-edge/webview2/\n\n'
                'The application starts with the project\'s configured startup window.\n', encoding='utf-8')
        report('Creating shareable ZIP')
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.viper-', suffix='.zip', delete=False) as output:
                temporary = Path(output.name)
            with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(bundle.rglob('*')):
                    if path.is_file():
                        archive.write(path, Path(name) / path.relative_to(bundle))
            if target.exists() and not overwrite:
                raise FileExistsError(f'{target.name} was created while building; it has been preserved.')
            temporary.replace(target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    report('Build complete')
    return target


def main():
    parser = argparse.ArgumentParser(description='Export an executable or standalone Python project ZIP.')
    parser.add_argument('project', type=Path)
    parser.add_argument('--output', '-o', type=Path, required=True)
    parser.add_argument('--overwrite', action='store_true')
    parser.add_argument('--format', choices=['exe', 'python'], default='exe')
    parser.add_argument('--hidden-import', action='append', default=[], help='Additional dynamically imported module to bundle')
    args = parser.parse_args()
    try:
        result = export_project(load_project(args.project), args.output, format=args.format, overwrite=args.overwrite,
                                hidden_imports=args.hidden_import, progress=lambda message: print(message, flush=True))
    except Exception as error:
        parser.exit(1, f'Build failed: {error}\n')
    print(f'Created {result}')


if __name__ == '__main__':
    main()
