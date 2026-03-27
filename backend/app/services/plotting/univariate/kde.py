import pandas as pd
from scipy.stats import gaussian_kde
import numpy as np
import matplotlib.pyplot as plt
from app.services.plotting.base import BasePlotter

class KDEPlotter(BasePlotter):
    """Create Kernel Density Estimation plots"""
    
    def plot(
        self,
        x_column: str,
        x_column_2: str = None,
        color: str = "#ff6633",
        color_2: str = None,
        grid: bool = True,
        legend: bool = False,
        dark_theme: bool = False,
        bw_adjust: float = 1.0,
        alpha: float = 0.7,
        fill: bool = True
    ) -> str:
        """Generate KDE plot"""
        
        df = self.df.copy()
        for col in [x_column, x_column_2] if x_column_2 else [x_column]:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"Column '{col}' appears to be categorical or non-numeric. "
                    f"Select a numeric column for KDE."
                )
        self.validate_numeric(x_column)
        
        # Apply dark theme if enabled
        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')
        
        self.create_figure()
        
        # Process first field
        data1 = self.df[x_column].dropna()
        
        # ✅ FIX: Use bw_method correctly with bandwidth adjustment
        kde1 = gaussian_kde(data1, bw_method=gaussian_kde.scotts_factor)
        kde1.set_bandwidth(kde1.factor * bw_adjust)
        
        x_range1 = np.linspace(data1.min(), data1.max(), 500)
        density1 = kde1(x_range1)
        
        # Plot single or dual KDE
        if x_column_2:
            # Validate second column
            self.validate_numeric(x_column_2)
            
            # Process second field
            data2 = self.df[x_column_2].dropna()
            
            # ✅ FIX: Same bandwidth adjustment for second field
            kde2 = gaussian_kde(data2, bw_method=gaussian_kde.scotts_factor)
            kde2.set_bandwidth(kde2.factor * bw_adjust)
            
            x_range2 = np.linspace(data2.min(), data2.max(), 500)
            density2 = kde2(x_range2)
            
            # Plot both KDEs
            if fill:
                self.ax.fill_between(
                    x_range1, density1, 
                    alpha=alpha, 
                    color=color, 
                    label=x_column
                )
                self.ax.fill_between(
                    x_range2, density2, 
                    alpha=alpha, 
                    color=color_2 or "#3366ff", 
                    label=x_column_2
                )
            
            self.ax.plot(
                x_range1, density1, 
                color=color, 
                linewidth=2, 
                label=x_column if not fill else None
            )
            self.ax.plot(
                x_range2, density2, 
                color=color_2 or "#3366ff", 
                linewidth=2, 
                label=x_column_2 if not fill else None
            )
            
            # Title for dual KDE
            self.ax.set_title(
                f'KDE Plot of {x_column} & {x_column_2}',
                fontsize=14,
                fontweight='bold'
            )
            
        else:
            # Single KDE
            if fill:
                self.ax.fill_between(x_range1, density1, alpha=alpha, color=color)
            
            self.ax.plot(x_range1, density1, color=color, linewidth=2)
            
            self.ax.set_title(
                f'KDE Plot of {x_column}',
                fontsize=14,
                fontweight='bold'
            )
        
        # Labels
        self.ax.set_xlabel('Value', fontsize=12)
        self.ax.set_ylabel('Density', fontsize=12)
        
        # Grid
        self.apply_grid(grid)
        
        # Legend (only show if user wants it)
        if legend:
            self.ax.legend(loc='best', framealpha=0.9)
        
        return self.save_plot("kde")