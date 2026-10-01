import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        """Accept CORS_ORIGINS as comma-separated text or as a JSON array."""
        if not isinstance(value, str):
            return value
        s = value.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
            s = s[1:-1]
        return [p.strip().strip('"').strip("'") for p in s.split(",") if p.strip()]

    app_name: str = "Peace-Watch API"
    version: str = "0.3.0"

    # Public display name used by the WhatsApp chatbot in replies.
    # (The official display name shown at the top of the chat is set in the
    # Meta dashboard, not here — this only controls how the bot signs itself.)
    bot_name: str = "Community Watch"

    # When False the API never auto-seeds demo reports on startup, so a
    # cleared database stays cleared. Set DEMO_AUTO_SEED=false on Render.
    demo_auto_seed: bool = True

    # Defaults to SQLite so the project runs out of the box.
    # Point this at PostgreSQL for production / Step 2, e.g.:
    #   postgresql+asyncpg://peacewatch:password@localhost:5432/peacewatch
    database_url: str = "sqlite+aiosqlite:///./peacewatch.db"

    # Allowed browser origins for the dashboard (dev server + vite preview).
    # NoDecode passes the raw env string to parse_cors_origins so both
    # comma-separated and JSON-array formats are accepted.
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]

    # Local-dev friendly: when True the API accepts requests from ANY browser
    # origin (allow_credentials is then disabled). Set to false and rely on
    # cors_origins for stricter, production-style CORS control.
    cors_allow_all: bool = True

    # Corroboration / clustering parameters.
    cluster_radius_km: float = 2.0
    cluster_time_window_hours: int = 6
    cluster_min_reports: int = 2
    cluster_active_hours: int = 24

    # --- AI extraction (OpenRouter, primary) ---
    openrouter_api_key: str = ""
    openrouter_model: str = "nvidia/nemotron-3-super-120b-a12b:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_timeout_seconds: int = 40
    ai_summary_max_length: int = 300
    ai_max_input_chars: int = 4000

    # --- AI extraction (NVIDIA NIM, fallback) ---
    nvidia_api_key: str = ""
    nvidia_model: str = "nvidia/nemotron-3-super-120b-a12b"
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_timeout_seconds: int = 40

    # --- Speech-to-text (faster-whisper) ---
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_language: str = "auto"  # "auto" or an ISO code such as "en"
    whisper_download_root: str = ""
    voice_max_bytes: int = 25 * 1024 * 1024
    voice_temp_dir: str = ""

    # --- WhatsApp / Meta Cloud API webhook ---
    # Public callback URL: https://<your-domain>/api/whatsapp/webhook
    # "verify token": a secret phrase you share with Meta; must match what
    # you enter in the Meta developer dashboard (Webhook → Verify token).
    whatsapp_verify_token: str = "peacewatch"
    # Optional: Meta App Secret. When set, incoming webhook payloads are
    # checked against the X-Hub-Signature-256 header (HMAC-SHA256 of the body).
    whatsapp_app_secret: str = ""
    # Optional: when both are set, the bot auto-replies to the sender with a
    # confirmation after each report is ingested.
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""


settings = Settings()