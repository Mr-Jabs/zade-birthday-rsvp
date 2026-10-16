from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )
    database_url: str
    frontend_origin: str = "http://localhost:5173"
    session_cookie_secure: bool = False

    @property
    def allowed_frontend_origins(self) -> list[str]:
        return list(dict.fromkeys([
            "https://mr-jabs.github.io",
            self.frontend_origin.rstrip("/"),
        ]))

    @property
    def session_cookie_samesite(self) -> Literal["none", "strict"]:
        # GitHub Pages and Render are different sites. SameSite=None requires HTTPS.
        return "none" if self.session_cookie_secure else "strict"


@lru_cache
def get_settings() -> Settings:
    return Settings()
