"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, BarChart3, Grid3X3, Link2, Ruler, Sigma, TrendingDown, X } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./HeatmapPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type MissingHandling    = "drop" | "pairwise_drop" | "mean_impute";
type SamplingStrat      = "none" | "random";
type CorrMethod         = "pearson" | "spearman" | "kendall";
type DiagonalMode       = "show" | "hide" | "constant_one";
type TriangleMode       = "full" | "upper" | "lower";
type SortMethod         = "input_order" | "alphabetical" | "correlation_strength";
type DistanceMetric     = "euclidean" | "correlation" | "cosine";
type LinkageMethod      = "average" | "complete" | "ward" | "single";
type ColorScaleMode     = "diverging" | "sequential";

// ─── Stat result ──────────────────────────────────────────────────────────────
interface HeatmapStats {
  // Dependency structure
  strongest_positive?:    { var1: string; var2: string; r: number };
  strongest_negative?:    { var1: string; var2: string; r: number };
  mean_abs_corr?:         number;
  median_abs_corr?:       number;
  high_corr_pairs?:       Array<{ var1: string; var2: string; r: number }>;
  // Multicollinearity
  multicollinear_pairs?:  Array<{ var1: string; var2: string; r: number }>;
  redundant_features?:    string[];
  // Clustering / grouping
  feature_clusters?:      Array<string[]>;
  n_clusters_detected?:   number;
  // Significance
  insignificant_pairs?:   Array<{ var1: string; var2: string; p: number }>;
  significant_pair_pct?:  number;
  // Structure summary
  avg_corr_per_feature?:  Record<string, number>;
  most_connected?:        string;
  most_isolated?:         string;
  corr_matrix_det?:       number;
}

