from __future__ import annotations

import json
import tempfile
from pathlib import Path
from .base import NativeHost, Receiver, WindowOptions


class LinuxHost(NativeHost):
    """GTK 4 + WebKitGTK 6.0. Requires native Linux verification."""

    def run(self, interface: Path, receiver: Receiver, options: WindowOptions) -> None:
        try:
            import gi
            gi.require_version("Gtk", "4.0")
            gi.require_version("WebKit", "6.0")
            from gi.repository import Gtk, WebKit, GLib
        except (ImportError, ValueError) as exc:
            raise RuntimeError("Install PyGObject, GTK 4 and WebKitGTK 6.0 on Linux.") from exc
        self._Gtk, self._GLib = Gtk, GLib
        from .icons import write_icon
        icon_directory = tempfile.TemporaryDirectory(prefix="viper-icon-")
        icon = write_icon(options.icon_data, Path(icon_directory.name), ico=False) if options.icon_data else options.icon
        self._application = Gtk.Application(application_id="com.viper.desktop")

        def activate(application):
            self._window = Gtk.ApplicationWindow(application=application, title=options.title)
            self._window.set_default_size(options.width, options.height)
            self._window.set_resizable(options.resizable)
            self._window.set_decorated(options.decorated)
            if options.state == "maximized":
                self._window.maximize()
            elif options.state == "fullscreen":
                self._window.fullscreen()
            if icon:
                theme = Gtk.IconTheme.get_for_display(self._window.get_display())
                theme.add_search_path(str(icon.resolve().parent))
                self._window.set_icon_name(icon.stem)
            manager = WebKit.UserContentManager()

            def message_received(_manager, value):
                try:
                    receiver(json.loads(value.to_string()), self.send)
                except (ValueError, TypeError):
                    return

            manager.connect("script-message-received::viper", message_received)
            manager.register_script_message_handler("viper", None)
            self._view = WebKit.WebView(user_content_manager=manager)
            self._view.set_size_request(options.min_width, options.min_height)
            self._view.load_uri(interface.resolve().as_uri())
            self._window.set_child(self._view)
            self._window.present()

        self._application.connect("activate", activate)
        try:
            self._application.run([])
        finally:
            icon_directory.cleanup()

    def _on_ui(self, action):
        def invoke():
            action()
            return False
        self._GLib.idle_add(invoke)

    def send(self, message):
        script = f"window.viperHost.receive({json.dumps(message)});"
        self._on_ui(lambda: self._view.evaluate_javascript(script, -1, None, None, None, None, None))

    def file_dialog(self, save, callback):
        Gtk = self._Gtk
        action = Gtk.FileChooserAction.SAVE if save else Gtk.FileChooserAction.OPEN
        dialog = Gtk.FileChooserNative.new("Save project" if save else "Open project", self._window,
                                           action, "Save" if save else "Open", "Cancel")
        file_filter = Gtk.FileFilter()
        file_filter.set_name("Viper project (*.json)")
        file_filter.add_pattern("*.json")
        dialog.add_filter(file_filter)
        if save:
            dialog.set_current_name("project.json")
        self._dialog = dialog

        def response(chooser, response_id):
            selected = chooser.get_file() if response_id == Gtk.ResponseType.ACCEPT else None
            path = selected.get_path() if selected else None
            chooser.destroy()
            self._dialog = None
            callback(Path(path) if path else None)

        dialog.connect("response", response)
        dialog.show()

    def set_title(self, title):
        self._on_ui(lambda: self._window.set_title(title))

    def resize(self, width, height):
        self._on_ui(lambda: self._window.set_default_size(width, height))

    def close(self):
        self._on_ui(self._application.quit)
