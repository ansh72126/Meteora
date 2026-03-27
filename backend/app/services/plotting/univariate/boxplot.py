import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from app.services.plotting.base import BasePlotter

class BoxPlotPlotter(BasePlotter):
    """Create box plots with statistical analysis"""
    
    def plot(
        self,
        numeric_column: str,
        grouping_column: str = None,
        grouping_mode: str = "single",
        orientation: str = "vertical",
        whisker_definition: str = "iqr",
        outlier_detection: bool = True,
        quartile_method: str = "linear",
        axis_scale: str = "linear",
        axis_range: str = "auto",
        range_min: float = None,
        range_max: float = None,
        grid_style: str = "horizontal",
        color_mode: str = "single",
        single_color: str = "#00d4ff",
        show_legend: bool = False,
        dark_theme: bool = False,
        category_sorting: str = "original"
    ) -> tuple:
        """Generate box plot and return (image_path, statistics)"""
        
        df = self.df.copy()
        coerced = pd.to_numeric(df[numeric_column], errors="coerce")
        n_rows = len(df)
        if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
            raise ValueError(
                f"Column '{numeric_column}' appears to be categorical or non-numeric. "
                f"Select a numeric column for the box plot."
            )
        self.validate_numeric(numeric_column)
        
        # Apply dark theme if enabled
        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')
        
        self.create_figure()
        
        # Prepare data and statistics
        statistics = []
        
        if grouping_column:
            # Grouped box plot
            groups = self.df[grouping_column].unique()
            
            # Sort groups if needed
            if category_sorting == "alphabetical":
                groups = sorted(groups)
            elif category_sorting == "median":
                medians = [self.df[self.df[grouping_column] == g][numeric_column].median() 
                          for g in groups]
                groups = [g for _, g in sorted(zip(medians, groups))]
            
            data_to_plot = []
            for group in groups:
                group_data = self.df[self.df[grouping_column] == group][numeric_column].dropna()
                data_to_plot.append(group_data)
                
                # Calculate statistics
                stats = self._calculate_statistics(group_data, str(group), whisker_definition)
                statistics.append(stats)
            
            labels = [str(g) for g in groups]
            
            # Define colors
            if color_mode == "single":
                colors = [single_color] * len(groups)
            else:
                default_colors = ['#00d4ff', '#ff6b6b', '#4ecdc4', '#95e1d3', 
                                '#f38181', '#aa96da', '#fcbad3', '#ffffd2']
                colors = default_colors[:len(groups)]
        else:
            # Single box plot
            data_to_plot = [self.df[numeric_column].dropna()]
            labels = [numeric_column]
            colors = [single_color]
            
            # Calculate statistics
            stats = self._calculate_statistics(data_to_plot[0], numeric_column, whisker_definition)
            statistics.append(stats)
        
        # Create box plot
        whis = 1.5 if whisker_definition == "iqr" else (0, 100)
        
        bp = self.ax.boxplot(
            data_to_plot,
            labels=labels,
            vert=(orientation == "vertical"),
            showfliers=outlier_detection,
            whis=whis,
            patch_artist=True,
            notch=False
        )
        
        # Color the boxes
        for patch, color in zip(bp['boxes'], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)
        
        # Color medians
        for median in bp['medians']:
            median.set_color('#ff0000')
            median.set_linewidth(2)
        
        # Color whiskers and caps
        for whisker in bp['whiskers']:
            whisker.set_color('#7faddb')
            whisker.set_linewidth(1.5)
        
        for cap in bp['caps']:
            cap.set_color('#7faddb')
            cap.set_linewidth(1.5)
        
        # Color outliers
        if outlier_detection:
            for flier in bp['fliers']:
                flier.set_marker('o')
                flier.set_markerfacecolor('#ffa500')
                flier.set_markeredgecolor('#ffa500')
                flier.set_markersize(5)
                flier.set_alpha(0.6)
        
        # Labels and title
        if orientation == "vertical":
            self.ax.set_ylabel(numeric_column, fontsize=12)
            if grouping_column:
                self.ax.set_xlabel(grouping_column, fontsize=12)
                title = f'Box Plot: {numeric_column} by {grouping_column}'
            else:
                title = f'Box Plot: {numeric_column}'
            
            # Rotate labels if many groups
            if len(labels) > 5:
                self.ax.set_xticklabels(labels, rotation=45, ha='right')
        else:
            self.ax.set_xlabel(numeric_column, fontsize=12)
            if grouping_column:
                self.ax.set_ylabel(grouping_column, fontsize=12)
                title = f'Box Plot: {numeric_column} by {grouping_column}'
            else:
                title = f'Box Plot: {numeric_column}'
        
        self.ax.set_title(title, fontsize=14, fontweight='bold')
        
        # Grid
        if grid_style == "horizontal":
            if orientation == "vertical":
                self.ax.yaxis.grid(True, alpha=0.3, linestyle='--')
            else:
                self.ax.xaxis.grid(True, alpha=0.3, linestyle='--')
            self.ax.set_axisbelow(True)
        
        # Axis scale
        if axis_scale == "log":
            if orientation == "vertical":
                self.ax.set_yscale('log')
            else:
                self.ax.set_xscale('log')
        
        # Axis range
        if axis_range == "manual":
            if orientation == "vertical":
                if range_min is not None or range_max is not None:
                    self.ax.set_ylim(bottom=range_min, top=range_max)
            else:
                if range_min is not None or range_max is not None:
                    self.ax.set_xlim(left=range_min, right=range_max)
        
        # Legend
        if show_legend and grouping_column:
            self.ax.legend(
                [bp['boxes'][i] for i in range(len(labels))],
                labels,
                loc='best',
                framealpha=0.9
            )
        
        image_path = self.save_plot("boxplot")
        return image_path, statistics
    
    def _calculate_statistics(self, data, group_name, whisker_def):
        """Calculate box plot statistics"""
        q1 = np.percentile(data, 25)
        median = np.percentile(data, 50)
        q3 = np.percentile(data, 75)
        iqr = q3 - q1
        
        if whisker_def == "iqr":
            lower_whisker = q1 - 1.5 * iqr
            upper_whisker = q3 + 1.5 * iqr
            
            # Get actual whisker values (within bounds)
            min_val = data[data >= lower_whisker].min()
            max_val = data[data <= upper_whisker].max()
            
            # Count outliers
            outliers = data[(data < lower_whisker) | (data > upper_whisker)]
            outlier_count = len(outliers)
        else:
            min_val = data.min()
            max_val = data.max()
            outlier_count = 0
        
        return {
            "group": group_name,
            "n": len(data),
            "median": float(median),
            "q1": float(q1),
            "q3": float(q3),
            "iqr": float(iqr),
            "min": float(min_val),
            "max": float(max_val),
            "outlier_count": outlier_count
        }