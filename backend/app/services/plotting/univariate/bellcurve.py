import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats
from app.services.plotting.base import BasePlotter

class BellCurvePlotter(BasePlotter):
    """Create Bell Curve (Normal Distribution) plots"""
    
    def plot(
        self,
        x_column: str,
        color: str = "#9b59b6",
        grid: bool = True,
        dark_theme: bool = False,
        line_width: float = 2.0,
        alpha: float = 0.8,
        overlay_histogram: bool = False,
        show_confidence_interval: bool = True,
        confidence_level: int = 95
    ) -> str:
        """Generate bell curve plot"""
        
        df = self.df.copy()
        coerced = pd.to_numeric(df[x_column], errors="coerce")
        n_rows = len(df)
        if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
            raise ValueError(
                f"Column '{x_column}' appears to be categorical or non-numeric. "
                f"Select a numeric column for the bell curve."
            )
        self.validate_numeric(x_column)
        
        # Apply dark theme if enabled
        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')
        
        self.create_figure()
        
        # Get data
        data = self.df[x_column].dropna()
        
        # Calculate statistics
        mean = data.mean()
        std = data.std()
        
        # Generate x range for bell curve
        x_min = data.min()
        x_max = data.max()
        # Extend range to show full bell curve
        x_range = np.linspace(x_min - std, x_max + std, 500)
        
        # Calculate normal distribution
        bell_curve = stats.norm.pdf(x_range, mean, std)
        
        # Overlay histogram if requested
        if overlay_histogram:
            # Plot histogram (normalized)
            n, bins, patches = self.ax.hist(
                data,
                bins=30,
                density=True,  # Normalize to match bell curve
                alpha=0.3,
                color=color,
                edgecolor='black',
                linewidth=0.5,
                label='Empirical (Histogram)'
            )
        
        # Plot bell curve
        self.ax.plot(
            x_range,
            bell_curve,
            color=color,
            linewidth=line_width,
            alpha=alpha,
            label=f'Theoretical (μ={mean:.2f}, σ={std:.2f})'
        )
        
        # Show confidence interval if requested
        if show_confidence_interval:
            # Calculate confidence interval bounds
            z_score = stats.norm.ppf((1 + confidence_level / 100) / 2)
            ci_lower = mean - z_score * std
            ci_upper = mean + z_score * std
            
            # Shade confidence interval
            mask = (x_range >= ci_lower) & (x_range <= ci_upper)
            self.ax.fill_between(
                x_range[mask],
                bell_curve[mask],
                alpha=0.2,
                color=color,
                label=f'{confidence_level}% Confidence Interval'
            )
            
            # Draw vertical lines at CI bounds
            self.ax.axvline(
                ci_lower,
                color=color,
                linestyle='--',
                linewidth=1,
                alpha=0.5
            )
            self.ax.axvline(
                ci_upper,
                color=color,
                linestyle='--',
                linewidth=1,
                alpha=0.5
            )
        
        # Draw mean line
        self.ax.axvline(
            mean,
            color='red',
            linestyle='-',
            linewidth=1.5,
            alpha=0.7,
            label=f'Mean ({mean:.2f})'
        )
        
        # Labels and title
        self.ax.set_xlabel(x_column, fontsize=12)
        self.ax.set_ylabel('Density', fontsize=12)
        
        title = f'Normal Distribution of {x_column}'
        if overlay_histogram:
            title += ' (vs Empirical)'
        self.ax.set_title(title, fontsize=14, fontweight='bold')
        
        # Grid
        self.apply_grid(grid)
        
        # Legend
        self.ax.legend(loc='best', framealpha=0.9, fontsize=9)
        
        return self.save_plot("bellcurve")