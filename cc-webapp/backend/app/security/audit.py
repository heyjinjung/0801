import os
import json
import logging
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any, Dict, Optional

_logger: Optional[logging.Logger] = None

def _get_logger() -> logging.Logger:
    global _logger
    if _logger:
        return _logger
    logger = logging.getLogger("audit")
    logger.setLevel(logging.INFO)
    # Ensure logs directory exists
    logs_dir = os.path.join(os.getcwd(), "logs")
    try:
        os.makedirs(logs_dir, exist_ok=True)
    except Exception:
        pass
    path = os.path.join(logs_dir, "audit.log")
    handler = RotatingFileHandler(path, maxBytes=2_000_000, backupCount=5, encoding='utf-8')
    fmt = logging.Formatter('%(message)s')  # pre-formatted JSON lines
    handler.setFormatter(fmt)
    if not any(isinstance(h, RotatingFileHandler) for h in logger.handlers):
        logger.addHandler(handler)
    _logger = logger
    return logger

def audit_log(event: str, *, actor_id: Optional[int] = None, meta: Optional[Dict[str, Any]] = None) -> None:
    """Write an audit entry as JSON line.

    event: short code (e.g., 'admin_gacha_config_update', 'admin_limited_toggle')
    actor_id: user id if available
    meta: additional structured info
    """
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "actor_id": actor_id,
        "meta": meta or {},
    }
    try:
        _get_logger().info(json.dumps(payload, ensure_ascii=False))
    except Exception:
        # Fallback to stdout
        print("[AUDIT]", json.dumps(payload, ensure_ascii=False))
