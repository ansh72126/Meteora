from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.services.csv_handler import CSVHandler
from app.models import UploadResponse
from app.config import MAX_FILE_SIZE, ALLOWED_EXTENSIONS
from pathlib import Path
from app.services.auth import get_current_user_id

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("/", response_model=UploadResponse)
async def upload_csv(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload CSV file to server"""
    
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Only CSV files allowed."
        )
    
    # Read file content
    content = await file.read()
    
    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE / 1024 / 1024}MB"
        )
    
    # Save CSV
    try:
        CSVHandler.save_user_csv(content, user_id=user_id)
        
        # Get metadata
        df = CSVHandler.load_user_csv(user_id=user_id)
        columns = df.columns.tolist()
        rows = len(df)
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        categorical_cols = [c for c in columns if c not in set(numeric_cols)]
        column_types = {c: ("numeric" if c in set(numeric_cols) else "categorical") for c in columns}
        
        return UploadResponse(
            message="File uploaded successfully",
            columns=columns,
            rows=rows,
            numeric_columns=numeric_cols,
            categorical_columns=categorical_cols,
            column_types=column_types,
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")