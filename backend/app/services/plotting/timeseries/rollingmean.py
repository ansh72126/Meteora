import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from sklearn.metrics import mean_squared_error, mean_absolute_error
from sklearn.linear_model import LinearRegression

from app.services.plotting.base import BasePlotter
from app.models import RollingMeanStats

LINE_STYLE_MAP = {"solid": "-", "dashed": "--", "dotted": ":", "dashdot": "-."}

# Pandas >= 2.2 resample aliases
FREQ_MAP = {
    "sec":   "s",
    "min":   "min",
    "hour":  "h",
    "day":   "D",
    "week":  "W",
    "month": "ME",
    "year":  "YE",
}


class RollingMeanPlotter(BasePlotter):
    """Rolling statistics plotter — mean / median / std / var / min / max"""

    def plot(
        self,
        time_column: str,
        value_column: str,
        series_column: str = None,
        window_size: int = 7,
        window_type: str = "fixed",
        time_period: str = "7D",
        rolling_function: str = "mean",
        center_window: bool = False,
        min_periods: int = 1,
        multi_window_enabled: bool = False,
        extra_windows: list = None,
        std_band_enabled: bool = False,
        std_multiplier: float = 1.0,
        ci_band_enabled: bool = False,
        ci_level: int = 95,
        raw_overlay: bool = True,
        raw_alpha: float = 0.3,
        resample_frequency: str = "none",
        aggregation_method: str = "mean",
        start_date: str = None,
        end_date: str = None,
        missing_value_handling: str = "ffill",
        trend_line: str = "none",
        trend_poly_degree: int = 2,
        anomaly_rule: str = "none",
        anomaly_threshold: float = 2.5,
        event_markers: list = None,
        facet_column: str = None,
        facet_cols: int = 2,
        shared_axes: bool = True,
        axis_scale: str = "linear",
        y_min: float = None,
        y_max: float = None,
        x_label: str = None,
        y_label: str = None,
        line_width: float = 2.0,
        color_palette: str = "tab10",
        show_grid: bool = True,
        grid_style: str = "horizontal",
        show_legend: bool = True,
        dark_theme: bool = False,
        compute_rolling_stats: bool = True,
        compute_trend: bool = False,
        compute_smoothing_error: bool = False,
        compute_autocorrelation: bool = False,
        compute_anomaly_stats: bool = False,
    ) -> tuple:
        """Returns (image_path, RollingMeanStats)"""

        if extra_windows is None:
            extra_windows = []
        if event_markers is None:
            event_markers = []

        df = self.df.copy()

        # Detect non-numeric (categorical) value column: >80% NaN after coercion
        coerced = pd.to_numeric(df[value_column], errors="coerce")
        n_rows = len(df)
        if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
            raise ValueError(
                f"The Value column '{value_column}' appears to be categorical or non-numeric "
                f"and cannot be used for rolling statistics. Select a numeric column for Value."
            )

        self.validate_numeric(value_column)
        # ── Parse time column ──────────────────────────────────────────────────
        try:
            df[time_column] = pd.to_datetime(df[time_column])
        except Exception:
            df[time_column] = pd.to_numeric(df[time_column], errors="coerce")

        df = (df.dropna(subset=[time_column, value_column])
                .sort_values(time_column)
                .reset_index(drop=True))

        # ── Date range filter ──────────────────────────────────────────────────
        if start_date or end_date:
            try:
                if start_date:
                    df = df[df[time_column] >= pd.to_datetime(start_date)]
                if end_date:
                    df = df[df[time_column] <= pd.to_datetime(end_date)]
                df = df.reset_index(drop=True)
            except Exception:
                pass

        # ── Resample ───────────────────────────────────────────────────────────
        if resample_frequency != "none" and resample_frequency in FREQ_MAP:
            try:
                df = df.set_index(time_column)
                if series_column and series_column in df.columns:
                    df = (df.groupby(series_column)
                            .resample(FREQ_MAP[resample_frequency])[value_column]
                            .agg(aggregation_method)
                            .reset_index())
                else:
                    df = (df.resample(FREQ_MAP[resample_frequency])[value_column]
                            .agg(aggregation_method)
                            .reset_index())
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

        # ── Theme ──────────────────────────────────────────────────────────────
        if dark_theme:
            plt.style.use("dark_background")
            bg, fg, gc = "#0a1628", "#c8ddf0", "#1e3a5f"
        else:
            plt.style.use("default")
            bg, fg, gc = "white", "#333333", "#e0e0e0"

        cmap   = plt.get_cmap(color_palette)
        groups = list(df[series_column].unique()) if (series_column and series_column in df.columns) else [None]
        colors = [cmap(i / max(len(groups) - 1, 1)) for i in range(len(groups))]

        draw_kwargs = dict(
            time_col=time_column,
            val_col=value_column,
            series_col=series_column,
            groups=groups,
            colors=colors,
            window_size=window_size,
            window_type=window_type,
            time_period=time_period,
            rolling_function=rolling_function,
            center_window=center_window,
            min_periods=min_periods,
            multi_window_enabled=multi_window_enabled,
            extra_windows=extra_windows,
            std_band_enabled=std_band_enabled,
            std_multiplier=std_multiplier,
            ci_band_enabled=ci_band_enabled,
            ci_level=ci_level,
            raw_overlay=raw_overlay,
            raw_alpha=raw_alpha,
            trend_line=trend_line,
            trend_poly_degree=trend_poly_degree,
            anomaly_rule=anomaly_rule,
            anomaly_threshold=anomaly_threshold,
            line_width=line_width,
            grid_style=grid_style,
            gc=gc, fg=fg,
            show_legend=show_legend,
        )

        # ── Facet or single panel ──────────────────────────────────────────────
        if facet_column and facet_column in df.columns:
            facets   = list(df[facet_column].unique())
            n_facets = len(facets)
            n_cols   = min(facet_cols, n_facets)
            n_rows   = int(np.ceil(n_facets / n_cols))
            fig, axes = plt.subplots(n_rows, n_cols, figsize=(8*n_cols, 4*n_rows),
                                     sharex=shared_axes, sharey=shared_axes, squeeze=False)
            fig.patch.set_facecolor(bg)
            for idx, fval in enumerate(facets):
                ax  = axes.flat[idx]
                sub = df[df[facet_column] == fval]
                ax.set_facecolor(bg)
                _draw_rolling(ax, sub, title=f"{facet_column}: {fval}", **draw_kwargs)
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
            fig, ax = plt.subplots(figsize=(14, 6))
            fig.patch.set_facecolor(bg)
            ax.set_facecolor(bg)
            _draw_rolling(ax, df, **draw_kwargs)

            # Event markers
            for marker_date in event_markers:
                try:
                    md = pd.to_datetime(marker_date)
                    ax.axvline(md, color="#ffaa00", linestyle="--", linewidth=1.2, alpha=0.7)
                    ylims = ax.get_ylim()
                    ax.text(md, ylims[1], marker_date[:10], rotation=90,
                            fontsize=7, color="#ffaa00", va="top", ha="right")
                except Exception:
                    pass

            if y_min is not None and y_max is not None:
                ax.set_ylim(y_min, y_max)
            ax.set_xlabel(x_label or time_column, color=fg, fontsize=11)
            ax.set_ylabel(y_label or value_column, color=fg, fontsize=11)
            ax.set_yscale(axis_scale)
            ax.tick_params(colors=fg)
            for spine in ax.spines.values():
                spine.set_edgecolor(gc)

            win_label = time_period if window_type == "time" else str(window_size)
            ax.set_title(
                f"Rolling {rolling_function.capitalize()} ({win_label}) — {value_column}",
                color=fg, fontsize=13, fontweight="bold", pad=14,
            )

        plt.tight_layout()
        image_path = self.save_plot("rollingmean")

        # ── Compute stats ──────────────────────────────────────────────────────
        stats   = RollingMeanStats()
        raw     = df[value_column].dropna().values.astype(float)
        n       = len(raw)

        # Build rolling series for stats
        if n > window_size:
            s = pd.Series(raw)
            win = window_size if window_type == "fixed" else None
            if win:
                roll_obj = s.rolling(window=win, center=center_window, min_periods=min_periods)
            else:
                roll_obj = s.rolling(window=time_period, center=center_window, min_periods=min_periods)

            rolling_vals = getattr(roll_obj, rolling_function)().dropna().values.astype(float)
        else:
            rolling_vals = raw

        nr = len(rolling_vals)

        if compute_rolling_stats and nr > 0:
            stats.rolling_mean_level  = float(np.mean(rolling_vals))
            stats.rolling_variance    = float(np.var(rolling_vals))
            stats.rolling_std         = float(np.std(rolling_vals))
            raw_var   = float(np.var(raw)) if np.var(raw) > 0 else 1e-10
            roll_var  = float(np.var(rolling_vals))
            stats.signal_noise_ratio  = float(raw_var / (roll_var + 1e-10))
            stats.volatility_index    = float(np.std(rolling_vals) / (np.abs(np.mean(rolling_vals)) + 1e-10))
            if ci_band_enabled and nr > 1:
                alpha = 1 - ci_level / 100
                se    = float(np.std(rolling_vals) / np.sqrt(nr))
                t_val = float(scipy_stats.t.ppf(1 - alpha / 2, df=nr - 1))
                m     = float(np.mean(rolling_vals))
                stats.ci_lower = m - t_val * se
                stats.ci_upper = m + t_val * se

        if compute_trend and nr > 2:
            x_idx = np.arange(nr, dtype=float)
            slope, _, r, p, _ = scipy_stats.linregress(x_idx, rolling_vals)
            stats.trend_slope     = float(slope)
            stats.r_squared       = float(r ** 2)
            stats.p_value         = float(p)
            stats.trend_direction = (
                "Increasing ↑" if slope > 0 else
                "Decreasing ↓" if slope < 0 else "Flat →"
            )

        if compute_smoothing_error and nr > 0:
            # Align raw and rolling (rolling is shorter due to NaN warm-up)
            min_len = min(len(raw), nr)
            r_aligned   = raw[-min_len:]
            rol_aligned = rolling_vals[-min_len:]
            mse  = float(mean_squared_error(r_aligned, rol_aligned))
            stats.mse  = mse
            stats.rmse = float(np.sqrt(mse))
            stats.mae  = float(mean_absolute_error(r_aligned, rol_aligned))

        if compute_autocorrelation and nr > 5:
            try:
                from statsmodels.tsa.stattools import acf, pacf
                acf_v  = acf(rolling_vals, nlags=2, fft=True)
                pacf_v = pacf(rolling_vals, nlags=1)
                stats.acf_lag1  = float(acf_v[1])
                stats.acf_lag2  = float(acf_v[2])
                stats.pacf_lag1 = float(pacf_v[1])
            except Exception:
                for lag in [1, 2]:
                    if nr > lag:
                        corr = np.corrcoef(rolling_vals[:-lag], rolling_vals[lag:])[0, 1]
                        setattr(stats, f"acf_lag{lag}", float(corr))

        if compute_anomaly_stats and n > 0 and anomaly_rule != "none":
            roll_series = pd.Series(raw).rolling(
                window=window_size if window_type == "fixed" else time_period,
                center=center_window, min_periods=min_periods
            )
            roll_mean = roll_series.mean().values
            roll_std  = roll_series.std().values
            valid     = ~(np.isnan(roll_mean) | np.isnan(roll_std) | (roll_std == 0))
            residuals = np.where(valid, (raw - roll_mean) / (roll_std + 1e-10), 0)

            if anomaly_rule == "zscore":
                mask = np.abs(scipy_stats.zscore(raw)) > anomaly_threshold
            else:  # residual
                mask = np.abs(residuals) > anomaly_threshold

            stats.anomaly_count  = int(np.sum(mask))
            stats.anomaly_method = anomaly_rule

        return image_path, stats


