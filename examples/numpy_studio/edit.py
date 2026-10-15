"""Open the same project in the Viper designer."""
from pathlib import Path

from viper.app import ViperApp
from viper.serializer import load_project


if __name__ == '__main__':
    ViperApp(load_project(Path(__file__).resolve().parent / 'project.json')).launch()
