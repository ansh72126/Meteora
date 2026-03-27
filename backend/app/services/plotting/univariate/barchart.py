import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np
from app.services.plotting.base import BasePlotter

DISTINCT_COLORS = [
    "#33cc66", "#3366ff", "#ff6633", "#9b59b6",
    "#e91e8c", "#00bcd4", "#ff9800", "#4caf50",
]

class BarChartPlotter(BasePlotter):
    """Create bar chart plots"""
    
    def plot(
        self,
        value_columns: list,
        category_column: str,
        series_color_mode: str = "per-field",
        single_color: str = "#00d4ff",
        per_field_colors: list = None,          # ← added
        layout_mode: str = "grouped",
        orientation: str = "vertical",
        bar_width: float = 0.8,
        bar_spacing: float = 0.2,
        y_axis_scale: str = "auto",
        y_min: float = None,
        y_max: float = None,
        tick_format: str = "none",
        major_tick_interval: float = None,
        grid_style: bool = True,
        zero_baseline: bool = True,
        show_legend: bool = True,
        dark_theme: bool = False
    ) -> str:
        """Generate bar chart plot"""
        
        df = self.df.copy()
        if category_column not in df.columns:
            raise ValueError(f"Category column '{category_column}' not found")
        
        for col in value_columns:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"Value column '{col}' appears to be categorical or non-numeric. "
                    f"Select numeric columns for bar chart values."
                )
            self.validate_numeric(col)
        
        # Apply dark theme if enabled
        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')
        
        # Adjust figure size based on number of categories
        n_categories = len(self.df[category_column].unique())
        figsize = (max(10, n_categories * 0.8), 6)
        self.create_figure(figsize=figsize)
        
        # Get categories
        categories = self.df[category_column].unique()
        x_pos = np.arange(len(categories))
        
        # ── Resolve colors ──────────────────────────────────
        if series_color_mode == "single":
            colors = [single_color] * len(value_columns)
        elif series_color_mode == "per-field" and per_field_colors and len(per_field_colors) == len(value_columns):
            colors = per_field_colors
        else:
            colors = [DISTINCT_COLORS[i % len(DISTINCT_COLORS)] for i in range(len(value_columns))]
        
        # Plot based on layout mode
        if layout_mode == "stacked":
            # Stacked bar chart
            bottom = np.zeros(len(categories))
            
            for idx, col in enumerate(value_columns):
                values = [self.df[self.df[category_column] == cat][col].sum() 
                         for cat in categories]
                
                if orientation == "vertical":
                    self.ax.bar(
                        x_pos, values, bar_width,
                        bottom=bottom, label=col,
                        color=colors[idx], alpha=0.8
                    )
                else:
                    self.ax.barh(
                        x_pos, values, bar_width,
                        left=bottom, label=col,
                        color=colors[idx], alpha=0.8
                    )
                
                bottom += values
        
        else:
            # Grouped bar chart
            n_bars = len(value_columns)
            width = bar_width / n_bars
            offset = (np.arange(n_bars) - n_bars / 2) * (width + bar_spacing / n_bars)
            
            for idx, col in enumerate(value_columns):
                values = [self.df[self.df[category_column] == cat][col].sum() 
                         for cat in categories]
                
                if orientation == "vertical":
                    self.ax.bar(
                        x_pos + offset[idx], values, width,
                        label=col, color=colors[idx], alpha=0.8
                    )
                else:
                    self.ax.barh(
                        x_pos + offset[idx], values, width,
                        label=col, color=colors[idx], alpha=0.8
                    )
        
        # Set labels and title
        if orientation == "vertical":
            self.ax.set_xticks(x_pos)
            self.ax.set_xticklabels(categories, rotation=45 if len(categories) > 5 else 0, ha='right')
            self.ax.set_xlabel(category_column, fontsize=12)
            self.ax.set_ylabel('Value', fontsize=12)
            
            if tick_format == "K":
                self.ax.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'{x/1000:.0f}K'))
            elif tick_format == "M":
                self.ax.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'{x/1000000:.1f}M'))
            
            if y_axis_scale == "manual":
                if y_min is not None or y_max is not None:
                    self.ax.set_ylim(bottom=y_min, top=y_max)
            
            if zero_baseline:
                ylim = self.ax.get_ylim()
                self.ax.set_ylim(bottom=0, top=ylim[1])
            
            if major_tick_interval:
                self.ax.yaxis.set_major_locator(ticker.MultipleLocator(major_tick_interval))
        
        else:
            self.ax.set_yticks(x_pos)
            self.ax.set_yticklabels(categories)
            self.ax.set_ylabel(category_column, fontsize=12)
            self.ax.set_xlabel('Value', fontsize=12)
            
            if tick_format == "K":
                self.ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'{x/1000:.0f}K'))
            elif tick_format == "M":
                self.ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'{x/1000000:.1f}M'))
            
            if y_axis_scale == "manual":
                if y_min is not None or y_max is not None:
                    self.ax.set_xlim(left=y_min, right=y_max)
            
            if zero_baseline:
                xlim = self.ax.get_xlim()
                self.ax.set_xlim(left=0, right=xlim[1])
            
            if major_tick_interval:
                self.ax.xaxis.set_major_locator(ticker.MultipleLocator(major_tick_interval))
        
        # Title
        if len(value_columns) == 1:
            title = f'Bar Chart: {value_columns[0]} by {category_column}'
        else:
            title = f'Bar Chart: {len(value_columns)} metrics by {category_column}'
        
        self.ax.set_title(title, fontsize=14, fontweight='bold')
        
        # Grid
        if grid_style:
            if orientation == "vertical":
                self.ax.yaxis.grid(True, alpha=0.3, linestyle='--')
            else:
                self.ax.xaxis.grid(True, alpha=0.3, linestyle='--')
            self.ax.set_axisbelow(True)
        
        # Legend
        if show_legend and len(value_columns) > 1:
            self.ax.legend(loc='best', framealpha=0.9)
        
        return self.save_plot("barchart")