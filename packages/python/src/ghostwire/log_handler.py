"""A logging handler that reports errors you log.

    import logging
    from ghostwire.log_handler import GhostwireHandler

    logging.getLogger().addHandler(GhostwireHandler())  # ERROR and above

    log.exception("Payment failed")   # reported with the stack trace
    log.error("Queue is backing up")  # reported as a message
"""

from __future__ import annotations

import logging

from . import get_client

__all__ = ["GhostwireHandler"]


class GhostwireHandler(logging.Handler):
    def __init__(self, level: int = logging.ERROR) -> None:
        super().__init__(level)

    def emit(self, record: logging.LogRecord) -> None:
        # Our own debug logging must never loop back into reports.
        if record.name.startswith("ghostwire"):
            return
        try:
            extra = {"logger": record.name, "message": record.getMessage()}
            if record.exc_info and record.exc_info[1] is not None:
                get_client().capture_exception(record.exc_info[1], handled=True, extra=extra)
            else:
                get_client().capture_message(
                    record.getMessage(), level=record.levelname.lower(), extra={"logger": record.name}
                )
        except Exception:
            self.handleError(record)
