from fastapi import FastAPI

from app.api.routes import router as api_router
from app.core.config import get_settings
from app.core.logging import configure_app_logging

settings = get_settings()
configure_app_logging(settings)

app = FastAPI(title=settings.APP_NAME)
app.include_router(api_router)
