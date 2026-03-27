import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from pathlib import Path
from datetime import datetime
from app.config import PLOTS_DIR
import pandas as pd

def prune_old_plots(plots_dir: Path, *, max_pngs: int = 102) -> None:
    """
    Ensure there are at most `max_pngs` PNG files in the plots directory
    by deleting the oldest ones first.
    """
    pngs = sorted(
        plots_dir.glob("*.png"),
        key=lambda p: p.stat().st_mtime,  # oldest first
    )
    if len(pngs) <= max_pngs:
        return

    # Delete just enough oldest files so that only `max_pngs` remain
    delete_count = len(pngs) - max_pngs
    for p in pngs[:delete_count]:
        try:
            p.unlink()
        except FileNotFoundError:
            pass

class BasePlotter:
    """Base class for all plot types"""
    
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.fig = None
        self.ax = None
    
    def create_figure(self, figsize=(10, 6)):
        """Initialize matplotlib figure"""
        self.fig, self.ax = plt.subplots(figsize=figsize)
    
    def apply_grid(self, show_grid: bool):
        """Apply grid settings"""
        if show_grid:
            self.ax.grid(True, alpha=0.3, linestyle='--')
    
    def save_plot(self, plot_type: str) -> str:
        """Save plot and return relative path"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{plot_type}_{timestamp}.png"
        filepath = PLOTS_DIR / filename
        
        plt.tight_layout()
        plt.savefig(filepath, dpi=100, bbox_inches='tight')
        plt.close(self.fig)

        # After saving, prune so that only the latest `max_pngs` remain
        prune_old_plots(PLOTS_DIR, max_pngs=102)
        
        # Return relative path for URL
        return f"static/plots/{filename}"
    
    def validate_numeric(self, column: str):
        """Ensure column is numeric"""
        if column not in self.df.columns:
            raise ValueError(f"Column '{column}' not found")
        
        if not pd.api.types.is_numeric_dtype(self.df[column]):
            raise ValueError(f"Column '{column}' must be numeric")