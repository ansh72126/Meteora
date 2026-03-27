from fastapi import APIRouter, Depends

from app.services.auth import get_current_user_id
from app.services.csv_handler import CSVHandler

router = APIRouter(prefix="/session", tags=["session"])


@router.post("/cleanup")
async def cleanup_user_session(user_id: str = Depends(get_current_user_id)):
    CSVHandler.delete_user_csv(user_id=user_id)
    return {"ok": True}

