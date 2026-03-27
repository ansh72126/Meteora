import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from app.services.plotting.base import BasePlotter

class PieChartPlotter(BasePlotter):
    """Create pie/donut chart plots"""
    
    def plot(
        self,
        category_column: str,
        value_column: str = None,
        aggregation_method: str = "sum",
        chart_type: str = "pie",
        inner_radius: float = 0.0,
        slice_ordering: str = "descending",
        start_angle: float = 0,
        value_representation: str = "percentage",
        label_position: str = "outside",
        min_slice_threshold: float = 2.0,
        show_legend: bool = True,
        legend_position: str = "right",
        center_label: str = None,
        show_total: bool = False,
        slice_border: bool = True,
        border_width: float = 1.5,
        angle_precision: int = 1,
        dark_theme: bool = False
    ) -> str:
        """Generate pie/donut chart"""
        
        # Validate category column
        if category_column not in self.df.columns:
            raise ValueError(f"Category column '{category_column}' not found")
        
        # Apply dark theme if enabled
        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')
        
        self.create_figure()
        
        # Aggregate data based on method
        df = self.df.copy()
        if aggregation_method == "count":
            data = self.df[category_column].value_counts()
        elif aggregation_method == "sum":
            if not value_column:
                raise ValueError("Value column required for sum aggregation")
            coerced = pd.to_numeric(df[value_column], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"Value column '{value_column}' appears to be categorical or non-numeric. "
                    f"Select a numeric column for sum aggregation, or use 'Count' aggregation."
                )
            self.validate_numeric(value_column)
            data = df.groupby(category_column)[value_column].sum()
        elif aggregation_method == "mean":
            if not value_column:
                raise ValueError("Value column required for mean aggregation")
            coerced = pd.to_numeric(df[value_column], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"Value column '{value_column}' appears to be categorical or non-numeric. "
                    f"Select a numeric column for mean aggregation, or use 'Count' aggregation."
                )
            self.validate_numeric(value_column)
            data = df.groupby(category_column)[value_column].mean()
        
        # Sort data if needed
        if slice_ordering == "ascending":
            data = data.sort_values(ascending=True)
        elif slice_ordering == "descending":
            data = data.sort_values(ascending=False)
        
        # Group small slices into "Other"
        if min_slice_threshold > 0:
            total = data.sum()
            percentages = (data / total) * 100
            small_slices_mask = percentages < min_slice_threshold
            
            if small_slices_mask.any():
                # Sum up small slices
                other_value = data[small_slices_mask].sum()
                # Keep large slices
                data = data[~small_slices_mask]
                # Add "Other" category if there were small slices
                if other_value > 0:
                    data = pd.concat([data, pd.Series({'Other': other_value})])
        
        # Define colors
        colors = [
            '#00d4ff', '#ff6b6b', '#4ecdc4', '#95e1d3',
            '#f38181', '#aa96da', '#fcbad3', '#ffffd2',
            '#ff9a76', '#7bed9f', '#ffa502', '#ff6348'
        ]
        colors = colors[:len(data)]
        
        # Prepare labels based on value representation
        labels = []
        total = data.sum()
        for label, value in data.items():
            percentage = (value / total) * 100
            
            if value_representation == "values":
                labels.append(f'{label}\n{value:.{angle_precision}f}')
            elif value_representation == "percentage":
                labels.append(f'{label}\n{percentage:.{angle_precision}f}%')
            elif value_representation == "both":
                labels.append(f'{label}\n{value:.{angle_precision}f} ({percentage:.{angle_precision}f}%)')
        
        # Determine if labels should be shown on chart
        autopct = None
        labels_to_show = None
        
        if label_position == "inside":
            if value_representation == "percentage":
                autopct = f'%1.{angle_precision}f%%'
            labels_to_show = [label.split('\n')[0] for label in labels]
        elif label_position == "outside":
            labels_to_show = labels
        elif label_position == "legend":
            labels_to_show = None
        
        # Create pie/donut chart
        wedgeprops = {}
        if chart_type == "donut":
            wedgeprops['width'] = 1 - inner_radius
        
        if slice_border:
            wedgeprops['edgecolor'] = 'white' if not dark_theme else '#0a1628'
            wedgeprops['linewidth'] = border_width
        
        # Create the pie chart
        pie_result = self.ax.pie(
            data.values,
            labels=labels_to_show,
            autopct=autopct,
            startangle=start_angle,
            colors=colors,
            wedgeprops=wedgeprops,
            pctdistance=0.85 if chart_type == "pie" else 0.75
        )
        
        # Unpack results
        if autopct:
            wedges, texts, autotexts = pie_result
        else:
            wedges, texts = pie_result
            autotexts = []
        
        # Style text
        for text in texts:
            text.set_fontsize(13)
            text.set_color('#7faddb' if dark_theme else '#333')
        
        if autotexts:
            for autotext in autotexts:
                autotext.set_color('white')
                autotext.set_fontsize(13)
                autotext.set_weight('bold')
        
        # Center label for donut
        if chart_type == "donut" and center_label:
            self.ax.text(
                0, 0, center_label,
                ha='center', va='center',
                fontsize=16, fontweight='bold',
                color='#00d4ff' if dark_theme else '#333'
            )
        
        # Show total if requested
        if show_total and chart_type == "donut":
            total_text = f'Total\n{total:.{angle_precision}f}'
            y_pos = -0.15 if center_label else 0
            self.ax.text(
                0, y_pos, total_text,
                ha='center', va='center',
                fontsize=12,
                color='#7faddb' if dark_theme else '#666'
            )
        
        # Title
        method_name = aggregation_method.capitalize()
        if value_column:
            title = f'{method_name} of {value_column} by {category_column}'
        else:
            title = f'{method_name} by {category_column}'
        
        self.ax.set_title(title, fontsize=14, fontweight='bold', pad=20)
        
        # Legend
        if show_legend:
            legend_labels = [label.split('\n')[0] for label in labels]
            bbox_to_anchor = (1.05, 0.5) if legend_position == "right" else (0.5, -0.1)
            loc = 'center left' if legend_position == "right" else 'upper center'
            ncol = 1 if legend_position == "right" else min(len(legend_labels), 4)
            
            self.ax.legend(
                legend_labels,
                loc=loc,
                bbox_to_anchor=bbox_to_anchor,
                framealpha=0.9,
                ncol=ncol
            )
        
        # Equal aspect ratio ensures circular shape
        self.ax.axis('equal')
        
        return self.save_plot("piechart")