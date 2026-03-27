import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.interpolate import make_interp_spline
from app.services.plotting.base import BasePlotter

class LineChartPlotter(BasePlotter):
    """Create line chart plots"""
    
    def plot(
        self,
        x_axis_field: str,
        y_axis_field: str,
        series_group_field: str = None,
        multi_series_mode: str = "single",
        x_axis_type: str = "numeric",
        y_axis_scale: str = "linear",
        aggregation_method: str = "none",
        sorting_order: str = "ascending",
        missing_value_handling: str = "connect",
        enable_secondary_axis: bool = False,
        secondary_y_field: str = None,
        default_line_style: str = "solid",
        color_mode: str = "auto",
        show_legend: bool = True,
        legend_position: str = "best",
        grid_style: str = "horizontal",
        area_fill: bool = False,
        fill_alpha: float = 0.3,
        smoothing: str = "none",
        smoothing_window: int = 3,
        line_width: float = 2.0,
        marker_style: str = "none",
        marker_size: int = 6,
        dark_theme: bool = False
    ) -> str:
        """Generate line chart"""
        
        df = self.df.copy()
        cols_to_check: list = [(y_axis_field, "Y-axis")]
        if enable_secondary_axis and secondary_y_field and secondary_y_field in df.columns:
            cols_to_check.append((secondary_y_field, "Secondary Y-axis"))
        for col, label in cols_to_check:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"The {label} column '{col}' appears to be categorical or non-numeric. "
                    f"Select a numeric column for {label}."
                )
        
        # Apply dark theme if enabled
        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')
        
        self.create_figure(figsize=(12, 7))
        
        # Define colors
        colors = [
            '#00d4ff', '#ff6b6b', '#4ecdc4', '#95e1d3',
            '#f38181', '#aa96da', '#fcbad3', '#ffffd2'
        ]
        
        # Line style mapping
        line_styles = {
            'solid': '-',
            'dashed': '--',
            'dotted': ':'
        }
        
        # Marker mapping
        marker_map = {
            'none': '',
            'circle': 'o',
            'square': 's',
            'triangle': '^'
        }
        
        # Prepare data
        df_plot = self.df[[x_axis_field, y_axis_field]].copy()
        
        # Handle x-axis type
        if x_axis_type == "time":
            try:
                df_plot[x_axis_field] = pd.to_datetime(df_plot[x_axis_field])
            except:
                raise ValueError(f"Cannot convert {x_axis_field} to datetime")
        
        # Sort data
        df_plot = df_plot.sort_values(x_axis_field)
        
        # Handle aggregation
        if aggregation_method != "none":
            if aggregation_method == "sum":
                df_plot = df_plot.groupby(x_axis_field)[y_axis_field].sum().reset_index()
            elif aggregation_method == "mean":
                df_plot = df_plot.groupby(x_axis_field)[y_axis_field].mean().reset_index()
            elif aggregation_method == "count":
                df_plot = df_plot.groupby(x_axis_field)[y_axis_field].count().reset_index()
        
        # Handle missing values
        if missing_value_handling == "break":
            # Don't drop NaN, matplotlib will break the line
            pass
        elif missing_value_handling == "interpolate":
            df_plot[y_axis_field] = df_plot[y_axis_field].interpolate()
        else:  # connect
            df_plot = df_plot.dropna()
        
        # Plot based on mode
        if multi_series_mode == "single":
            x_data = df_plot[x_axis_field].values
            y_data = df_plot[y_axis_field].values
            
            # Apply smoothing
            if smoothing == "moving_average":
                y_data = pd.Series(y_data).rolling(window=smoothing_window, center=True).mean().values
            elif smoothing == "spline" and len(x_data) > 3:
                x_numeric = np.arange(len(x_data))
                spl = make_interp_spline(x_numeric, y_data, k=3)
                x_smooth = np.linspace(x_numeric.min(), x_numeric.max(), 300)
                y_data = spl(x_smooth)
                x_data = np.linspace(x_data.min(), x_data.max(), 300)
            
            # Plot line
            self.ax.plot(
                x_data, y_data,
                linestyle=line_styles[default_line_style],
                linewidth=line_width,
                color=colors[0],
                marker=marker_map[marker_style],
                markersize=marker_size,
                label=y_axis_field
            )
            
            # Area fill
            if area_fill:
                self.ax.fill_between(x_data, y_data, alpha=fill_alpha, color=colors[0])
            
            # Secondary axis
            if enable_secondary_axis and secondary_y_field:
                ax2 = self.ax.twinx()
                df_plot2 = self.df[[x_axis_field, secondary_y_field]].copy()
                df_plot2 = df_plot2.sort_values(x_axis_field).dropna()
                
                ax2.plot(
                    df_plot2[x_axis_field].values,
                    df_plot2[secondary_y_field].values,
                    linestyle='--',
                    linewidth=line_width,
                    color=colors[1],
                    marker=marker_map[marker_style],
                    markersize=marker_size,
                    label=secondary_y_field
                )
                
                ax2.set_ylabel(secondary_y_field, fontsize=12, color=colors[1])
                ax2.tick_params(axis='y', labelcolor=colors[1])
        
        else:  # multiple series
            if not series_group_field:
                raise ValueError("Series group field required for multiple series mode")
            
            groups = self.df[series_group_field].unique()
            
            for idx, group in enumerate(groups):
                df_group = self.df[self.df[series_group_field] == group]
                df_group = df_group[[x_axis_field, y_axis_field]].copy()
                df_group = df_group.sort_values(x_axis_field).dropna()
                
                x_data = df_group[x_axis_field].values
                y_data = df_group[y_axis_field].values
                
                # Apply smoothing
                if smoothing == "moving_average" and len(y_data) >= smoothing_window:
                    y_data = pd.Series(y_data).rolling(window=smoothing_window, center=True).mean().values
                
                self.ax.plot(
                    x_data, y_data,
                    linestyle=line_styles[default_line_style],
                    linewidth=line_width,
                    color=colors[idx % len(colors)],
                    marker=marker_map[marker_style],
                    markersize=marker_size,
                    label=str(group)
                )
                
                if area_fill:
                    self.ax.fill_between(
                        x_data, y_data,
                        alpha=fill_alpha,
                        color=colors[idx % len(colors)]
                    )
        
        # Labels and title
        self.ax.set_xlabel(x_axis_field, fontsize=12)
        self.ax.set_ylabel(y_axis_field, fontsize=12)
        
        if multi_series_mode == "single":
            title = f'Line Chart: {y_axis_field} vs {x_axis_field}'
        else:
            title = f'Line Chart: {y_axis_field} by {series_group_field}'
        
        self.ax.set_title(title, fontsize=14, fontweight='bold')
        
        # Y-axis scale
        if y_axis_scale == "log":
            self.ax.set_yscale('log')
        elif y_axis_scale == "symlog":
            self.ax.set_yscale('symlog')
        
        # Grid
        if grid_style == "horizontal":
            self.ax.yaxis.grid(True, alpha=0.3, linestyle='--')
        elif grid_style == "full":
            self.ax.grid(True, alpha=0.3, linestyle='--')
        
        if grid_style != "none":
            self.ax.set_axisbelow(True)
        
        # Legend
        if show_legend:
            self.ax.legend(loc=legend_position, framealpha=0.9)
        
        # Rotate x-axis labels if many points
        if x_axis_type == "time" or len(df_plot) > 10:
            plt.xticks(rotation=45, ha='right')
        
        plt.tight_layout()
        
        return self.save_plot("linechart")