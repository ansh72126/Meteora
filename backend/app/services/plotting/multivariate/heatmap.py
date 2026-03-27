# app/services/plotting/multivariate/heatmap.py
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.services.plotting.base import BasePlotter
from app.models import HeatmapStats


SCALE_MAP = {
    "small":  (6,  5),
    "medium": (9,  8),
    "large":  (12, 11),
    "xlarge": (16, 14),
}

CMAP_DIVERGING  = "RdBu_r"
CMAP_SEQUENTIAL = "Blues"


class HeatmapPlotter(BasePlotter):
    """Correlation heatmap plotter.
    Supports Pearson / Spearman / Kendall, hierarchical clustering reorder,
    triangle masking, significance masking, and full stat inference.
    Parameter names match HeatmapRequest / frontend exactly.
    """

    def plot(
        self,
        feature_columns: list,
        max_variable_cap: int = 20,
        missing_value_handling: str = "drop",
        sampling_strategy: str = "none",
        sample_size: int = 5000,
        correlation_method: str = "pearson",
        absolute_correlation_mode: bool = False,
        significance_test_enabled: bool = False,
        significance_threshold: float = 0.05,
        diagonal_display_mode: str = "constant_one",
        matrix_triangle_mode: str = "full",
        variable_sorting_method: str = "input_order",
        hierarchical_clustering_enabled: bool = False,
        clustering_distance_metric: str = "euclidean",
        clustering_linkage_method: str = "average",
        dendrogram_display: bool = False,
        color_scale_mode: str = "diverging",
        color_range_limits: list = None,
        cell_annotation_enabled: bool = True,
        annotation_precision: int = 2,
        cell_gridlines_enabled: bool = True,
        axis_label_rotation: int = 45,
        figure_scale: str = "medium",
        dark_theme: bool = False,
        compute_dependency: bool = True,
        compute_multicollinearity: bool = False,
        compute_clustering: bool = False,
        compute_significance: bool = False,
        compute_structure: bool = False,
    ) -> tuple:

        if color_range_limits is None:
            color_range_limits = [-1.0, 1.0]

        # ── Build working dataframe ────────────────────────────────
        cols = feature_columns[:max_variable_cap]
        df   = self.df[cols].copy()

        for c in cols:
            df[c] = pd.to_numeric(df[c], errors="coerce")

        # Detect non-numeric (categorical) columns: >80% NaN after coercion
        n_rows = len(df)
        non_numeric = [
            c for c in cols
            if n_rows > 0 and df[c].isna().sum() / n_rows > 0.8
        ]
        if non_numeric:
            names = ", ".join(f"'{x}'" for x in non_numeric)
            raise ValueError(
                f"The following columns appear to be categorical or non-numeric "
                f"and cannot be used for correlation: {names}. "
                f"Deselect these and choose only numeric columns."
            )

        if missing_value_handling == "drop":
            df = df.dropna()
        elif missing_value_handling == "mean_impute":
            for c in cols:
                df[c] = df[c].fillna(df[c].mean())
        # pairwise_drop: handled implicitly by pandas corr()

        df = df.reset_index(drop=True)

        if len(df) < 3:
            raise ValueError("Not enough rows after preprocessing to compute correlations.")

        if sampling_strategy == "random" and len(df) > sample_size:
            df = df.sample(n=sample_size, random_state=42).reset_index(drop=True)

        # ── Correlation matrix ─────────────────────────────────────
        corr_mat = df[cols].corr(method=correlation_method)

        # ── P-value matrix ─────────────────────────────────────────
        pval_mat = None
        if significance_test_enabled or compute_significance:
            pval_df = pd.DataFrame(np.ones((len(cols), len(cols))), index=cols, columns=cols)
            for i, c1 in enumerate(cols):
                for j, c2 in enumerate(cols):
                    if i == j:
                        pval_df.loc[c1, c2] = 0.0
                        continue
                    valid = df[[c1, c2]].dropna()
                    if len(valid) < 4:
                        continue
                    if correlation_method == "pearson":
                        _, p = scipy_stats.pearsonr(valid[c1], valid[c2])
                    elif correlation_method == "spearman":
                        _, p = scipy_stats.spearmanr(valid[c1], valid[c2])
                    else:
                        _, p = scipy_stats.kendalltau(valid[c1], valid[c2])
                    pval_df.loc[c1, c2] = p
            pval_mat = pval_df

        # ── Absolute mode ──────────────────────────────────────────
        plot_corr = corr_mat.abs() if absolute_correlation_mode else corr_mat.copy()

        # ── Variable sorting ───────────────────────────────────────
        if variable_sorting_method == "alphabetical":
            order = sorted(cols)
            plot_corr = plot_corr.loc[order, order]
            if pval_mat is not None:
                pval_mat = pval_mat.loc[order, order]
        elif variable_sorting_method == "correlation_strength":
            mean_abs = corr_mat.abs().mean(axis=1)
            order    = mean_abs.sort_values(ascending=False).index.tolist()
            plot_corr = plot_corr.loc[order, order]
            if pval_mat is not None:
                pval_mat = pval_mat.loc[order, order]

        # ── Hierarchical clustering reorder ────────────────────────
        _Z_linkage = None
        if hierarchical_clustering_enabled:
            try:
                from scipy.cluster.hierarchy import linkage, leaves_list
                from scipy.spatial.distance import pdist, squareform

                corr_vals = plot_corr.values.copy().astype(float)
                np.fill_diagonal(corr_vals, 1.0)

                if clustering_distance_metric == "correlation":
                    dist_mat = 1 - np.abs(corr_vals)
                    np.clip(dist_mat, 0, 2, out=dist_mat)
                    np.fill_diagonal(dist_mat, 0)
                    condensed = squareform(dist_mat)
                elif clustering_distance_metric == "cosine":
                    condensed = pdist(corr_vals, metric="cosine")
                else:
                    condensed = pdist(corr_vals, metric="euclidean")

                Z      = linkage(condensed, method=clustering_linkage_method)
                order  = leaves_list(Z)
                reordered_cols = [plot_corr.columns[i] for i in order]
                plot_corr = plot_corr.loc[reordered_cols, reordered_cols]
                if pval_mat is not None:
                    pval_mat = pval_mat.loc[reordered_cols, reordered_cols]
                _Z_linkage = Z
            except Exception:
                pass

        # ── Final columns ──────────────────────────────────────────
        final_cols = list(plot_corr.columns)
        n          = len(final_cols)

        # ── Significance mask ──────────────────────────────────────
        sig_mask = None
        if significance_test_enabled and pval_mat is not None:
            sig_mask = pval_mat.loc[final_cols, final_cols] >= significance_threshold

        # ── Triangle mask ──────────────────────────────────────────
        tri_mask = np.zeros((n, n), dtype=bool)
        if matrix_triangle_mode == "upper":
            tri_mask = np.tril(np.ones((n, n), dtype=bool), k=-1)
        elif matrix_triangle_mode == "lower":
            tri_mask = np.triu(np.ones((n, n), dtype=bool), k=1)

        # ── Diagonal display ───────────────────────────────────────
        plot_vals = plot_corr.loc[final_cols, final_cols].values.copy().astype(float)
        if diagonal_display_mode == "constant_one":
            np.fill_diagonal(plot_vals, 1.0)
        elif diagonal_display_mode == "hide":
            np.fill_diagonal(plot_vals, np.nan)

        # ── Theme ──────────────────────────────────────────────────
        if dark_theme:
            plt.style.use("dark_background")
            bg, fg, gc = "#0a1628", "#c8ddf0", "#1e3a5f"
        else:
            plt.style.use("default")
            bg, fg, gc = "white", "#333333", "#e0e0e0"

        # ── Figure layout ──────────────────────────────────────────
        fig_w, fig_h = SCALE_MAP.get(figure_scale, (9, 8))
        show_dendro  = dendrogram_display and hierarchical_clustering_enabled and _Z_linkage is not None

        if show_dendro:
            # Layout (2 rows × 2 cols):
            #   [0,0] blank corner      [0,1] heatmap
            #   [1,0] blank corner      [1,1] column dendrogram (bottom)
            # Row dendrogram sits left of heatmap in col-0, row-0
            fig = plt.figure(figsize=(fig_w + 2, fig_h + 2))
            fig.patch.set_facecolor(bg)
            gs = fig.add_gridspec(
                2, 2,
                width_ratios=[0.15, 1],
                height_ratios=[1, 0.15],
                hspace=0.0,
                wspace=0.0,
            )
            ax             = fig.add_subplot(gs[0, 1])   # heatmap
            ax_dendro_left = fig.add_subplot(gs[0, 0])   # row dendrogram (left)
            ax_dendro_bot  = fig.add_subplot(gs[1, 1])   # col dendrogram (bottom)
            ax_corner      = fig.add_subplot(gs[1, 0])   # blank corner

            for a in [ax_dendro_left, ax_dendro_bot, ax_corner]:
                a.set_facecolor(bg)
                for sp in a.spines.values():
                    sp.set_visible(False)
                a.set_xticks([])
                a.set_yticks([])
        else:
            fig, ax        = plt.subplots(figsize=(fig_w, fig_h))
            ax_dendro_left = None
            ax_dendro_bot  = None

        fig.patch.set_facecolor(bg)
        ax.set_facecolor(bg)

        # ── Color map ──────────────────────────────────────────────
        cmap = plt.cm.get_cmap(CMAP_DIVERGING if color_scale_mode == "diverging" else CMAP_SEQUENTIAL)
        vmin = color_range_limits[0]
        vmax = color_range_limits[1]

        display = np.ma.array(plot_vals, mask=tri_mask)
        if sig_mask is not None:
            display = np.ma.array(display, mask=display.mask | sig_mask.values)

        im = ax.imshow(display, cmap=cmap, vmin=vmin, vmax=vmax, aspect="auto")

        # ── Draw dendrograms ───────────────────────────────────────
        if show_dendro:
            from scipy.cluster.hierarchy import dendrogram as sp_dendrogram

            # Left dendrogram (rows) ── leaves touch right edge → align with y-axis
            sp_dendrogram(
                _Z_linkage,
                orientation="left",
                ax=ax_dendro_left,
                no_labels=True,
                color_threshold=0,
                link_color_func=lambda k: "#00d4ff",
            )
            ax_dendro_left.set_ylim(0, n * 10)   # icoord units: 5, 15, ..., 10n-5
            ax_dendro_left.set_facecolor(bg)
            for sp in ax_dendro_left.spines.values():
                sp.set_visible(False)
            ax_dendro_left.set_xticks([])
            ax_dendro_left.set_yticks([])

            # Bottom dendrogram (cols) ── orientation="bottom" places leaves at top
            # invert_yaxis so leaves touch the heatmap above, roots point downward
            sp_dendrogram(
                _Z_linkage,
                orientation="bottom",
                ax=ax_dendro_bot,
                no_labels=True,
                color_threshold=0,
                link_color_func=lambda k: "#00d4ff",
            )
            ax_dendro_bot.set_xlim(0, n * 10)    # icoord units: 5, 15, ..., 10n-5
            ax_dendro_bot.invert_yaxis()          # leaves at top, roots at bottom
            ax_dendro_bot.set_facecolor(bg)
            for sp in ax_dendro_bot.spines.values():
                sp.set_visible(False)
            ax_dendro_bot.set_xticks([])
            ax_dendro_bot.set_yticks([])

        # ── Colorbar ───────────────────────────────────────────────
        cbar = fig.colorbar(im, ax=ax, shrink=0.8, pad=0.02)
        cbar.ax.tick_params(colors=fg, labelsize=8)
        cbar.outline.set_edgecolor(gc)

        # ── Gridlines ──────────────────────────────────────────────
        if cell_gridlines_enabled:
            ax.set_xticks(np.arange(-0.5, n, 1), minor=True)
            ax.set_yticks(np.arange(-0.5, n, 1), minor=True)
            ax.grid(which="minor", color=gc, linewidth=0.5)
            ax.tick_params(which="minor", bottom=False, left=False)

        # ── Axis labels ────────────────────────────────────────────
        ax.set_xticks(range(n))
        ax.set_yticks(range(n))
        ax.set_xticklabels(
            final_cols,
            rotation=axis_label_rotation,
            ha="right" if axis_label_rotation > 0 else "center",
            fontsize=max(6, 10 - n // 4),
            color=fg,
        )
        ax.set_yticklabels(final_cols, fontsize=max(6, 10 - n // 4), color=fg)
        ax.tick_params(colors=fg)
        for spine in ax.spines.values():
            spine.set_edgecolor(gc)

        # ── Cell annotations ───────────────────────────────────────
        if cell_annotation_enabled:
            fmt = f".{annotation_precision}f"
            for i in range(n):
                for j in range(n):
                    if tri_mask[i, j]:
                        continue
                    if sig_mask is not None and sig_mask.iloc[i, j]:
                        ax.text(j, i, "×", ha="center", va="center",
                                fontsize=max(5, 9 - n // 5), color="#5a7a9e")
                        continue
                    val = plot_vals[i, j]
                    if np.isnan(val):
                        continue
                    txt_color = "white" if abs(val) >= 0.5 else (fg if not dark_theme else "#c8ddf0")
                    ax.text(j, i, format(val, fmt),
                            ha="center", va="center",
                            fontsize=max(5, 9 - n // 5),
                            color=txt_color, fontweight="600")

        # ── Title ──────────────────────────────────────────────────
        mode_str = "Absolute " if absolute_correlation_mode else ""
        fig.suptitle(
            f"{mode_str}{correlation_method.capitalize()} Correlation Heatmap  ({n} × {n})",
            color=fg, fontsize=13, fontweight="bold", y=1.01,
        )

        plt.tight_layout()
        image_path = self.save_plot("heatmap")

        # ══════════════════════════════════════════════════════════
        # COMPUTE STATS
        # ══════════════════════════════════════════════════════════
        stats    = HeatmapStats()
        abs_corr = corr_mat.abs()

        pairs = []
        for i, c1 in enumerate(final_cols):
            for j, c2 in enumerate(final_cols):
                if j > i:
                    pairs.append({"var1": c1, "var2": c2, "r": float(corr_mat.loc[c1, c2])})

        # 🔗 Dependency
        if compute_dependency and pairs:
            sorted_abs = sorted(pairs, key=lambda p: abs(p["r"]), reverse=True)
            positives  = [p for p in pairs if p["r"] > 0]
            negatives  = [p for p in pairs if p["r"] < 0]
            stats.mean_abs_corr   = float(np.mean([abs(p["r"]) for p in pairs]))
            stats.median_abs_corr = float(np.median([abs(p["r"]) for p in pairs]))
            if positives:
                stats.strongest_positive = max(positives, key=lambda p: p["r"])
            if negatives:
                stats.strongest_negative = min(negatives, key=lambda p: p["r"])
            stats.high_corr_pairs = [p for p in sorted_abs if abs(p["r"]) >= 0.6]

        # ⚠️ Multicollinearity
        if compute_multicollinearity and pairs:
            from collections import Counter
            multi = [p for p in pairs if abs(p["r"]) >= 0.8]
            stats.multicollinear_pairs = multi
            counts = Counter()
            for p in multi:
                counts[p["var1"]] += 1
                counts[p["var2"]] += 1
            stats.redundant_features = [f for f, c in counts.items() if c >= 2]

        # 🧩 Clustering
        if compute_clustering and len(final_cols) >= 3:
            try:
                from scipy.cluster.hierarchy import linkage, fcluster
                from scipy.spatial.distance import squareform

                cv = corr_mat.loc[final_cols, final_cols].values.copy().astype(float)
                np.fill_diagonal(cv, 1.0)
                dm = 1 - np.abs(cv)
                np.clip(dm, 0, 2, out=dm)
                np.fill_diagonal(dm, 0)
                Z      = linkage(squareform(dm), method="average")
                labels = fcluster(Z, t=0.5, criterion="distance")
                n_cls  = int(labels.max())
                stats.n_clusters_detected = n_cls
                stats.feature_clusters = [
                    [final_cols[i] for i, lbl in enumerate(labels) if lbl == g]
                    for g in range(1, n_cls + 1)
                    if any(lbl == g for lbl in labels)
                ]
            except Exception:
                pass

        # 📉 Significance
        if compute_significance and pval_mat is not None:
            insig = [
                {"var1": p["var1"], "var2": p["var2"], "p": float(pval_mat.loc[p["var1"], p["var2"]])}
                for p in pairs
                if float(pval_mat.loc[p["var1"], p["var2"]]) >= significance_threshold
            ]
            stats.insignificant_pairs  = sorted(insig, key=lambda x: x["p"])
            stats.significant_pair_pct = float((len(pairs) - len(insig)) / len(pairs) * 100) if pairs else 0.0

        # 📐 Structure
        if compute_structure:
            apf = abs_corr.loc[final_cols, final_cols].values.copy().astype(float)
            np.fill_diagonal(apf, np.nan)
            apf   = pd.DataFrame(apf, index=final_cols, columns=final_cols)
            means = apf.mean(axis=1, skipna=True)
            stats.avg_corr_per_feature = {c: float(v) for c, v in means.items()}
            stats.most_connected       = str(means.idxmax())
            stats.most_isolated        = str(means.idxmin())
            try:
                stats.corr_matrix_det = float(np.linalg.det(
                    corr_mat.loc[final_cols, final_cols].fillna(0).values
                ))
            except Exception:
                pass

        return image_path, stats