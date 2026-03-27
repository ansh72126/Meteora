from __future__ import annotations

import json
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import SUPABASE_URL, SUPABASE_ANON_KEY


_bearer = HTTPBearer(auto_error=True)


def _get_user_from_supabase(access_token: str) -> dict[str, Any]:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase server auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend environment.",
        )

    req = Request(
        url=f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        },
        method="GET",
    )

    try:
        with urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except HTTPError as e:
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        raise HTTPException(status_code=401, detail=f"Invalid or expired access token. {body}".strip())
    except (URLError, TimeoutError) as e:
        raise HTTPException(status_code=502, detail=f"Auth provider request failed: {e}")


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    token = credentials.credentials
    user = _get_user_from_supabase(token)
    user_id = user.get("id") or user.get("sub")
    if not user_id or not isinstance(user_id, str):
        raise HTTPException(status_code=401, detail="Unable to resolve user id from access token.")
    return user_id

