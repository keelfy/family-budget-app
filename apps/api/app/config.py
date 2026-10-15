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

    # Receipt item categorization: any OpenAI-compatible chat-completions API.
    # Empty key disables it (items are imported uncategorized).
    llm_api_key: str = ""
    llm_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    llm_model: str = "gemini-2.5-flash-lite"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
