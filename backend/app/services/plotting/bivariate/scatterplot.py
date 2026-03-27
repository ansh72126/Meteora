import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from scipy import stats as scipy_stats
from scipy.stats import pearsonr, spearmanr, kendalltau
from sklearn.metrics import mean_squared_error, mean_absolute_error
from sklearn.linear_model import LinearRegression

from app.services.plotting.base import BasePlotter
from app.models import ScatterStats

MARKER_MAP = {
    "circle":   "o",
    "square":   "s",
    "diamond":  "D",
    "triangle": "^",
    "plus":     "+",
    "cross":    "x",
}


class ScatterPlotPlotter(BasePlotter):
    """Bivariate scatter / bubble plot plotter"""

    def plot(
        self,
        x_column: str,
        y_column: str,
        series_column: str = None,
        size_column: str = None,
        overplot_strategy: str = "none",
        alpha: float = 0.6,
        jitter_amount: float = 0.1,
        hexbin_grid_size: int = 30,
        point_size: float = 50,
        point_shape: str = "circle",
        color_palette: str = "tab10",
        dark_theme: bool = False,
        show_grid: bool = True,
        x_min: float = None,
        x_max: float = None,
        y_min: float = None,
        y_max: float = None,
        x_label: str = None,
        y_label: str = None,
        facet_column: str = None,
        facet_cols: int = 2,
        shared_axes: bool = True,
        show_fit: bool = False,
        fit_model: str = "linear",
        poly_degree: int = 2,
        show_confidence_band: bool = True,
        confidence_level: float = 0.95,
        compute_core_stats: bool = True,
        compute_error_metrics: bool = False,
        compute_distribution_stats: bool = False,
        correlation_method: str = "pearson",
        outlier_method: str = "iqr",
        show_kde_2d: bool = False,
    ) -> tuple:
        """Returns (image_path, ScatterStats)"""

        df = self.df.copy()
        for col, label in [(x_column, "X"), (y_column, "Y")]:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"The {label} column '{col}' appears to be categorical or non-numeric "
                    f"and cannot be used for the scatter plot. Select a numeric column for {label}."
                )
        if size_column and size_column in df.columns:
            coerced = pd.to_numeric(df[size_column], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"The Size column '{size_column}' appears to be categorical or non-numeric. "
                    f"Deselect it or choose a numeric column for bubble size."
                )
        self.validate_numeric(x_column)
        self.validate_numeric(y_column)

        df = df.dropna(subset=[x_column, y_column]).copy()

        # ── Theme ──────────────────────────────────────────────────────────────
        if dark_theme:
            plt.style.use("dark_background")
            bg_color, text_color, grid_color = "#0a1628", "#c8ddf0", "#1e3a5f"
        else:
            plt.style.use("default")
            bg_color, text_color, grid_color = "white", "#333", "#e0e0e0"

        marker = MARKER_MAP.get(point_shape, "o")

        draw_kwargs = dict(
            series_col=series_column,
            size_col=size_column,
            overplot_strategy=overplot_strategy,
            alpha=alpha,
            jitter_amount=jitter_amount,
            hexbin_grid_size=hexbin_grid_size,
            point_size=point_size,
            marker=marker,
            color_palette=color_palette,
            show_fit=show_fit,
            fit_model=fit_model,
            poly_degree=poly_degree,
            show_confidence_band=show_confidence_band,
            confidence_level=confidence_level,
            show_kde_2d=show_kde_2d,
            show_grid=show_grid,
            grid_color=grid_color,
            text_color=text_color,
            dark_theme=dark_theme,
        )

        # ── Facet ──────────────────────────────────────────────────────────────
        if facet_column and facet_column in df.columns:
            groups   = df[facet_column].unique()
            n_panels = len(groups)
            n_cols   = min(facet_cols, n_panels)
            n_rows   = int(np.ceil(n_panels / n_cols))

            fig, axes = plt.subplots(
                n_rows, n_cols,
                figsize=(6 * n_cols, 5 * n_rows),
                sharex=shared_axes, sharey=shared_axes,
                squeeze=False,
            )
            fig.patch.set_facecolor(bg_color)

            for idx, group_val in enumerate(groups):
                ax  = axes.flat[idx]
                sub = df[df[facet_column] == group_val]
                _draw_scatter(ax, sub, x_column, y_column,
                              title=f"{facet_column}: {group_val}", **draw_kwargs)
                if x_min is not None and x_max is not None:
                    ax.set_xlim(x_min, x_max)
                if y_min is not None and y_max is not None:
                    ax.set_ylim(y_min, y_max)
                ax.set_xlabel(x_label or x_column, color=text_color, fontsize=9)
                ax.set_ylabel(y_label or y_column, color=text_color, fontsize=9)
                ax.set_facecolor(bg_color)

            for idx in range(n_panels, n_rows * n_cols):
                axes.flat[idx].set_visible(False)

            fig.tight_layout()

        else:
            # ── Single panel ───────────────────────────────────────────────────
            fig, ax = plt.subplots(figsize=(12, 8))
            fig.patch.set_facecolor(bg_color)
            ax.set_facecolor(bg_color)

            _draw_scatter(ax, df, x_column, y_column, **draw_kwargs)

            if x_min is not None and x_max is not None:
                ax.set_xlim(x_min, x_max)
            if y_min is not None and y_max is not None:
                ax.set_ylim(y_min, y_max)

            ax.set_xlabel(x_label or x_column, color=text_color, fontsize=12)
            ax.set_ylabel(y_label or y_column, color=text_color, fontsize=12)
            ax.set_title(
                f"{y_column} vs {x_column}",
                color=text_color, fontsize=14, fontweight="bold", pad=16,
            )
            for spine in ax.spines.values():
                spine.set_edgecolor(grid_color)
            ax.tick_params(colors=text_color)

        image_path = self.save_plot("scatterplot")

        # ── Stats ──────────────────────────────────────────────────────────────
        stats  = ScatterStats()
        x_vals = df[x_column].values.astype(float)
        y_vals = df[y_column].values.astype(float)

        if compute_core_stats and len(x_vals) > 2:
            if correlation_method == "pearson":
                r, p = pearsonr(x_vals, y_vals)
            elif correlation_method == "spearman":
                r, p = spearmanr(x_vals, y_vals)
            else:
                r, p = kendalltau(x_vals, y_vals)

            stats.correlation_coefficient = float(r)
            stats.correlation_method      = correlation_method
            stats.p_value                 = float(p)

            slope, intercept, r_lin, _, _ = scipy_stats.linregress(x_vals, y_vals)
            stats.r_squared  = float(r_lin ** 2)
            stats.slope      = float(slope)
            stats.intercept  = float(intercept)
            stats.equation   = (
                f"y = {slope:.4f}x + {intercept:.4f}"
                if intercept >= 0
                else f"y = {slope:.4f}x - {abs(intercept):.4f}"
            )

            n   = len(x_vals)
            se  = np.sqrt(
                np.sum((y_vals - (slope * x_vals + intercept)) ** 2) / (n - 2) /
                np.sum((x_vals - np.mean(x_vals)) ** 2)
            )
            t_c = scipy_stats.t.ppf((1 + confidence_level) / 2, df=n - 2)
            stats.confidence_interval_lower = float(slope - t_c * se)
            stats.confidence_interval_upper = float(slope + t_c * se)

        if compute_error_metrics and len(x_vals) > 2:
            model  = LinearRegression().fit(x_vals.reshape(-1, 1), y_vals)
            y_pred = model.predict(x_vals.reshape(-1, 1))
            mse    = mean_squared_error(y_vals, y_pred)
            stats.mse  = float(mse)
            stats.rmse = float(np.sqrt(mse))
            stats.mae  = float(mean_absolute_error(y_vals, y_pred))

        if compute_distribution_stats:
            stats.total_points = int(len(df))
            stats.x_range      = [float(x_vals.min()), float(x_vals.max())]
            stats.y_range      = [float(y_vals.min()), float(y_vals.max())]

            if outlier_method == "iqr":
                q1, q3     = np.percentile(y_vals, [25, 75])
                iqr         = q3 - q1
                threshold   = q3 + 1.5 * iqr
                n_outliers  = int(np.sum(
                    (y_vals < q1 - 1.5 * iqr) | (y_vals > q3 + 1.5 * iqr)
                ))
            else:
                z_scores   = np.abs(scipy_stats.zscore(y_vals))
                threshold  = 3.0
                n_outliers = int(np.sum(z_scores > threshold))

            stats.outlier_threshold = float(threshold)
            stats.outlier_count     = n_outliers

        return image_path, stats


