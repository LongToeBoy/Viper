from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Any

Reply = Callable[[dict[str, Any]], None]
Receiver = Callable[[dict[str, Any], Reply], None]


@dataclass(frozen=True)
class WindowOptions:
    title: str = "Viper Designer"
    width: int = 1280
    height: int = 820
    icon: Path | None = None
    icon_data: str = ""
    resizable: bool = True
    decorated: bool = True
    min_width: int = 200
    min_height: int = 100
    state: str = "normal"
    background_color: str = "#0b1020"


class NativeHost(ABC):
    """Native operations; all calls into the frontend use JSON messages."""

    @abstractmethod
    def run(self, interface: Path, receiver: Receiver, options: WindowOptions) -> None: ...

    @abstractmethod
    def send(self, message: dict[str, Any]) -> None: ...

    @abstractmethod
    def file_dialog(self, save: bool, callback: Callable[[Path | None], None]) -> None: ...

    @abstractmethod
    def set_title(self, title: str) -> None: ...

    @abstractmethod
    def resize(self, width: int, height: int) -> None: ...

    @abstractmethod
    def close(self) -> None: ...
