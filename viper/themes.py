"""Portable CSS library, resource embedding and appearance validation."""
import base64
import mimetypes
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


MAX_CSS = 8 * 1024 * 1024
STYLE_PROPERTIES = {
    'font_family': ('font-family', 'text'), 'font_size': ('font-size', 'number'),
    'font_weight': ('font-weight', 'text'), 'text_color': ('color', 'text'),
    'background_color': ('background-color', 'text'), 'border_color': ('border-color', 'text'),
    'border_width': ('border-width', 'number'), 'border_radius': ('border-radius', 'number'),
    'padding': ('padding', 'number'), 'text_align': ('text-align', 'text'),
    'white_space': ('white-space', 'text'), 'overflow_wrap': ('overflow-wrap', 'text'),
    'overflow': ('overflow', 'text'),
}


def style_overrides(data):
    if not isinstance(data, dict) or data.keys() - STYLE_PROPERTIES.keys():
        raise ValueError('Invalid appearance properties')
    result = {}
    choices = {'text_align': {'left', 'center', 'right', 'justify'},
               'white_space': {'normal', 'nowrap', 'pre-wrap', 'pre-line'},
               'overflow_wrap': {'normal', 'break-word', 'anywhere'},
               'overflow': {'visible', 'hidden', 'auto'}}
    for key, value in data.items():
        if STYLE_PROPERTIES[key][1] == 'number':
            if type(value) not in (float, int) or not 0 <= value <= 500 or (key == 'font_size' and value < 1):
                raise ValueError(f'Invalid {key}')
        elif not isinstance(value, str) or not value.strip() or len(value) > 250:
            raise ValueError(f'Invalid {key}')
        if key in choices and value not in choices[key]:
            raise ValueError(f'Invalid {key}')
        result[key] = value
    return result


def theme_definitions(data):
    if not isinstance(data, dict) or len(data) > 32:
        raise ValueError('Invalid project themes')
    result = {}
    for key, theme in data.items():
        if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,100}\.css', key):
            raise ValueError('Invalid theme filename')
        if not isinstance(theme, dict) or not isinstance(theme.get('css'), str) or len(theme['css']) > MAX_CSS:
            raise ValueError('Invalid theme stylesheet')
        name = theme.get('name', key[:-4])
        if not isinstance(name, str) or not name or len(name) > 120:
            raise ValueError('Invalid theme name')
        result[key] = {'name': name, 'css': theme['css']}
    return result


def portable_css(path, chain=()):
    import tinycss2

    path = Path(path).resolve()
    if path.suffix.lower() != '.css':
        raise ValueError('Choose a .css stylesheet')
    if path in chain or len(chain) >= 16:
        raise ValueError('CSS imports contain a cycle or exceed 16 levels')
    if path.stat().st_size > MAX_CSS:
        raise ValueError('Stylesheet is too large')
    rules = tinycss2.parse_stylesheet(path.read_text(encoding='utf-8-sig'))

    def local(value):
        location = urlsplit(value)
        if location.scheme or location.netloc or not location.path:
            raise ValueError(f'Use local CSS imports/resources or data URLs: {value[:100]}')
        return path.parent / unquote(location.path), location.fragment

    def url_value(token):
        if token.type in {'url', 'string'}:
            return token.value
        if token.type == 'function' and token.lower_name == 'url':
            arguments = [item for item in token.arguments if item.type not in {'whitespace', 'comment'}]
            if len(arguments) == 1 and arguments[0].type == 'string':
                return arguments[0].value
        raise ValueError('Invalid CSS URL')

    def resources(tokens):
        result = []
        for token in tokens:
            if token.type == 'error':
                raise ValueError(f'Invalid CSS: {token.message}')
            if token.type == 'url' or (token.type == 'function' and token.lower_name == 'url'):
                value = url_value(token)
                if value.startswith(('data:', '#')):
                    result.append(token)
                    continue
                asset, fragment = local(value)
                if asset.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
                                                '.avif', '.woff', '.woff2', '.ttf', '.otf', '.eot'}:
                    raise ValueError(f'Unsupported CSS image/font resource: {asset.name}')
                if asset.stat().st_size > 2 * 1024 * 1024:
                    raise ValueError(f'CSS resource {asset.name} exceeds 2 MB')
                encoded = base64.b64encode(asset.read_bytes()).decode('ascii')
                mime = mimetypes.guess_type(asset.name)[0] or 'application/octet-stream'
                replacement = f'url("data:{mime};base64,{encoded}' + (f'#{fragment}' if fragment else '') + '")'
                result.extend(tinycss2.parse_component_value_list(replacement))
                continue
            if hasattr(token, 'content') and token.content is not None:
                token.content = resources(token.content)
            if hasattr(token, 'arguments'):
                token.arguments = resources(token.arguments)
            result.append(token)
        return result

    output = []
    for rule in rules:
        if rule.type == 'at-rule' and rule.lower_at_keyword == 'import':
            tokens = list(rule.prelude)
            while tokens and tokens[0].type in {'whitespace', 'comment'}:
                tokens.pop(0)
            if not tokens:
                raise ValueError('Empty CSS import')
            imported, _ = local(url_value(tokens[0]))
            css = portable_css(imported, (*chain, path))
            media = tinycss2.serialize(tokens[1:]).strip()
            if re.search(r'\b(layer|supports)\b', media):
                raise ValueError('CSS @import layer/supports qualifiers are not supported; use a combined stylesheet')
            output.append(f'@media {media}{{{css}}}' if media else css)
        elif rule.type == 'at-rule' and rule.lower_at_keyword == 'charset':
            continue
        else:
            output.append(tinycss2.serialize(resources([rule])))
    css = ''.join(output)
    if len(css) > MAX_CSS:
        raise ValueError('Combined theme exceeds 8 MB')
    return css


class ThemeLibrary:
    def __init__(self, directory=None):
        self.directory = Path(directory) if directory is not None else Path(__file__).parent / 'themes'

    def list(self):
        return [{'id': path.name, 'name': path.stem} for path in sorted(self.directory.glob('*.css'))
                if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,100}\.css', path.name)]

    def get(self, key):
        theme_definitions({key: {'css': ''}})
        return {'id': key, 'name': Path(key).stem, 'css': portable_css(self.directory / key)}

    def import_file(self, path):
        css = portable_css(path)
        stem = re.sub(r'[^a-zA-Z0-9_. -]', '-', Path(path).stem).strip(' .-')[:70] or 'theme'
        self.directory.mkdir(parents=True, exist_ok=True)
        key, index = stem + '.css', 2
        while (self.directory / key).exists():
            if (self.directory / key).read_text(encoding='utf-8-sig') == css:
                return {'id': key, 'name': Path(key).stem, 'css': css}
            key, index = f'{stem}-{index}.css', index + 1
        (self.directory / key).write_text(css, encoding='utf-8', newline='')
        return {'id': key, 'name': Path(key).stem, 'css': css}