// ─── Small reusable components ────────────────────────────────────────────────
const StatRow = ({
  label, value, highlight = false, warn = false, danger = false,
}: {
  label: string; value: string;
  highlight?: boolean; warn?: boolean; danger?: boolean;
}) => (
  <div className={`stat-row ${highlight ? "highlight" : ""} ${warn ? "warn" : ""} ${danger ? "danger" : ""}`}>
    <span className="stat-key">{label}</span>
    <span className="stat-val">{value}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
export default function HeatmapPage() {

  // ── Column state ─────────────────────────────────────────────────────────
  const [allHeaders,   setAllHeaders]   = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [maxVarCap,    setMaxVarCap]    = useState("20");

  // ── Data controls ─────────────────────────────────────────────────────────
  const [missingHandling, setMissingHandling] = useState<MissingHandling>("drop");
  const [sampling,        setSampling]        = useState<SamplingStrat>("none");
  const [sampleSize,      setSampleSize]      = useState("5000");

  // ── Correlation computation ───────────────────────────────────────────────
  const [corrMethod,      setCorrMethod]      = useState<CorrMethod>("pearson");
  const [absMode,         setAbsMode]         = useState(false);
  const [sigTestEnabled,  setSigTestEnabled]  = useState(false);
  const [sigThreshold,    setSigThreshold]    = useState("0.05");
  const [diagMode,        setDiagMode]        = useState<DiagonalMode>("constant_one");

  // ── Matrix structure ──────────────────────────────────────────────────────
  const [triangleMode,    setTriangleMode]    = useState<TriangleMode>("full");
  const [sortMethod,      setSortMethod]      = useState<SortMethod>("input_order");
  const [hierEnabled,     setHierEnabled]     = useState(false);
  const [distMetric,      setDistMetric]      = useState<DistanceMetric>("euclidean");
  const [linkageMethod,   setLinkageMethod]   = useState<LinkageMethod>("average");
  const [dendrogramShow,  setDendrogramShow]  = useState(false);

  // ── Rendering ─────────────────────────────────────────────────────────────
  const [colorScaleMode,  setColorScaleMode]  = useState<ColorScaleMode>("diverging");
  const [colorRangeMin,   setColorRangeMin]   = useState("-1");
  const [colorRangeMax,   setColorRangeMax]   = useState("1");
  const [cellAnnotation,  setCellAnnotation]  = useState(true);
  const [annotPrecision,  setAnnotPrecision]  = useState("2");
  const [gridlines,       setGridlines]       = useState(true);
  const [labelRotation,   setLabelRotation]   = useState("45");
  const [figScale,        setFigScale]        = useState("medium");
  const [darkTheme,       setDarkTheme]       = useState(false);

  // ── Stat categories ───────────────────────────────────────────────────────
  const [compDependency,  setCompDependency]  = useState(true);
  const [compMulticoll,   setCompMulticoll]   = useState(false);
  const [compClustering,  setCompClustering]  = useState(false);
  const [compSignif,      setCompSignif]      = useState(false);
  const [compStructure,   setCompStructure]   = useState(false);

  // ── Plot state ────────────────────────────────────────────────────────────
  const [plotUrl,        setPlotUrl]        = useState("");
  const [loading,        setLoading]        = useState(false);
  const [statResults,    setStatResults]    = useState<HeatmapStats | null>(null);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  // ── Load headers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    if (stored) {
      const parsed: string[] = JSON.parse(stored);
      setAllHeaders(parsed.map((h: string) => h.replace(/^["']|["']$/g, "").trim()));
    }
  }, []);

  const cap = parseInt(maxVarCap) || 20;

  const toggleCol = (col: string) => {
    setSelectedCols(prev => {
      if (prev.includes(col)) return prev.filter(c => c !== col);
      if (prev.length >= cap) return prev;
      return [...prev, col];
    });
  };

  const clean = (s: string) => s.replace(/^["']|["']$/g, "").trim();
  const n     = selectedCols.length;

  /** Returns { valid, message } for client-side validation. Message includes suggestion when invalid. */
  const validateConfig = (): { valid: boolean; message?: string } => {
    if (allHeaders.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the heatmap." };
    }
    if (n < 2) {
      return { valid: false, message: "At least 2 numeric columns are required. Select two or more columns from the list before generating." };
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
    const vmin = parseFloat(colorRangeMin);
    const vmax = parseFloat(colorRangeMax);
    if (isNaN(vmin) || isNaN(vmax)) {
      return { valid: false, message: "Color range limits must be numeric. Enter valid numbers for Min and Max (e.g. -1 and 1 for correlation)." };
    }
    if (vmin >= vmax) {
      return { valid: false, message: "Color range Min must be less than Max. For correlation use -1 and 1; for absolute mode use 0 and 1." };
    }
    if (dendrogramShow && !hierEnabled) {
      return { valid: false, message: "Dendrogram requires hierarchical clustering. Enable 'Hierarchical Clustering Reorder' first, or turn off the dendrogram." };
    }
    if (absMode && vmin < 0) {
      return { valid: false, message: "In absolute correlation mode, values range from 0 to 1. Set color range Min to 0 and Max to 1 for correct display." };
    }
    const capVal = parseInt(maxVarCap, 10);
    if (isNaN(capVal) || capVal < 2 || capVal > 50) {
      return { valid: false, message: "Max variable cap must be between 2 and 50. Adjust the slider to a valid value." };
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/multivariate/heatmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          feature_columns:              selectedCols.map(clean),
          max_variable_cap:             cap,
          missing_value_handling:       missingHandling,
          sampling_strategy:            sampling,
          sample_size:                  parseInt(sampleSize),
          correlation_method:           corrMethod,
          absolute_correlation_mode:    absMode,
          significance_test_enabled:    sigTestEnabled,
          significance_threshold:       parseFloat(sigThreshold),
          diagonal_display_mode:        diagMode,
          matrix_triangle_mode:         triangleMode,
          variable_sorting_method:      sortMethod,
          hierarchical_clustering_enabled: hierEnabled,
          clustering_distance_metric:   distMetric,
          clustering_linkage_method:    linkageMethod,
          dendrogram_display:           dendrogramShow,
          color_scale_mode:             colorScaleMode,
          color_range_limits:           [parseFloat(colorRangeMin), parseFloat(colorRangeMax)],
          cell_annotation_enabled:      cellAnnotation,
          annotation_precision:         parseInt(annotPrecision),
          cell_gridlines_enabled:       gridlines,
          axis_label_rotation:          parseInt(labelRotation),
          figure_scale:                 figScale,
          dark_theme:                   darkTheme,
          compute_dependency:           compDependency,
          compute_multicollinearity:    compMulticoll,
          compute_clustering:           compClustering,
          compute_significance:         compSignif,
          compute_structure:            compStructure,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = parseApiError(err.detail ?? "Failed to generate heatmap");
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
        msg = "Not enough rows after preprocessing. Try 'Mean impute' or 'Pairwise drop' for missing values, reduce the number of columns, or select columns with fewer missing values.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the heatmap.";
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
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Heatmap_${corrMethod}_${n}vars.png`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { console.error("Download failed"); }
  };

  const fmtN  = (v: number | null | undefined, d = 3) => v != null ? v.toFixed(d) : "—";
  const rColor = (r: number) => Math.abs(r) >= 0.7 ? "#00d4ff" : Math.abs(r) >= 0.4 ? "#ffaa00" : "#5a7a9e";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="hm-container">

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
          CONFIG PANEL
          ══════════════════════════════════════════════════════════ */}
      <div className="config-panel">
        <h2 className="panel-title">Heatmap</h2>

        {/* FEATURE COLUMNS */}
        <div className="section-label">Feature Columns</div>

        <div className="form-group">
          <div className="col-select-header">
            <label style={{ margin: 0 }}>
              Numeric Variables
              <span className="label-badge">≥ 2 Required</span>
            </label>
            <div className="col-select-actions">
              <button className="col-action-btn"
                onClick={() => setSelectedCols(allHeaders.slice(0, cap))}>All</button>
              <button className="col-action-btn"
                onClick={() => setSelectedCols([])}>Clear</button>
            </div>
          </div>

          <span className="input-hint" style={{ marginBottom: 8 }}>
            {n} / {maxVarCap} selected
          </span>

          {n >= 2 && (
            <div className="matrix-preview">
              <span className="matrix-preview-label">Matrix size</span>
              <span className="matrix-preview-val">{n} × {n}</span>
              <span className="matrix-preview-label" style={{ marginLeft: 8 }}>cells</span>
              <span className="matrix-preview-val">{n * n}</span>
            </div>
          )}

          <div className="col-checklist" style={{ marginTop: 8 }}>
            {allHeaders.length === 0 ? (
              <p className="col-empty">Upload a CSV to see available columns</p>
            ) : (
              allHeaders.map(col => {
                const sel    = selectedCols.includes(col);
                const capped = !sel && selectedCols.length >= cap;
                return (
                  <label key={col}
                    className={`col-check-item ${sel ? "active" : ""} ${capped ? "capped" : ""}`}>
                    <input type="checkbox" checked={sel} disabled={capped}
                      onChange={() => toggleCol(col)} />
                    <span className="col-check-name">{col}</span>
                    {sel && (
                      <span className="col-check-idx">{selectedCols.indexOf(col) + 1}</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="form-group">
          <label>Max Variable Cap</label>
          <div className="slider-group">
            <input type="range" min="2" max="40" step="1"
              value={maxVarCap} onChange={e => setMaxVarCap(e.target.value)}
              className="slider" />
            <span className="slider-value">{maxVarCap}</span>
          </div>
          <span className="input-hint">Matrix grows O(n²) — above 20 labels may overlap</span>
        </div>

        {/* DATA CONTROLS */}
        <div className="section-label">Data Controls</div>

        <div className="form-group">
          <label>Missing Value Handling</label>
          <div className="segmented-control wrap">
            {(["drop","pairwise_drop","mean_impute"] as MissingHandling[]).map(m => (
              <button key={m}
                className={`seg-btn ${missingHandling === m ? "active" : ""}`}
                onClick={() => setMissingHandling(m)}>
                {m === "drop" ? "Drop" : m === "pairwise_drop" ? "Pairwise" : "Mean"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {missingHandling === "drop"         && "Remove all rows with any NaN before computing"}
            {missingHandling === "pairwise_drop" && "Use available pairs — maximises data usage"}
            {missingHandling === "mean_impute"  && "Fill NaN with column mean before computing"}
          </span>
        </div>

        <div className="form-group">
          <label>Sampling</label>
          <div className="segmented-control">
            {(["none","random"] as SamplingStrat[]).map(s => (
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

        {/* CORRELATION COMPUTATION */}
        <div className="section-label">Correlation Computation</div>

        <div className="form-group">
          <label>Method</label>
          <div className="segmented-control">
            {(["pearson","spearman","kendall"] as CorrMethod[]).map(m => (
              <button key={m}
                className={`seg-btn ${corrMethod === m ? "active" : ""}`}
                onClick={() => setCorrMethod(m)}>
                {m === "pearson" ? "Pearson" : m === "spearman" ? "Spearman" : "Kendall"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {corrMethod === "pearson"  && "Linear — fast, assumes normality"}
            {corrMethod === "spearman" && "Rank-based — robust to outliers"}
            {corrMethod === "kendall"  && "Concordance pairs — best for small samples"}
          </span>
        </div>

        <div className={`decomp-card ${absMode ? "active" : ""}`}
          onClick={() => setAbsMode(!absMode)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={absMode} readOnly />
            <span className="decomp-card-title">Absolute Correlation Mode</span>
          </div>
          <span className="decomp-card-desc">
            Convert all values to |r| — show magnitude only, ignore direction. Good for feature ranking.
          </span>
        </div>

        <div className="form-group">
          <label>Diagonal Display</label>
          <div className="segmented-control">
            {(["constant_one","show","hide"] as DiagonalMode[]).map(d => (
              <button key={d}
                className={`seg-btn ${diagMode === d ? "active" : ""}`}
                onClick={() => setDiagMode(d)}>
                {d === "constant_one" ? "1.0" : d === "show" ? "Computed" : "Hidden"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {diagMode === "constant_one" && "Fill diagonal with 1.0 — self-correlation"}
            {diagMode === "show"         && "Compute actual self-correlation (always 1.0)"}
            {diagMode === "hide"         && "Blank diagonal cells — reduces visual noise"}
          </span>
        </div>

        <div className={`decomp-card ${sigTestEnabled ? "active" : ""}`}
          onClick={() => setSigTestEnabled(!sigTestEnabled)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={sigTestEnabled} readOnly />
            <span className="decomp-card-title">Significance Testing</span>
          </div>
          <span className="decomp-card-desc">
            Compute p-values and mask cells where p ≥ threshold (shown as blank or ×).
          </span>
        </div>

        {sigTestEnabled && (
          <div className="form-group nested">
            <label>Significance Threshold (p ≤)</label>
            <div className="segmented-control">
              {["0.01","0.05","0.10"].map(t => (
                <button key={t}
                  className={`seg-btn ${sigThreshold === t ? "active" : ""}`}
                  onClick={() => setSigThreshold(t)}>
                  {t}
                </button>
              ))}
            </div>
            <span className="input-hint">Pairs with p ≥ threshold are masked as insignificant</span>
          </div>
        )}

        {/* MATRIX STRUCTURE */}
        <div className="section-label">Matrix Structure</div>

        <div className="form-group">
          <label>Triangle Mode</label>
          <div className="segmented-control">
            {(["full","upper","lower"] as TriangleMode[]).map(t => (
              <button key={t}
                className={`seg-btn ${triangleMode === t ? "active" : ""}`}
                onClick={() => setTriangleMode(t)}>
                {t === "full" ? "Full" : t === "upper" ? "Upper" : "Lower"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {triangleMode === "full"  && "Show complete symmetric matrix"}
            {triangleMode === "upper" && "Upper triangle only — removes mirrored half"}
            {triangleMode === "lower" && "Lower triangle only — removes mirrored half"}
          </span>
        </div>

        <div className="form-group">
          <label>Variable Sorting</label>
          <div className="segmented-control wrap">
            {(["input_order","alphabetical","correlation_strength"] as SortMethod[]).map(s => (
              <button key={s}
                className={`seg-btn ${sortMethod === s ? "active" : ""}`}
                onClick={() => setSortMethod(s)}>
                {s === "input_order" ? "Input" : s === "alphabetical" ? "Alpha" : "Strength"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {sortMethod === "input_order"          && "Preserve order columns were selected"}
            {sortMethod === "alphabetical"         && "Sort column names A → Z"}
            {sortMethod === "correlation_strength" && "Sort by mean absolute correlation desc"}
          </span>
        </div>

        <div className={`decomp-card ${hierEnabled ? "active" : ""}`}
          onClick={() => setHierEnabled(!hierEnabled)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={hierEnabled} readOnly />
            <span className="decomp-card-title">Hierarchical Clustering Reorder</span>
          </div>
          <span className="decomp-card-desc">
            Reorder matrix rows/columns using hierarchical clustering — groups similar variables.
          </span>
        </div>

        {hierEnabled && (
          <div className="form-group nested">
            <label>Distance Metric</label>
            <div className="segmented-control">
              {(["euclidean","correlation","cosine"] as DistanceMetric[]).map(d => (
                <button key={d}
                  className={`seg-btn ${distMetric === d ? "active" : ""}`}
                  onClick={() => setDistMetric(d)}>
                  {d === "euclidean" ? "Euclid" : d === "correlation" ? "Corr" : "Cosine"}
                </button>
              ))}
            </div>

            <label style={{ marginTop: 12, display: "flex", gap: 8 }}>Linkage Method</label>
            <div className="segmented-control" style={{ marginTop: 6 }}>
              {(["average","complete","ward","single"] as LinkageMethod[]).map(l => (
                <button key={l}
                  className={`seg-btn ${linkageMethod === l ? "active" : ""}`}
                  onClick={() => setLinkageMethod(l)}>
                  {l === "average" ? "Avg" : l === "complete" ? "Comp" : l === "ward" ? "Ward" : "Single"}
                </button>
              ))}
            </div>
            <span className="input-hint">
              {linkageMethod === "ward"     && "Ward — minimises within-cluster variance. Recommended."}
              {linkageMethod === "average"  && "Average — balanced, robust to outlier clusters"}
              {linkageMethod === "complete" && "Complete — compact spherical clusters"}
              {linkageMethod === "single"   && "Single — may produce elongated chain clusters"}
            </span>

            <div className={`decomp-card ${dendrogramShow ? "active" : ""}`}
              style={{ marginTop: 10 }}
              onClick={() => setDendrogramShow(!dendrogramShow)}>
              <div className="decomp-card-top">
                <input type="checkbox" checked={dendrogramShow} readOnly />
                <span className="decomp-card-title">Show Dendrogram</span>
              </div>
              <span className="decomp-card-desc">
                Display hierarchical cluster tree along the heatmap axes.
              </span>
            </div>
          </div>
        )}

        {/* RENDERING */}
        <div className="section-label">Rendering</div>

        <div className="form-group">
          <label>Color Scale Mode</label>
          <div className="segmented-control">
            {(["diverging","sequential"] as ColorScaleMode[]).map(c => (
              <button key={c}
                className={`seg-btn ${colorScaleMode === c ? "active" : ""}`}
                onClick={() => setColorScaleMode(c)}>
                {c === "diverging" ? "Diverging" : "Sequential"}
              </button>
            ))}
          </div>
          <div className={`color-scale-preview ${colorScaleMode}`} />
          <span className="input-hint">
            {colorScaleMode === "diverging"  && "Two-colour around zero — ideal for correlation [-1, 1]"}
            {colorScaleMode === "sequential" && "Single-colour magnitude — best with absolute mode"}
          </span>
        </div>

        <div className="form-group">
          <label>Color Range Limits</label>
          <div className="range-row">
            <div className="input-wrapper">
              <span className="mini-label">Min</span>
              <input type="number" min="-1" max="0" step="0.1"
                value={colorRangeMin}
                onChange={e => setColorRangeMin(e.target.value)}
                className="form-input-small" />
            </div>
            <div className="input-wrapper">
              <span className="mini-label">Max</span>
              <input type="number" min="0" max="1" step="0.1"
                value={colorRangeMax}
                onChange={e => setColorRangeMax(e.target.value)}
                className="form-input-small" />
            </div>
          </div>
          <span className="input-hint">Typical: −1 / 1 for correlation, 0 / 1 for absolute mode</span>
        </div>

        <div className={`decomp-card ${cellAnnotation ? "active" : ""}`}
          onClick={() => setCellAnnotation(!cellAnnotation)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={cellAnnotation} readOnly />
            <span className="decomp-card-title">Cell Annotation</span>
          </div>
          <span className="decomp-card-desc">
            Display correlation coefficient value inside each heatmap cell.
          </span>
        </div>

        {cellAnnotation && (
          <div className="form-group nested">
            <label>Decimal Precision</label>
            <div className="segmented-control">
              {["1","2","3"].map(p => (
                <button key={p}
                  className={`seg-btn ${annotPrecision === p ? "active" : ""}`}
                  onClick={() => setAnnotPrecision(p)}>
                  {p === "1" ? "0.0" : p === "2" ? "0.00" : "0.000"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="checkbox-row">
          <div className="checkbox-group">
            <input type="checkbox" id="hm-grid" checked={gridlines}
              onChange={() => setGridlines(!gridlines)} />
            <label htmlFor="hm-grid">Cell Gridlines</label>
          </div>
          <div className="checkbox-group">
            <input type="checkbox" id="hm-dark" checked={darkTheme}
              onChange={() => setDarkTheme(!darkTheme)} />
            <label htmlFor="hm-dark">Dark Theme</label>
          </div>
        </div>

        <div className="form-group">
          <label>Axis Label Rotation</label>
          <div className="segmented-control">
            {["0","30","45","60","90"].map(r => (
              <button key={r}
                className={`seg-btn ${labelRotation === r ? "active" : ""}`}
                onClick={() => setLabelRotation(r)}>
                {r}°
              </button>
            ))}
          </div>
          <span className="input-hint">Higher rotation prevents label overlap for large matrices</span>
        </div>

        <div className="form-group">
          <label>Figure Scale</label>
          <div className="segmented-control">
            {["small","medium","large","xlarge"].map(s => (
              <button key={s}
                className={`seg-btn ${figScale === s ? "active" : ""}`}
                onClick={() => setFigScale(s)}>
                {s === "small" ? "S" : s === "medium" ? "M" : s === "large" ? "L" : "XL"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {figScale === "small"  && "8 × 7 in — compact"}
            {figScale === "medium" && "12 × 10 in — default"}
            {figScale === "large"  && "16 × 14 in — presentation"}
            {figScale === "xlarge" && "22 × 18 in — high-res export"}
          </span>
        </div>

        {/* STATISTICAL INFERENCE */}
        <div className="section-label">Statistical Inference</div>
        <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
          Toggle categories to compute on generate
        </span>

        <div className="stat-category-cards">
          {([
            { key: "dep",   label: "Depend",    Icon: Link2,        desc: "strength, direction",   val: compDependency, set: setCompDependency },
            { key: "multi", label: "Multicoll", Icon: AlertTriangle, desc: "redundant predictors", val: compMulticoll,  set: setCompMulticoll  },
            { key: "clust", label: "Cluster",   Icon: Grid3X3,      desc: "feature groups",        val: compClustering, set: setCompClustering },
            { key: "sig",   label: "Signif",    Icon: TrendingDown, desc: "p-value filter",        val: compSignif,     set: setCompSignif     },
            { key: "struct", label: "Structure", Icon: Ruler,       desc: "connectivity, det",     val: compStructure,  set: setCompStructure  },
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
          disabled={loading || n < 2}>
          {loading ? "Computing…" : "Generate Heatmap"}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          PLOT AREA
          ══════════════════════════════════════════════════════════ */}
      <div className="plot-area">
        {loading ? (
          <div className="loading-state">
            <div className="hm-loader">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="dot"
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    transform: `rotate(${i * 30}deg) translateX(28px)`,
                  }} />
              ))}
            </div>
            <p className="placeholder-text">Computing {corrMethod} correlations…</p>
            {n >= 2 && (
              <p className="placeholder-text"
                style={{ fontSize: "0.75rem", opacity: 0.6, margin: 0 }}>
                {n} × {n} matrix · {n * n} cells
              </p>
            )}
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="Correlation Heatmap" className="plot-image" />
        ) : (
          <div className="empty-state">
            <div className="empty-hm-icon">
              <svg width="200" height="180" viewBox="0 0 200 180" fill="none">
                {/* 5×5 heatmap preview */}
                {(() => {
                  const vals = [
                    [1.0,  0.82, 0.45, -0.3, -0.6],
                    [0.82, 1.0,  0.31, -0.1, -0.4],
                    [0.45, 0.31, 1.0,   0.6,  0.2],
                    [-0.3,-0.1,  0.6,   1.0,  0.7],
                    [-0.6,-0.4,  0.2,   0.7,  1.0],
                  ];
                  const size = 30, pad = 20;
                  return vals.map((row, ri) =>
                    row.map((v, ci) => {
                      const r = v > 0 ? Math.round(v * 40) : 0;
                      const b = v < 0 ? Math.round(Math.abs(v) * 40) : 0;
                      const g = Math.round((1 - Math.abs(v)) * 30);
                      const fill = `rgb(${30+b},${40+g},${80+r})`;
                      const isDiag = ri === ci;
                      return (
                        <React.Fragment key={`${ri}-${ci}`}>
                          <rect
                            x={pad + ci * size} y={pad + ri * size}
                            width={size - 1} height={size - 1}
                            rx="2"
                            fill={isDiag ? "rgba(0,212,255,0.2)" : fill}
                            opacity="0.85"
                          />
                          {isDiag && (
                            <text
                              x={pad + ci * size + size / 2}
                              y={pad + ri * size + size / 2 + 4}
                              textAnchor="middle" fontSize="8"
                              fill="#00d4ff" fontFamily="monospace" fontWeight="700">
                              1.0
                            </text>
                          )}
                          {!isDiag && Math.abs(v) >= 0.6 && (
                            <text
                              x={pad + ci * size + size / 2}
                              y={pad + ri * size + size / 2 + 4}
                              textAnchor="middle" fontSize="7"
                              fill="#c8ddf0" opacity="0.9"
                              fontFamily="monospace">
                              {v.toFixed(2)}
                            </text>
                          )}
                        </React.Fragment>
                      );
                    })
                  );
                })()}
              </svg>
            </div>
            <p className="placeholder-text">Select columns and generate</p>
            <p className="placeholder-text"
              style={{ fontSize: "0.75rem", marginTop: 2, opacity: 0.55 }}>
              Pearson · Spearman · Clustering · Significance
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
            Correlation Inference
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
              {/* DEPENDENCY */}
              {compDependency && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Link2 /></span>
                    Pairwise Dependency Structure
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Mean |r|"
                      value={fmtN(statResults.mean_abs_corr)}
                      highlight={(statResults.mean_abs_corr ?? 0) > 0.5} />
                    <StatRow label="Median |r|"
                      value={fmtN(statResults.median_abs_corr)} />
                    {statResults.strongest_positive && (
                      <>
                        <StatRow label="Strongest positive"
                          value={`${statResults.strongest_positive.var1} × ${statResults.strongest_positive.var2}`}
                          highlight />
                        <StatRow label="↑ r value"
                          value={fmtN(statResults.strongest_positive.r)} />
                      </>
                    )}
                    {statResults.strongest_negative && (
                      <>
                        <StatRow label="Strongest negative"
                          value={`${statResults.strongest_negative.var1} × ${statResults.strongest_negative.var2}`}
                          danger />
                        <StatRow label="↓ r value"
                          value={fmtN(statResults.strongest_negative.r)} />
                      </>
                    )}
                  </div>

                  {statResults.high_corr_pairs && statResults.high_corr_pairs.length > 0 && (
                    <>
                      <div className="contrib-section-label">High Correlation Pairs (|r| ≥ 0.6)</div>
                      <div className="pair-list">
                        {statResults.high_corr_pairs.map((p, i) => (
                          <div key={i} className="pair-item">
                            <span className="pair-label">{p.var1} × {p.var2}</span>
                            <span className="pair-val"
                              style={{ color: rColor(p.r) }}>
                              {fmtN(p.r)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* MULTICOLLINEARITY */}
              {compMulticoll && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><AlertTriangle /></span>
                    Multicollinearity & Redundancy
                  </h4>

                  {(!statResults.multicollinear_pairs || statResults.multicollinear_pairs.length === 0) ? (
                    <div className="stat-rows">
                      <StatRow label="Multicollinear pairs" value="None detected" />
                    </div>
                  ) : (
                    <>
                      <div className="stat-rows">
                        <StatRow label="Pairs detected"
                          value={`${statResults.multicollinear_pairs.length}`}
                          warn={statResults.multicollinear_pairs.length > 0} />
                      </div>
                      <div className="contrib-section-label">Pairs with |r| ≥ 0.8</div>
                      <div className="pair-list">
                        {statResults.multicollinear_pairs.map((p, i) => (
                          <div key={i} className="pair-item">
                            <span className="pair-label">{p.var1} × {p.var2}</span>
                            <span className="pair-val warn">{fmtN(p.r)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {statResults.redundant_features && statResults.redundant_features.length > 0 && (
                    <>
                      <div className="contrib-section-label">Candidate Features to Remove</div>
                      <div className="cluster-group">
                        {statResults.redundant_features.map(f => (
                          <span key={f} className="cluster-badge" style={{ borderColor: "rgba(255,170,0,0.4)", color: "#ffaa00" }}>
                            {f}
                          </span>
                        ))}
                      </div>
                      <div className="stat-note">
                        These features share high correlation with at least one other variable and may be candidates for removal before modelling.
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CLUSTERING */}
              {compClustering && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Grid3X3 /></span>
                    Feature Grouping & Clustering
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Clusters detected"
                      value={statResults.n_clusters_detected != null
                        ? `${statResults.n_clusters_detected}` : "—"}
                      highlight />
                  </div>

                  {statResults.feature_clusters && statResults.feature_clusters.length > 0 && (
                    <>
                      <div className="contrib-section-label">Feature Groups</div>
                      {statResults.feature_clusters.map((group, gi) => (
                        <div key={gi}>
                          <div className="contrib-section-label"
                            style={{ paddingTop: gi > 0 ? 8 : 0, borderTop: gi > 0 ? "1px solid #1e3a5f" : "none", fontSize: "0.6rem", color: "#00d4ff" }}>
                            Group {gi + 1}
                          </div>
                          <div className="cluster-group">
                            {group.map(f => (
                              <span key={f} className="cluster-badge">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="stat-note">
                        Variables in the same group share similar correlation patterns — may indicate a latent factor or shared underlying driver.
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* SIGNIFICANCE */}
              {compSignif && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><TrendingDown /></span>
                    Statistical Significance
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Significant pair %"
                      value={statResults.significant_pair_pct != null
                        ? `${fmtN(statResults.significant_pair_pct, 1)}%` : "—"}
                      highlight={(statResults.significant_pair_pct ?? 0) > 50} />
                  </div>

                  {statResults.insignificant_pairs && statResults.insignificant_pairs.length > 0 && (
                    <>
                      <div className="contrib-section-label">
                        Insignificant Pairs (p ≥ {sigThreshold})
                      </div>
                      <div className="pair-list">
                        {statResults.insignificant_pairs.slice(0, 8).map((p, i) => (
                          <div key={i} className="pair-item">
                            <span className="pair-label">{p.var1} × {p.var2}</span>
                            <span className="pair-val warn">p={fmtN(p.p, 4)}</span>
                          </div>
                        ))}
                        {statResults.insignificant_pairs.length > 8 && (
                          <div className="pair-item">
                            <span className="pair-label" style={{ fontStyle: "italic" }}>
                              +{statResults.insignificant_pairs.length - 8} more…
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="stat-note">
                        Insignificant pairs should be interpreted cautiously — apparent correlations may be noise.
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* STRUCTURE */}
              {compStructure && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Ruler /></span>
                    Matrix Structure Summary
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Most connected"
                      value={statResults.most_connected ?? "—"}
                      highlight />
                    <StatRow label="Most isolated"
                      value={statResults.most_isolated ?? "—"} />
                    <StatRow label="Correlation det"
                      value={fmtN(statResults.corr_matrix_det, 5)}
                      warn={(statResults.corr_matrix_det ?? 1) < 0.01} />
                  </div>

                  {statResults.avg_corr_per_feature &&
                    Object.keys(statResults.avg_corr_per_feature).length > 0 && (
                    <>
                      <div className="contrib-section-label">Avg |r| per Feature</div>
                      <div className="stat-rows">
                        {Object.entries(statResults.avg_corr_per_feature)
                          .sort(([, a], [, b]) => b - a)
                          .map(([feat, v]) => {
                            const max = Math.max(...Object.values(statResults.avg_corr_per_feature!));
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
                                  <span className="stat-val">{fmtN(v, 3)}</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </>
                  )}

                  <div className="stat-note">
                    Determinant ≈ 0 indicates near-perfect multicollinearity — matrix is nearly singular.
                    det &lt; 0.01 is highlighted as a warning.
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