from __future__ import annotations

from typing import Any, TYPE_CHECKING
from threading import RLock
from .component_registry import COMPONENT_LIBRARY
from .models import Project
from .hosts.base import Reply

if TYPE_CHECKING:
    from .app import ViperApp


class Bridge:
    """Shared request/reply API. Native adapters only transport messages."""

    def __init__(self, app: ViperApp) -> None:
        self.app = app
        self._lock = RLock()
        self._runtime = None

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
                    success({"project": self.app.project.to_dict(), "library": COMPONENT_LIBRARY})
                elif command == "update":
                    self.app.replace_project(Project.from_dict(payload["project"]))
                    self._runtime = None
                    success(self.app.project.to_dict())
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
                    start_project(self.app.project, payload.get('window_id', 'main'))
                    success({"started": True})
                elif command == "event":
                    from .runtime import Runtime
                    if self._runtime is None or self._runtime.project is not self.app.project:
                        self._runtime = Runtime(self.app.project, self.app.handlers)
                    self._runtime.receive(message, reply)
                else:
                    raise ValueError(f"Unknown command: {command}")
        except Exception as exc:
            failure(exc)
