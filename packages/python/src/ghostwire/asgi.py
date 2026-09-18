"""ASGI middleware (FastAPI, Starlette, Django ASGI): reports unhandled exceptions from requests.

    from ghostwire.asgi import GhostwireMiddleware

    app.add_middleware(GhostwireMiddleware, get_user=lambda scope: current_user_from(scope))

The exception is re-raised unchanged, so your framework's error handling runs as before.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Mapping, MutableMapping, Optional

from . import get_client

Scope = MutableMapping[str, Any]
ASGIApp = Callable[[Scope, Any, Any], Awaitable[None]]
GetUser = Callable[[Scope], Optional[Mapping[str, Any]]]

__all__ = ["GhostwireMiddleware", "request_from_scope"]


def request_from_scope(scope: Scope) -> dict[str, str]:
    """Method, URL (without the query string, which often carries tokens) and user agent."""
    headers = {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in scope.get("headers") or []
    }
    host = headers.get("host") or ""
    scheme = scope.get("scheme", "http")
    path = scope.get("root_path", "") + scope.get("path", "")
    return {
        "method": scope.get("method", ""),
        "url": f"{scheme}://{host}{path}" if host else path,
        "userAgent": headers.get("user-agent", ""),
    }


class GhostwireMiddleware:
    def __init__(self, app: ASGIApp, get_user: Optional[GetUser] = None) -> None:
        self.app = app
        self.get_user = get_user

    async def __call__(self, scope: Scope, receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        try:
            await self.app(scope, receive, send)
        except Exception as error:
            try:
                user = self.get_user(scope) if self.get_user else None
            except Exception:
                user = None
            get_client().capture_exception(
                error, handled=False, request=request_from_scope(scope), user=user
            )
            raise
