"""Error reporting for Ghostwire Analytics.

    import ghostwire

    ghostwire.init(host="https://analytics.example.com", website_id="...", key="gwe_...")

    try:
        charge(order)
    except PaymentError as error:
        ghostwire.capture_exception(error, user={"id": order.username})
        raise

Or set GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID and GHOSTWIRE_ERROR_KEY and skip init().
Reporting only observes: it never swallows or changes your exceptions, and never raises.
"""

from __future__ import annotations

import sys
import threading
from typing import Any, Optional

from .client import Client, ClientOptions

__all__ = [
    "Client",
    "ClientOptions",
    "capture_exception",
    "capture_message",
    "flush",
    "get_client",
    "init",
    "install_excepthook",
    "register_release",
]

__version__ = "0.1.0"

_client: Optional[Client] = None


def init(*, excepthook: bool = True, **options: Any) -> Client:
    """Configures reporting. Options: host, website_id, key, environment, release, before_send,
    tags, timeout (each falls back to its GHOSTWIRE_* environment variable). With `excepthook`
    (the default), crashes are reported too."""
    global _client
    _client = Client(ClientOptions.from_env(**options))
    if excepthook:
        install_excepthook()
    return _client


def get_client() -> Client:
    """The configured client (created from the environment on first use)."""
    global _client
    if _client is None:
        _client = Client(ClientOptions.from_env())
    return _client


def capture_exception(error: Optional[BaseException] = None, **context: Any) -> bool:
    """Reports `error` (default: the exception being handled). Context: handled, user
    ({"id", "email", "name"}), request ({"method", "url", "userAgent"}), tags, extra."""
    return get_client().capture_exception(error, **context)


def capture_message(message: str, **context: Any) -> bool:
    return get_client().capture_message(message, **context)


def flush(timeout: float = 2.0) -> bool:
    """Waits for queued reports to be sent (e.g. at the end of a short script or job)."""
    return get_client().flush(timeout)


def register_release(version: Optional[str] = None, **details: Any) -> bool:
    """Marks a deploy: version (default: the configured release), environment, commit, url."""
    return get_client().register_release(version, **details)


_installed = False


def install_excepthook() -> None:
    """Reports uncaught exceptions (main thread and other threads), then hands them to the
    previous hooks unchanged, so the program crashes exactly as it would have."""
    global _installed
    if _installed:
        return
    _installed = True

    previous = sys.excepthook

    def excepthook(exc_type, exc, tb):  # type: ignore[no-untyped-def]
        try:
            if not issubclass(exc_type, KeyboardInterrupt):
                client = get_client()
                if client.capture_exception(exc, handled=False):
                    client.flush(2.0)
        except Exception:
            pass
        previous(exc_type, exc, tb)

    sys.excepthook = excepthook

    previous_thread_hook = threading.excepthook

    def thread_excepthook(args):  # type: ignore[no-untyped-def]
        try:
            if args.exc_value is not None and not issubclass(args.exc_type, SystemExit):
                get_client().capture_exception(
                    args.exc_value,
                    handled=False,
                    tags={"thread": getattr(args.thread, "name", "thread")},
                )
        except Exception:
            pass
        previous_thread_hook(args)

    threading.excepthook = thread_excepthook