# ── Internal draw helper ───────────────────────────────────────────────────────
def _draw_scatter(
    ax, df, x_col, y_col,
    series_col, size_col, overplot_strategy,
    alpha, jitter_amount, hexbin_grid_size,
    point_size, marker, color_palette,
    show_fit, fit_model, poly_degree,
    show_confidence_band, confidence_level,
    show_kde_2d, show_grid,
    grid_color, text_color, dark_theme,
    title=None,
):
    x = df[x_col].values.astype(float)
    y = df[y_col].values.astype(float)

    # Jitter
    if overplot_strategy == "jitter":
        x_rng = np.ptp(x) or 1
        y_rng = np.ptp(y) or 1
        x = x + np.random.uniform(-jitter_amount * x_rng, jitter_amount * x_rng, size=x.shape)
        y = y + np.random.uniform(-jitter_amount * y_rng, jitter_amount * y_rng, size=y.shape)

    # Dense strategies bypass scatter
    if overplot_strategy == "hexbin":
        ax.hexbin(x, y, gridsize=hexbin_grid_size, cmap="YlOrRd", mincnt=1)
    elif overplot_strategy == "2d_hist":
        ax.hist2d(x, y, bins=30, cmap="YlOrRd")
    else:
        eff_alpha = alpha if overplot_strategy == "alpha" else 1.0
        sizes = None

        if size_col and size_col in df.columns:
            sz    = df[size_col].values.astype(float)
            sz_n  = (sz - sz.min()) / (np.ptp(sz) + 1e-8)
            sizes = 20 + sz_n * 200

        if series_col and series_col in df.columns:
            groups  = df[series_col].unique()
            cmap    = plt.get_cmap(color_palette)
            colors  = [cmap(i / max(len(groups) - 1, 1)) for i in range(len(groups))]
            handles = []
            for grp, color in zip(groups, colors):
                mask = (df[series_col] == grp).values
                ax.scatter(
                    x[mask], y[mask],
                    s=sizes[mask] if sizes is not None else point_size,
                    c=[color], marker=marker,
                    alpha=eff_alpha, edgecolors="none",
                )
                handles.append(mpatches.Patch(color=color, label=str(grp)))
            ax.legend(
                handles=handles, framealpha=0.15,
                facecolor="#0a1628" if dark_theme else "white",
                edgecolor=grid_color, labelcolor=text_color, fontsize=9,
            )
        else:
            ax.scatter(
                x, y,
                s=sizes if sizes is not None else point_size,
                c=["#00d4ff"], marker=marker,
                alpha=eff_alpha, edgecolors="none",
            )

    # 2D KDE overlay
    if show_kde_2d and overplot_strategy not in ("hexbin", "2d_hist"):
        try:
            from scipy.stats import gaussian_kde
            kde      = gaussian_kde(np.vstack([x, y]))
            xg, yg   = np.linspace(x.min(), x.max(), 100), np.linspace(y.min(), y.max(), 100)
            xx, yy   = np.meshgrid(xg, yg)
            zz       = kde(np.vstack([xx.ravel(), yy.ravel()])).reshape(xx.shape)
            ax.contour(xx, yy, zz, levels=6,
                       colors="white" if dark_theme else "steelblue",
                       alpha=0.4, linewidths=0.8)
        except Exception:
            pass

    # Fit overlay
    if show_fit and len(x) > 2:
        x_s = np.sort(x)
        try:
            if fit_model == "linear":
                slope, intercept, _, _, _ = scipy_stats.linregress(x, y)
                y_fit = slope * x_s + intercept
                if show_confidence_band:
                    n    = len(x)
                    y_p  = slope * x + intercept
                    se   = np.sqrt(np.sum((y - y_p) ** 2) / (n - 2) / np.sum((x - x.mean()) ** 2))
                    t_c  = scipy_stats.t.ppf((1 + confidence_level) / 2, df=n - 2)
                    se_f = se * np.sqrt(1/n + (x_s - x.mean())**2 / np.sum((x - x.mean())**2))
                    ax.fill_between(x_s, y_fit - t_c * se_f, y_fit + t_c * se_f,
                                    alpha=0.15, color="#ff6b6b")

            elif fit_model == "polynomial":
                coeffs = np.polyfit(x, y, poly_degree)
                y_fit  = np.polyval(coeffs, x_s)
                if show_confidence_band:
                    resid = y - np.polyval(coeffs, x)
                    ax.fill_between(x_s,
                                    y_fit - 1.96 * resid.std(),
                                    y_fit + 1.96 * resid.std(),
                                    alpha=0.12, color="#ff6b6b")

            elif fit_model == "lowess":
                from statsmodels.nonparametric.smoothers_lowess import lowess
                sm    = lowess(y, x, frac=0.3, return_sorted=True)
                x_s   = sm[:, 0]
                y_fit = sm[:, 1]

            ax.plot(x_s, y_fit, color="#ff6b6b", linewidth=2, linestyle="--", label="Fit")
        except Exception:
            pass

    ax.grid(show_grid, color=grid_color, linewidth=0.5, alpha=0.6)

    if title:
        ax.set_title(title, color=text_color, fontsize=11, fontweight="bold")