# ── Draw helper ────────────────────────────────────────────────────────────────
def _draw_rolling(
    ax, df,
    time_col, val_col, series_col, groups, colors,
    window_size, window_type, time_period,
    rolling_function, center_window, min_periods,
    multi_window_enabled, extra_windows,
    std_band_enabled, std_multiplier,
    ci_band_enabled, ci_level,
    raw_overlay, raw_alpha,
    trend_line, trend_poly_degree,
    anomaly_rule, anomaly_threshold,
    line_width, grid_style, gc, fg, show_legend,
    title=None,
):
    """Draw rolling mean for one panel"""

    for grp, color in zip(groups, colors):
        sub = df[df[series_col] == grp].copy() if (grp is not None and series_col and series_col in df.columns) else df.copy()
        sub = sub.dropna(subset=[val_col])
        x   = sub[time_col].values
        y   = sub[val_col].values.astype(float)
        if len(x) == 0:
            continue

        label = str(grp) if grp is not None else val_col
        s     = pd.Series(y, index=x)

        # ── Window ─────────────────────────────────────────────────────────────
        win    = window_size if window_type == "fixed" else time_period
        roller = s.rolling(window=win, center=center_window, min_periods=min_periods)

        try:
            roll_val = getattr(roller, rolling_function)()
        except AttributeError:
            roll_val = roller.mean()

        # ── Raw overlay ────────────────────────────────────────────────────────
        if raw_overlay:
            ax.plot(x, y, color=color, linewidth=max(0.8, line_width - 0.8),
                    linestyle="-", alpha=raw_alpha, zorder=1,
                    label=f"{label} (raw)")

        # ── Rolling line ───────────────────────────────────────────────────────
        ax.plot(roll_val.index, roll_val.values, color=color,
                linewidth=line_width, linestyle="-", alpha=0.95,
                zorder=3, label=f"{label} (rolling {rolling_function})")

        # ── Std band ───────────────────────────────────────────────────────────
        if std_band_enabled:
            try:
                roll_mean = s.rolling(window=win, center=center_window, min_periods=min_periods).mean()
                roll_std  = s.rolling(window=win, center=center_window, min_periods=min_periods).std()
                upper = roll_mean + std_multiplier * roll_std
                lower = roll_mean - std_multiplier * roll_std
                ax.fill_between(roll_mean.index, lower.values, upper.values,
                                alpha=0.12, color=color, zorder=1)
                ax.plot(upper.index, upper.values, color=color, linewidth=0.6,
                        linestyle="--", alpha=0.4, zorder=2)
                ax.plot(lower.index, lower.values, color=color, linewidth=0.6,
                        linestyle="--", alpha=0.4, zorder=2)
            except Exception:
                pass

        # ── CI band ────────────────────────────────────────────────────────────
        if ci_band_enabled:
            try:
                roll_m   = s.rolling(window=win, center=center_window, min_periods=min_periods).mean()
                roll_s   = s.rolling(window=win, center=center_window, min_periods=min_periods).std()
                roll_cnt = s.rolling(window=win, center=center_window, min_periods=min_periods).count()
                alpha    = 1 - ci_level / 100
                t_crit   = scipy_stats.t.ppf(1 - alpha / 2, df=max(roll_cnt.max() - 1, 1))
                se       = roll_s / np.sqrt(roll_cnt.clip(lower=1))
                upper_ci = roll_m + t_crit * se
                lower_ci = roll_m - t_crit * se
                ax.fill_between(roll_m.index, lower_ci.values, upper_ci.values,
                                alpha=0.08, color=color, zorder=1, linestyle=":")
            except Exception:
                pass

        # ── Multi-window extras ────────────────────────────────────────────────
        if multi_window_enabled and extra_windows:
            extra_colors = ["#ff6b6b", "#ffaa00", "#a855f7", "#22c55e"]
            for ew, ec in zip(extra_windows, extra_colors):
                try:
                    ew_int  = int(ew)
                    ew_roll = s.rolling(window=ew_int, center=center_window, min_periods=1)
                    ew_vals = getattr(ew_roll, rolling_function)()
                    ax.plot(ew_vals.index, ew_vals.values, color=ec,
                            linewidth=max(1.2, line_width - 0.4),
                            linestyle="--", alpha=0.8, zorder=2,
                            label=f"{label} (w={ew_int})")
                except Exception:
                    pass

    # ── Trend line ─────────────────────────────────────────────────────────────
    if trend_line != "none" and len(df) > 2:
        try:
            y_raw   = df[val_col].dropna().values.astype(float)
            x_all   = df[time_col].values[:len(y_raw)]
            s_full  = pd.Series(y_raw, index=x_all)
            win_tr  = window_size if window_type == "fixed" else time_period
            roll_tr = getattr(s_full.rolling(window=win_tr, center=center_window, min_periods=min_periods),
                              rolling_function)().dropna()
            x_idx   = np.arange(len(roll_tr), dtype=float)

            if trend_line == "linear":
                slope, intercept, _, _, _ = scipy_stats.linregress(x_idx, roll_tr.values)
                y_trend = slope * x_idx + intercept
            else:
                coeffs  = np.polyfit(x_idx, roll_tr.values, trend_poly_degree)
                y_trend = np.polyval(coeffs, x_idx)

            ax.plot(roll_tr.index, y_trend, color="#ff6b6b",
                    linewidth=1.8, linestyle=":", alpha=0.9, zorder=4, label="Trend")
        except Exception:
            pass

    # ── Anomaly scatter ────────────────────────────────────────────────────────
    if anomaly_rule != "none":
        try:
            y_raw   = df[val_col].dropna().values.astype(float)
            x_all   = df[time_col].values[:len(y_raw)]
            s_full  = pd.Series(y_raw, index=x_all)
            win_an  = window_size if window_type == "fixed" else time_period
            rm      = s_full.rolling(window=win_an, center=center_window, min_periods=min_periods).mean()
            rs      = s_full.rolling(window=win_an, center=center_window, min_periods=min_periods).std()
            residuals = ((y_raw - rm.values) / (rs.values + 1e-10))

            if anomaly_rule == "zscore":
                mask = np.abs(scipy_stats.zscore(y_raw)) > anomaly_threshold
            else:
                mask = np.abs(residuals) > anomaly_threshold

            ax.scatter(x_all[mask], y_raw[mask], color="#ffaa00",
                       s=60, zorder=5, marker="o",
                       edgecolors="#ff6b6b", linewidths=1.2)
        except Exception:
            pass

    # ── Grid ───────────────────────────────────────────────────────────────────
    if grid_style == "horizontal":
        ax.yaxis.grid(True, color=gc, linewidth=0.4, alpha=0.5)
        ax.xaxis.grid(False)
    elif grid_style == "full":
        ax.grid(True, color=gc, linewidth=0.4, alpha=0.5)
    else:
        ax.grid(False)

    if show_legend:
        ax.legend(framealpha=0.15, facecolor="#0a1628",
                  edgecolor=gc, labelcolor=fg, fontsize=8)

    if title:
        ax.set_title(title, color=fg, fontsize=10, fontweight="bold")