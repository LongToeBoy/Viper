from __future__ import annotations

from typing import Any, TYPE_CHECKING
from threading import RLock, Thread
from uuid import uuid4
from .component_registry import COMPONENT_LIBRARY
from .models import Project, WindowDefinition
from .hosts.base import Reply

if TYPE_CHECKING:
    from .app import ViperApp


class Bridge:
    """Shared request/reply API. Native adapters only transport messages."""

    def __init__(self, app: ViperApp) -> None:
        self.app = app
        self._lock = RLock()
        self._runtime = None
        self._build_job = None

    def receive(self, message: dict[str, Any], reply: Reply) -> None:
        request_id = message.get("id")

        def success(result):
            reply({"id": request_id, "result": result})

        def failure(error):
            reply({"id": request_id, "error": str(error)})

        try:
            with self._lock:
                command = message["command"]
                payload = message.get("payload") or {}
                if command == "bootstrap":
                    success({"project": self.app.project.to_dict(), "library": COMPONENT_LIBRARY,
                             'window_defaults': WindowDefinition().to_dict()})
                elif command == "update":
                    project = Project.from_dict(payload['project'])
                    if project.to_dict() != self.app.project.to_dict():
                        self.app.replace_project(project)
                        self._runtime = None
                    success(self.app.project.to_dict())
                elif command == 'reset-preview':
                    self._runtime = None
                    success({'reset': True})
                elif command == "new":
                    self.app.replace_project(Project())
                    self._runtime = None
                    success(self.app.project.to_dict())
                elif command in ("save", "open"):
                    if self.app.host is None:
                        raise RuntimeError("No native host attached")
                    snapshot = Project.from_dict(self.app.project.to_dict())

                    def selected(path):
                        try:
                            with self._lock:
                                if path is None:
                                    success({"cancelled": True})
                                elif command == "save":
                                    save_path = path if path.suffix else path.with_suffix(".json")
                                    from .serializer import save_project
                                    save_project(snapshot, save_path)
                                    success({"saved": True})
                                else:
                                    success({"project": self.app.load(path).to_dict()})
                                    self._runtime = None
                        except Exception as exc:
                            failure(exc)

                    self.app.host.file_dialog(command == "save", selected)
                elif command == "run":
                    from .runtime import start_project
                    start_project(self.app.project, payload.get('window_id'))
                    success({"started": True})
                elif command == 'build':
                    if self.app.host is None:
                        raise RuntimeError('No native host attached')
                    if self._build_job and self._build_job['state'] in {'choosing', 'running'}:
                        raise RuntimeError('An application build is already in progress.')
                    from .build import application_name, export_project, validate_project
                    from .hosts import create_builder
                    format = payload.get('format', 'exe')
                    if format not in {'exe', 'python'}:
                        raise ValueError('Choose exe or python as the export format.')
                    snapshot = Project.from_dict(self.app.project.to_dict())
                    validate_project(snapshot, registered_handlers=self.app.handlers)
                    builder = None
                    if format == 'exe':
                        builder = create_builder()
                        builder.check_available()
                    job = {'id': uuid4().hex, 'format': format, 'state': 'choosing', 'message': 'Choose an application ZIP destination'}
                    self._build_job = job

                    def progress(message):
                        with self._lock:
                            job['message'] = message

                    def build_selected(path):
                        with self._lock:
                            if path is None:
                                job.update(state='cancelled', message='Build cancelled')
                                success({'cancelled': True})
                                return
                            job.update(state='running', message='Preparing application')

                        def build():
                            try:
                                archive = export_project(snapshot, path, format=format, builder=builder, progress=progress, overwrite=True)
                                with self._lock:
                                    job.update(state='complete', message='Build complete', path=str(archive))
                            except Exception as error:
                                with self._lock:
                                    job.update(state='failed', message=str(error))

                        Thread(target=build, name='viper-build').start()
                        success({'job_id': job['id']})

                    try:
                        suffix = '_python.zip' if format == 'python' else '.zip'
                        self.app.host.export_dialog(application_name(snapshot.name) + suffix, build_selected)
                    except Exception:
                        job.update(state='failed', message='Could not open the export dialog')
                        raise
                elif command == 'build-status':
                    if self._build_job is None or payload.get('job_id') != self._build_job['id']:
                        raise ValueError('Unknown application build')
                    success(dict(self._build_job))
                elif command == "event":
                    from .runtime import Runtime
                    if self._runtime is None or self._runtime.project is not self.app.project:
                        self._runtime = Runtime(self.app.project, self.app.handlers)
                    self._runtime.receive(message, reply)
                else:
                    raise ValueError(f"Unknown command: {command}")
        except Exception as exc:
            failure(exc)
