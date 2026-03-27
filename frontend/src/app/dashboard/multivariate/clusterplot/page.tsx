"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, Box, Search, Sigma, Star, X } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./ClusterPlotPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type StandardMethod = "none" | "standard" | "minmax";
type DimReduction = "none" | "pca";
type MissingHandling = "drop" | "mean_impute" | "median_impute";
type SamplingStrat = "none" | "random";
type InitMethod = "k-means++" | "random";
type ColorMode = "distinct_colors" | "monochrome";
type AxisScale = "linear" | "log";
type FigureScale = "small" | "medium" | "large" | "xlarge";
type ExportFormat = "png" | "svg" | "pdf";

// ─── Stat result ──────────────────────────────────────────────────────────────
interface ClusterStats {
    // Cluster quality
    silhouette_score?: number;
    inertia?: number;
    between_cluster_var?: number;
    within_cluster_var?: number;
    // Cluster sizes
    cluster_sizes?: Record<string, number>;
    cluster_balance_ratio?: number;
    largest_cluster?: number;
    smallest_cluster?: number;
    // Separation
    centroid_distances?: Record<string, number>;  // pair label → distance
    max_centroid_distance?: number;
    min_centroid_distance?: number;
    separation_strength?: string;
    // Outliers
    outlier_count?: number;
    outlier_pct?: number;
    // Feature dominance
    feature_variance?: Record<string, number>;
    dominant_feature?: string;
    // Overlap
    overlap_detected?: boolean;
    overlap_pairs?: string[];
}

// ─── Colour palette for cluster swatches (matches matplotlib tab10) ──────────
const TAB10 = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
];

