from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.core.config import get_settings
from app.core.logging import configure_app_logging

settings = get_settings()
configure_app_logging(settings)

app = FastAPI(title=settings.APP_NAME)
_cors_kwargs = {
    "allow_origins": settings.resolved_cors_allow_origins(),
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
_origin_regex = (settings.CORS_ALLOW_ORIGIN_REGEX or "").strip()
if _origin_regex:
    _cors_kwargs["allow_origin_regex"] = _origin_regex
app.add_middleware(CORSMiddleware, **_cors_kwargs)
app.include_router(api_router)
