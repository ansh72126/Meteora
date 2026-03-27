import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from app.services.plotting.base import BasePlotter
from app.models import PairPlotStats


class PairPlotPlotter(BasePlotter):

    def plot(
        self,
        columns: list,
        hue_column: str = None,
        sampling_strategy: str = "none",
        sample_size: int = 2000,
        missing_value_handling: str = "drop",
        corner_mode: bool = False,
        upper_triangle_type: str = "correlation_text",
        lower_triangle_type: str = "scatter",
        diagonal_type: str = "histogram",
        histogram_bins=None,
        correlation_method: str = "pearson",
        correlation_overlay: bool = True,
        correlation_highlight_threshold: float = 0.7,
        regression_overlay: bool = False,
        regression_type: str = "linear",
        confidence_interval_level: int = 95,
        show_r_squared: bool = True,
        outlier_detection_method: str = "none",
        mark_outliers: bool = True,
        scatter_point_alpha: float = 0.6,
        scatter_marker_size: float = 18,
        axis_scale: str = "linear",
        percentile_clip_low=None,
        percentile_clip_high=None,
        color_palette: str = "tab10",
        show_legend: bool = True,
        dark_theme: bool = False,
        compute_correlation: bool = True,
        compute_relationships: bool = False,
        compute_distribution: bool = False,
        compute_diagnostics: bool = False,
        compute_separability: bool = False,
    ) -> tuple:

        df = self.df[columns + ([hue_column] if hue_column else [])].copy()

        # ── Force numeric conversion ───────────────────────────────
        for c in columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

        # Detect non-numeric (categorical) columns: >80% NaN after coercion
        n_rows = len(df)
        non_numeric = [
            c for c in columns
            if n_rows > 0 and df[c].isna().sum() / n_rows > 0.8
        ]
        if non_numeric:
            names = ", ".join(f"'{x}'" for x in non_numeric)
            raise ValueError(
                f"The following columns appear to be categorical or non-numeric "
                f"and cannot be used for the scatter matrix: {names}. "
                f"Deselect these and choose only numeric columns for the grid."
            )

        # ── Missing values ─────────────────────────────────────────
        if missing_value_handling == "drop":
            df = df.dropna()
        elif missing_value_handling == "mean_impute":
            for c in columns:
                df[c] = df[c].fillna(df[c].mean())
        elif missing_value_handling == "median_impute":
            for c in columns:
                df[c] = df[c].fillna(df[c].median())

        # ── Sampling ───────────────────────────────────────────────
        if sampling_strategy == "random" and len(df) > sample_size:
            df = df.sample(n=sample_size, random_state=42).reset_index(drop=True)
        elif sampling_strategy == "stratified" and hue_column and len(df) > sample_size:
            df = (df.groupby(hue_column, group_keys=False)
                    .apply(lambda g: g.sample(
                        min(len(g), max(1, int(sample_size * len(g) / len(df)))),
                        random_state=42))
                    .reset_index(drop=True))

        # ── Outlier mask ───────────────────────────────────────────
        outlier_mask = np.zeros(len(df), dtype=bool)
        if outlier_detection_method != "none":
            numeric_df = df[columns].select_dtypes(include=np.number)
            if outlier_detection_method == "zscore":
                z = np.abs(scipy_stats.zscore(numeric_df.dropna(), nan_policy="omit"))
                outlier_mask = (z > 3).any(axis=1)
            elif outlier_detection_method == "iqr":
                for c in columns:
                    q1, q3 = df[c].quantile([0.25, 0.75])
                    iqr = q3 - q1
                    outlier_mask |= (df[c] < q1 - 1.5*iqr) | (df[c] > q3 + 1.5*iqr)

        # ── Percentile clipping ────────────────────────────────────
        if percentile_clip_low is not None and percentile_clip_high is not None:
            for c in columns:
                lo = df[c].quantile(percentile_clip_low / 100)
                hi = df[c].quantile(percentile_clip_high / 100)
                df[c] = df[c].clip(lo, hi)

        # ── Theme ──────────────────────────────────────────────────
        if dark_theme:
            plt.style.use("dark_background")
            bg, fg, gc = "#0a1628", "#c8ddf0", "#1e3a5f"
        else:
            plt.style.use("default")
            bg, fg, gc = "white", "#333333", "#e0e0e0"

        n = len(columns)
        fig, axes = plt.subplots(n, n, figsize=(3 * n, 3 * n))
        fig.patch.set_facecolor(bg)
        if n == 1:
            axes = np.array([[axes]])

        cmap = plt.get_cmap(color_palette)
        hue_vals = df[hue_column].unique() if hue_column and hue_column in df.columns else [None]
        colors = {v: cmap(i / max(len(hue_vals) - 1, 1)) for i, v in enumerate(hue_vals)}

        for i, row_col in enumerate(columns):
            for j, col_col in enumerate(columns):
                ax = axes[i][j]
                ax.set_facecolor(bg)
                ax.tick_params(colors=fg, labelsize=6)
                for spine in ax.spines.values():
                    spine.set_edgecolor(gc)

                is_upper = j > i
                is_lower = j < i
                is_diag  = i == j

                # Skip upper triangle in corner mode
                if corner_mode and is_upper:
                    ax.set_visible(False)
                    continue

                xdata = df[col_col]
                ydata = df[row_col]

                # ── Diagonal ───────────────────────────────────────
                if is_diag:
                    if hue_column and hue_column in df.columns:
                        for hv, color in colors.items():
                            sub = df[df[hue_column] == hv][row_col].dropna()
                            if diagonal_type == "kde":
                                sub.plot.kde(ax=ax, color=color, linewidth=1.5)
                            elif diagonal_type == "density_histogram":
                                ax.hist(sub, bins=histogram_bins or "auto",
                                        density=True, alpha=0.5, color=color)
                                sub.plot.kde(ax=ax, color=color, linewidth=1.2)
                            else:
                                ax.hist(sub, bins=histogram_bins or "auto",
                                        alpha=0.6, color=color)
                    else:
                        data = df[row_col].dropna()
                        if diagonal_type == "kde":
                            data.plot.kde(ax=ax, color="#00d4ff", linewidth=1.5)
                        elif diagonal_type == "density_histogram":
                            ax.hist(data, bins=histogram_bins or "auto",
                                    density=True, alpha=0.5, color="#00d4ff")
                            data.plot.kde(ax=ax, color="#00d4ff", linewidth=1.2)
                        else:
                            ax.hist(data, bins=histogram_bins or "auto",
                                    alpha=0.7, color="#00d4ff", edgecolor=gc)

                # ── Lower triangle ─────────────────────────────────
                elif is_lower:
                    cell_type = lower_triangle_type

                    def _draw_scatter(ax, x, y, mask, colors):
                        if hue_column and hue_column in df.columns:
                            for hv, color in colors.items():
                                hue_mask = df[hue_column] == hv
                                inliers  = hue_mask & ~mask
                                out_pts  = hue_mask & mask
                                ax.scatter(x[inliers], y[inliers],
                                           alpha=scatter_point_alpha,
                                           s=scatter_marker_size, color=color,
                                           label=str(hv), zorder=2)
                                if mark_outliers and out_pts.any():
                                    ax.scatter(x[out_pts], y[out_pts],
                                               alpha=0.8, s=scatter_marker_size * 1.5,
                                               color=color, marker="o",
                                               facecolors="none", linewidths=1.5, zorder=3)
                        else:
                            ax.scatter(x[~mask], y[~mask],
                                       alpha=scatter_point_alpha,
                                       s=scatter_marker_size, color="#00d4ff", zorder=2)
                            if mark_outliers and mask.any():
                                ax.scatter(x[mask], y[mask],
                                           alpha=0.8, s=scatter_marker_size * 1.5,
                                           color="#ffaa00", marker="o",
                                           facecolors="none", linewidths=1.5, zorder=3)

                    valid = xdata.notna() & ydata.notna()
                    xv, yv = xdata[valid].values, ydata[valid].values
                    mv = outlier_mask[valid]

                    if cell_type == "kde":
                        try:
                            from scipy.stats import gaussian_kde
                            k = gaussian_kde(np.vstack([xv, yv]))
                            xi = np.linspace(xv.min(), xv.max(), 80)
                            yi = np.linspace(yv.min(), yv.max(), 80)
                            xi, yi = np.meshgrid(xi, yi)
                            zi = k(np.vstack([xi.ravel(), yi.ravel()])).reshape(xi.shape)
                            ax.contourf(xi, yi, zi, levels=8,
                                        cmap="Blues" if not dark_theme else "cyan_r",
                                        alpha=0.7)
                        except Exception:
                            _draw_scatter(ax, xdata[valid], ydata[valid], mv, colors)
                    else:
                        _draw_scatter(ax, xdata[valid], ydata[valid], mv, colors)
                        if cell_type == "regression" or regression_overlay:
                            try:
                                if regression_type == "robust":
                                    from statsmodels.robust.robust_linear_model import RLM
                                    import statsmodels.api as sm
                                    X = sm.add_constant(xv)
                                    m = RLM(yv, X).fit()
                                    xline = np.linspace(xv.min(), xv.max(), 80)
                                    yline = m.params[0] + m.params[1] * xline
                                else:
                                    slope, intercept, r, p, _ = scipy_stats.linregress(xv, yv)
                                    xline = np.linspace(xv.min(), xv.max(), 80)
                                    yline = intercept + slope * xline
                                    if show_r_squared:
                                        ax.text(0.05, 0.95, f"R²={r**2:.3f}",
                                                transform=ax.transAxes,
                                                fontsize=6, color="#ffaa00",
                                                va="top", ha="left")
                                ax.plot(xline, yline, color="#ffaa00",
                                        linewidth=1.5, zorder=4, alpha=0.85)
                            except Exception:
                                pass

                # ── Upper triangle ─────────────────────────────────
                else:
                    cell_type = upperTri = upper_triangle_type
                    valid = xdata.notna() & ydata.notna()
                    xv, yv = xdata[valid].values, ydata[valid].values

                    if cell_type == "correlation_text":
                        try:
                            if correlation_method == "pearson":
                                r, p = scipy_stats.pearsonr(xv, yv)
                            else:
                                r, p = scipy_stats.spearmanr(xv, yv)
                            color = "#00d4ff" if abs(r) >= correlation_highlight_threshold else "#7faddb"
                            ax.text(0.5, 0.5, f"r = {r:.3f}",
                                    transform=ax.transAxes,
                                    ha="center", va="center",
                                    fontsize=10, fontweight="bold", color=color)
                            ax.text(0.5, 0.3, f"p = {p:.4f}",
                                    transform=ax.transAxes,
                                    ha="center", va="center",
                                    fontsize=7, color=fg, alpha=0.7)
                        except Exception:
                            pass
                    elif cell_type in ("scatter", "regression"):
                        ax.scatter(xv, yv, alpha=scatter_point_alpha * 0.7,
                                   s=scatter_marker_size * 0.8, color="#7faddb", zorder=2)
                        if cell_type == "regression":
                            try:
                                slope, intercept, r, _, _ = scipy_stats.linregress(xv, yv)
                                xline = np.linspace(xv.min(), xv.max(), 80)
                                ax.plot(xline, intercept + slope * xline,
                                        color="#ffaa00", linewidth=1.2, zorder=3)
                            except Exception:
                                pass
                    elif cell_type == "kde":
                        try:
                            from scipy.stats import gaussian_kde
                            k = gaussian_kde(np.vstack([xv, yv]))
                            xi = np.linspace(xv.min(), xv.max(), 60)
                            yi = np.linspace(yv.min(), yv.max(), 60)
                            xi, yi = np.meshgrid(xi, yi)
                            zi = k(np.vstack([xi.ravel(), yi.ravel()])).reshape(xi.shape)
                            ax.contourf(xi, yi, zi, levels=6, cmap="Blues", alpha=0.6)
                        except Exception:
                            pass

                # Axis labels on edges
                if i == n - 1: ax.set_xlabel(col_col, fontsize=7, color=fg)
                if j == 0:     ax.set_ylabel(row_col, fontsize=7, color=fg)
                if axis_scale == "log":
                    try: ax.set_xscale("log")
                    except Exception: pass
                    try: ax.set_yscale("log")
                    except Exception: pass

        # Legend
        if show_legend and hue_column and hue_column in df.columns:
            handles = [plt.Line2D([0],[0], marker='o', color='w',
                                  markerfacecolor=colors[v],
                                  markersize=7, label=str(v))
                       for v in hue_vals]
            fig.legend(handles=handles, loc="upper right",
                       framealpha=0.15, facecolor="#0a1628",
                       edgecolor=gc, labelcolor=fg, fontsize=8)

        plt.suptitle("Pair Plot", fontsize=13, fontweight="bold", color=fg, y=1.01)
        plt.tight_layout()
        image_path = self.save_plot("pairplot")

        # ── Compute stats ──────────────────────────────────────────
        stats    = PairPlotStats()
        num_df   = df[columns].select_dtypes(include=np.number)

        if compute_correlation and len(num_df.columns) >= 2:
            if correlation_method == "pearson":
                corr_mat = num_df.corr(method="pearson")
            else:
                corr_mat = num_df.corr(method="spearman")
            stats.correlation_matrix = corr_mat.round(4).to_dict()

            # Flatten upper triangle for analysis
            pairs = []
            cols_list = list(num_df.columns)
            for a_i, ca in enumerate(cols_list):
                for b_i, cb in enumerate(cols_list):
                    if b_i > a_i:
                        r_val = float(corr_mat.loc[ca, cb])
                        pairs.append({"var1": ca, "var2": cb, "r": r_val})

            if pairs:
                sorted_by_abs = sorted(pairs, key=lambda p: abs(p["r"]), reverse=True)
                stats.strongest_pair      = sorted_by_abs[0]
                stats.weakest_pair        = sorted_by_abs[-1]
                stats.mean_abs_corr       = float(np.mean([abs(p["r"]) for p in pairs]))
                stats.multicollinear_pairs = [p for p in pairs
                                              if abs(p["r"]) >= correlation_highlight_threshold]

        if compute_relationships and len(num_df.columns) >= 2:
            lin_pairs = []
            cols_list = list(num_df.columns)
            for a_i, ca in enumerate(cols_list):
                for b_i, cb in enumerate(cols_list):
                    if b_i > a_i:
                        x_v = num_df[ca].dropna().values
                        y_v = num_df[cb].dropna().values
                        min_len = min(len(x_v), len(y_v))
                        if min_len > 3:
                            try:
                                slope, intercept, r, p, _ = scipy_stats.linregress(
                                    x_v[:min_len], y_v[:min_len])
                                lin_pairs.append({
                                    "var1": ca, "var2": cb,
                                    "r_squared": float(r**2),
                                    "slope": float(slope),
                                    "p_value": float(p),
                                })
                            except Exception:
                                pass
            if lin_pairs:
                stats.linear_pairs     = sorted(lin_pairs,
                                                key=lambda p: p["r_squared"],
                                                reverse=True)
                stats.best_linear_pair = stats.linear_pairs[0]
                # Nonlinear signal: compare pearson vs spearman
                try:
                    pearson_mean  = float(np.mean([abs(p["r_squared"]**0.5) for p in lin_pairs]))
                    spearman_corr = num_df.corr(method="spearman")
                    pairs_sp = []
                    cls_list2 = list(num_df.columns)
                    for a_i2, ca2 in enumerate(cls_list2):
                        for b_i2, cb2 in enumerate(cls_list2):
                            if b_i2 > a_i2:
                                pairs_sp.append(abs(float(spearman_corr.loc[ca2,cb2])))
                    spearman_mean = float(np.mean(pairs_sp)) if pairs_sp else 0
                    diff = spearman_mean - pearson_mean
                    if diff > 0.15:
                        stats.nonlinear_signal = (
                            f"Spearman mean |r|={spearman_mean:.3f} exceeds "
                            f"Pearson R={pearson_mean:.3f} by {diff:.3f} — "
                            "suggests notable nonlinear/monotonic patterns.")
                except Exception:
                    pass

        if compute_distribution:
            stats.skew_summary    = {c: float(num_df[c].skew())     for c in num_df.columns}
            stats.kurtosis_summary = {c: float(num_df[c].kurtosis()) for c in num_df.columns}
            shapes = {}
            for c in num_df.columns:
                sk = num_df[c].skew()
                if abs(sk) < 0.5:
                    shapes[c] = "symmetric"
                elif sk > 1.0:
                    shapes[c] = "right-skewed ↗"
                elif sk > 0.5:
                    shapes[c] = "slightly right-skewed"
                elif sk < -1.0:
                    shapes[c] = "left-skewed ↙"
                else:
                    shapes[c] = "slightly left-skewed"
            stats.distribution_shapes = shapes

        if compute_diagnostics:
            # Outlier stats
            n_total = len(df)
            n_out   = int(np.sum(outlier_mask))
            stats.outlier_count  = n_out
            stats.outlier_pct    = float(n_out / n_total * 100) if n_total > 0 else 0.0
            stats.outlier_method = outlier_detection_method

            # Breusch-Pagan heteroscedasticity test on pairs
            het_pairs = []
            try:
                from statsmodels.stats.diagnostic import het_breuschpagan
                import statsmodels.api as sm
                cols_list3 = list(num_df.columns)
                for a_i3, ca3 in enumerate(cols_list3):
                    for b_i3, cb3 in enumerate(cols_list3):
                        if b_i3 > a_i3:
                            valid3 = num_df[[ca3, cb3]].dropna()
                            if len(valid3) > 10:
                                X3 = sm.add_constant(valid3[ca3].values)
                                y3 = valid3[cb3].values
                                residuals = y3 - sm.OLS(y3, X3).fit().fittedvalues
                                _, p_bp, _, _ = het_breuschpagan(residuals, X3)
                                if p_bp < 0.05:
                                    het_pairs.append({
                                        "var1": ca3, "var2": cb3,
                                        "bp_stat": 0.0,
                                        "p_value": float(p_bp),
                                    })
            except Exception:
                pass
            stats.heteroscedastic_pairs = het_pairs if het_pairs else []

        if compute_separability and hue_column and hue_column in df.columns:
            fisher_ratios = {}
            for c in columns:
                try:
                    groups      = [df[df[hue_column] == v][c].dropna().values
                                   for v in df[hue_column].unique()]
                    grand_mean  = df[c].mean()
                    total_n     = len(df[c].dropna())
                    between_var = sum(len(g) * (g.mean() - grand_mean)**2
                                     for g in groups if len(g) > 0) / max(len(groups)-1, 1)
                    within_var  = sum(np.var(g) * len(g)
                                      for g in groups if len(g) > 0) / total_n
                    fisher_ratios[c] = float(between_var / (within_var + 1e-10))
                except Exception:
                    fisher_ratios[c] = 0.0
            stats.class_separability = fisher_ratios
            if fisher_ratios:
                stats.best_separator = max(fisher_ratios, key=fisher_ratios.get)

        return image_path, stats

        
    