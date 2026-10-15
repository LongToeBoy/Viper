"""Window-owned Python imports shared by the existing event runtime/exporter."""
import ast


def window_import_tree(source, window_name):
    filename = f'<imports {window_name}>'
    try:
        tree = ast.parse(source, filename=filename)
        for node in tree.body:
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                raise ValueError('Use only import statements and comments in window imports.')
            if isinstance(node, ast.ImportFrom) and (node.level or node.module == '__future__'):
                raise ValueError('Use absolute module imports. Future imports belong in event code.')
            for alias in node.names:
                name = alias.asname or (alias.name.split('.')[0] if isinstance(node, ast.Import) else alias.name)
                if name == '*':
                    raise ValueError('Import explicit names instead of using import *.')
                if name in {'controls', 'form', 'event', '__name__', '__builtins__'}:
                    raise ValueError(f'{name!r} is reserved by the event API; choose a different import alias.')
        compile(tree, filename, 'exec')
        return tree
    except (SyntaxError, ValueError) as error:
        raise ValueError(f'Imports for window {window_name!r}: {error}') from error


def imported_modules(tree, context):
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                raise ValueError(f'{context} uses a relative import; use an installed module name.')
            if node.module:
                modules.add(node.module)
    return modules
