import logging

from app.core.config import Settings


def configure_app_logging(settings: Settings) -> None:
    level_name = settings.APP_LOG_LEVEL.upper().strip()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(level=level)
