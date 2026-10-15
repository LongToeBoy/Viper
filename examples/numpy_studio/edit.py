"""Open the same project in the Viper designer."""
from pathlib import Path

from viper.app import ViperApp


if __name__ == '__main__':
    app = ViperApp()
    app.load(Path(__file__).resolve().parent / 'project.json')
    app.launch()
