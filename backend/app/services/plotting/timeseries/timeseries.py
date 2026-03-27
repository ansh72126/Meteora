import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from sklearn.metrics import mean_squared_error, mean_absolute_error
from sklearn.linear_model import LinearRegression

from app.services.plotting.base import BasePlotter
from app.models import TimeSeriesStats

LINE_STYLE_MAP = {
    "solid": "-", "dashed": "--", "dotted": ":", "dashdot": "-."
}

MARKER_MAP = {
    "none": None, "o": "o", "s": "s", "^": "^", "D": "D"
}


class TimeSeriesPlotter(BasePlotter):
    """Standalone time series plotter"""

    def plot(
        self,
        time_column: str,
        value_column: str,
        series_column: str = None,
        secondary_value_column: str = None,
        start_date: str = None,
        end_date: str = None,
        resample_frequency: str = "none",
        aggregation_method: str = "mean",
        missing_value_handling: str = "ffill",
        smoothing_method: str = "none",
        rolling_window: int = 7,
        show_confidence_band: bool = True,
        confidence_band_alpha: float = 0.15,
        trend_line: str = "none",
        trend_poly_degree: int = 2,
        seasonality_detection: bool = False,
        seasonality_period: int = 12,
        change_point_detection: bool = False,
        axis_scale: str = "linear",
        y_min: float = None,
        y_max: float = None,
        x_label: str = None,
        y_label: str = None,
        anomaly_rule: str = "none",
        anomaly_threshold: float = 3.0,
        event_markers: list = None,
        facet_column: str = None,
        facet_cols: int = 2,
        shared_axes: bool = True,
        line_width: float = 2.0,
        line_style: str = "solid",
        marker_style: str = "none",
        marker_size: int = 5,
        color_palette: str = "tab10",
        show_grid: bool = True,
        grid_style: str = "horizontal",
        show_legend: bool = True,
        area_fill: bool = False,
        fill_alpha: float = 0.15,
        dark_theme: bool = False,
        compute_descriptive: bool = True,
        compute_trend: bool = False,
        compute_autocorrelation: bool = False,
        compute_seasonality: bool = False,
        compute_error_metrics: bool = False,
        compute_anomaly_stats: bool = False,
    ) -> tuple:
        """Returns (image_path, TimeSeriesStats)"""

        if event_markers is None:
            event_markers = []

        df = self.df.copy()

        # Detect non-numeric (categorical) value columns: >80% NaN after coercion
        cols_to_check = [(value_column, "Value")]
        if secondary_value_column and secondary_value_column in df.columns:
            cols_to_check.append((secondary_value_column, "Secondary"))
        for col, label in cols_to_check:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"The {label} column '{col}' appears to be categorical or non-numeric "
                    f"and cannot be used for the time series. Select a numeric column for {label}."
                )

        self.validate_numeric(value_column)
        # ── Parse time column ──────────────────────────────────────────────────
        try:
            df[time_column] = pd.to_datetime(df[time_column])
        except Exception:
            df[time_column] = pd.to_numeric(df[time_column], errors="coerce")

        df = df.dropna(subset=[time_column, value_column]) \
               .sort_values(time_column) \
               .reset_index(drop=True)

        # ── Date range filter (applied AFTER sort, BEFORE resample) ───────────
        if start_date or end_date:
            try:
                if start_date:
                    df = df[df[time_column] >= pd.to_datetime(start_date)]
                if end_date:
                    df = df[df[time_column] <= pd.to_datetime(end_date)]
                df = df.reset_index(drop=True)
            except Exception:
                pass  # silently skip if dates can't be parsed

        # ── Resample ───────────────────────────────────────────────────────────
        # Use period-end aliases compatible with pandas >= 2.2
        freq_map = {
            "sec":   "s",
            "min":   "min",
            "hour":  "h",
            "day":   "D",
            "week":  "W",
            "month": "ME",
            "year":  "YE",
        }
        if resample_frequency != "none" and resample_frequency in freq_map:
            try:
                agg_fn = aggregation_method  # "mean" | "sum" | "median" | "count"
                df = df.set_index(time_column)
                if series_column and series_column in df.columns:
                    df = (
                        df.groupby(series_column)
                          .resample(freq_map[resample_frequency])[value_column]
                          .agg(agg_fn)
                          .reset_index()
                    )
                else:
                    df = (
                        df.resample(freq_map[resample_frequency])[value_column]
                          .agg(agg_fn)
                          .reset_index()
                    )
                    df.columns = [time_column, value_column]
            except Exception:
                df = df.reset_index()

        # ── Missing value handling ─────────────────────────────────────────────
        if missing_value_handling == "ffill":
            df[value_column] = df[value_column].ffill()
        elif missing_value_handling == "bfill":
            df[value_column] = df[value_column].bfill()
        elif missing_value_handling == "interpolate":
            df[value_column] = df[value_column].interpolate(method="linear")
        # "gap" — leave NaN so matplotlib breaks the line naturally

        # ── Theme ──────────────────────────────────────────────────────────────
        if dark_theme:
            plt.style.use("dark_background")
            bg, fg, gc = "#0a1628", "#c8ddf0", "#1e3a5f"
        else:
            plt.style.use("default")
            bg, fg, gc = "white", "#333333", "#e0e0e0"

        ls     = LINE_STYLE_MAP.get(line_style, "-")
        marker = MARKER_MAP.get(marker_style, None)
        cmap   = plt.get_cmap(color_palette)

        # ── Groups ─────────────────────────────────────────────────────────────
        if series_column and series_column in df.columns:
            groups = list(df[series_column].unique())
        else:
            groups = [None]

        colors = [cmap(i / max(len(groups) - 1, 1)) for i in range(len(groups))]

        draw_kwargs = dict(
            time_col=time_column,
            val_col=value_column,
            series_col=series_column,
            groups=groups,
            colors=colors,
            ls=ls,
            marker=marker,
            marker_size=marker_size,
            line_width=line_width,
            area_fill=area_fill,
            fill_alpha=fill_alpha,
            smoothing_method=smoothing_method,
            rolling_window=rolling_window,
            show_confidence_band=show_confidence_band,
            confidence_band_alpha=confidence_band_alpha,
            trend_line=trend_line,
            trend_poly_degree=trend_poly_degree,
            anomaly_rule=anomaly_rule,
            anomaly_threshold=anomaly_threshold,
            grid_style=grid_style,
            gc=gc,
            fg=fg,
            show_legend=show_legend,
        )

        # ── Facet or single panel ──────────────────────────────────────────────
        if facet_column and facet_column in df.columns:
            facets   = list(df[facet_column].unique())
            n_facets = len(facets)
            n_cols   = min(facet_cols, n_facets)
            n_rows   = int(np.ceil(n_facets / n_cols))

            fig, axes = plt.subplots(
                n_rows, n_cols,
                figsize=(8 * n_cols, 4 * n_rows),
                sharex=shared_axes, sharey=shared_axes,
                squeeze=False,
            )
            fig.patch.set_facecolor(bg)

            for idx, fval in enumerate(facets):
                ax  = axes.flat[idx]
                sub = df[df[facet_column] == fval]
                ax.set_facecolor(bg)
                _draw_ts(ax, sub, title=f"{facet_column}: {fval}", **draw_kwargs)
                if y_min is not None and y_max is not None:
                    ax.set_ylim(y_min, y_max)
                ax.set_xlabel(x_label or time_column, color=fg, fontsize=8)
                ax.set_ylabel(y_label or value_column, color=fg, fontsize=8)
                ax.set_yscale(axis_scale)
                ax.tick_params(colors=fg, labelsize=7)
                for spine in ax.spines.values():
                    spine.set_edgecolor(gc)

            for idx in range(n_facets, n_rows * n_cols):
                axes.flat[idx].set_visible(False)

            fig.tight_layout()

        else:
            # ── Single panel ───────────────────────────────────────────────────
            fig, ax = plt.subplots(figsize=(14, 6))
            fig.patch.set_facecolor(bg)
            ax.set_facecolor(bg)

            _draw_ts(ax, df, **draw_kwargs)

            if y_min is not None and y_max is not None:
                ax.set_ylim(y_min, y_max)
            ax.set_xlabel(x_label or time_column, color=fg, fontsize=11)
            ax.set_ylabel(y_label or value_column, color=fg, fontsize=11)
            ax.set_yscale(axis_scale)
            ax.tick_params(colors=fg)
            for spine in ax.spines.values():
                spine.set_edgecolor(gc)

            # Secondary Y axis
            if secondary_value_column and secondary_value_column in df.columns:
                ax2 = ax.twinx()
                ax2.set_facecolor(bg)
                ax2.plot(
                    df[time_column], df[secondary_value_column],
                    color="#ff6b6b", linewidth=line_width,
                    linestyle="--", label=secondary_value_column, alpha=0.8,
                )
                ax2.set_ylabel(secondary_value_column, color="#ff6b6b", fontsize=10)
                ax2.tick_params(colors="#ff6b6b")
                ax2.spines["right"].set_edgecolor("#ff6b6b")

            # Event markers
            for marker_date in event_markers:
                try:
                    md = pd.to_datetime(marker_date)
                    ax.axvline(md, color="#ffaa00", linestyle="--",
                               linewidth=1.2, alpha=0.7)
                    ylims = ax.get_ylim()
                    ax.text(md, ylims[1], marker_date[:10],
                            rotation=90, fontsize=7, color="#ffaa00",
                            va="top", ha="right")
                except Exception:
                    pass

            # Change point detection (CUSUM)
            if change_point_detection:
                try:
                    vals_cp = df[value_column].dropna().values.astype(float)
                    mean_v  = vals_cp.mean()
                    cusum   = np.cumsum(vals_cp - mean_v)
                    thresh  = 3 * vals_cp.std()
                    cp_idx  = np.where(np.abs(np.diff(cusum)) > thresh)[0]
                    for ci in cp_idx[:5]:
                        ax.axvline(
                            df[time_column].iloc[ci], color="#9b59b6",
                            linestyle=":", linewidth=1.2, alpha=0.7,
                        )
                except Exception:
                    pass

            ax.set_title(
                f"{value_column} over {time_column}",
                color=fg, fontsize=13, fontweight="bold", pad=14,
            )

        plt.tight_layout()
        image_path = self.save_plot("timeseries")

        # ── Compute stats ──────────────────────────────────────────────────────
        stats = TimeSeriesStats()
        vals  = df[value_column].dropna().values.astype(float)
        n     = len(vals)

        if compute_descriptive and n > 0:
            stats.sample_size  = int(n)
            stats.mean_value   = float(np.mean(vals))
            stats.median_value = float(np.median(vals))
            stats.std_dev      = float(np.std(vals))

        if compute_trend and n > 2:
            x_idx = np.arange(n, dtype=float)
            slope, _, r, p, _ = scipy_stats.linregress(x_idx, vals)
            stats.trend_slope     = float(slope)
            stats.r_squared       = float(r ** 2)
            stats.p_value         = float(p)
            stats.trend_direction = (
                "Increasing ↑" if slope > 0 else
                "Decreasing ↓" if slope < 0 else
                "Flat →"
            )

        if compute_autocorrelation and n > 5:
            try:
                from statsmodels.tsa.stattools import acf, pacf
                acf_v  = acf(vals, nlags=3, fft=True)
                pacf_v = pacf(vals, nlags=2)
                stats.acf_lag1  = float(acf_v[1])
                stats.acf_lag2  = float(acf_v[2])
                stats.acf_lag3  = float(acf_v[3])
                stats.pacf_lag1 = float(pacf_v[1])
                stats.pacf_lag2 = float(pacf_v[2])
            except Exception:
                # Fallback: manual lagged correlation
                for lag in [1, 2, 3]:
                    if n > lag:
                        corr = np.corrcoef(vals[:-lag], vals[lag:])[0, 1]
                        setattr(stats, f"acf_lag{lag}", float(corr))

        # seasonality_detection flag also triggers this block
        if (compute_seasonality or seasonality_detection) and n > 10:
            try:
                from statsmodels.tsa.seasonal import seasonal_decompose
                period = min(seasonality_period, n // 2)
                decomp = seasonal_decompose(
                    pd.Series(vals), model="additive",
                    period=period, extrapolate_trend="freq",
                )
                seasonal_var = float(np.var(decomp.seasonal))
                total_var    = float(np.var(vals))
                stats.seasonal_strength = float(seasonal_var / (total_var + 1e-10))

                # Dominant period via FFT
                fft_v    = np.abs(np.fft.rfft(vals - np.mean(vals)))
                freqs    = np.fft.rfftfreq(n)
                dom_freq = freqs[np.argmax(fft_v[1:]) + 1]
                stats.dominant_period = int(round(1 / dom_freq)) if dom_freq > 0 else None
            except Exception:
                pass

        if compute_error_metrics and n > 2:
            x_idx  = np.arange(n, dtype=float).reshape(-1, 1)
            model  = LinearRegression().fit(x_idx, vals)
            y_pred = model.predict(x_idx)
            mse    = mean_squared_error(vals, y_pred)
            stats.mse  = float(mse)
            stats.rmse = float(np.sqrt(mse))
            stats.mae  = float(mean_absolute_error(vals, y_pred))

        if compute_anomaly_stats and n > 0 and anomaly_rule != "none":
            if anomaly_rule == "zscore":
                mask = np.abs(scipy_stats.zscore(vals)) > anomaly_threshold
            else:
                q1, q3 = np.percentile(vals, [25, 75])
                iqr     = q3 - q1
                mask    = (
                    (vals < q1 - anomaly_threshold * iqr) |
                    (vals > q3 + anomaly_threshold * iqr)
                )
            stats.anomaly_count  = int(np.sum(mask))
            stats.anomaly_method = anomaly_rule

        return image_path, stats


# ── Draw helper ────────────────────────────────────────────────────────────────
def _draw_ts(
    ax, df,
    time_col, val_col, series_col, groups, colors,
    ls, marker, marker_size, line_width,
    area_fill, fill_alpha,
    smoothing_method, rolling_window,
    show_confidence_band, confidence_band_alpha,
    trend_line, trend_poly_degree,
    anomaly_rule, anomaly_threshold,
    grid_style, gc, fg, show_legend,
    title=None,
):
    """Draw a single time series panel (shared by facet and single-panel paths)"""

    mk = marker if marker != "none" else None

    for grp, color in zip(groups, colors):
        # Filter to group subset if series column is set
        if grp is not None and series_col and series_col in df.columns:
            sub = df[df[series_col] == grp].copy()
        else:
            sub = df.copy()

        sub = sub.dropna(subset=[val_col])
        x   = sub[time_col].values
        y   = sub[val_col].values.astype(float)

        if len(x) == 0:
            continue

        label = str(grp) if grp is not None else val_col

        # Raw line
        ax.plot(
            x, y,
            color=color, linewidth=line_width, linestyle=ls,
            marker=mk, markersize=marker_size,
            label=label, alpha=0.85, zorder=2,
        )

        if area_fill:
            try:
                ax.fill_between(x, y, alpha=fill_alpha, color=color, zorder=1)
            except Exception:
                pass

        # Smoothing overlay
        if smoothing_method != "none" and len(y) >= rolling_window:
            try:
                s = pd.Series(y)
                if smoothing_method == "moving_average":
                    y_sm = s.rolling(window=rolling_window, center=True).mean().values
                elif smoothing_method == "exponential":
                    y_sm = s.ewm(span=rolling_window).mean().values
                elif smoothing_method == "loess":
                    from statsmodels.nonparametric.smoothers_lowess import lowess
                    sm   = lowess(
                        y, np.arange(len(y)),
                        frac=rolling_window / len(y), return_sorted=True,
                    )
                    y_sm = sm[:, 1]
                else:
                    y_sm = y

                ax.plot(
                    x, y_sm,
                    color=color, linewidth=line_width + 0.8,
                    linestyle="-", alpha=1.0,
                    label=f"{label} (smooth)", zorder=3,
                )

                if show_confidence_band and smoothing_method != "loess":
                    std_r = s.rolling(window=rolling_window, center=True).std().values
                    ax.fill_between(
                        x,
                        y_sm - 1.96 * np.nan_to_num(std_r),
                        y_sm + 1.96 * np.nan_to_num(std_r),
                        alpha=confidence_band_alpha, color=color, zorder=1,
                    )
            except Exception:
                pass

    # Trend line (computed over full df, not per group)
    if trend_line != "none" and len(df) > 2:
        try:
            y_all = df[val_col].dropna().values.astype(float)
            x_idx = np.arange(len(y_all), dtype=float)
            x_all = df[time_col].values[:len(y_all)]

            if trend_line == "linear":
                slope, intercept, _, _, _ = scipy_stats.linregress(x_idx, y_all)
                y_trend = slope * x_idx + intercept
            else:  # polynomial
                coeffs  = np.polyfit(x_idx, y_all, trend_poly_degree)
                y_trend = np.polyval(coeffs, x_idx)

            ax.plot(
                x_all, y_trend,
                color="#ff6b6b", linewidth=1.8,
                linestyle="--", alpha=0.85, label="Trend", zorder=4,
            )
        except Exception:
            pass

    # Anomaly scatter overlay
    if anomaly_rule != "none":
        try:
            y_all = df[val_col].dropna().values.astype(float)
            x_all = df[time_col].values[:len(y_all)]

            if anomaly_rule == "zscore":
                mask = np.abs(scipy_stats.zscore(y_all)) > anomaly_threshold
            else:
                q1, q3 = np.percentile(y_all, [25, 75])
                iqr     = q3 - q1
                mask    = (
                    (y_all < q1 - anomaly_threshold * iqr) |
                    (y_all > q3 + anomaly_threshold * iqr)
                )

            ax.scatter(
                x_all[mask], y_all[mask],
                color="#ffaa00", s=60, zorder=5,
                marker="o", edgecolors="#ff6b6b", linewidths=1.2,
            )
        except Exception:
            pass

    # Grid
    if grid_style == "horizontal":
        ax.yaxis.grid(True, color=gc, linewidth=0.4, alpha=0.5)
        ax.xaxis.grid(False)
    elif grid_style == "full":
        ax.grid(True, color=gc, linewidth=0.4, alpha=0.5)
    else:
        ax.grid(False)

    if show_legend:
        ax.legend(
            framealpha=0.15,
            facecolor="#0a1628",
            edgecolor=gc,
            labelcolor=fg,
            fontsize=8,
        )

    if title:
        ax.set_title(title, color=fg, fontsize=10, fontweight="bold")