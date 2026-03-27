# app/services/plotting/multivariate/clusterscatter.py
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import to_rgba
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from scipy.spatial import ConvexHull

from app.services.plotting.base import BasePlotter
from app.models import ClusterScatterStats


class ClusterScatterPlotter(BasePlotter):
    """K-Means cluster scatter plotter.
    Supports 2D and 3D, PCA projection, convex hull boundaries,
    density contours, centroid annotation, and full evaluation metrics.
    Parameter names match ClusterScatterRequest / frontend exactly.
    """

    def plot(
        self,
        # ── Required ───────────────────────────────────────────────
        feature_columns: list,
        # ── Preprocessing ──────────────────────────────────────────
        standardization_method: str = "standard",
        dimensionality_reduction_method: str = "none",
        missing_value_handling: str = "drop",
        sampling_strategy: str = "none",
        sample_size: int = 3000,
        # ── K-Means ────────────────────────────────────────────────
        n_clusters: int = 3,
        init_method: str = "k-means++",
        n_init: int = 10,
        max_iterations: int = 300,
        tolerance: float = 1e-4,
        random_state: int = 42,
        # ── Visualization ──────────────────────────────────────────
        show_centroids: bool = True,
        centroid_marker_size: int = 200,
        centroid_coordinate_annotation: bool = False,
        cluster_color_mode: str = "distinct_colors",
        point_alpha: float = 0.65,
        point_size: float = 25,
        density_contour_overlays: bool = False,
        show_cluster_boundary: bool = True,
        axis_scale: str = "linear",
        enable_3d_visualization: bool = False,
        figure_scale: str = "medium",
        dark_theme: bool = False,
        # ── Evaluation display ──────────────────────────────────────
        display_inertia_value: bool = True,
        display_silhouette_score: bool = True,
        display_cluster_sizes: bool = True,
        highlight_outliers: bool = False,
        # ── Stat computation ────────────────────────────────────────
        compute_quality: bool = True,
        compute_sizes: bool = False,
        compute_separation: bool = False,
        compute_features: bool = False,
        compute_outliers: bool = False,
    ) -> tuple:
        """Returns (image_path, ClusterScatterStats)"""

        SCALE_MAP = {
            "small":  (8, 5),
            "medium": (12, 8),
            "large":  (16, 10),
            "xlarge": (20, 13),
        }
        fig_w, fig_h = SCALE_MAP.get(figure_scale, SCALE_MAP["medium"])

        # ── Import sklearn ─────────────────────────────────────────
        try:
            from sklearn.cluster import KMeans
            from sklearn.preprocessing import StandardScaler, MinMaxScaler
            from sklearn.decomposition import PCA
            from sklearn.metrics import silhouette_score
        except ImportError:
            raise ValueError(
                "scikit-learn is required. Install with: pip install scikit-learn"
            )

        # ── Build working dataframe ────────────────────────────────
        df = self.df[feature_columns].copy()

        # Force numeric
        for c in feature_columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

        # Detect non-numeric (categorical) columns: >80% NaN after coercion
        n_rows = len(df)
        non_numeric = [
            c for c in feature_columns
            if n_rows > 0 and df[c].isna().sum() / n_rows > 0.8
        ]
        if non_numeric:
            names = ", ".join(f"'{x}'" for x in non_numeric)
            raise ValueError(
                f"The following columns appear to be categorical or non-numeric "
                f"and cannot be used for clustering: {names}. "
                f"Deselect these and choose only numeric columns."
            )

        # Missing value handling
        if missing_value_handling == "drop":
            df = df.dropna()
        elif missing_value_handling == "mean_impute":
            for c in feature_columns:
                df[c] = df[c].fillna(df[c].mean())
        elif missing_value_handling == "median_impute":
            for c in feature_columns:
                df[c] = df[c].fillna(df[c].median())

        df = df.reset_index(drop=True)

        if len(df) < n_clusters:
            raise ValueError(
                f"Not enough rows ({len(df)}) after preprocessing for {n_clusters} clusters."
            )

        # Sampling
        if sampling_strategy == "random" and len(df) > sample_size:
            df = df.sample(n=sample_size, random_state=random_state).reset_index(drop=True)

        X_raw = df[feature_columns].values.astype(float)

        # ── Standardization ────────────────────────────────────────
        if standardization_method == "standard":
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X_raw)
        elif standardization_method == "minmax":
            scaler = MinMaxScaler()
            X_scaled = scaler.fit_transform(X_raw)
        else:
            X_scaled = X_raw.copy()

        # ── Dimensionality reduction ───────────────────────────────
        pca_model = None
        pca_explained = None
        if dimensionality_reduction_method == "pca" and X_scaled.shape[1] > 2:
            n_components = 3 if enable_3d_visualization else 2
            pca_model    = PCA(n_components=n_components, random_state=random_state)
            X_plot       = pca_model.fit_transform(X_scaled)
            pca_explained = pca_model.explained_variance_ratio_
        elif X_scaled.shape[1] == 2 or (enable_3d_visualization and X_scaled.shape[1] == 3):
            X_plot = X_scaled
        else:
            # More than 2 columns, no PCA — use first 2 (or 3 for 3D)
            X_plot = X_scaled[:, :3] if enable_3d_visualization else X_scaled[:, :2]

        # ── K-Means ────────────────────────────────────────────────
        kmeans = KMeans(
            n_clusters=n_clusters,
            init=init_method,
            n_init=n_init,
            max_iter=max_iterations,
            tol=tolerance,
            random_state=random_state,
        )
        labels    = kmeans.fit_predict(X_scaled)
        centroids = kmeans.cluster_centers_

        # Project centroids to plot space
        if pca_model is not None:
            centroids_plot = pca_model.transform(centroids)
        elif X_scaled.shape[1] > (3 if enable_3d_visualization else 2):
            centroids_plot = centroids[:, :3] if enable_3d_visualization else centroids[:, :2]
        else:
            centroids_plot = centroids

        # ── Outlier mask (points > 3σ from their centroid) ─────────
        outlier_mask = np.zeros(len(X_scaled), dtype=bool)
        if highlight_outliers or compute_outliers:
            cluster_stds = []
            for k in range(n_clusters):
                mask_k = labels == k
                if mask_k.sum() > 1:
                    dists = np.linalg.norm(X_scaled[mask_k] - centroids[k], axis=1)
                    cluster_stds.append(dists.std())
                else:
                    cluster_stds.append(1.0)
            for i, (x_i, lbl) in enumerate(zip(X_scaled, labels)):
                dist = np.linalg.norm(x_i - centroids[lbl])
                if dist > 3 * cluster_stds[lbl]:
                    outlier_mask[i] = True

        # ── Colours ────────────────────────────────────────────────
        TAB10 = plt.cm.tab10.colors
        if cluster_color_mode == "monochrome":
            greys   = plt.cm.Greys(np.linspace(0.3, 0.85, n_clusters))
            palette = [greys[i] for i in range(n_clusters)]
        else:
            palette = [TAB10[i % 10] for i in range(n_clusters)]

        # ── Figure ─────────────────────────────────────────────────
        fig = plt.figure(figsize=(fig_w, fig_h), facecolor="#0a1628")

        if enable_3d_visualization:
            ax = fig.add_subplot(111, projection="3d")
            ax.set_facecolor("#0a1628")
        else:
            ax = fig.add_subplot(111)
            ax.set_facecolor("#0a1628")
        # Set plot style and aesthetic colors
        if dark_theme:
            plt.style.use("dark_background")
            bg_color = "#0a1628"
            fg_color = "#c8ddf0"
            grid_color = "#1e3a5f"
        else:
            plt.style.use("default")
            bg_color = "white"
            fg_color = "#333333"
            grid_color = "#e0e0e0"

        fig.patch.set_facecolor(bg_color)
        fg = fg_color
        gc = grid_color

        # ── Draw points ────────────────────────────────────────────
        for k_i in range(n_clusters):
            mask_k    = (labels == k_i) & ~outlier_mask
            color     = palette[k_i]
            pts       = X_plot[mask_k]

            if enable_3d_visualization and pts.shape[1] >= 3:
                ax.scatter(pts[:, 0], pts[:, 1], pts[:, 2],
                           c=[color], alpha=point_alpha, s=point_size,
                           label=f"Cluster {k_i}", zorder=2, edgecolors="none")
            else:
                ax.scatter(pts[:, 0], pts[:, 1],
                           c=[color], alpha=point_alpha, s=point_size,
                           label=f"Cluster {k_i}", zorder=2, edgecolors="none")

            # ── 2D only features ───────────────────────────────────
            if not enable_3d_visualization:

                # Convex hull boundary
                if show_cluster_boundary and len(pts) >= 3:
                    try:
                        hull    = ConvexHull(pts)
                        hull_pts = pts[hull.vertices]
                        hull_pts = np.vstack([hull_pts, hull_pts[0]])
                        ax.fill(hull_pts[:, 0], hull_pts[:, 1],
                                color=color, alpha=0.07, zorder=1)
                        ax.plot(hull_pts[:, 0], hull_pts[:, 1],
                                color=color, alpha=0.4, linewidth=1.2,
                                linestyle="--", zorder=1)
                    except Exception:
                        pass

                # Density contour
                if density_contour_overlays and len(pts) >= 10:
                    try:
                        from scipy.stats import gaussian_kde
                        kde     = gaussian_kde(pts.T)
                        xi      = np.linspace(pts[:, 0].min(), pts[:, 0].max(), 60)
                        yi      = np.linspace(pts[:, 1].min(), pts[:, 1].max(), 60)
                        xi, yi  = np.meshgrid(xi, yi)
                        zi      = kde(np.vstack([xi.ravel(), yi.ravel()])).reshape(xi.shape)
                        ax.contour(xi, yi, zi, levels=4,
                                   colors=[color], alpha=0.35, linewidths=0.8, zorder=2)
                    except Exception:
                        pass

        # ── Outlier points ─────────────────────────────────────────
        if highlight_outliers and outlier_mask.any():
            out_pts = X_plot[outlier_mask]
            kw = dict(c="#ffaa00", s=point_size * 1.8, zorder=5,
                      marker="o", edgecolors="#ff6b6b", linewidths=1.2,
                      alpha=0.85, label="Outliers")
            if enable_3d_visualization and out_pts.shape[1] >= 3:
                ax.scatter(out_pts[:, 0], out_pts[:, 1], out_pts[:, 2], **kw)
            else:
                ax.scatter(out_pts[:, 0], out_pts[:, 1], **kw)

        # ── Centroids ──────────────────────────────────────────────
        if show_centroids:
            for k_i in range(n_clusters):
                cp    = centroids_plot[k_i]
                color = palette[k_i]
                star_kw = dict(c=["white"], s=centroid_marker_size, zorder=6,
                               marker="*", edgecolors=color, linewidths=1.5)
                if enable_3d_visualization and len(cp) >= 3:
                    ax.scatter([cp[0]], [cp[1]], [cp[2]], **star_kw)
                else:
                    ax.scatter([cp[0]], [cp[1]], **star_kw)

                if centroid_coordinate_annotation:
                    if enable_3d_visualization and len(cp) >= 3:
                        coord_str = f"({cp[0]:.2f}, {cp[1]:.2f}, {cp[2]:.2f})"
                        ax.text(
                            cp[0], cp[1], cp[2], coord_str,
                            fontsize=6,
                            color=color,
                            alpha=0.85,
                            ha="left",
                            va="bottom"
                        )
                    else:
                        coord_str = f"({cp[0]:.2f}, {cp[1]:.2f})"
                        ax.annotate(
                            coord_str,
                            (cp[0], cp[1]),
                            textcoords="offset points",
                            xytext=(6, 4),
                            fontsize=6,
                            color=color,
                            alpha=0.85,
                            ha="left",
                            va="bottom"
                        )

        # ── Axis labels ────────────────────────────────────────────
        if pca_model is not None and pca_explained is not None:
            ax.set_xlabel(f"PC1 ({pca_explained[0]*100:.1f}%)", color=fg, fontsize=10)
            ax.set_ylabel(f"PC2 ({pca_explained[1]*100:.1f}%)", color=fg, fontsize=10)
            if enable_3d_visualization and len(pca_explained) >= 3:
                ax.set_zlabel(f"PC3 ({pca_explained[2]*100:.1f}%)", color=fg, fontsize=10)
        elif len(feature_columns) >= 2:
            ax.set_xlabel(feature_columns[0], color=fg, fontsize=10)
            ax.set_ylabel(feature_columns[1], color=fg, fontsize=10)
            if enable_3d_visualization and len(feature_columns) >= 3:
                ax.set_zlabel(feature_columns[2], color=fg, fontsize=10)

        if axis_scale == "log":
            try: ax.set_xscale("log")
            except Exception: pass
            try: ax.set_yscale("log")
            except Exception: pass

        ax.tick_params(colors=fg, labelsize=8)
        for spine in ax.spines.values():
            spine.set_edgecolor(gc)
        ax.yaxis.grid(True, color=gc, linewidth=0.4, alpha=0.5)
        ax.xaxis.grid(False)

        # ── Title ──────────────────────────────────────────────────
        ax.set_title(
            f"K-Means Clustering  (k={n_clusters}, "
            f"{'3D' if enable_3d_visualization else '2D'}, "
            f"std={standardization_method})",
            color=fg, fontsize=13, fontweight="bold", pad=14
        )

        # ── Annotation box (inertia, silhouette, cluster sizes) ────
        try:
            sil_score = silhouette_score(X_scaled, labels) if len(set(labels)) > 1 else None
        except Exception:
            sil_score = None

        annotation_lines = []
        if display_inertia_value:
            annotation_lines.append(f"Inertia: {kmeans.inertia_:.2f}")
        if display_silhouette_score and sil_score is not None:
            annotation_lines.append(f"Silhouette: {sil_score:.3f}")
        if display_cluster_sizes:
            sizes = {str(k_i): int(np.sum(labels == k_i)) for k_i in range(n_clusters)}
            size_str = "  ".join(f"C{k_i}:{v}" for k_i, v in sizes.items())
            annotation_lines.append(f"Sizes: {size_str}")

        if annotation_lines:
            textstr = "\n".join(annotation_lines)
            props = dict(
                boxstyle="round,pad=0.5",
                facecolor="#0f2035",
                edgecolor="#1e3a5f",
                alpha=0.85
            )
            if enable_3d_visualization:
                fig.text(
                    0.02, 0.98, textstr,
                    fontsize=8, verticalalignment="top",
                    color="#c8ddf0", bbox=props, fontfamily="monospace"
                )
            else:
                ax.text(
                    0.02, 0.98, textstr, transform=ax.transAxes,
                    fontsize=8, verticalalignment="top",
                    color="#c8ddf0", bbox=props, fontfamily="monospace"
                )

        # ── Legend ─────────────────────────────────────────────────
        ax.legend(framealpha=0.15, facecolor="#0a1628",
                  edgecolor=gc, labelcolor=fg, fontsize=8,
                  loc="lower right")

        plt.tight_layout()
        image_path = self.save_plot("clusterscatter")

        # ══════════════════════════════════════════════════════════
        # COMPUTE STATS
        # ══════════════════════════════════════════════════════════
        stats = ClusterScatterStats()

        # ── ⭐ Quality ─────────────────────────────────────────────
        if compute_quality:
            stats.inertia = float(kmeans.inertia_)

            if sil_score is not None:
                stats.silhouette_score = float(sil_score)
                stats.separation_strength = (
                    "Strong"   if sil_score >= 0.6 else
                    "Moderate" if sil_score >= 0.4 else
                    "Weak"
                )

            # Between-cluster variance: variance of centroid positions
            if len(centroids) >= 2:
                stats.between_cluster_var = float(np.var(centroids, axis=0).mean())

            # Within-cluster variance: mean intra-cluster variance
            within_vars = []
            for k_i in range(n_clusters):
                mask_k = labels == k_i
                if mask_k.sum() > 1:
                    within_vars.append(np.var(X_scaled[mask_k], axis=0).mean())
            if within_vars:
                stats.within_cluster_var = float(np.mean(within_vars))

        # ── 📦 Sizes ──────────────────────────────────────────────
        if compute_sizes:
            sizes = {str(k_i): int(np.sum(labels == k_i)) for k_i in range(n_clusters)}
            stats.cluster_sizes = sizes
            size_vals = list(sizes.values())
            stats.largest_cluster  = max(size_vals)
            stats.smallest_cluster = min(size_vals)
            stats.cluster_balance_ratio = (
                float(min(size_vals) / max(size_vals)) if max(size_vals) > 0 else 0.0
            )

        # ── ↔️ Separation ─────────────────────────────────────────
        if compute_separation:
            dists = {}
            for i in range(n_clusters):
                for j in range(i + 1, n_clusters):
                    d = float(np.linalg.norm(centroids[i] - centroids[j]))
                    dists[f"C{i}↔C{j}"] = d
            if dists:
                stats.centroid_distances    = dists
                stats.max_centroid_distance = max(dists.values())
                stats.min_centroid_distance = min(dists.values())

            # Overlap detection: check if any two cluster point clouds overlap
            # via bounding box intersection in plot space
            overlap_pairs = []
            for i in range(n_clusters):
                for j in range(i + 1, n_clusters):
                    pts_i = X_plot[labels == i]
                    pts_j = X_plot[labels == j]
                    if len(pts_i) == 0 or len(pts_j) == 0:
                        continue
                    # Check overlap in x and y
                    x_overlap = (pts_i[:, 0].min() < pts_j[:, 0].max() and
                                 pts_j[:, 0].min() < pts_i[:, 0].max())
                    y_overlap = (pts_i[:, 1].min() < pts_j[:, 1].max() and
                                 pts_j[:, 1].min() < pts_i[:, 1].max())
                    if x_overlap and y_overlap:
                        overlap_pairs.append(f"C{i}↔C{j}")
            stats.overlap_detected = len(overlap_pairs) > 0
            stats.overlap_pairs    = overlap_pairs

        # ── 🔍 Feature dominance ──────────────────────────────────
        if compute_features:
            feature_vars = {}
            for idx, feat in enumerate(feature_columns):
                if idx < X_scaled.shape[1]:
                    # Between-cluster variance for this feature specifically
                    grand_mean = X_scaled[:, idx].mean()
                    bv = sum(
                        np.sum(labels == k_i) * (X_scaled[labels == k_i, idx].mean() - grand_mean) ** 2
                        for k_i in range(n_clusters)
                        if np.sum(labels == k_i) > 0
                    ) / len(X_scaled)
                    feature_vars[feat] = float(bv)
            stats.feature_variance = feature_vars
            if feature_vars:
                stats.dominant_feature = max(feature_vars, key=feature_vars.get)

        # ── ⚠️ Outliers ───────────────────────────────────────────
        if compute_outliers:
            n_out = int(outlier_mask.sum())
            stats.outlier_count = n_out
            stats.outlier_pct   = float(n_out / len(X_scaled) * 100) if len(X_scaled) > 0 else 0.0

        return image_path, stats