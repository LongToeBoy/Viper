"""Only this package selects an OS or imports native GUI libraries."""
from .base import NativeHost, WindowOptions


def create_host() -> NativeHost:
    import sys
    if sys.platform == "win32":
        from .windows import WindowsHost
        return WindowsHost()
    if sys.platform.startswith("linux"):
        from .linux import LinuxHost
        return LinuxHost()
    raise RuntimeError("Viper currently supports Windows and Linux; no adapter is installed for this OS.")


def create_builder():
    import sys
    if sys.platform == 'win32':
        from .windows_build import WindowsBuilder
        return WindowsBuilder()
    raise RuntimeError('Application ZIP export currently builds Windows applications on Windows. Linux packaging is not available yet.')


def show_launch_error(title, message):
    import sys
    if sys.platform == 'win32':
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)
    elif sys.stderr is not None:
        print(f'{title}: {message}', file=sys.stderr)


__all__ = ["NativeHost", "WindowOptions", "create_host", "create_builder", "show_launch_error"]
