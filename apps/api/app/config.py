from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str

    # App
    app_name: str = "Nomad Ledger API"
    debug: bool = False

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Exchange Rate API
    frankfurter_api_url: str = "https://api.frankfurter.app"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