const StatRow = ({ label, value, highlight = false }:
    { label: string; value: string; highlight?: boolean }) => (
    <div className={`stat-row ${highlight ? "highlight" : ""}`}>
        <span className="stat-key">{label}</span>
        <span className="stat-val">{value}</span>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
export default function ClusterScatterPage() {

    // ── Column state ─────────────────────────────────────────────────────────
    const [allHeaders, setAllHeaders] = useState<string[]>([]);
    const [selectedCols, setSelectedCols] = useState<string[]>([]);

    // ── Preprocessing ─────────────────────────────────────────────────────────
    const [stdMethod, setStdMethod] = useState<StandardMethod>("standard");
    const [dimReduction, setDimReduction] = useState<DimReduction>("none");
    const [missingHandling, setMissingHandling] = useState<MissingHandling>("drop");
    const [sampling, setSampling] = useState<SamplingStrat>("none");
    const [sampleSize, setSampleSize] = useState("3000");

    // ── K-Means parameters ────────────────────────────────────────────────────
    const [nClusters, setNClusters] = useState("3");
    const [initMethod, setInitMethod] = useState<InitMethod>("k-means++");
    const [nInit, setNInit] = useState("10");
    const [maxIter, setMaxIter] = useState("300");
    const [tolerance, setTolerance] = useState("0.0001");
    const [randomState, setRandomState] = useState("42");

    // ── Visualization ─────────────────────────────────────────────────────────
    const [showCentroids, setShowCentroids] = useState(true);
    const [centroidMarkerSize, setCentroidMarkerSize] = useState("200");
    const [centroidAnnotation, setCentroidAnnotation] = useState(false);
    const [colorMode, setColorMode] = useState<ColorMode>("distinct_colors");
    const [pointAlpha, setPointAlpha] = useState("0.65");
    const [pointSize, setPointSize] = useState("25");
    const [densityContour, setDensityContour] = useState(false);
    const [showClusterBoundary, setShowClusterBoundary] = useState(true);
    const [axisScale, setAxisScale] = useState<AxisScale>("linear");
    const [enable3D, setEnable3D] = useState(false);
    const [figScale, setFigScale] = useState<FigureScale>("medium");
    const [darkTheme, setDarkTheme] = useState(false);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("png");

    // ── Evaluation toggles ────────────────────────────────────────────────────
    const [displayInertia, setDisplayInertia] = useState(true);
    const [displaySilhouette, setDisplaySilhouette] = useState(true);
    const [displayClusterSizes, setDisplayClusterSizes] = useState(true);
    const [highlightOutliers, setHighlightOutliers] = useState(false);

    // ── Stat categories ───────────────────────────────────────────────────────
    const [compQuality, setCompQuality] = useState(true);
    const [compSizes, setCompSizes] = useState(false);
    const [compSeparation, setCompSeparation] = useState(false);
    const [compFeatures, setCompFeatures] = useState(false);
    const [compOutliers, setCompOutliers] = useState(false);

    // ── Plot state ────────────────────────────────────────────────────────────
    const [plotUrl, setPlotUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [statResults, setStatResults] = useState<ClusterStats | null>(null);
    const [statsPanelOpen, setStatsPanelOpen] = useState(false);

    // ── Load headers ──────────────────────────────────────────────────────────
    useEffect(() => {
        const stored = sessionStorage.getItem("csvHeaders");
        if (stored) {
            const parsed: string[] = JSON.parse(stored);
            const clean = parsed.map((h: string) => h.replace(/^["']|["']$/g, "").trim());
            setAllHeaders(clean);
        }
    }, []);

    // ── Column toggle — cap at 3 for 3D, no cap for 2D+ PCA ─────────────────
    const maxCols = enable3D ? 3 : 20;
    const toggleCol = (col: string) => {
        setSelectedCols(prev => {
            if (prev.includes(col)) return prev.filter(c => c !== col);
            if (prev.length >= maxCols) return prev;
            return [...prev, col];
        });
    };

    const clean = (s: string) => s.replace(/^["']|["']$/g, "").trim();

    // ── Derived: need PCA if > 2 features (and 2D mode) ─────────────────────
    const needsPCA = !enable3D && selectedCols.length > 2 && dimReduction === "none";

    /** Returns { valid, message } for client-side validation. Message includes suggestion when invalid. */
    const validateConfig = (): { valid: boolean; message?: string } => {
        if (allHeaders.length === 0) {
            return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the cluster plot." };
        }
        if (selectedCols.length < 2) {
            return { valid: false, message: "At least 2 numeric feature columns are required for clustering. Select two or more numeric columns from the list." };
        }
        if (enable3D && selectedCols.length !== 3) {
            return { valid: false, message: "3D mode requires exactly 3 feature columns. Select exactly 3 columns, or turn off 3D mode for 2D projection." };
        }
        if (sampling === "random") {
            const sz = parseInt(sampleSize, 10);
            if (isNaN(sz) || sz < 100) {
                return { valid: false, message: "Sample size must be at least 100 when using random sampling. Increase the sample size to 100 or more." };
            }
            if (sz > 100000) {
                return { valid: false, message: "Sample size cannot exceed 100,000. Lower the value to 100,000 or below." };
            }
        }
        const k = parseInt(nClusters, 10);
        if (isNaN(k) || k < 2 || k > 15) {
            return { valid: false, message: "Number of clusters must be between 2 and 15. Adjust the value accordingly." };
        }
        if (needsPCA) {
            return { valid: false, message: "More than 2 features in 2D mode requires PCA. Enable 'Dimensionality Reduction: PCA' to project all selected features, or select only 2 columns." };
        }
        return { valid: true };
    };

    /** Parse API error into a clear message with suggestion. */
    const parseApiError = (detail: unknown): string => {
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail) && detail.length > 0) {
            const first = detail[0];
            const loc = (first as { loc?: string[] })?.loc;
            const msg = (first as { msg?: string })?.msg ?? "Invalid request";
            const field = loc?.filter((s: string) => s !== "body")?.join(".") ?? "field";
            return `Invalid ${field}: ${msg}. Check the configuration and try again.`;
        }
        if (detail && typeof detail === "object" && "detail" in detail) {
            return parseApiError((detail as { detail: unknown }).detail);
        }
        return "An unexpected error occurred. Check your configuration and try again.";
    };

    // ── Generate ──────────────────────────────────────────────────────────────
    const generatePlot = async () => {
        const v = validateConfig();
        if (!v.valid) {
            alert(v.message);
            return;
        }
        setLoading(true);
        setStatResults(null);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/multivariate/clusterscatter`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    feature_columns: selectedCols.map(clean),
                    standardization_method: stdMethod,
                    dimensionality_reduction_method: dimReduction,
                    missing_value_handling: missingHandling,
                    sampling_strategy: sampling,
                    sample_size: parseInt(sampleSize),
                    n_clusters: parseInt(nClusters),
                    init_method: initMethod,
                    n_init: parseInt(nInit),
                    max_iterations: parseInt(maxIter),
                    tolerance: parseFloat(tolerance),
                    random_state: parseInt(randomState),
                    show_centroids: showCentroids,
                    centroid_marker_size: parseInt(centroidMarkerSize),
                    centroid_coordinate_annotation: centroidAnnotation,
                    cluster_color_mode: colorMode,
                    point_alpha: parseFloat(pointAlpha),
                    point_size: parseFloat(pointSize),
                    density_contour_overlays: densityContour,
                    show_cluster_boundary: showClusterBoundary,
                    axis_scale: axisScale,
                    enable_3d_visualization: enable3D,
                    figure_scale: figScale,
                    dark_theme: darkTheme,
                    display_inertia_value: displayInertia,
                    display_silhouette_score: displaySilhouette,
                    display_cluster_sizes: displayClusterSizes,
                    highlight_outliers: highlightOutliers,
                    compute_quality: compQuality,
                    compute_sizes: compSizes,
                    compute_separation: compSeparation,
                    compute_features: compFeatures,
                    compute_outliers: compOutliers,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = parseApiError(err.detail ?? "Failed to generate cluster plot");
                throw new Error(msg);
            }
            const data = await res.json();
            setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
            if (data.stats) setStatResults(data.stats);
        } catch (err: any) {
            let msg = err?.message ?? "An unexpected error occurred.";
            if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
                msg = msg.trim();
                if (!msg.endsWith(".")) msg += ".";
            } else if (msg.toLowerCase().includes("not enough rows")) {
                msg = "Not enough rows after preprocessing for the chosen number of clusters. Try 'Drop' or 'Mean impute' for missing values, reduce the number of clusters, or select columns with fewer missing values.";
            } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
                msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the cluster plot.";
            } else if (msg.toLowerCase().includes("scikit-learn")) {
                msg = msg.trim();
            }
            alert(msg);
        } finally {
            setLoading(false);
        }
    };

    // ── Download ──────────────────────────────────────────────────────────────
    const handleDownload = async () => {
        if (!plotUrl) return;
        try {
            const blob = await (await fetch(plotUrl)).blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ClusterScatter_k${nClusters}.png`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch { console.error("Download failed"); }
    };

    const fmtN = (v: number | null | undefined, d = 3) =>
        v != null ? v.toFixed(d) : "—";

    const silhouetteColor = (s: number | undefined) => {
        if (s == null) return "#5a7a9e";
        if (s >= 0.6) return "#00d4ff";
        if (s >= 0.4) return "#ffaa00";
        return "#ff6b6b";
    };

    const k = parseInt(nClusters) || 3;
    const swatches = TAB10.slice(0, Math.min(k, 10));

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="cs-container">

            {/* BACK */}
            <button className="back-button" onClick={() => window.history.back()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
            </button>

            {/* STATS TOGGLE */}
            {plotUrl && (
                <button
                    className={`stats-toggle-btn ${statsPanelOpen ? "active" : ""}`}
                    onClick={() => setStatsPanelOpen(!statsPanelOpen)}>
                    <span className="btn-icon" aria-hidden="true">
                        {statsPanelOpen ? <X /> : <Sigma />}
                    </span>
                    {statsPanelOpen ? "Close Stats" : "Stats"}
                </button>
            )}

            {/* ══════════════════════════════════════════════════════════
          CONFIG PANEL — sticky + scrollable
          ══════════════════════════════════════════════════════════ */}
            <div className="config-panel">
                <h2 className="panel-title">Cluster Scatter</h2>

                {/* DATA & PREPROCESSING */}
                <div className="section-label">Feature Columns</div>

                <div className="form-group">
                    <div className="col-select-header">
                        <label style={{ margin: 0 }}>
                            Numeric Features
                            <span className="label-badge">≥ 2 Required</span>
                        </label>
                        <div className="col-select-actions">
                            <button className="col-action-btn"
                                onClick={() => setSelectedCols(allHeaders.slice(0, maxCols))}>
                                All
                            </button>
                            <button className="col-action-btn" onClick={() => setSelectedCols([])}>
                                Clear
                            </button>
                        </div>
                    </div>

                    <span className="input-hint" style={{ marginBottom: 8 }}>
                        {selectedCols.length} selected
                        {enable3D ? " — exactly 3 needed for 3D" : " — PCA auto-applied if > 2"}
                    </span>

                    <div className="col-checklist">
                        {allHeaders.length === 0 ? (
                            <p className="col-empty">Upload a CSV to see available columns</p>
                        ) : (
                            allHeaders.map(col => {
                                const sel = selectedCols.includes(col);
                                const capped = !sel && selectedCols.length >= maxCols;
                                return (
                                    <label key={col}
                                        className={`col-check-item ${sel ? "active" : ""} ${capped ? "capped" : ""}`}>
                                        <input type="checkbox" checked={sel} disabled={capped}
                                            onChange={() => toggleCol(col)} />
                                        <span className="col-check-name">{col}</span>
                                        {sel && (
                                            <span className="col-check-idx"
                                                style={{ background: swatches[selectedCols.indexOf(col)] || "rgba(0,212,255,0.15)" }}>
                                                {selectedCols.indexOf(col) + 1}
                                            </span>
                                        )}
                                    </label>
                                );
                            })
                        )}
                    </div>
                </div>

                {needsPCA && (
                    <div className="stat-note" style={{ borderRadius: 7, marginBottom: 12, border: "1px solid rgba(255,170,0,0.3)", background: "rgba(255,170,0,0.05)" }}>
                        <span className="note-icon" aria-hidden="true"><AlertTriangle /></span>
                        More than 2 features selected — enable PCA below or switch to 3D.
                    </div>
                )}

                {/* PREPROCESSING */}
                <div className="section-label">Preprocessing</div>

                <div className="form-group">
                    <label>Standardization</label>
                    <div className="segmented-control">
                        {(["none", "standard", "minmax"] as StandardMethod[]).map(s => (
                            <button key={s}
                                className={`seg-btn ${stdMethod === s ? "active" : ""}`}
                                onClick={() => setStdMethod(s)}>
                                {s === "none" ? "None" : s === "standard" ? "Z-Score" : "MinMax"}
                            </button>
                        ))}
                    </div>
                    <span className="input-hint">
                        {stdMethod === "none" && "Raw values — features with large ranges will dominate"}
                        {stdMethod === "standard" && "Zero mean, unit variance — recommended for K-Means"}
                        {stdMethod === "minmax" && "Scale to [0,1] — preserves distribution shape"}
                    </span>
                </div>

                <div className="form-group">
                    <label>Dimensionality Reduction</label>
                    <div className="segmented-control">
                        {(["none", "pca"] as DimReduction[]).map(d => (
                            <button key={d}
                                className={`seg-btn ${dimReduction === d ? "active" : ""}`}
                                onClick={() => setDimReduction(d)}>
                                {d === "none" ? "None" : "PCA → 2D"}
                            </button>
                        ))}
                    </div>
                    <span className="input-hint">
                        {dimReduction === "none" && "Use features directly — only 2 or 3 cols plot cleanly"}
                        {dimReduction === "pca" && "Project all features to 2D via PCA for visualization"}
                    </span>
                </div>

                <div className="form-group">
                    <label>Missing Values</label>
                    <div className="segmented-control">
                        {(["drop", "mean_impute", "median_impute"] as MissingHandling[]).map(m => (
                            <button key={m}
                                className={`seg-btn ${missingHandling === m ? "active" : ""}`}
                                onClick={() => setMissingHandling(m)}>
                                {m === "drop" ? "Drop" : m === "mean_impute" ? "Mean" : "Median"}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label>Sampling</label>
                    <div className="segmented-control">
                        {(["none", "random"] as SamplingStrat[]).map(s => (
                            <button key={s}
                                className={`seg-btn ${sampling === s ? "active" : ""}`}
                                onClick={() => setSampling(s)}>
                                {s === "none" ? "Full Dataset" : "Random Sample"}
                            </button>
                        ))}
                    </div>
                </div>

                {sampling === "random" && (
                    <div className="form-group nested">
                        <label>Sample Size (rows)</label>
                        <div className="slider-group">
                            <input type="range" min="100" max="20000" step="100"
                                value={sampleSize} onChange={e => setSampleSize(e.target.value)}
                                className="slider" />
                            <input type="number" min="100" max="100000"
                                value={sampleSize} onChange={e => setSampleSize(e.target.value)}
                                className="window-num-input" style={{ width: 72 }} />
                        </div>
                    </div>
                )}

                {/* K-MEANS PARAMETERS */}
                <div className="section-label">K-Means Parameters</div>

                {/* Big K display */}
                <div className="k-display">
                    <span className="k-number">{nClusters}</span>
                    <div className="k-label-block">
                        <span className="k-label">Clusters (k)</span>
                        <span className="k-sublabel">Pairwise cells = {k * (k - 1) / 2}</span>
                        <div className="cluster-swatches" style={{ marginTop: 4 }}>
                            {swatches.map((c, i) => (
                                <div key={i} className="cluster-swatch" style={{ background: c }} />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="form-group">
                    <label>Number of Clusters (k)</label>
                    <div className="slider-group">
                        <input type="range" min="2" max="15" step="1"
                            value={nClusters} onChange={e => setNClusters(e.target.value)}
                            className="slider" />
                        <span className="slider-value">{nClusters}</span>
                    </div>
                    <span className="input-hint">
                        High k = more granular, higher risk of over-segmentation. Evaluate via silhouette.
                    </span>
                </div>

                <div className="form-group">
                    <label>Initialization Method</label>
                    <div className="segmented-control">
                        {(["k-means++", "random"] as InitMethod[]).map(m => (
                            <button key={m}
                                className={`seg-btn ${initMethod === m ? "active" : ""}`}
                                onClick={() => setInitMethod(m)}>
                                {m === "k-means++" ? "K-Means++" : "Random"}
                            </button>
                        ))}
                    </div>
                    <span className="input-hint">
                        {initMethod === "k-means++" && "Smart init — spreads seeds, faster convergence. Recommended."}
                        {initMethod === "random" && "Random seeds — may need more runs (n_init) to find optimum"}
                    </span>
                </div>

                <div className="form-group">
                    <label>n_init — Independent Runs</label>
                    <div className="slider-group">
                        <input type="range" min="1" max="30" step="1"
                            value={nInit} onChange={e => setNInit(e.target.value)}
                            className="slider" />
                        <span className="slider-value">{nInit}</span>
                    </div>
                    <span className="input-hint">Best result retained across all runs</span>
                </div>

                <div className="form-group">
                    <label>Max Iterations</label>
                    <div className="slider-group">
                        <input type="range" min="50" max="1000" step="50"
                            value={maxIter} onChange={e => setMaxIter(e.target.value)}
                            className="slider" />
                        <span className="slider-value">{maxIter}</span>
                    </div>
                </div>

                <div className="form-group">
                    <label>Convergence Tolerance</label>
                    <div className="segmented-control">
                        {["0.001", "0.0001", "0.00001"].map(t => (
                            <button key={t}
                                className={`seg-btn ${tolerance === t ? "active" : ""}`}
                                onClick={() => setTolerance(t)}>
                                {t}
                            </button>
                        ))}
                    </div>
                    <span className="input-hint">Minimum centroid shift required to continue iterating</span>
                </div>

                <div className="form-group">
                    <label>Random State (seed)</label>
                    <input type="number" min="0" max="9999" value={randomState}
                        onChange={e => setRandomState(e.target.value)}
                        className="form-input" style={{ width: "100%" }} />
                    <span className="input-hint">Fixed seed for reproducibility</span>
                </div>

                {/* VISUALIZATION */}
                <div className="section-label">Visualization</div>

                <div className={`decomp-card ${enable3D ? "active" : ""}`}
                    onClick={() => {
                        setEnable3D(!enable3D);
                        if (!enable3D && selectedCols.length > 3) setSelectedCols(selectedCols.slice(0, 3));
                    }}>
                    <div className="decomp-card-top">
                        <input type="checkbox" checked={enable3D} readOnly />
                        <span className="decomp-card-title">Enable 3D Visualization</span>
                    </div>
                    <span className="decomp-card-desc">
                        Requires exactly 3 feature columns. Renders an interactive 3D scatter plot.
                    </span>
                </div>

                <div className={`decomp-card ${showCentroids ? "active" : ""}`}
                    onClick={() => setShowCentroids(!showCentroids)}>
                    <div className="decomp-card-top">
                        <input type="checkbox" checked={showCentroids} readOnly />
                        <span className="decomp-card-title">Show Centroids</span>
                    </div>
                    <span className="decomp-card-desc">
                        Render cluster centroid markers as large distinct symbols.
                    </span>
                </div>

                {showCentroids && (
                    <div className="form-group nested">
                        <label>Centroid Marker Size</label>
                        <div className="slider-group">
                            <input type="range" min="50" max="600" step="25"
                                value={centroidMarkerSize}
                                onChange={e => setCentroidMarkerSize(e.target.value)}
                                className="slider" />
                            <span className="slider-value">{centroidMarkerSize}</span>
                        </div>

                        <div className={`decomp-card ${centroidAnnotation ? "active" : ""}`}
                            style={{ marginTop: 8 }}
                            onClick={() => setCentroidAnnotation(!centroidAnnotation)}>
                            <div className="decomp-card-top">
                                <input type="checkbox" checked={centroidAnnotation} readOnly />
                                <span className="decomp-card-title">Coordinate Annotation</span>
                            </div>
                            <span className="decomp-card-desc">
                                Display centroid coordinates as small text near each marker.
                            </span>
                        </div>
                    </div>
                )}

                <div className={`decomp-card ${showClusterBoundary ? "active" : ""}`}
                    onClick={() => setShowClusterBoundary(!showClusterBoundary)}>
                    <div className="decomp-card-top">
                        <input type="checkbox" checked={showClusterBoundary} readOnly />
                        <span className="decomp-card-title">Convex Hull Boundary</span>
                    </div>
                    <span className="decomp-card-desc">
                        Draw cluster boundary outlines using convex hull of each group.
                    </span>
                </div>

                <div className={`decomp-card ${densityContour ? "active" : ""}`}
                    onClick={() => setDensityContour(!densityContour)}>
                    <div className="decomp-card-top">
                        <input type="checkbox" checked={densityContour} readOnly />
                        <span className="decomp-card-title">Density Contour Overlay</span>
                    </div>
                    <span className="decomp-card-desc">
                        Subtle KDE contour lines within each cluster showing data density.
                    </span>
                </div>

                <div className="form-group">
                    <label>Cluster Color Mode</label>
                    <div className="segmented-control">
                        {(["distinct_colors", "monochrome"] as ColorMode[]).map(c => (
                            <button key={c}
                                className={`seg-btn ${colorMode === c ? "active" : ""}`}
                                onClick={() => setColorMode(c)}>
                                {c === "distinct_colors" ? "Distinct" : "Monochrome"}
                            </button>
                        ))}
                    </div>
                    <span className="input-hint">
                        {colorMode === "distinct_colors" && "Each cluster a unique colour — best readability"}
                        {colorMode === "monochrome" && "Greyscale gradient — suitable for print"}
                    </span>
                </div>

                <div className="form-group">
                    <label>Point Opacity</label>
                    <div className="slider-group">
                        <input type="range" min="0.05" max="1.0" step="0.05"
                            value={pointAlpha} onChange={e => setPointAlpha(e.target.value)}
                            className="slider" />
                        <span className="slider-value">{pointAlpha}</span>
                    </div>
                    <span className="input-hint">Lower opacity reveals density in overlapping clusters</span>
                </div>

                <div className="form-group">
                    <label>Point Size</label>
                    <div className="slider-group">
                        <input type="range" min="2" max="100" step="2"
                            value={pointSize} onChange={e => setPointSize(e.target.value)}
                            className="slider" />
                        <span className="slider-value">{pointSize}</span>
                    </div>
                </div>

                <div className="form-group">
                    <label>Axis Scale</label>
                    <div className="segmented-control">
                        {(["linear", "log"] as AxisScale[]).map(s => (
                            <button key={s}
                                className={`seg-btn ${axisScale === s ? "active" : ""}`}
                                onClick={() => setAxisScale(s)}>
                                {s === "linear" ? "Linear" : "Log"}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label>Figure Scale</label>
                    <div className="segmented-control">
                        {(["small", "medium", "large", "xlarge"] as FigureScale[]).map(s => (
                            <button key={s}
                                className={`seg-btn ${figScale === s ? "active" : ""}`}
                                onClick={() => setFigScale(s)}>
                                {s === "small" ? "S" : s === "medium" ? "M" : s === "large" ? "L" : "XL"}
                            </button>
                        ))}
                    </div>
                    <span className="input-hint">
                        {figScale === "small" && "8 × 5 in — compact, good for dashboards"}
                        {figScale === "medium" && "12 × 8 in — default balanced size"}
                        {figScale === "large" && "16 × 10 in — presentation quality"}
                        {figScale === "xlarge" && "20 × 13 in — high resolution export"}
                    </span>
                </div>

                <div className="checkbox-group" style={{ marginBottom: 8 }}>
                    <input type="checkbox" id="cs-dark" checked={darkTheme}
                        onChange={() => setDarkTheme(!darkTheme)} />
                    <label htmlFor="cs-dark">Dark Theme</label>
                </div>



                {/* EVALUATION DISPLAY */}
                <div className="section-label">Evaluation Display</div>

                <div className="checkbox-row">
                    <div className="checkbox-group">
                        <input type="checkbox" id="cs-inertia" checked={displayInertia}
                            onChange={() => setDisplayInertia(!displayInertia)} />
                        <label htmlFor="cs-inertia">Inertia</label>
                    </div>
                    <div className="checkbox-group">
                        <input type="checkbox" id="cs-silhouette" checked={displaySilhouette}
                            onChange={() => setDisplaySilhouette(!displaySilhouette)} />
                        <label htmlFor="cs-silhouette">Silhouette</label>
                    </div>
                </div>
                <div className="checkbox-row">
                    <div className="checkbox-group">
                        <input type="checkbox" id="cs-sizes" checked={displayClusterSizes}
                            onChange={() => setDisplayClusterSizes(!displayClusterSizes)} />
                        <label htmlFor="cs-sizes">Cluster Sizes</label>
                    </div>
                    <div className="checkbox-group">
                        <input type="checkbox" id="cs-outliers" checked={highlightOutliers}
                            onChange={() => setHighlightOutliers(!highlightOutliers)} />
                        <label htmlFor="cs-outliers">Highlight Outliers</label>
                    </div>
                </div>

                {/* STATISTICAL INFERENCE */}
                <div className="section-label">Statistical Inference</div>
                <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
                    Toggle categories to compute on generate
                </span>

                <div className="stat-category-cards">
                    {([
                        { key: "quality", label: "Quality", Icon: Star, desc: "silhouette, inertia", val: compQuality, set: setCompQuality },
                        { key: "sizes", label: "Sizes", Icon: Box, desc: "count, balance", val: compSizes, set: setCompSizes },
                        { key: "separation", label: "Separation", Icon: Search, desc: "centroid distances", val: compSeparation, set: setCompSeparation },
                        { key: "features", label: "Features", Icon: Search, desc: "dominance, variance", val: compFeatures, set: setCompFeatures },
                        { key: "outliers", label: "Outliers", Icon: AlertTriangle, desc: "distance anomalies", val: compOutliers, set: setCompOutliers },
                    ] as const).map(({ key, label, Icon, desc, val, set }) => (
                        <label key={key} className={`stat-category-card ${val ? "active" : ""}`}>
                            <input type="checkbox" checked={val} onChange={() => (set as any)(!val)} />
                            <div className="stat-cat-icon" aria-hidden="true"><Icon /></div>
                            <div className="stat-cat-label">{label}</div>
                            <div className="stat-cat-desc">{desc}</div>
                        </label>
                    ))}
                </div>

                <button className="generate-button" onClick={generatePlot}
                    disabled={loading || selectedCols.length < 2}>
                    {loading ? "Clustering…" : "Generate Cluster Plot"}
                </button>
            </div>

            {/* ══════════════════════════════════════════════════════════
          PLOT AREA
          ══════════════════════════════════════════════════════════ */}
            <div className="plot-area">
                {loading ? (
                    <div className="loading-state">
                        <div className="cs-loader">
                            {[...Array(12)].map((_, i) => (
                                <div key={i} className="dot"
                                    style={{
                                        animationDelay: `${i * 0.1}s`,
                                        transform: `rotate(${i * 30}deg) translateX(28px)`,
                                    }} />
                            ))}
                        </div>
                        <p className="placeholder-text">Running K-Means (k={nClusters})…</p>
                    </div>
                ) : plotUrl ? (
                    <img src={plotUrl} alt="Cluster Scatter Plot" className="plot-image" />
                ) : (
                    <div className="empty-state">
                        <div className="empty-cs-icon">
                            <svg width="200" height="160" viewBox="0 0 200 160" fill="none">
                                {/* Cluster A */}
                                {[[30, 40], [42, 32], [50, 45], [38, 55], [25, 50], [45, 60], [55, 35]].map(([x, y], i) => (
                                    <circle key={`a${i}`} cx={x} cy={y} r="5" fill="#1f77b4" opacity="0.55" />
                                ))}
                                <circle cx="40" cy={45} r="9" fill="none" stroke="#1f77b4" strokeWidth="2" opacity="0.7" strokeDasharray="3 2" />
                                <circle cx="40" cy={45} r="4" fill="#1f77b4" opacity="0.9" />
                                {/* Cluster B */}
                                {[[110, 60], [125, 48], [138, 65], [120, 75], [105, 72], [135, 78], [145, 55]].map(([x, y], i) => (
                                    <circle key={`b${i}`} cx={x} cy={y} r="5" fill="#ff7f0e" opacity="0.55" />
                                ))}
                                <circle cx={122} cy={65} r="10" fill="none" stroke="#ff7f0e" strokeWidth="2" opacity="0.7" strokeDasharray="3 2" />
                                <circle cx={122} cy={65} r="4" fill="#ff7f0e" opacity="0.9" />
                                {/* Cluster C */}
                                {[[60, 120], [75, 108], [88, 125], [70, 135], [55, 128], [85, 138], [95, 115]].map(([x, y], i) => (
                                    <circle key={`c${i}`} cx={x} cy={y} r="5" fill="#2ca02c" opacity="0.55" />
                                ))}
                                <circle cx={75} cy={124} r="10" fill="none" stroke="#2ca02c" strokeWidth="2" opacity="0.7" strokeDasharray="3 2" />
                                <circle cx={75} cy={124} r="4" fill="#2ca02c" opacity="0.9" />
                                {/* Connecting lines between centroids */}
                                <line x1="40" y1="45" x2="122" y2="65" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
                                <line x1="40" y1="45" x2="75" y2="124" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
                                <line x1="122" y1="65" x2="75" y2="124" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
                                {/* K label */}
                                <text x="155" y="30" fontSize="28" fontWeight="900"
                                    fill="#00d4ff" opacity="0.25" fontFamily="monospace">k=3</text>
                            </svg>
                        </div>
                        <p className="placeholder-text">Select features and generate</p>
                        <p className="placeholder-text"
                            style={{ fontSize: "0.75rem", marginTop: 2, opacity: 0.55 }}>
                            K-Means · PCA · Convex Hull · Silhouette
                        </p>
                    </div>
                )}

                <button className="download-btn" onClick={handleDownload}
                    disabled={!plotUrl || loading}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download PNG
                </button>
            </div>

            {/* ══════════════════════════════════════════════════════════
          STATS PANEL — right overlay, never compresses plot
          ══════════════════════════════════════════════════════════ */}
            <div className={`stats-panel ${statsPanelOpen ? "open" : ""}`}>
                <div className="stats-panel-header">
                    <h3 className="stats-panel-title">
                        <span className="title-icon" aria-hidden="true"><Sigma /></span>
                        Cluster Inference
                    </h3>
                    <button className="stats-close-btn" onClick={() => setStatsPanelOpen(false)} aria-label="Close statistics panel">
                        <X aria-hidden="true" />
                    </button>
                </div>

                <div className="stats-panel-body">
                    {!statResults ? (
                        <div className="stats-empty">
                            <p>No statistics computed yet.</p>
                            <p className="stats-hint">Enable categories and regenerate.</p>
                        </div>
                    ) : (
                        <>
                            {/* ⭐ QUALITY */}
                            {compQuality && (
                                <div className="stat-block">
                                    <h4 className="stat-block-title">
                                        <span className="stat-block-icon" aria-hidden="true"><Star /></span>
                                        Cluster Quality
                                    </h4>

                                    {/* Prominent metric badges */}
                                    <div className="metric-badge-row">
                                        <div className="metric-badge">
                                            <span className="metric-badge-val"
                                                style={{ color: silhouetteColor(statResults.silhouette_score) }}>
                                                {fmtN(statResults.silhouette_score, 3)}
                                            </span>
                                            <span className="metric-badge-label">Silhouette</span>
                                        </div>
                                        <div className="metric-badge">
                                            <span className="metric-badge-val" style={{ fontSize: "0.95rem" }}>
                                                {statResults.inertia != null
                                                    ? statResults.inertia.toExponential(2) : "—"}
                                            </span>
                                            <span className="metric-badge-label">Inertia (WCSS)</span>
                                        </div>
                                    </div>

                                    <div className="stat-rows">
                                        <StatRow label="Between-cluster var"
                                            value={fmtN(statResults.between_cluster_var)}
                                            highlight={(statResults.between_cluster_var ?? 0) > 0} />
                                        <StatRow label="Within-cluster var"
                                            value={fmtN(statResults.within_cluster_var)} />
                                        <StatRow label="Separation strength"
                                            value={statResults.separation_strength ?? "—"}
                                            highlight={statResults.separation_strength === "Strong"} />
                                    </div>

                                    <div className="stat-note">
                                        Silhouette ≥ 0.6 = well-separated · 0.4–0.6 = moderate · &lt; 0.4 = weak or overlapping.
                                    </div>
                                </div>
                            )}

                            {/* SIZES */}
                            {compSizes && statResults.cluster_sizes && (
                                <div className="stat-block">
                                    <h4 className="stat-block-title">
                                        <span className="stat-block-icon" aria-hidden="true"><Box /></span>
                                        Cluster Sizes
                                    </h4>

                                    <div className="stat-rows">
                                        <StatRow label="Balance ratio"
                                            value={fmtN(statResults.cluster_balance_ratio)}
                                            highlight={(statResults.cluster_balance_ratio ?? 0) < 0.5} />
                                        <StatRow label="Largest cluster"
                                            value={statResults.largest_cluster != null
                                                ? `${statResults.largest_cluster} rows` : "—"} />
                                        <StatRow label="Smallest cluster"
                                            value={statResults.smallest_cluster != null
                                                ? `${statResults.smallest_cluster} rows` : "—"} />
                                    </div>

                                    <div className="contrib-section-label">Rows per Cluster</div>
                                    <div className="stat-rows">
                                        {Object.entries(statResults.cluster_sizes)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([clusterLabel, count], i) => {
                                                const total = Object.values(statResults.cluster_sizes!).reduce((a, b) => a + b, 0);
                                                const pct = total > 0 ? count / total : 0;
                                                const color = TAB10[parseInt(clusterLabel)] || "#00d4ff";
                                                return (
                                                    <div key={clusterLabel} className="stat-row">
                                                        <span className="stat-key" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                                                            Cluster {clusterLabel}
                                                        </span>
                                                        <div className="contrib-bar-wrap">
                                                            <div className="contrib-bar"
                                                                style={{ width: `${Math.min(pct * 90, 90)}px`, background: color }} />
                                                            <span className="stat-val">{count} ({(pct * 100).toFixed(1)}%)</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>

                                    {(statResults.cluster_balance_ratio ?? 1) < 0.4 && (
                                        <div className="stat-note">
                                            <span className="note-icon" aria-hidden="true"><AlertTriangle /></span>
                                            Low balance ratio — clusters are unevenly distributed. Consider adjusting k.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ↔️ SEPARATION */}
                            {compSeparation && (
                                <div className="stat-block">
                                    <h4 className="stat-block-title">
                                        <span className="stat-block-icon" aria-hidden="true"><Search /></span>
                                        Cluster Separation
                                    </h4>

                                    <div className="stat-rows">
                                        <StatRow label="Max centroid distance"
                                            value={fmtN(statResults.max_centroid_distance)}
                                            highlight />
                                        <StatRow label="Min centroid distance"
                                            value={fmtN(statResults.min_centroid_distance)} />
                                    </div>

                                    {statResults.centroid_distances &&
                                        Object.keys(statResults.centroid_distances).length > 0 && (
                                            <>
                                                <div className="contrib-section-label">Pairwise Centroid Distances</div>
                                                <div className="pair-list">
                                                    {Object.entries(statResults.centroid_distances)
                                                        .sort(([, a], [, b]) => b - a)
                                                        .map(([pair, dist]) => (
                                                            <div key={pair} className="pair-item">
                                                                <span className="pair-label">{pair}</span>
                                                                <span className="pair-val good">{fmtN(dist, 3)}</span>
                                                            </div>
                                                        ))}
                                                </div>
                                            </>
                                        )}

                                    {statResults.overlap_detected && (
                                        <div className="stat-note" style={{ color: "#ffaa00" }}>
                                            <span className="note-icon" aria-hidden="true"><AlertTriangle /></span>
                                            Cluster overlap detected in pairs: {statResults.overlap_pairs?.join(", ") ?? "—"}.
                                            Consider increasing k or applying better preprocessing.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* FEATURES */}
                            {compFeatures && statResults.feature_variance && (
                                <div className="stat-block">
                                    <h4 className="stat-block-title">
                                        <span className="stat-block-icon" aria-hidden="true"><Search /></span>
                                        Feature Dominance
                                    </h4>

                                    <div className="stat-rows">
                                        <StatRow label="Dominant feature"
                                            value={statResults.dominant_feature ?? "—"}
                                            highlight />
                                    </div>

                                    <div className="contrib-section-label">Variance by Feature</div>
                                    <div className="stat-rows">
                                        {Object.entries(statResults.feature_variance)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([feat, v]) => {
                                                const max = Math.max(...Object.values(statResults.feature_variance!));
                                                const pct = max > 0 ? v / max : 0;
                                                return (
                                                    <div key={feat} className="stat-row">
                                                        <span className="stat-key">{feat}</span>
                                                        <div className="contrib-bar-wrap">
                                                            <div className="contrib-bar"
                                                                style={{
                                                                    width: `${Math.min(pct * 90, 90)}px`,
                                                                    background: pct > 0.7 ? "#00d4ff" : "rgba(0,212,255,0.35)",
                                                                }} />
                                                            <span className="stat-val">{fmtN(v, 4)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    <div className="stat-note">
                                        Higher variance = that feature drives cluster separation more strongly.
                                    </div>
                                </div>
                            )}

                            {/* OUTLIERS */}
                            {compOutliers && (
                                <div className="stat-block">
                                    <h4 className="stat-block-title">
                                        <span className="stat-block-icon" aria-hidden="true"><AlertTriangle /></span>
                                        Outlier Detection
                                    </h4>

                                    <div className="stat-rows">
                                        <StatRow label="Outlier count"
                                            value={statResults.outlier_count != null
                                                ? `${statResults.outlier_count} points` : "—"}
                                            highlight={(statResults.outlier_count ?? 0) > 0} />
                                        <StatRow label="Outlier %"
                                            value={statResults.outlier_pct != null
                                                ? `${fmtN(statResults.outlier_pct, 2)}%` : "—"} />
                                    </div>
                                    <div className="stat-note">
                                        Points with centroid distance &gt; 3× within-cluster standard deviation
                                        are flagged as outliers.
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Backdrop — closes panel on mobile */}
            {statsPanelOpen && (
                <div className="stats-backdrop" onClick={() => setStatsPanelOpen(false)} />
            )}

        </div>
    );
}