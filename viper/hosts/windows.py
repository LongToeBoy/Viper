from __future__ import annotations

import json
import tempfile
from pathlib import Path
from .base import NativeHost, Receiver, WindowOptions


class WindowsHost(NativeHost):
    """Microsoft WebView2 via pywebview. No rendering engine fallback."""

    def run(self, interface: Path, receiver: Receiver, options: WindowOptions) -> None:
        try:
            import webview
        except ImportError as exc:
            raise RuntimeError("Install pywebview and Microsoft WebView2 Runtime on Windows.") from exc
        self._webview = webview
        self_host = self

        class API:
            def post_message(self, message):
                receiver(message, self_host.send)

        self._window = webview.create_window(
            options.title, interface.resolve().as_uri(), js_api=API(),
            width=options.width, height=options.height, min_size=(options.min_width, options.min_height),
            resizable=options.resizable, frameless=not options.decorated,
            maximized=options.state == "maximized", fullscreen=options.state == "fullscreen",
            background_color=options.background_color,
        )
        def configure_client_size():
            # pywebview sizes the outer WinForms window; project dimensions describe
            # the client surface, so account for native decorations and DPI here.
            from System import Action
            from System.Drawing import Size
            form = self._window.native

            def configure():
                scale = form.DeviceDpi / 96.0
                form.MinimumSize = form.SizeFromClientSize(Size(
                    int(options.min_width * scale), int(options.min_height * scale)))
                if options.state == "normal":
                    form.ClientSize = Size(int(options.width * scale), int(options.height * scale))

            form.Invoke(Action(configure))

        self._window.events.shown += configure_client_size
        from .icons import write_icon
        with tempfile.TemporaryDirectory(prefix="viper-icon-") as directory:
            icon = options.icon
            if options.icon_data:
                png = write_icon(options.icon_data, Path(directory), ico=False)
                icon = self._native_icon(png)
            webview.start(gui="edgechromium", icon=str(icon) if icon else None)

    @staticmethod
    def _native_icon(png: Path) -> Path:
        # Write a 32-bit DIB-backed ICO. Icon.Save can quantize handles to 4-bit
        # color, while PNG-backed ICOs fail in some .NET bitmap consumers.
        import clr
        import struct
        clr.AddReference("System.Drawing")
        from System.Drawing import Bitmap
        target = png.with_suffix('.ico')
        bitmap = Bitmap(str(png))
        try:
            pixels = bytearray()
            for y in range(31, -1, -1):
                for x in range(32):
                    color = bitmap.GetPixel(x, y)
                    pixels.extend((color.B, color.G, color.R, color.A))
            dib = struct.pack('<IiiHHIIiiII', 40, 32, 64, 1, 32, 0, len(pixels), 0, 0, 0, 0)
            dib += pixels + bytes(128)  # 32 rows of DWORD-aligned 1-bit AND mask.
            target.write_bytes(struct.pack('<HHH', 0, 1, 1) +
                               struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(dib), 22) + dib)
        finally:
            bitmap.Dispose()
        return target

    def send(self, message):
        self._window.evaluate_js(f"window.viperHost.receive({json.dumps(message)});")

    def file_dialog(self, save, callback):
        kind = self._webview.FileDialog.SAVE if save else self._webview.FileDialog.OPEN
        paths = self._window.create_file_dialog(kind, save_filename="project.json" if save else "",
                                               file_types=("Viper project (*.json)",))
        callback(Path(paths[0]) if paths else None)

    def set_title(self, title):
        self._window.set_title(title)

    def export_dialog(self, name, callback):
        paths = self._window.create_file_dialog(self._webview.FileDialog.SAVE, save_filename=name,
                                               file_types=('Application ZIP (*.zip)',))
        callback(Path(paths[0]) if paths else None)

    def theme_dialog(self, callback):
        paths = self._window.create_file_dialog(self._webview.FileDialog.OPEN,
                                               file_types=('CSS stylesheet (*.css)',))
        callback(Path(paths[0]) if paths else None)

    def resize(self, width, height):
        self._window.resize(width, height)

    def close(self):
        self._window.destroy()
