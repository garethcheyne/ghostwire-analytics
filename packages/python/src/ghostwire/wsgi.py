"""WSGI middleware (Flask, Django, any WSGI app): reports unhandled exceptions from requests.

    from ghostwire.wsgi import GhostwireWSGIMiddleware

    app.wsgi_app = GhostwireWSGIMiddleware(app.wsgi_app)

The exception is re-raised unchanged. Flask and Django turn errors into 500 pages before WSGI
middleware sees them; for those, also call ghostwire.capture_exception() from your error handler
(Flask: @app.errorhandler(Exception), Django: the got_request_exception signal).
"""

from __future__ import annotations

from typing import Any, Callable, Iterable, Mapping, Optional

from . import get_client

__all__ = ["GhostwireWSGIMiddleware", "request_from_environ"]

GetUser = Callable[[Mapping[str, Any]], Optional[Mapping[str, Any]]]


def request_from_environ(environ: Mapping[str, Any]) -> dict[str, str]:
    host = environ.get("HTTP_HOST") or environ.get("SERVER_NAME", "")
    scheme = environ.get("wsgi.url_scheme", "http")
    path = environ.get("SCRIPT_NAME", "") + environ.get("PATH_INFO", "")
    return {
        "method": environ.get("REQUEST_METHOD", ""),
        "url": f"{scheme}://{host}{path}" if host else path,
        "userAgent": environ.get("HTTP_USER_AGENT", ""),
    }


class GhostwireWSGIMiddleware:
    def __init__(self, app: Callable[..., Iterable[bytes]], get_user: Optional[GetUser] = None):
        self.app = app
        self.get_user = get_user

    def _report(self, error: BaseException, environ: Mapping[str, Any]) -> None:
        try:
            user = self.get_user(environ) if self.get_user else None
        except Exception:
            user = None
        get_client().capture_exception(
            error, handled=False, request=request_from_environ(environ), user=user
        )

    def __call__(self, environ: Mapping[str, Any], start_response: Callable[..., Any]):
        try:
            response = self.app(environ, start_response)
        except Exception as error:
            self._report(error, environ)
            raise
        return self._iterate(response, environ)

    def _iterate(self, response: Iterable[bytes], environ: Mapping[str, Any]):
        # Streaming responses can fail while they're being sent.
        try:
            yield from response
        except Exception as error:
            self._report(error, environ)
            raise
        finally:
            close = getattr(response, "close", None)
            if close:
                close()
