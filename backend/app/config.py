from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )
    database_url: str
    frontend_origin: str = "http://localhost:5173"
    session_cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
