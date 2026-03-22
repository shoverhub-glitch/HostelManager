import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any


class JsonLogFormatter(logging.Formatter):
    """Format logs as compact JSON for centralized ingestion."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include structured fields passed via `extra={...}`.
        for key, value in record.__dict__.items():
            if key.startswith("_") or key in {
                "args",
                "asctime",
                "created",
                "exc_info",
                "exc_text",
                "filename",
                "funcName",
                "levelname",
                "levelno",
                "lineno",
                "module",
                "msecs",
                "message",
                "msg",
                "name",
                "pathname",
                "process",
                "processName",
                "relativeCreated",
                "stack_info",
                "thread",
                "threadName",
            }:
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str, ensure_ascii=True)


class ExactLevelFilter(logging.Filter):
    """Allow only records for an exact log level."""

    def __init__(self, level: int) -> None:
        super().__init__()
        self.level = level

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno == self.level


def setup_logging() -> None:
    """Configure root logging from centralized settings."""
    # Import here to avoid circular imports
    from app.config.settings import (
        LOG_DIR,
        LOG_ENDPOINTS_ONLY,
        LOG_FILE_BACKUP_COUNT,
        LOG_FILE_MAX_BYTES,
        LOG_LEVEL,
        LOG_TO_CONSOLE,
        LOG_TO_FILE,
    )

    formatter = JsonLogFormatter()
    handlers: list[logging.Handler] = []
    
    # Console output
    if LOG_TO_CONSOLE:
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(formatter)
        handlers.append(stream_handler)

    # File output
    if LOG_TO_FILE:
        log_dir = LOG_DIR
        os.makedirs(log_dir, exist_ok=True)

        app_log_path = os.path.join(log_dir, "warning.log")
        error_log_path = os.path.join(log_dir, "error.log")

        app_file_handler = RotatingFileHandler(
            app_log_path,
            maxBytes=max(1, LOG_FILE_MAX_BYTES),
            backupCount=max(1, LOG_FILE_BACKUP_COUNT),
            encoding="utf-8",
        )
        app_file_handler.setFormatter(formatter)
        app_file_handler.setLevel(logging.WARNING)
        app_file_handler.addFilter(ExactLevelFilter(logging.WARNING))
        handlers.append(app_file_handler)

        error_file_handler = RotatingFileHandler(
            error_log_path,
            maxBytes=max(1, LOG_FILE_MAX_BYTES),
            backupCount=max(1, LOG_FILE_BACKUP_COUNT),
            encoding="utf-8",
        )
        error_file_handler.setFormatter(formatter)
        error_file_handler.setLevel(logging.ERROR)
        handlers.append(error_file_handler)

    root_logger = logging.getLogger()
    root_logger.handlers = handlers
    
    # When showing only endpoints, suppress other INFO logs
    if LOG_ENDPOINTS_ONLY:
        root_logger.setLevel(LOG_LEVEL)
        # Configure api.request logger separately to show INFO logs for endpoints
        request_logger = logging.getLogger("api.request")
        request_logger.setLevel(logging.INFO)
        # Create a dedicated console handler for request logs
        request_console_handler = logging.StreamHandler(sys.stdout)
        request_console_handler.setFormatter(formatter)
        # Clear any existing handlers and add only console
        request_logger.handlers.clear()
        request_logger.addHandler(request_console_handler)
        request_logger.propagate = False
    else:
        root_logger.setLevel(LOG_LEVEL)

    # Align framework loggers with app format/level.
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "gunicorn", "gunicorn.error"):
        framework_logger = logging.getLogger(logger_name)
        framework_logger.handlers = handlers
        framework_logger.setLevel(LOG_LEVEL)
        framework_logger.propagate = False
