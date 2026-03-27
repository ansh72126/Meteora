import pandas as pd
from pathlib import Path
from app.config import UPLOAD_DIR, CSV_FILENAME

class CSVHandler:
    """Handles CSV file operations"""

    @staticmethod
    def _resolve_user_path(user_id: str) -> Path:
        user_dir = UPLOAD_DIR / "users" / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / CSV_FILENAME
    
    @staticmethod
    def save_user_csv(file_content: bytes, user_id: str) -> Path:
        """Save uploaded CSV for a specific user (overwrites)."""
        file_path = CSVHandler._resolve_user_path(user_id)
        
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        return file_path
    
    @staticmethod
    def load_user_csv(user_id: str) -> pd.DataFrame:
        """Load the current CSV file for a user."""
        file_path = CSVHandler._resolve_user_path(user_id)
        
        if not file_path.exists():
            raise FileNotFoundError("No CSV file uploaded")
        
        return pd.read_csv(file_path)
    
    @staticmethod
    def delete_user_csv(user_id: str) -> None:
        user_dir = UPLOAD_DIR / "users" / user_id
        file_path = user_dir / CSV_FILENAME

        if file_path.exists():
            file_path.unlink()

        # Remove the user folder too if it is now empty
        if user_dir.exists() and user_dir.is_dir():
            try:
                next(user_dir.iterdir())
            except StopIteration:
                user_dir.rmdir()

    @staticmethod
    def get_columns(user_id: str) -> list[str]:
        """Get column names from current CSV"""
        df = CSVHandler.load_user_csv(user_id)
        return df.columns.tolist()
    
    @staticmethod
    def validate_column(column: str, user_id: str) -> bool:
        """Check if column exists in CSV"""
        columns = CSVHandler.get_columns(user_id)
        return column in columns
    
    @staticmethod
    def get_numeric_columns(user_id: str) -> list[str]:
        """Get only numeric columns"""
        df = CSVHandler.load_user_csv(user_id)
        return df.select_dtypes(include=['number']).columns.tolist()