from __future__ import annotations

from .app import ViperApp


def main() -> None:
    app = ViperApp()
    try:
        app.launch()
    except KeyboardInterrupt:
        print("\nViper stopped.")


if __name__ == "__main__":
    main()
