import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Upload settings
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Static files
STATIC_DIR = BASE_DIR / "static"
PLOTS_DIR = STATIC_DIR / "plots"
PLOTS_DIR.mkdir(parents=True, exist_ok=True)

# CSV settings
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {".csv"}

# CORS settings
# Set FRONTEND_URL to your deployed Next.js origin for production.
# Example: FRONTEND_URL="https://your-domain.com"
#
# For local development, if you keep FRONTEND_URL at localhost, localhost origins
# are automatically allowed. Otherwise, localhost origins are blocked unless
# you explicitly set ALLOW_LOCALHOST_CORS=true.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
ALLOW_LOCALHOST_CORS = os.getenv("ALLOW_LOCALHOST_CORS", "false").strip().lower() in (
    "1",
    "true",
    "yes",
)

def _is_local_origin(origin: str) -> bool:
    origin = origin.lower()
    return (
        origin.startswith("http://localhost")
        or origin.startswith("https://localhost")
        or origin.startswith("http://127.0.0.1")
        or origin.startswith("https://127.0.0.1")
    )

ALLOWED_ORIGINS = [FRONTEND_URL]
if _is_local_origin(FRONTEND_URL) or ALLOW_LOCALHOST_CORS:
    ALLOWED_ORIGINS.extend(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    )

# Deduplicate while preserving order
ALLOWED_ORIGINS = list(dict.fromkeys(ALLOWED_ORIGINS))

# Session settings
CSV_FILENAME = "current_data.csv"  # Single CSV per session

# Supabase auth (server-side validation of access tokens)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")