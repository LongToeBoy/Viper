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


__all__ = ["NativeHost", "WindowOptions", "create_host"]
