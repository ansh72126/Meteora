FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Prevents Python from writing .pyc files
ENV PYTHONDONTWRITEBYTECODE=1

# System deps for scientific Python libs (safe defaults)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    libfreetype6-dev \
    libpng-dev \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend app code
COPY ./app /app/app

# Create expected runtime dirs (your code uses BASE_DIR / "uploads" and / "static")
RUN mkdir -p /app/uploads /app/static

EXPOSE 8000

# IMPORTANT:
# - The backend reads env vars SUPABASE_URL and SUPABASE_ANON_KEY from the process environment.
# - It also attempts to load /app/.env (via backend/app/main.py). For production, prefer passing
#   secrets as environment variables or using Docker/Kubernetes "--env-file" at runtime.

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]