"""The Ghostwire client: builds error reports and sends them in the background.

Reporting only observes: it never swallows, changes or re-raises your exceptions, and it never
raises itself. Reports go out on a background thread, so your code never waits on the network.
"""

from __future__ import annotations

import atexit
import json
import logging
import os
import queue
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from types import TracebackType
from typing import Any, Callable, Mapping, Optional

__all__ = ["Client", "ClientOptions", "build_frames", "exception_type_name"]

log = logging.getLogger("ghostwire")

USER_AGENT = "ghostwire-python/0.1.0"
MAX_STACK = 20_000
MAX_MESSAGE = 2_000
MAX_FRAMES = 100
MAX_QUEUE = 100
# Client-side cap, so an error loop can't flood the server (it also limits per website).
MAX_PER_MINUTE = 100

# Library, standard library and runtime code isn't "your" code.
_LIBRARY_MARKERS = ("site-packages", "dist-packages", "<frozen ")

ExcInfo = tuple[type[BaseException], BaseException, Optional[TracebackType]]
BeforeSend = Callable[[dict[str, Any]], Optional[dict[str, Any]]]


def _stdlib_paths() -> tuple[str, ...]:
    paths = set()
    for name in ("stdlib", "platstdlib"):
        try:
            import sysconfig

            path = sysconfig.get_paths().get(name)
            if path:
                paths.add(os.path.normcase(os.path.abspath(path)))
        except Exception:  # pragma: no cover - defensive
            pass
    return tuple(paths)


_STDLIB = _stdlib_paths()


def _in_app(filename: str) -> bool:
    if any(marker in filename for marker in _LIBRARY_MARKERS):
        return False
    normalized = os.path.normcase(os.path.abspath(filename)) if filename else filename
    return not any(normalized.startswith(path) for path in _STDLIB)


def exception_type_name(exc: BaseException) -> str:
    cls = type(exc)
    module = cls.__module__
    return cls.__qualname__ if module in ("builtins", "__main__") else f"{module}.{cls.__qualname__}"


def build_frames(tb: Optional[TracebackType]) -> list[dict[str, Any]]:
    """Stack frames, innermost (where it was raised) first."""
    frames = [
        {
            "file": summary.filename[:500],
            "function": (summary.name or None) and summary.name[:500],
            "line": summary.lineno,
            "column": getattr(summary, "colno", None),
            "inApp": _in_app(summary.filename),
        }
        for summary in traceback.extract_tb(tb)
    ]
    frames.reverse()
    return frames[:MAX_FRAMES]


def _env(name: str) -> Optional[str]:
    value = os.environ.get(name)
    return value or None


@dataclass
class ClientOptions:
    host: Optional[str] = None
    website_id: Optional[str] = None
    key: Optional[str] = None
    environment: Optional[str] = None
    release: Optional[str] = None
    #: Change or drop (return None) a report before it's sent, e.g. to remove personal data.
    before_send: Optional[BeforeSend] = None
    #: Seconds to wait for the server per report.
    timeout: float = 3.0
    tags: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_env(cls, **overrides: Any) -> "ClientOptions":
        values = {
            "host": _env("GHOSTWIRE_HOST"),
            "website_id": _env("GHOSTWIRE_WEBSITE_ID"),
            "key": _env("GHOSTWIRE_ERROR_KEY"),
            "environment": _env("GHOSTWIRE_ENVIRONMENT"),
            "release": _env("GHOSTWIRE_RELEASE"),
        }
        values.update({k: v for k, v in overrides.items() if v is not None})
        return cls(**values)


