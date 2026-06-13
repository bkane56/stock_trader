"""API key authentication for expensive AI endpoints."""

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    """Require ``X-API-Key`` when ``API_SECRET_KEY`` is configured."""
    secret = settings.API_SECRET_KEY.strip()
    if not secret:
        return
    if not x_api_key or x_api_key != secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
