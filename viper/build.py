"""Export a project with the existing runtime; platform packaging lives in hosts/."""
from __future__ import annotations

import argparse
import ast
import importlib.util
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from .models import Project
from .serializer import load_project, save_project


RUNTIME_ASSETS = ('runtime.html', 'designer.css', 'host.js', 'components.js',
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
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                if node.level:
                    raise ValueError(f'Handler {name!r} uses a relative import; use an installed module name.')
                if node.module:
                    imports.add(node.module)
    for module in sorted(imports):
        if importlib.util.find_spec(module.split('.')[0]) is None:
            raise ValueError(f'Event code imports {module!r}, which is not installed in the build environment.')
    return sorted(imports)


def export_project(project, destination, *, builder=None, progress=None, overwrite=False, hidden_imports=()):
    from .hosts import create_builder

    report = progress or (lambda message: None)
    snapshot = Project.from_dict(project.to_dict())
    imports = sorted(set(validate_project(snapshot)) | set(hidden_imports))
    target = Path(destination).resolve()
    if not target.suffix:
        target = target.with_suffix('.zip')
    if target.suffix.lower() != '.zip':
        raise ValueError('Choose a .zip destination for the application package.')
    if target.exists() and not overwrite:
        raise FileExistsError(f'{target.name} already exists. Choose a new name or use --overwrite.')
    builder = builder or create_builder()
    builder.check_available()
    name = application_name(snapshot.name)
    target.parent.mkdir(parents=True, exist_ok=True)
    report('Preparing project and runtime')
    with tempfile.TemporaryDirectory(prefix='viper-build-') as directory:
        staging = Path(directory)
        save_project(snapshot, staging / 'project.json')
        (staging / 'launch.py').write_text(
            'from pathlib import Path\nfrom viper.packaged import launch\n\n'
            'if __name__ == "__main__":\n'
            '    raise SystemExit(launch(Path(__file__).resolve().parent / "project.json"))\n', encoding='utf-8')
        assets = staging / 'assets'
        assets.mkdir()
        for filename in RUNTIME_ASSETS:
            shutil.copyfile(Path(__file__).parent / 'assets' / filename, assets / filename)
        bundle = builder.build(staging, name, imports, snapshot.get_window().window, report)
        if not bundle.is_dir():
            raise RuntimeError('The packager did not produce an application folder.')
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
    parser = argparse.ArgumentParser(description='Build a shareable Viper application ZIP on the native platform.')
    parser.add_argument('project', type=Path)
    parser.add_argument('--output', '-o', type=Path, required=True)
    parser.add_argument('--overwrite', action='store_true')
    parser.add_argument('--hidden-import', action='append', default=[], help='Additional dynamically imported module to bundle')
    args = parser.parse_args()
    try:
        result = export_project(load_project(args.project), args.output, overwrite=args.overwrite,
                                hidden_imports=args.hidden_import, progress=lambda message: print(message, flush=True))
    except Exception as error:
        parser.exit(1, f'Build failed: {error}\n')
    print(f'Created {result}')


if __name__ == '__main__':
    main()
