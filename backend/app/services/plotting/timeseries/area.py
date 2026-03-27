import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.services.plotting.base import BasePlotter
from app.models import AreaChartStats

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


class AreaChartPlotter(BasePlotter):
    """Area chart plotter — single / stacked / normalized stacked.
    Supports temporal (datetime / numeric) and categorical X axes.
    Parameter names match the frontend request body exactly.
    """

    def plot(
        self,
        # ── Required ───────────────────────────────────────────────────────────
        x_column: str,
        y_column: str,
        # ── Optional fields ────────────────────────────────────────────────────
        series_column: str = None,
        secondary_column: str = None,       # frontend: secondary_column
        facet_column: str = None,
        # ── Chart mode ─────────────────────────────────────────────────────────
        chart_mode: str = "single_area",
        series_sort_order: str = "auto",
        # ── Resampling ─────────────────────────────────────────────────────────
        resample_frequency: str = "none",
        aggregation_method: str = "sum",
        start_date: str = None,
        end_date: str = None,
        # ── Missing values ──────────────────────────────────────────────────────
        missing_value_handling: str = "ffill",
        # ── Area appearance ─────────────────────────────────────────────────────
        fill_alpha: float = 0.6,
        line_boundary_overlay: bool = True,
        line_width: float = 1.5,
        baseline_value: float = 0.0,
        # ── Rolling smoothing (frontend: rolling_enabled + rolling_window) ──────
        rolling_enabled: bool = False,
        rolling_window: int = 7,
        # ── Cumulative ─────────────────────────────────────────────────────────
        cumulative_mode: bool = False,
        # ── Confidence band (frontend: conf_band_*) ──────────────────────────
        conf_band_enabled: bool = False,
        conf_band_window: int = 14,
        conf_band_alpha: float = 0.15,
        # ── Anomaly ─────────────────────────────────────────────────────────────
        anomaly_rule: str = "none",
        anomaly_threshold: float = 3.0,
        # ── Density reduction ────────────────────────────────────────────────
        density_reduction: bool = False,
        density_points: int = 500,          # frontend: density_points
        # ── Event markers ───────────────────────────────────────────────────────
        event_markers: list = None,
        # ── Facet ───────────────────────────────────────────────────────────────
        facet_cols: int = 2,
        shared_axes: bool = True,
        # ── Axis ────────────────────────────────────────────────────────────────
        axis_scale: str = "linear",
        y_min: float = None,
        y_max: float = None,
        x_label: str = None,
        y_label: str = None,
        # ── Visuals ─────────────────────────────────────────────────────────────
        color_palette: str = "tab10",
        show_grid: bool = True,
        grid_style: str = "horizontal",
        show_legend: bool = True,
        dark_theme: bool = False,
        # ── Stats (frontend: compute_area_metrics / compute_peaks / etc.) ────
        compute_area_metrics: bool = True,   # frontend name
        compute_trend: bool = False,
        compute_rolling_stats: bool = False, # frontend name
        compute_peaks: bool = False,         # frontend name
        compute_seasonality: bool = False,
        compute_anomaly_stats: bool = False,
    ) -> tuple:
        """Returns (image_path, AreaChartStats)"""

        if event_markers is None:
            event_markers = []

        df = self.df.copy()

        # Detect non-numeric (categorical) Y columns: >80% NaN after coercion
        cols_to_check = [(y_column, "Y")]
        if secondary_column and secondary_column in df.columns:
            cols_to_check.append((secondary_column, "Secondary"))
        for col, label in cols_to_check:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"The {label} column '{col}' appears to be categorical or non-numeric "
                    f"and cannot be used for the area chart. Select a numeric column for {label}."
                )

        self.validate_numeric(y_column)

        # ── Parse x column: datetime → numeric → categorical ──────────────────
        x_type = "categorical"

        try:
            converted = pd.to_datetime(df[x_column])
            if converted.notna().sum() > len(converted) * 0.5:
                df[x_column] = converted
                x_type = "datetime"
        except Exception:
            pass

        if x_type == "categorical":
            numeric_try = pd.to_numeric(df[x_column], errors="coerce")
            if numeric_try.notna().sum() > len(numeric_try) * 0.5:
                df[x_column] = numeric_try
                x_type = "numeric"

        # ── Drop NaN y, sort temporal ──────────────────────────────────────────
        df = df.dropna(subset=[y_column]).reset_index(drop=True)
        if x_type in ("datetime", "numeric"):
            df = df.dropna(subset=[x_column])
            df = df.sort_values(x_column).reset_index(drop=True)

        # ── Date range filter (temporal only) ─────────────────────────────────
        if x_type == "datetime" and (start_date or end_date):
            try:
                if start_date:
                    df = df[df[x_column] >= pd.to_datetime(start_date)]
                if end_date:
                    df = df[df[x_column] <= pd.to_datetime(end_date)]
                df = df.reset_index(drop=True)
            except Exception:
                pass

        # ── Resample (datetime only) ───────────────────────────────────────────
        if x_type == "datetime" and resample_frequency != "none" and resample_frequency in FREQ_MAP:
            freq = FREQ_MAP[resample_frequency]
            try:
                if series_column and series_column in df.columns:
                    # Resample each group separately — groupby().resample() silently
                    # drops the grouping column from the result in pandas >= 2.0
                    parts = []
                    for grp in df[series_column].unique():
                        sub = df[df[series_column] == grp].set_index(x_column)[[y_column]]
                        res = sub.resample(freq)[y_column].agg(aggregation_method)
                        res = res.reset_index()
                        res.columns = [x_column, y_column]
                        res[series_column] = grp
                        parts.append(res)
                    df = pd.concat(parts, ignore_index=True).sort_values(x_column).reset_index(drop=True)
                else:
                    tmp = df.set_index(x_column)
                    resampled = tmp.resample(freq)[y_column].agg(aggregation_method)
                    df = resampled.reset_index()
                    df.columns = [x_column, y_column]
            except Exception:
                pass  # Keep raw data if resampling fails

        # ── Aggregation for categorical x (group by x + series) ───────────────
        if x_type == "categorical":
            if series_column and series_column in df.columns:
                df = (df.groupby([x_column, series_column], sort=False)[y_column]
                        .agg(aggregation_method)
                        .reset_index())
            else:
                df = (df.groupby(x_column, sort=False)[y_column]
                        .agg(aggregation_method)
                        .reset_index())

        # ── Missing value handling (per-group if series present) ─────────────
        if series_column and series_column in df.columns:
            def _fill(s):
                if missing_value_handling == "ffill":
                    return s.ffill()
                elif missing_value_handling == "bfill":
                    return s.bfill()
                elif missing_value_handling == "interpolate":
                    return s.interpolate(method="linear")
                return s
            df[y_column] = df.groupby(series_column)[y_column].transform(_fill)
            if missing_value_handling == "drop":
                df = df.dropna(subset=[y_column]).reset_index(drop=True)
        else:
            if missing_value_handling == "ffill":
                df[y_column] = df[y_column].ffill()
            elif missing_value_handling == "bfill":
                df[y_column] = df[y_column].bfill()
            elif missing_value_handling == "interpolate":
                df[y_column] = df[y_column].interpolate(method="linear")
            elif missing_value_handling == "drop":
                df = df.dropna(subset=[y_column]).reset_index(drop=True)

        # ── Density reduction ──────────────────────────────────────────────────
        if density_reduction and len(df) > density_points:
            step = max(1, len(df) // density_points)
            df = df.iloc[::step].reset_index(drop=True)

        # ── Rolling smoothing ──────────────────────────────────────────────────
        if rolling_enabled and rolling_window > 1:
            if series_column and series_column in df.columns:
                df[y_column] = (df.groupby(series_column)[y_column]
                                  .transform(lambda s: s.rolling(rolling_window, min_periods=1).mean()))
            else:
                df[y_column] = df[y_column].rolling(window=rolling_window, min_periods=1).mean()

        # ── Cumulative mode ────────────────────────────────────────────────────
        if cumulative_mode:
            if series_column and series_column in df.columns:
                df[y_column] = df.groupby(series_column)[y_column].cumsum()
            else:
                df[y_column] = df[y_column].cumsum()

        # ── Theme ──────────────────────────────────────────────────────────────
        if dark_theme:
            plt.style.use("dark_background")
            bg, fg, gc = "#0a1628", "#c8ddf0", "#1e3a5f"
        else:
            plt.style.use("default")
            bg, fg, gc = "white", "#333333", "#e0e0e0"

        cmap = plt.get_cmap(color_palette)

        # ── Groups + sort order ────────────────────────────────────────────────
        if series_column and series_column in df.columns:
            raw_groups = list(df[series_column].unique())
            if series_sort_order == "asc":
                groups = sorted(raw_groups, key=lambda g: df[df[series_column] == g][y_column].sum())
            elif series_sort_order == "desc":
                groups = sorted(raw_groups, key=lambda g: df[df[series_column] == g][y_column].sum(), reverse=True)
            else:
                groups = raw_groups
        else:
            groups = [None]

        colors = [cmap(i / max(len(groups) - 1, 1)) for i in range(len(groups))]

        # ── Categorical x: integer positions ──────────────────────────────────
        if x_type == "categorical":
            cat_order = list(dict.fromkeys(df[x_column].astype(str).tolist()))
            cat_pos   = {c: i for i, c in enumerate(cat_order)}
            df["_xpos"] = df[x_column].astype(str).map(cat_pos)
            x_plot_col = "_xpos"
        else:
            cat_order  = None
            x_plot_col = x_column

        draw_kwargs = dict(
            x_col=x_plot_col, y_col=y_column, series_col=series_column,
            groups=groups, colors=colors,
            chart_mode=chart_mode, fill_alpha=fill_alpha,
            line_boundary_overlay=line_boundary_overlay, line_width=line_width,
            baseline_value=baseline_value,
            conf_band_enabled=conf_band_enabled,
            conf_band_window=conf_band_window,
            conf_band_alpha=conf_band_alpha,
            rolling_enabled=rolling_enabled,
            rolling_window=rolling_window,
            anomaly_rule=anomaly_rule, anomaly_threshold=anomaly_threshold,
            grid_style=grid_style, gc=gc, fg=fg, show_legend=show_legend,
            cat_order=cat_order,
        )

        # ── Facet or single panel ──────────────────────────────────────────────
        if facet_column and facet_column in df.columns:
            facets   = list(df[facet_column].unique())
            n_facets = len(facets)
            n_cols   = min(facet_cols, n_facets)
            n_rows   = int(np.ceil(n_facets / n_cols))
            fig, axes = plt.subplots(n_rows, n_cols, figsize=(8 * n_cols, 4 * n_rows),
                                     sharex=shared_axes, sharey=shared_axes, squeeze=False)
            fig.patch.set_facecolor(bg)
            for idx, fval in enumerate(facets):
                ax  = axes.flat[idx]
                sub = df[df[facet_column] == fval]
                ax.set_facecolor(bg)
                _draw_area(ax, sub, title=f"{facet_column}: {fval}", **draw_kwargs)
                if y_min is not None and y_max is not None:
                    ax.set_ylim(y_min, y_max)
                ax.set_xlabel(x_label or x_column, color=fg, fontsize=8)
                ax.set_ylabel(y_label or y_column, color=fg, fontsize=8)
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
            _draw_area(ax, df, **draw_kwargs)

            # Event markers (temporal only)
            if x_type == "datetime":
                for md_str in event_markers:
                    try:
                        md = pd.to_datetime(md_str)
                        ax.axvline(md, color="#ffaa00", linestyle="--",
                                   linewidth=1.2, alpha=0.7)
                        ax.text(md, ax.get_ylim()[1], md_str[:10], rotation=90,
                                fontsize=7, color="#ffaa00", va="top", ha="right")
                    except Exception:
                        pass

            # Secondary axis
            if secondary_column and secondary_column in df.columns:
                ax2 = ax.twinx()
                ax2.set_facecolor(bg)
                ax2.plot(df[x_plot_col], df[secondary_column], color="#ff6b6b",
                         linewidth=line_width, linestyle="--",
                         label=secondary_column, alpha=0.85)
                ax2.set_ylabel(secondary_column, color="#ff6b6b", fontsize=10)
                ax2.tick_params(colors="#ff6b6b")
                ax2.spines["right"].set_edgecolor("#ff6b6b")

            if y_min is not None and y_max is not None:
                ax.set_ylim(y_min, y_max)
            ax.set_xlabel(x_label or x_column, color=fg, fontsize=11)
            ax.set_ylabel(y_label or y_column, color=fg, fontsize=11)
            ax.set_yscale(axis_scale)
            ax.tick_params(colors=fg)
            for spine in ax.spines.values():
                spine.set_edgecolor(gc)

            mode_label = {
                "single_area":        "Area",
                "stacked":            "Stacked Area",
                "normalized_stacked": "100% Stacked Area",
            }.get(chart_mode, "Area")
            ax.set_title(f"{mode_label} — {y_column} over {x_column}",
                         color=fg, fontsize=13, fontweight="bold", pad=14)

        plt.tight_layout()
        image_path = self.save_plot("areachart")

        # ── Compute stats ──────────────────────────────────────────────────────
        stats = AreaChartStats()
        vals  = df[y_column].dropna().values.astype(float)
        n     = len(vals)
        x_raw = df[x_column].values if x_column in df.columns else np.arange(n)

        if compute_area_metrics and n > 1:
            x_idx = np.arange(n, dtype=float)
            stats.total_area_integral = float(np.trapezoid(vals, x=x_idx))
            if vals[0] != 0:
                stats.cumulative_growth = float((vals[-1] - vals[0]) / abs(vals[0]) * 100)
            if series_column and series_column in df.columns:
                total  = df[y_column].sum()
                stats.category_contribution_ratio = {
                    str(g): float(df[df[series_column] == g][y_column].sum()) / (total + 1e-10)
                    for g in groups if g is not None
                }

        if compute_trend and n > 2:
            x_idx = np.arange(n, dtype=float)
            slope, _, r, p, _ = scipy_stats.linregress(x_idx, vals)
            stats.trend_slope     = float(slope)
            stats.r_squared       = float(r ** 2)
            stats.p_value         = float(p)
            stats.trend_direction = ("Increasing ↑" if slope > 0
                                     else "Decreasing ↓" if slope < 0 else "Flat →")

        if compute_rolling_stats and n > rolling_window:
            roll = pd.Series(vals).rolling(window=rolling_window, min_periods=1)
            stats.rolling_mean       = float(roll.mean().mean())
            stats.rolling_std        = float(roll.std().mean())
            stats.variance_over_time = float(roll.var().mean())

        if compute_peaks and n > 0:
            peak_idx   = int(np.argmax(vals))
            trough_idx = int(np.argmin(vals))
            stats.peak_value   = float(vals[peak_idx])
            stats.trough_value = float(vals[trough_idx])
            try:
                stats.peak_time   = str(pd.Timestamp(x_raw[peak_idx]).date())
                stats.trough_time = str(pd.Timestamp(x_raw[trough_idx]).date())
            except Exception:
                stats.peak_time   = str(x_raw[peak_idx])
                stats.trough_time = str(x_raw[trough_idx])

        if compute_trend and n > 1:
            pct = pd.Series(vals).pct_change().dropna().values
            stats.growth_rate    = float(pct.mean() * 100) if len(pct) else None
            stats.rate_of_change = float(np.mean(np.diff(vals)))

        if compute_seasonality and n > 10:
            try:
                from statsmodels.tsa.seasonal import seasonal_decompose
                period = min(12, n // 2)
                decomp = seasonal_decompose(pd.Series(vals), model="additive",
                                            period=period, extrapolate_trend="freq")
                stats.seasonality_signal = float(
                    np.var(decomp.seasonal) / (np.var(vals) + 1e-10))
                fft_v    = np.abs(np.fft.rfft(vals - np.mean(vals)))
                freqs    = np.fft.rfftfreq(n)
                dom_freq = freqs[np.argmax(fft_v[1:]) + 1]
                stats.dominant_period = int(round(1 / dom_freq)) if dom_freq > 0 else None
            except Exception:
                pass

        if compute_anomaly_stats and n > 0 and anomaly_rule != "none":
            if anomaly_rule == "zscore":
                mask = np.abs(scipy_stats.zscore(vals)) > anomaly_threshold
            else:
                q1, q3 = np.percentile(vals, [25, 75])
                iqr     = q3 - q1
                mask    = ((vals < q1 - anomaly_threshold * iqr) |
                           (vals > q3 + anomaly_threshold * iqr))
            stats.anomaly_count  = int(np.sum(mask))
            stats.anomaly_method = anomaly_rule

        return image_path, stats


# ── Draw helper ────────────────────────────────────────────────────────────────
def _draw_area(
    ax, df,
    x_col, y_col, series_col, groups, colors,
    chart_mode, fill_alpha, line_boundary_overlay, line_width,
    baseline_value,
    conf_band_enabled, conf_band_window, conf_band_alpha,
    rolling_enabled, rolling_window,
    anomaly_rule, anomaly_threshold,
    grid_style, gc, fg, show_legend,
    cat_order=None,
    title=None,
):
    n_grps = len(groups)

    def _pivot(data):
        piv = data.pivot_table(
            index=x_col, columns=series_col, values=y_col, aggfunc="sum"
        ).fillna(0)
        valid = [g for g in groups if g in piv.columns]
        return piv[valid]

    if chart_mode == "stacked" and n_grps > 1 and series_col:
        pivot   = _pivot(df)
        x_vals  = pivot.index.values
        bottoms = np.zeros(len(x_vals))
        for grp, color in zip(groups, colors):
            if grp not in pivot.columns:
                continue
            y_vals = pivot[grp].values.astype(float)
            ax.fill_between(x_vals, bottoms, bottoms + y_vals,
                            alpha=fill_alpha, color=color, label=str(grp), zorder=2)
            if line_boundary_overlay:
                ax.plot(x_vals, bottoms + y_vals, color=color,
                        linewidth=line_width, zorder=3, alpha=0.9)
            bottoms += y_vals

    elif chart_mode == "normalized_stacked" and n_grps > 1 and series_col:
        pivot   = _pivot(df)
        row_sum = pivot.sum(axis=1).replace(0, 1)
        norm    = pivot.div(row_sum, axis=0)
        x_vals  = norm.index.values
        bottoms = np.zeros(len(x_vals))
        for grp, color in zip(groups, colors):
            if grp not in norm.columns:
                continue
            y_vals = norm[grp].values.astype(float)
            ax.fill_between(x_vals, bottoms, bottoms + y_vals,
                            alpha=fill_alpha, color=color, label=str(grp), zorder=2)
            if line_boundary_overlay:
                ax.plot(x_vals, bottoms + y_vals, color=color,
                        linewidth=line_width, zorder=3, alpha=0.9)
            bottoms += y_vals
        ax.set_ylim(0, 1)
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v*100:.0f}%"))

    else:
        # Single / overlaid areas
        for grp, color in zip(groups, colors):
            sub = (df[df[series_col] == grp].copy()
                   if grp is not None and series_col and series_col in df.columns
                   else df.copy())
            sub = sub.dropna(subset=[y_col])
            x_v = sub[x_col].values
            y_v = sub[y_col].values.astype(float)
            if len(x_v) == 0:
                continue
            label = str(grp) if grp is not None else y_col
            ax.fill_between(x_v, baseline_value, y_v,
                            alpha=fill_alpha, color=color, label=label, zorder=2)
            if line_boundary_overlay:
                ax.plot(x_v, y_v, color=color, linewidth=line_width, zorder=3, alpha=0.95)

            # Confidence band (requires rolling)
            if conf_band_enabled and rolling_enabled and rolling_window > 1 and len(y_v) > conf_band_window:
                s      = pd.Series(y_v)
                r_mean = s.rolling(conf_band_window, min_periods=1).mean()
                r_std  = s.rolling(conf_band_window, min_periods=1).std().fillna(0)
                ax.fill_between(x_v,
                                r_mean.values - 1.96 * r_std.values,
                                r_mean.values + 1.96 * r_std.values,
                                alpha=conf_band_alpha, color=color, zorder=1)
            elif conf_band_enabled and len(y_v) > conf_band_window:
                # Band without requiring rolling toggle
                s      = pd.Series(y_v)
                r_mean = s.rolling(conf_band_window, min_periods=1).mean()
                r_std  = s.rolling(conf_band_window, min_periods=1).std().fillna(0)
                ax.fill_between(x_v,
                                r_mean.values - 1.96 * r_std.values,
                                r_mean.values + 1.96 * r_std.values,
                                alpha=conf_band_alpha, color=color, zorder=1)

    # ── Categorical axis labels ────────────────────────────────────────────────
    if cat_order:
        ax.set_xticks(range(len(cat_order)))
        ax.set_xticklabels(
            cat_order,
            rotation=35 if len(cat_order) > 5 else 0,
            ha="right"  if len(cat_order) > 5 else "center",
            fontsize=9,
        )

    # ── Anomaly scatter ────────────────────────────────────────────────────────
    if anomaly_rule != "none":
        try:
            y_raw = df[y_col].dropna().values.astype(float)
            x_raw = df[x_col].values[:len(y_raw)]
            if anomaly_rule == "zscore":
                mask = np.abs(scipy_stats.zscore(y_raw)) > anomaly_threshold
            else:
                q1, q3 = np.percentile(y_raw, [25, 75])
                iqr     = q3 - q1
                mask    = ((y_raw < q1 - anomaly_threshold * iqr) |
                           (y_raw > q3 + anomaly_threshold * iqr))
            ax.scatter(x_raw[mask], y_raw[mask], color="#ffaa00",
                       s=55, zorder=5, marker="o",
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