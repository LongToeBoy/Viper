"""Portable entry point used by generated applications."""
from pathlib import Path
import tempfile
import traceback


def launch(project_path):
    try:
        from .runtime import Runtime
        from .serializer import load_project
        Runtime(load_project(project_path)).launch()
        return 0
    except Exception as error:
        from .hosts import show_launch_error
        log = Path(tempfile.gettempdir()) / 'viper-application-error.log'
        try:
            log.write_text(traceback.format_exc(), encoding='utf-8')
            detail = f'\n\nDetails: {log}'
        except OSError:
            detail = ''
        show_launch_error('Application could not start', f'{error}{detail}')
        return 1
