import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib.patches as mpatches
import numpy as np
from scipy import stats as scipy_stats
from scipy.stats import pearsonr, spearmanr, shapiro
from sklearn.metrics import mean_squared_error, mean_absolute_error
from sklearn.linear_model import LinearRegression

from app.services.plotting.base import BasePlotter
from app.models import JointStats

MARKER_MAP = {
    "o": "o", "s": "s", "^": "^", "+": "+", "x": "x", "D": "D",
}


class JointPlotPlotter(BasePlotter):
    """Bivariate joint plot with marginals"""

    def plot(
        self,
        x_column: str,
        y_column: str,
        hue_column: str = None,
        joint_kind: str = "scatter",
        joint_alpha: float = 0.6,
        joint_point_size: float = 40,
        joint_point_color: str = "#00d4ff",
        joint_marker_style: str = "o",
        overplot_strategy: str = "none",
        color_palette: str = "tab10",
        hexbin_gridsize: int = 30,
        hexbin_count_scale: str = "linear",
        marginal_kind: str = "hist",
        marginal_ratio: int = 5,
        marginal_ticks: bool = True,
        marginal_stat_lines: list = None,
        marginal_normal_overlay: bool = False,
        fit_overlay: str = "none",
        confidence_band: bool = True,
        confidence_band_alpha: float = 0.15,
        confidence_level: float = 0.95,
        density_contours: bool = False,
        density_contour_levels: int = 6,
        dark_theme: bool = False,
        figure_size: float = 8,
        compute_correlation: bool = True,
        correlation_method: str = "pearson",
        compute_regression: bool = False,
        compute_normality: bool = False,
        compute_outliers: bool = False,
        outlier_method: str = "mahalanobis",
        compute_marginal_stats: bool = False,
        pearson_annotation: bool = True,
        spearman_annotation: bool = False,
        sample_size_annotation: bool = True,
        fit_annotation_box: bool = False,
        outlier_annotation: bool = False,
    ) -> tuple:
        """Returns (image_path, JointStats)"""

        if marginal_stat_lines is None:
            marginal_stat_lines = []

        df = self.df.copy()
        for col, label in [(x_column, "X"), (y_column, "Y")]:
            coerced = pd.to_numeric(df[col], errors="coerce")
            n_rows = len(df)
            if n_rows > 0 and coerced.isna().sum() / n_rows > 0.8:
                raise ValueError(
                    f"The {label} column '{col}' appears to be categorical or non-numeric "
                    f"and cannot be used for the joint plot. Select a numeric column for {label}."
                )
        self.validate_numeric(x_column)
        self.validate_numeric(y_column)

        df = df.dropna(subset=[x_column, y_column]).copy()
        x_vals = df[x_column].values.astype(float)
        y_vals = df[y_column].values.astype(float)

        # ── Theme ──────────────────────────────────────────────────────────────
        if dark_theme:
            plt.style.use("dark_background")
            bg       = "#0a1628"
            fg       = "#c8ddf0"
            grid_c   = "#1e3a5f"
            ann_bg   = "#0f2035"
            ann_edge = "#1e3a5f"
        else:
            plt.style.use("default")
            bg       = "white"
            fg       = "#333"
            grid_c   = "#e0e0e0"
            ann_bg   = "white"
            ann_edge = "#cccccc"

        # ── Build figure with GridSpec ─────────────────────────────────────────
        fig = plt.figure(figsize=(figure_size, figure_size))
        fig.patch.set_facecolor(bg)

        gs = gridspec.GridSpec(
            2, 2,
            width_ratios=[marginal_ratio, 1],
            height_ratios=[1, marginal_ratio],
            hspace=0.05, wspace=0.05,
        )

        ax_joint  = fig.add_subplot(gs[1, 0])
        ax_top    = fig.add_subplot(gs[0, 0], sharex=ax_joint)
        ax_right  = fig.add_subplot(gs[1, 1], sharey=ax_joint)

        for ax in [ax_joint, ax_top, ax_right]:
            ax.set_facecolor(bg)
            for spine in ax.spines.values():
                spine.set_edgecolor(grid_c)

        # ── Hue groups ────────────────────────────────────────────────────────
        if hue_column and hue_column in df.columns:
            groups = df[hue_column].unique()
            cmap   = plt.get_cmap(color_palette)
            colors = [cmap(i / max(len(groups) - 1, 1)) for i in range(len(groups))]
        else:
            groups = [None]
            colors = [joint_point_color]

        # ── JOINT AXIS ────────────────────────────────────────────────────────
        eff_alpha = joint_alpha if overplot_strategy == "alpha" else joint_alpha

        if joint_kind == "hex" or overplot_strategy == "hexbin":
            bins = hexbin_gridsize
            if hexbin_count_scale == "log":
                from matplotlib.colors import LogNorm
                ax_joint.hexbin(x_vals, y_vals, gridsize=bins, cmap="YlOrRd",
                                mincnt=1, norm=LogNorm())
            else:
                ax_joint.hexbin(x_vals, y_vals, gridsize=bins, cmap="YlOrRd", mincnt=1)

        elif joint_kind == "kde":
            from scipy.stats import gaussian_kde
            try:
                kde = gaussian_kde(np.vstack([x_vals, y_vals]))
                xg  = np.linspace(x_vals.min(), x_vals.max(), 100)
                yg  = np.linspace(y_vals.min(), y_vals.max(), 100)
                xx, yy = np.meshgrid(xg, yg)
                zz  = kde(np.vstack([xx.ravel(), yy.ravel()])).reshape(xx.shape)
                ax_joint.contourf(xx, yy, zz, levels=density_contour_levels,
                                  cmap="Blues" if not dark_theme else "YlOrRd", alpha=0.8)
                ax_joint.contour(xx, yy, zz, levels=density_contour_levels,
                                 colors=fg, alpha=0.3, linewidths=0.6)
            except Exception:
                pass

        else:
            # scatter or reg
            handles = []
            for grp, color in zip(groups, colors):
                if grp is not None:
                    mask = (df[hue_column] == grp).values
                    xg, yg = x_vals[mask], y_vals[mask]
                else:
                    xg, yg = x_vals, y_vals

                ax_joint.scatter(
                    xg, yg,
                    s=joint_point_size, c=[color],
                    marker=MARKER_MAP.get(joint_marker_style, "o"),
                    alpha=eff_alpha, edgecolors="none",
                )
                if grp is not None:
                    handles.append(mpatches.Patch(color=color, label=str(grp)))

            if handles:
                ax_joint.legend(handles=handles, framealpha=0.15,
                                facecolor=ann_bg, edgecolor=ann_edge,
                                labelcolor=fg, fontsize=8)

        # ── Density contours overlay ───────────────────────────────────────────
        if density_contours and joint_kind not in ("kde", "hex"):
            try:
                from scipy.stats import gaussian_kde
                kde  = gaussian_kde(np.vstack([x_vals, y_vals]))
                xg   = np.linspace(x_vals.min(), x_vals.max(), 80)
                yg   = np.linspace(y_vals.min(), y_vals.max(), 80)
                xx, yy = np.meshgrid(xg, yg)
                zz   = kde(np.vstack([xx.ravel(), yy.ravel()])).reshape(xx.shape)
                ax_joint.contour(xx, yy, zz, levels=density_contour_levels,
                                 colors="white" if dark_theme else "steelblue",
                                 alpha=0.4, linewidths=0.8)
            except Exception:
                pass

        # ── Fit line ──────────────────────────────────────────────────────────
        if fit_overlay != "none" and len(x_vals) > 2:
            x_s = np.sort(x_vals)
            try:
                if fit_overlay == "ols":
                    slope_f, intercept_f, _, _, _ = scipy_stats.linregress(x_vals, y_vals)
                    y_fit = slope_f * x_s + intercept_f
                    if confidence_band:
                        n     = len(x_vals)
                        y_p   = slope_f * x_vals + intercept_f
                        se    = np.sqrt(np.sum((y_vals - y_p)**2) / (n-2) / np.sum((x_vals - x_vals.mean())**2))
                        t_c   = scipy_stats.t.ppf((1 + confidence_level) / 2, df=n-2)
                        se_f  = se * np.sqrt(1/n + (x_s - x_vals.mean())**2 / np.sum((x_vals - x_vals.mean())**2))
                        ax_joint.fill_between(x_s, y_fit - t_c*se_f, y_fit + t_c*se_f,
                                              alpha=confidence_band_alpha, color="#ff6b6b")
                elif fit_overlay == "lowess":
                    from statsmodels.nonparametric.smoothers_lowess import lowess
                    sm    = lowess(y_vals, x_vals, frac=0.3, return_sorted=True)
                    x_s   = sm[:, 0]
                    y_fit = sm[:, 1]

                ax_joint.plot(x_s, y_fit, color="#ff6b6b", linewidth=2, linestyle="--")
            except Exception:
                pass

        # ── Annotations on joint ──────────────────────────────────────────────
        ann_lines = []
        if (pearson_annotation or compute_correlation) and len(x_vals) > 2:
            try:
                r, p = pearsonr(x_vals, y_vals)
                sig = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else "ns"
                ann_lines.append(f"r = {r:.3f} ({sig})")
            except Exception:
                pass

        if spearman_annotation and len(x_vals) > 2:
            try:
                rho, p = spearmanr(x_vals, y_vals)
                sig = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else "ns"
                ann_lines.append(f"ρ = {rho:.3f} ({sig})")
            except Exception:
                pass

        if sample_size_annotation:
            ann_lines.append(f"n = {len(df)}")

        if fit_annotation_box and fit_overlay == "ols" and len(x_vals) > 2:
            try:
                slope_f, intercept_f, r_lin, _, se_f = scipy_stats.linregress(x_vals, y_vals)
                ann_lines.append(f"slope = {slope_f:.4f}")
                ann_lines.append(f"R² = {r_lin**2:.4f}")
                ann_lines.append(f"SE = {se_f:.4f}")
            except Exception:
                pass

        if ann_lines:
            ann_text = "\n".join(ann_lines)
            ax_joint.text(
                0.97, 0.97, ann_text,
                transform=ax_joint.transAxes,
                ha="right", va="top", fontsize=8,
                color=fg,
                bbox=dict(boxstyle="round,pad=0.4", facecolor=ann_bg,
                          edgecolor=ann_edge, alpha=0.85),
            )

        # ── Outlier flag ──────────────────────────────────────────────────────
        if outlier_annotation and len(x_vals) > 2:
            try:
                from scipy.spatial.distance import mahalanobis
                data = np.column_stack([x_vals, y_vals])
                cov  = np.cov(data.T)
                mean = data.mean(axis=0)
                inv_cov = np.linalg.inv(cov)
                dists = [mahalanobis(row, mean, inv_cov) for row in data]
                threshold = np.percentile(dists, 97.5)
                for i, d in enumerate(dists):
                    if d > threshold:
                        ax_joint.annotate("✕",
                            (x_vals[i], y_vals[i]),
                            color="#ff6b6b", fontsize=7, ha="center", va="center",
                        )
            except Exception:
                pass

        # ── Axis labels ───────────────────────────────────────────────────────
        ax_joint.set_xlabel(x_column, color=fg, fontsize=10)
        ax_joint.set_ylabel(y_column, color=fg, fontsize=10)
        ax_joint.tick_params(colors=fg)
        ax_joint.grid(True, color=grid_c, linewidth=0.4, alpha=0.5)

        # ── TOP MARGINAL ──────────────────────────────────────────────────────
        plt.setp(ax_top.get_xticklabels(), visible=False)
        ax_top.tick_params(colors=fg)
        ax_top.grid(False)

        if marginal_kind == "hist":
            for grp, color in zip(groups, colors):
                data_m = x_vals if grp is None else df[df[hue_column] == grp][x_column].values.astype(float)
                ax_top.hist(data_m, bins=20, color=color, alpha=0.6, edgecolor="none")
        else:
            for grp, color in zip(groups, colors):
                data_m = x_vals if grp is None else df[df[hue_column] == grp][x_column].values.astype(float)
                from scipy.stats import gaussian_kde
                try:
                    kde_m  = gaussian_kde(data_m)
                    xs_m   = np.linspace(data_m.min(), data_m.max(), 200)
                    ys_m   = kde_m(xs_m)
                    if marginal_kind == "kde":
                        ax_top.fill_between(xs_m, ys_m, alpha=0.35, color=color)
                    ax_top.plot(xs_m, ys_m, color=color, linewidth=1.5)
                except Exception:
                    pass

        if marginal_normal_overlay:
            try:
                mu, sigma = x_vals.mean(), x_vals.std()
                xs_n = np.linspace(x_vals.min(), x_vals.max(), 200)
                ax_top.plot(xs_n, scipy_stats.norm.pdf(xs_n, mu, sigma) * len(x_vals) * (x_vals.max()-x_vals.min())/20
                            if marginal_kind == "hist" else scipy_stats.norm.pdf(xs_n, mu, sigma),
                            color="#ffaa00", linewidth=1.5, linestyle=":", label="Normal")
            except Exception:
                pass

        _draw_stat_lines(ax_top, x_vals, marginal_stat_lines, "vertical", fg)

        if not marginal_ticks:
            ax_top.set_yticks([])

        # ── RIGHT MARGINAL ─────────────────────────────────────────────────────
        plt.setp(ax_right.get_yticklabels(), visible=False)
        ax_right.tick_params(colors=fg)
        ax_right.grid(False)

        if marginal_kind == "hist":
            for grp, color in zip(groups, colors):
                data_m = y_vals if grp is None else df[df[hue_column] == grp][y_column].values.astype(float)
                ax_right.hist(data_m, bins=20, color=color, alpha=0.6,
                              orientation="horizontal", edgecolor="none")
        else:
            for grp, color in zip(groups, colors):
                data_m = y_vals if grp is None else df[df[hue_column] == grp][y_column].values.astype(float)
                try:
                    kde_m  = gaussian_kde(data_m)
                    ys_m   = np.linspace(data_m.min(), data_m.max(), 200)
                    xs_m   = kde_m(ys_m)
                    if marginal_kind == "kde":
                        ax_right.fill_betweenx(ys_m, xs_m, alpha=0.35, color=color)
                    ax_right.plot(xs_m, ys_m, color=color, linewidth=1.5)
                except Exception:
                    pass

        if marginal_normal_overlay:
            try:
                mu, sigma = y_vals.mean(), y_vals.std()
                ys_n = np.linspace(y_vals.min(), y_vals.max(), 200)
                xs_n = scipy_stats.norm.pdf(ys_n, mu, sigma)
                ax_right.plot(xs_n, ys_n, color="#ffaa00", linewidth=1.5, linestyle=":")
            except Exception:
                pass

        _draw_stat_lines(ax_right, y_vals, marginal_stat_lines, "horizontal", fg)

        if not marginal_ticks:
            ax_right.set_xticks([])

        # hide top-right corner cell
        fig.add_subplot(gs[0, 1]).set_visible(False)

        plt.suptitle(f"{y_column} vs {x_column}", color=fg, fontsize=11,
                     fontweight="bold", y=1.01)

        image_path = self.save_plot("jointplot")

        # ── Stats ──────────────────────────────────────────────────────────────
        stats = JointStats()

        if compute_correlation and len(x_vals) > 2:
            if correlation_method in ("pearson", "both"):
                r, p = pearsonr(x_vals, y_vals)
                stats.pearson_r = float(r)
                stats.pearson_p = float(p)
                stats.significance = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else "ns"

            if correlation_method in ("spearman", "both"):
                rho, p = spearmanr(x_vals, y_vals)
                stats.spearman_rho = float(rho)
                stats.spearman_p = float(p)

            stats.sample_size = int(len(df))

        if compute_regression and len(x_vals) > 2:
            slope_r, intercept_r, r_lin, p_r, se_r = scipy_stats.linregress(x_vals, y_vals)
            stats.r_squared  = float(r_lin ** 2)
            stats.slope      = float(slope_r)
            stats.intercept  = float(intercept_r)
            stats.std_error  = float(se_r)
            stats.equation   = (
                f"y = {slope_r:.4f}x + {intercept_r:.4f}"
                if intercept_r >= 0
                else f"y = {slope_r:.4f}x - {abs(intercept_r):.4f}"
            )
            n   = len(x_vals)
            se  = np.sqrt(
                np.sum((y_vals - (slope_r * x_vals + intercept_r))**2) / (n-2) /
                np.sum((x_vals - x_vals.mean())**2)
            )
            t_c = scipy_stats.t.ppf((1 + confidence_level) / 2, df=n-2)
            stats.confidence_interval_lower = float(slope_r - t_c * se)
            stats.confidence_interval_upper = float(slope_r + t_c * se)

            model  = LinearRegression().fit(x_vals.reshape(-1, 1), y_vals)
            y_pred = model.predict(x_vals.reshape(-1, 1))
            mse    = mean_squared_error(y_vals, y_pred)
            stats.mse  = float(mse)
            stats.rmse = float(np.sqrt(mse))
            stats.mae  = float(mean_absolute_error(y_vals, y_pred))

        if compute_normality and len(x_vals) >= 3:
            try:
                stat_x, p_x = shapiro(x_vals[:5000])
                stat_y, p_y = shapiro(y_vals[:5000])
                stats.normality_x_stat = float(stat_x)
                stats.normality_x_p   = float(p_x)
                stats.normality_y_stat = float(stat_y)
                stats.normality_y_p   = float(p_y)
                stats.normality_test  = "Shapiro-Wilk"
            except Exception:
                pass

        if compute_outliers and len(x_vals) > 2:
            try:
                if outlier_method == "mahalanobis":
                    from scipy.spatial.distance import mahalanobis as mah
                    data   = np.column_stack([x_vals, y_vals])
                    cov    = np.cov(data.T)
                    mean   = data.mean(axis=0)
                    inv_c  = np.linalg.inv(cov)
                    dists  = [mah(row, mean, inv_c) for row in data]
                    thresh = np.percentile(dists, 97.5)
                    n_out  = int(np.sum(np.array(dists) > thresh))
                elif outlier_method == "zscore":
                    z = np.abs(scipy_stats.zscore(y_vals))
                    n_out = int(np.sum(z > 3))
                else:
                    q1, q3 = np.percentile(y_vals, [25, 75])
                    iqr = q3 - q1
                    n_out = int(np.sum((y_vals < q1 - 1.5*iqr) | (y_vals > q3 + 1.5*iqr)))

                stats.outlier_count  = n_out
                stats.outlier_method = outlier_method
            except Exception:
                pass

        if compute_marginal_stats:
            stats.x_mean   = float(np.mean(x_vals))
            stats.x_median = float(np.median(x_vals))
            stats.x_std    = float(np.std(x_vals))
            stats.y_mean   = float(np.mean(y_vals))
            stats.y_median = float(np.median(y_vals))
            stats.y_std    = float(np.std(y_vals))

        return image_path, stats


# ── Marginal stat line helper ──────────────────────────────────────────────────
def _draw_stat_lines(ax, values, stat_lines, orientation, color):
    """Draw mean/median/q1q3 lines on a marginal axis"""
    if not stat_lines:
        return

    line_styles = {
        "mean":   ("#00d4ff", "--", 1.4),
        "median": ("#ffaa00", "-",  1.4),
        "q1q3":   ("#7faddb", ":",  1.2),
    }

    for key in stat_lines:
        if key == "mean":
            vals_to_draw = [np.mean(values)]
        elif key == "median":
            vals_to_draw = [np.median(values)]
        elif key == "q1q3":
            vals_to_draw = list(np.percentile(values, [25, 75]))
        else:
            continue

        c, ls, lw = line_styles.get(key, (color, "-", 1))
        for v in vals_to_draw:
            if orientation == "vertical":
                ax.axvline(v, color=c, linestyle=ls, linewidth=lw, alpha=0.7)
            else:
                ax.axhline(v, color=c, linestyle=ls, linewidth=lw, alpha=0.7)