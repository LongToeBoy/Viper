"""Launch the finished demo with the installed Viper runtime."""
from pathlib import Path

from viper.runtime import Runtime
from viper.serializer import load_project


if __name__ == '__main__':
    Runtime(load_project(Path(__file__).resolve().parent / 'project.json')).launch()
