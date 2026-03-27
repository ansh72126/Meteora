import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats
from app.services.plotting.base import BasePlotter

DISTINCT_COLORS = ["#33cc66", "#3366ff", "#ff6633", "#9b59b6",
                   "#e91e8c", "#00bcd4", "#ff9800", "#4caf50"]

class ECDFPlotter(BasePlotter):

    def plot(
        self,
        x_columns: list[str],
        colors: list[str] | None = None,
        color_mode: str = "single",
        legend: bool = True,
        grid: bool = True,
        dark_theme: bool = False,
        cumulative_scale: str = "0-1",       # "0-1" | "0-100"
        complementary: bool = False,
        theoretical_overlay: str = "none",   # "none" | "normal"
        show_summary_stats: bool = False,
        summary_fields: dict | None = None,
    ) -> str:
        df = self.df.copy()
        for col in x_columns:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"Column '{col}' appears to be categorical or non-numeric. "
                    f"Select numeric columns for the ECDF plot."
                )

        if dark_theme:
            plt.style.use('dark_background')
        else:
            plt.style.use('default')

        self.create_figure()
        scale_factor = 100 if cumulative_scale == "0-100" else 1

        for i, col in enumerate(x_columns):
            # Resolve color
            if color_mode == "single":
                c = (colors[0] if colors else DISTINCT_COLORS[0])
            else:
                c = (colors[i] if colors and i < len(colors)
                     else DISTINCT_COLORS[i % len(DISTINCT_COLORS)])

            data = self.df[col].dropna().sort_values()
            n = len(data)
            y = np.arange(1, n + 1) / n * scale_factor

            if complementary:
                y = scale_factor - y

            # Step plot
            self.ax.step(data, y, where='post', color=c,
                         linewidth=2, label=col)

            # Theoretical Normal CDF overlay
            if theoretical_overlay == "normal":
                from scipy import stats
                mu, sigma = data.mean(), data.std()
                x_th = np.linspace(data.min(), data.max(), 300)
                y_th = stats.norm.cdf(x_th, mu, sigma) * scale_factor
                if complementary:
                    y_th = scale_factor - y_th
                self.ax.plot(x_th, y_th, color=c, linestyle='--',
                             linewidth=1.5, alpha=0.7,
                             label=f'{col} — Normal CDF')

            # Summary stats annotation
            if show_summary_stats:
                sf = summary_fields or {"mean": True, "median": True, "stdev": True, "n": True}
                lines = []
                if sf.get("mean"):    lines.append(f"μ = {data.mean():.3g}")
                if sf.get("median"):  lines.append(f"Med = {data.median():.3g}")
                if sf.get("stdev"):   lines.append(f"σ = {data.std():.3g}")
                if sf.get("n"):       lines.append(f"N = {n}")
                if lines:
                    # Offset text box per series
                    x_pos = 0.02 + i * 0.22
                    self.ax.text(
                        x_pos, 0.97, "\n".join(lines),
                        transform=self.ax.transAxes,
                        fontsize=8, verticalalignment='top',
                        bbox=dict(boxstyle='round,pad=0.4', facecolor=c,
                                  alpha=0.12, edgecolor=c)
                    )

        # Axis labels
        ylabel = ("1 − F(x)" if complementary else "F(x)")
        if cumulative_scale == "0-100":
            ylabel += " (%)"
        self.ax.set_ylabel(ylabel, fontsize=12)
        self.ax.set_xlabel("Value", fontsize=12)

        title = "Complementary ECDF" if complementary else "ECDF"
        if len(x_columns) > 1:
            title += f" — {len(x_columns)} Series"
        else:
            title += f" of {x_columns[0]}"
        self.ax.set_title(title, fontsize=14, fontweight='bold')

        self.apply_grid(grid)

        if legend:
            self.ax.legend(loc='best', framealpha=0.9, fontsize=9)

        return self.save_plot("ecdf")