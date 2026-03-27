import pandas as pd
import matplotlib.pyplot as plt
from app.services.plotting.base import BasePlotter

class HistogramPlotter(BasePlotter):
    """Create histogram plots"""
    
    def plot(
        self,
        x_column: str,
        x_column_2: str = None,
        bins: int = 20,
        color: str = "#3366ff",
        color_2: str = None,
        grid: bool = True,
        legend: bool = False,
        dark_theme: bool = False,
        alpha: float = 0.7
    ) -> str:
        """Generate histogram plot"""
        
        df = self.df.copy()
        for col in [x_column, x_column_2] if x_column_2 else [x_column]:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"Column '{col}' appears to be categorical or non-numeric. "
                    f"Select a numeric column for the histogram."
                )
        self.validate_numeric(x_column)
        
        # Apply dark theme if enabled
        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')
        
        self.create_figure()
        
        # Plot single or dual histogram
        if x_column_2:
            # Validate second column
            self.validate_numeric(x_column_2)
            
            # Plot both histograms
            self.ax.hist(
                self.df[x_column].dropna(),
                bins=bins,
                color=color,
                alpha=alpha,
                edgecolor='black',
                linewidth=0.5,
                label=x_column
            )
            
            self.ax.hist(
                self.df[x_column_2].dropna(),
                bins=bins,
                color=color_2 or "#ff6633",
                alpha=alpha,
                edgecolor='black',
                linewidth=0.5,
                label=x_column_2
            )
            
            # Title for dual histogram
            self.ax.set_title(
                f'Histogram of {x_column} & {x_column_2}',
                fontsize=14,
                fontweight='bold'
            )
            
            # ✅ FIX: Don't override legend variable - respect user choice
            # If user wants legend off even with 2 fields, allow it
            
        else:
            # Single histogram
            self.ax.hist(
                self.df[x_column].dropna(),
                bins=bins,
                color=color,
                alpha=alpha,
                edgecolor='black',
                linewidth=0.5,
                label=x_column  # ✅ FIX: Add label even for single field
            )
            
            self.ax.set_title(
                f'Histogram of {x_column}',
                fontsize=14,
                fontweight='bold'
            )
        
        # Labels
        self.ax.set_xlabel('Value', fontsize=12)
        self.ax.set_ylabel('Frequency', fontsize=12)
        
        # Grid
        self.apply_grid(grid)
        
        # ✅ FIX: Only show legend if user wants it (respect the parameter)
        if legend:
            self.ax.legend(loc='best', framealpha=0.9)
        
        return self.save_plot("histogram")