class Client:
    def __init__(self, options: Optional[ClientOptions] = None, **kwargs: Any) -> None:
        self.options = options or ClientOptions.from_env(**kwargs)
        self._queue: "queue.Queue[Optional[dict[str, Any]]]" = queue.Queue(maxsize=MAX_QUEUE)
        self._worker: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._window_start = time.monotonic()
        self._window_count = 0
        self._sent = 0
        atexit.register(self.flush, 2.0)

    # -- configuration -------------------------------------------------------

    @property
    def enabled(self) -> bool:
        o = self.options
        return bool(o.host and o.website_id and o.key)

    @property
    def endpoint(self) -> str:
        return f"{(self.options.host or '').rstrip('/')}/api/errors"

    # -- building reports ----------------------------------------------------

    def build_report(
        self,
        exc_info: ExcInfo,
        *,
        handled: bool = True,
        user: Optional[Mapping[str, Any]] = None,
        request: Optional[Mapping[str, Any]] = None,
        tags: Optional[Mapping[str, str]] = None,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Any]:
        exc_type, exc, tb = exc_info
        stack = "".join(traceback.format_exception(exc_type, exc, tb))[-MAX_STACK:]

        report: dict[str, Any] = {
            "website": self.options.website_id,
            "platform": "python",
            "error": {
                "type": exception_type_name(exc)[:200],
                "message": (str(exc) or exception_type_name(exc))[:MAX_MESSAGE],
                "stack": stack,
                "frames": build_frames(tb),
            },
            "handled": handled,
            "timestamp": int(time.time() * 1000),
        }
        if self.options.environment:
            report["environment"] = self.options.environment[:50]
        if self.options.release:
            report["release"] = self.options.release[:100]
        all_tags = {**self.options.tags, **(tags or {})}
        if all_tags:
            report["tags"] = {str(k)[:50]: str(v)[:200] for k, v in all_tags.items()}
        if extra:
            report["extra"] = dict(extra)
        if user and user.get("id"):
            report["user"] = {
                key: str(user[key])[:limit]
                for key, limit in (("id", 50), ("email", 200), ("name", 200))
                if user.get(key)
            }
        if request:
            report["request"] = {
                key: str(request[key])[:limit]
                for key, limit in (("method", 10), ("url", 2000), ("userAgent", 500))
                if request.get(key)
            }
        return report

    # -- capturing -----------------------------------------------------------

    def capture_exception(
        self,
        error: Optional[BaseException] = None,
        *,
        handled: bool = True,
        **context: Any,
    ) -> bool:
        """Queues a report for `error` (or the exception being handled). Never raises."""
        try:
            if not self.enabled:
                return False

            if error is None:
                exc_info = sys.exc_info()
                if exc_info[1] is None:
                    return False
            else:
                exc_info = (type(error), error, error.__traceback__)

            report = self.build_report(exc_info, handled=handled, **context)  # type: ignore[arg-type]
            return self._enqueue(report)
        except Exception:  # never let reporting break the app
            log.debug("Ghostwire: could not build a report", exc_info=True)
            return False

    def capture_message(self, message: str, *, level: str = "error", **context: Any) -> bool:
        """Reports a message without an exception (e.g. from logging)."""
        try:
            if not self.enabled:
                return False
            report = {
                "website": self.options.website_id,
                "platform": "python",
                "error": {"type": f"Log.{level}"[:200], "message": str(message)[:MAX_MESSAGE]},
                "handled": True,
                "timestamp": int(time.time() * 1000),
            }
            for key in ("environment", "release"):
                value = getattr(self.options, key)
                if value:
                    report[key] = value
            if context.get("extra"):
                report["extra"] = dict(context["extra"])
            return self._enqueue(report)
        except Exception:
            log.debug("Ghostwire: could not build a report", exc_info=True)
            return False

    # -- sending -------------------------------------------------------------

    def _allowed(self) -> bool:
        now = time.monotonic()
        with self._lock:
            if now - self._window_start >= 60:
                self._window_start, self._window_count = now, 0
            self._window_count += 1
            return self._window_count <= MAX_PER_MINUTE

    def _enqueue(self, report: dict[str, Any]) -> bool:
        if self.options.before_send:
            try:
                report = self.options.before_send(report)  # type: ignore[assignment]
            except Exception:
                log.debug("Ghostwire: before_send failed; report dropped", exc_info=True)
                return False
            if report is None:
                return False

        if not self._allowed():
            return False

        self._ensure_worker()
        try:
            self._queue.put_nowait(report)
            return True
        except queue.Full:
            return False

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker and self._worker.is_alive():
                return
            self._worker = threading.Thread(target=self._run, name="ghostwire-reporter", daemon=True)
            self._worker.start()

    def _run(self) -> None:
        while True:
            report = self._queue.get()
            try:
                if report is not None:
                    self.send(report)
            finally:
                self._queue.task_done()

    def send(self, report: dict[str, Any]) -> bool:
        """Sends one report now (on the calling thread). Returns whether the server accepted it."""
        try:
            request = urllib.request.Request(
                self.endpoint,
                data=json.dumps(report, default=str).encode("utf-8"),
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.options.key}",
                    "User-Agent": USER_AGENT,
                },
            )
            with urllib.request.urlopen(request, timeout=self.options.timeout) as response:
                ok = 200 <= response.status < 300
                if ok:
                    self._sent += 1
                return ok
        except urllib.error.HTTPError as error:
            log.debug("Ghostwire: report refused (%s)", error.code)
        except Exception:
            log.debug("Ghostwire: could not send a report", exc_info=True)
        return False

    def flush(self, timeout: float = 2.0) -> bool:
        """Waits up to `timeout` seconds for queued reports to be sent."""
        deadline = time.monotonic() + timeout
        while self._queue.unfinished_tasks and time.monotonic() < deadline:
            time.sleep(0.02)
        return not self._queue.unfinished_tasks

    # -- releases ------------------------------------------------------------

    def register_release(
        self,
        version: Optional[str] = None,
        *,
        environment: Optional[str] = None,
        commit: Optional[str] = None,
        url: Optional[str] = None,
    ) -> bool:
        """Marks a deploy in Ghostwire (shows on the Releases page and traffic chart)."""
        version = version or self.options.release
        if not (self.enabled and version):
            return False
        body = {
            key: value
            for key, value in (
                ("version", version),
                ("environment", environment or self.options.environment),
                ("commit", commit),
                ("url", url),
            )
            if value
        }
        try:
            request = urllib.request.Request(
                f"{(self.options.host or '').rstrip('/')}/api/websites/{self.options.website_id}/releases",
                data=json.dumps(body).encode("utf-8"),
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.options.key}",
                    "User-Agent": USER_AGENT,
                },
            )
            with urllib.request.urlopen(request, timeout=self.options.timeout) as response:
                return 200 <= response.status < 300
        except Exception:
            log.debug("Ghostwire: could not register the release", exc_info=True)
            return False
