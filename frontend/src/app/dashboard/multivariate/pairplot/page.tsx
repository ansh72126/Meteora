"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, BarChart3, FlaskConical, Sigma, Target, TrendingUp, Unlink2, X } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./PairPlotPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type SamplingStrategy  = "none" | "random" | "stratified";
type MissingHandling   = "none" | "drop" | "mean_impute" | "median_impute";
type UpperTriType      = "none" | "scatter" | "kde" | "regression" | "correlation_text";
type LowerTriType      = "scatter" | "kde" | "regression";
type DiagonalType      = "histogram" | "kde" | "density_histogram";
type CorrMethod        = "pearson" | "spearman";
type RegressionType    = "linear" | "robust";
type OutlierMethod     = "none" | "zscore" | "iqr";
type AxisScale         = "linear" | "log";

// ─── Stat result types ────────────────────────────────────────────────────────
interface CorrPair  { var1: string; var2: string; r: number }
interface LinPair   { var1: string; var2: string; r_squared: number; slope: number; p_value: number }
interface HetPair   { var1: string; var2: string; bp_stat: number; p_value: number }

interface PairStatResult {
  // Correlation
  correlation_matrix?:   Record<string, Record<string, number>>;
  strongest_pair?:       CorrPair;
  weakest_pair?:         CorrPair;
  multicollinear_pairs?: CorrPair[];
  mean_abs_corr?:        number;
  // Relationships
  linear_pairs?:         LinPair[];
  best_linear_pair?:     LinPair;
  nonlinear_signal?:     string;
  // Distribution
  skew_summary?:         Record<string, number>;
  kurtosis_summary?:     Record<string, number>;
  distribution_shapes?:  Record<string, string>;
  // Diagnostics
  heteroscedastic_pairs?: HetPair[];
  outlier_count?:         number;
  outlier_pct?:           number;
  outlier_method?:        string;
  // Separability
  class_separability?:   Record<string, number>;
  best_separator?:       string;
}

// ─── Small reusable row component ────────────────────────────────────────────
const StatRow = ({
  label, value, highlight = false,
}: { label: string; value: string; highlight?: boolean }) => (
  <div className={`stat-row ${highlight ? "highlight" : ""}`}>
    <span className="stat-key">{label}</span>
    <span className="stat-val">{value}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
export default function PairPlotPage() {

  // ── Column state ────────────────────────────────────────────────────────────
  const [allHeaders,   setAllHeaders]   = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [maxVarsCap,   setMaxVarsCap]   = useState("8");
  const [hueField,     setHueField]     = useState("");

  // ── Sampling ─────────────────────────────────────────────────────────────
  const [sampling,    setSampling]    = useState<SamplingStrategy>("none");
  const [sampleSize,  setSampleSize]  = useState("2000");

  // ── Missing values ───────────────────────────────────────────────────────
  const [missingHandling, setMissingHandling] = useState<MissingHandling>("drop");

  // ── Grid layout ──────────────────────────────────────────────────────────
  const [cornerMode,   setCornerMode]   = useState(false);
  const [upperTri,     setUpperTri]     = useState<UpperTriType>("correlation_text");
  const [lowerTri,     setLowerTri]     = useState<LowerTriType>("scatter");
  const [diagType,     setDiagType]     = useState<DiagonalType>("histogram");
  const [histBins,     setHistBins]     = useState("auto");
  const [histBinsNum,  setHistBinsNum]  = useState("20");

  // ── Correlation ──────────────────────────────────────────────────────────
  const [corrMethod,     setCorrMethod]     = useState<CorrMethod>("pearson");
  const [corrOverlay,    setCorrOverlay]    = useState(true);
  const [corrThreshold,  setCorrThreshold]  = useState("0.7");

  // ── Regression ───────────────────────────────────────────────────────────
  const [regrOverlay,  setRegrOverlay]  = useState(false);
  const [regrType,     setRegrType]     = useState<RegressionType>("linear");
  const [ciLevel,      setCiLevel]      = useState("95");
  const [showR2,       setShowR2]       = useState(true);

  // ── Outliers ─────────────────────────────────────────────────────────────
  const [outlierMethod, setOutlierMethod] = useState<OutlierMethod>("none");
  const [markOutliers,  setMarkOutliers]  = useState(true);

  // ── Scatter appearance ────────────────────────────────────────────────────
  const [scatterAlpha, setScatterAlpha] = useState("0.6");
  const [markerSize,   setMarkerSize]   = useState("18");

  // ── Axis ─────────────────────────────────────────────────────────────────
  const [axisScale,       setAxisScale]       = useState<AxisScale>("linear");
  const [pctClipping,     setPctClipping]     = useState(false);
  const [pctLow,          setPctLow]          = useState("1");
  const [pctHigh,         setPctHigh]         = useState("99");

  // ── Visuals ───────────────────────────────────────────────────────────────
  const [colorPalette, setColorPalette] = useState("tab10");
  const [showLegend,   setShowLegend]   = useState(true);
  const [darkTheme,    setDarkTheme]    = useState(false);

  // ── Stat categories ───────────────────────────────────────────────────────
  const [compCorr,    setCompCorr]    = useState(true);
  const [compRel,     setCompRel]     = useState(false);
  const [compDist,    setCompDist]    = useState(false);
  const [compDiag,    setCompDiag]    = useState(false);
  const [compSep,     setCompSep]     = useState(false);

  // ── Plot state ────────────────────────────────────────────────────────────
  const [plotUrl,        setPlotUrl]        = useState("");
  const [loading,        setLoading]        = useState(false);
  const [statResults,    setStatResults]    = useState<PairStatResult | null>(null);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  // ── Load headers from sessionStorage ─────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    if (stored) {
      const parsed: string[] = JSON.parse(stored);
      const clean = parsed.map((h: string) => h.replace(/^["']|["']$/g, "").trim());
      setAllHeaders(clean);
    }
  }, []);

  // ── Column toggle ─────────────────────────────────────────────────────────
  const toggleCol = (col: string) => {
    setSelectedCols(prev => {
      if (prev.includes(col)) return prev.filter(c => c !== col);
      if (prev.length >= parseInt(maxVarsCap)) return prev;
      return [...prev, col];
    });
  };

  const clean = (s: string) => s.replace(/^["']|["']$/g, "").trim();

  // ── Non-selected headers for hue dropdown ────────────────────────────────
  const nonSelected = allHeaders.filter(h => !selectedCols.includes(h));

  /** Returns { valid, message } for client-side validation. Message includes suggestion when invalid. */
  const validateConfig = (): { valid: boolean; message?: string } => {
    if (allHeaders.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the pair plot." };
    }
    if (selectedCols.length < 2) {
      return { valid: false, message: "At least 2 numeric columns are required for the scatter matrix. Select two or more numeric columns from the list." };
    }
    if (sampling === "random" || sampling === "stratified") {
      const sz = parseInt(sampleSize, 10);
      if (isNaN(sz) || sz < 100) {
        return { valid: false, message: "Sample size must be at least 100 when using sampling. Increase the sample size to 100 or more." };
      }
      if (sz > 50000) {
        return { valid: false, message: "Sample size cannot exceed 50,000. Lower the value to 50,000 or below." };
      }
    }
    if (sampling === "stratified" && !hueField) {
      return { valid: false, message: "Stratified sampling requires a hue column. Select a grouping column in the Hue field, or switch to Random or Full Dataset sampling." };
    }
    if (pctClipping) {
      const lo = parseFloat(pctLow);
      const hi = parseFloat(pctHigh);
      if (isNaN(lo) || isNaN(hi)) {
        return { valid: false, message: "Percentile clip values must be numeric. Enter valid numbers for Low and High (e.g. 1 and 99)." };
      }
      if (lo >= hi) {
        return { valid: false, message: "Percentile Low must be less than High. For example use 1 and 99 to clip extreme outliers." };
      }
      if (lo < 0 || lo > 100 || hi < 0 || hi > 100) {
        return { valid: false, message: "Percentile values must be between 0 and 100. Adjust Low and High accordingly." };
      }
    }
    if (histBins === "custom") {
      const bins = parseInt(histBinsNum, 10);
      if (isNaN(bins) || bins < 5 || bins > 100) {
        return { valid: false, message: "Histogram bins must be between 5 and 100 when using custom. Adjust the slider or switch to Auto." };
      }
    }
    const capVal = parseInt(maxVarsCap, 10);
    if (isNaN(capVal) || capVal < 2 || capVal > 12) {
      return { valid: false, message: "Max variables cap must be between 2 and 12. Large grids can be slow; keep under 8 for best performance." };
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/multivariate/pairplot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          columns:                          selectedCols.map(clean),
          hue_column:                       hueField ? clean(hueField) : null,
          sampling_strategy:                sampling,
          sample_size:                      parseInt(sampleSize),
          missing_value_handling:           missingHandling,
          corner_mode:                      cornerMode,
          upper_triangle_type:              upperTri,
          lower_triangle_type:              lowerTri,
          diagonal_type:                    diagType,
          histogram_bins:                   histBins === "auto" ? null : parseInt(histBinsNum),
          correlation_method:               corrMethod,
          correlation_overlay:              corrOverlay,
          correlation_highlight_threshold:  parseFloat(corrThreshold),
          regression_overlay:               regrOverlay,
          regression_type:                  regrType,
          confidence_interval_level:        parseInt(ciLevel),
          show_r_squared:                   showR2,
          outlier_detection_method:         outlierMethod,
          mark_outliers:                    markOutliers,
          scatter_point_alpha:              parseFloat(scatterAlpha),
          scatter_marker_size:              parseFloat(markerSize),
          axis_scale:                       axisScale,
          percentile_clip_low:              pctClipping ? parseFloat(pctLow)  : null,
          percentile_clip_high:             pctClipping ? parseFloat(pctHigh) : null,
          color_palette:                    colorPalette,
          show_legend:                      showLegend,
          dark_theme:                       darkTheme,
          compute_correlation:              compCorr,
          compute_relationships:            compRel,
          compute_distribution:             compDist,
          compute_diagnostics:              compDiag,
          compute_separability:             compSep,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = parseApiError(err.detail ?? "Failed to generate pair plot");
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
        msg = "Not enough rows after preprocessing. Try 'Drop' or 'Mean impute' for missing values, or select columns with fewer missing values.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the pair plot.";
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
      a.download = `PairPlot_${selectedCols.join("_")}.png`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { console.error("Download failed"); }
  };

  // ── Stat helpers ──────────────────────────────────────────────────────────
  const fmtN = (v: number | null | undefined, d = 3) => v != null ? v.toFixed(d) : "—";

  const rColor = (r: number) => {
    const a = Math.abs(r);
    return a >= 0.7 ? "#00d4ff" : a >= 0.4 ? "#7faddb" : "#5a7a9e";
  };

  const n = selectedCols.length;
  const gridSize = `${n} × ${n}`;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="pp-container">

      {/* ── BACK BUTTON ─────────────────────────────────────────── */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* ── STATS TOGGLE ────────────────────────────────────────── */}
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
        <h2 className="panel-title">Pair Plot</h2>

        {/* COLUMN SELECTION */}
        <div className="section-label">Column Selection</div>

        <div className="form-group">
          <div className="col-select-header">
            <label style={{ margin: 0 }}>
              Numeric Variables
              <span className="label-badge">≥ 2 Required</span>
            </label>
            <div className="col-select-actions">
              <button className="col-action-btn"
                onClick={() => setSelectedCols(allHeaders.slice(0, parseInt(maxVarsCap)))}>
                All
              </button>
              <button className="col-action-btn" onClick={() => setSelectedCols([])}>
                Clear
              </button>
            </div>
          </div>

          <span className="input-hint" style={{ marginBottom: 8 }}>
            {selectedCols.length} / {maxVarsCap} selected
          </span>

          {selectedCols.length >= 2 && (
            <div className="grid-preview">
              <span className="grid-preview-label">Grid size</span>
              <span className="grid-preview-val">{gridSize}</span>
              <span className="grid-preview-label" style={{ marginLeft: 8 }}>cells</span>
              <span className="grid-preview-val">{n * n}</span>
            </div>
          )}

          <div className="col-checklist" style={{ marginTop: 8 }}>
            {allHeaders.length === 0 ? (
              <p className="col-empty">Upload a CSV to see available columns</p>
            ) : (
              allHeaders.map(col => {
                const sel    = selectedCols.includes(col);
                const capped = !sel && selectedCols.length >= parseInt(maxVarsCap);
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
          <label>Max Variables Cap</label>
          <div className="slider-group">
            <input type="range" min="2" max="12" step="1" value={maxVarsCap}
              onChange={e => setMaxVarsCap(e.target.value)} className="slider" />
            <span className="slider-value">{maxVarsCap}</span>
          </div>
          <span className="input-hint">Grid grows O(n²) — keep ≤ 8 for best readability</span>
        </div>

        <div className="form-group">
          <label>Hue / Group By</label>
          <select value={hueField} onChange={e => setHueField(e.target.value)}
            className="form-select">
            <option value="">None</option>
            {nonSelected.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Categorical column — colours points by class</span>
        </div>

        {/* SAMPLING */}
        <div className="section-label">Sampling</div>

        <div className="form-group">
          <label>Strategy</label>
          <div className="segmented-control">
            {(["none","random","stratified"] as SamplingStrategy[]).map(s => (
              <button key={s}
                className={`seg-btn ${sampling === s ? "active" : ""}`}
                onClick={() => setSampling(s)}>
                {s === "none" ? "None" : s === "random" ? "Random" : "Stratified"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {sampling === "none"       && "Full dataset — may be slow for large data"}
            {sampling === "random"     && "Uniform random subsample of N rows"}
            {sampling === "stratified" && "Preserves class proportions (requires Hue)"}
          </span>
        </div>

        {sampling !== "none" && (
          <div className="form-group nested">
            <label>Sample Size (rows)</label>
            <div className="slider-group">
              <input type="range" min="100" max="10000" step="100"
                value={sampleSize} onChange={e => setSampleSize(e.target.value)}
                className="slider" />
              <input type="number" min="100" max="50000" value={sampleSize}
                onChange={e => setSampleSize(e.target.value)}
                className="window-num-input" style={{ width: 70 }} />
            </div>
          </div>
        )}

        {/* MISSING VALUES */}
        <div className="section-label">Missing Values</div>

        <div className="form-group">
          <label>Strategy</label>
          <div className="segmented-control wrap">
            {(["none","drop","mean_impute","median_impute"] as MissingHandling[]).map(m => (
              <button key={m}
                className={`seg-btn ${missingHandling === m ? "active" : ""}`}
                onClick={() => setMissingHandling(m)}>
                {m === "none" ? "None" : m === "drop" ? "Drop" :
                 m === "mean_impute" ? "Mean" : "Median"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {missingHandling === "none"         && "Pass through — NaN may cause errors"}
            {missingHandling === "drop"         && "Remove rows with any NaN value"}
            {missingHandling === "mean_impute"  && "Fill NaN with column mean"}
            {missingHandling === "median_impute" && "Fill NaN with column median (robust)"}
          </span>
        </div>

        {/* GRID LAYOUT */}
        <div className="section-label">Grid Layout</div>

        <div className={`decomp-card ${cornerMode ? "active" : ""}`}
          onClick={() => setCornerMode(!cornerMode)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={cornerMode} readOnly />
            <span className="decomp-card-title">Corner Mode (Lower Triangle Only)</span>
          </div>
          <span className="decomp-card-desc">
            Show only lower-left triangle — removes mirrored redundancy, cleaner for large grids.
          </span>
        </div>

        <div className="form-group">
          <label>Diagonal</label>
          <div className="segmented-control">
            {(["histogram","kde","density_histogram"] as DiagonalType[]).map(d => (
              <button key={d}
                className={`seg-btn ${diagType === d ? "active" : ""}`}
                onClick={() => setDiagType(d)}>
                {d === "histogram" ? "Hist" : d === "kde" ? "KDE" : "Density"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {diagType === "histogram"         && "Bar histogram of variable's distribution"}
            {diagType === "kde"               && "Smooth kernel density estimate curve"}
            {diagType === "density_histogram" && "Histogram + KDE overlay combined"}
          </span>
        </div>

        {diagType === "histogram" && (
          <div className="form-group nested">
            <label>Histogram Bins</label>
            <div className="segmented-control" style={{ marginBottom: 6 }}>
              {["auto","custom"].map(b => (
                <button key={b}
                  className={`seg-btn ${histBins === b ? "active" : ""}`}
                  onClick={() => setHistBins(b)}>
                  {b === "auto" ? "Auto" : "Custom"}
                </button>
              ))}
            </div>
            {histBins === "custom" && (
              <div className="slider-group" style={{ marginTop: 6 }}>
                <input type="range" min="5" max="100" step="5"
                  value={histBinsNum} onChange={e => setHistBinsNum(e.target.value)}
                  className="slider" />
                <span className="slider-value">{histBinsNum}</span>
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Lower Triangle</label>
          <div className="segmented-control">
            {(["scatter","kde","regression"] as LowerTriType[]).map(t => (
              <button key={t}
                className={`seg-btn ${lowerTri === t ? "active" : ""}`}
                onClick={() => setLowerTri(t)}>
                {t === "scatter" ? "Scatter" : t === "kde" ? "KDE" : "Regress"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {lowerTri === "scatter"    && "Raw scatter — shows every data point"}
            {lowerTri === "kde"        && "2D kernel density contour plot"}
            {lowerTri === "regression" && "Scatter with fitted regression line"}
          </span>
        </div>

        {!cornerMode && (
          <div className="form-group">
            <label>Upper Triangle</label>
            <div className="segmented-control wrap">
              {(["none","scatter","kde","regression","correlation_text"] as UpperTriType[]).map(t => (
                <button key={t}
                  className={`seg-btn ${upperTri === t ? "active" : ""}`}
                  onClick={() => setUpperTri(t)}>
                  {t === "none" ? "None" : t === "scatter" ? "Scatter" :
                   t === "kde" ? "KDE" : t === "regression" ? "Regress" : "Corr r"}
                </button>
              ))}
            </div>
            <span className="input-hint">
              {upperTri === "none"             && "Leave upper cells empty"}
              {upperTri === "scatter"          && "Mirror scatter from lower triangle"}
              {upperTri === "kde"              && "2D KDE density contour"}
              {upperTri === "regression"       && "Mirror regression from lower triangle"}
              {upperTri === "correlation_text" && "Display correlation coefficient r value"}
            </span>
          </div>
        )}

        {/* CORRELATION */}
        <div className="section-label">Correlation</div>

        <div className="form-group">
          <label>Method</label>
          <div className="segmented-control">
            {(["pearson","spearman"] as CorrMethod[]).map(m => (
              <button key={m}
                className={`seg-btn ${corrMethod === m ? "active" : ""}`}
                onClick={() => setCorrMethod(m)}>
                {m === "pearson" ? "Pearson" : "Spearman"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {corrMethod === "pearson"  && "Linear correlation — assumes normality"}
            {corrMethod === "spearman" && "Rank-based — robust to outliers & non-linearity"}
          </span>
        </div>

        <div className={`decomp-card ${corrOverlay ? "active" : ""}`}
          onClick={() => setCorrOverlay(!corrOverlay)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={corrOverlay} readOnly />
            <span className="decomp-card-title">Correlation Overlay</span>
          </div>
          <span className="decomp-card-desc">
            Show r value in upper triangle cells. Strong pairs highlighted by threshold.
          </span>
        </div>

        {corrOverlay && (
          <div className="form-group nested">
            <label>Highlight Threshold |r| ≥</label>
            <div className="slider-group">
              <input type="range" min="0.3" max="0.95" step="0.05"
                value={corrThreshold}
                onChange={e => setCorrThreshold(e.target.value)}
                className="slider" />
              <span className="slider-value">{corrThreshold}</span>
            </div>
            <span className="input-hint">Pairs above threshold rendered with accent colour</span>
          </div>
        )}

        {/* REGRESSION */}
        <div className="section-label">Regression</div>

        <div className={`decomp-card ${regrOverlay ? "active" : ""}`}
          onClick={() => setRegrOverlay(!regrOverlay)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={regrOverlay} readOnly />
            <span className="decomp-card-title">Regression Line Overlay</span>
          </div>
          <span className="decomp-card-desc">
            Draw fitted trend line on scatter cells in the lower triangle.
          </span>
        </div>

        {regrOverlay && (
          <div className="form-group nested">
            <label>Regression Type</label>
            <div className="segmented-control">
              {(["linear","robust"] as RegressionType[]).map(r => (
                <button key={r}
                  className={`seg-btn ${regrType === r ? "active" : ""}`}
                  onClick={() => setRegrType(r)}>
                  {r === "linear" ? "OLS Linear" : "Robust"}
                </button>
              ))}
            </div>
            <span className="input-hint">
              {regrType === "linear" ? "Ordinary least squares — sensitive to outliers"
                : "LOWESS / Huber M-estimator — downweights extremes"}
            </span>

            <label style={{ marginTop: 12, display: "flex", gap: 8 }}>
              Confidence Interval Band
            </label>
            <div className="segmented-control" style={{ marginTop: 6 }}>
              {["80","90","95","99"].map(ci => (
                <button key={ci}
                  className={`seg-btn ${ciLevel === ci ? "active" : ""}`}
                  onClick={() => setCiLevel(ci)}>
                  {ci}%
                </button>
              ))}
            </div>

            <div className={`decomp-card ${showR2 ? "active" : ""}`}
              style={{ marginTop: 10 }}
              onClick={() => setShowR2(!showR2)}>
              <div className="decomp-card-top">
                <input type="checkbox" checked={showR2} readOnly />
                <span className="decomp-card-title">Annotate R² Value</span>
              </div>
              <span className="decomp-card-desc">
                Print R² below the regression line in each scatter cell.
              </span>
            </div>
          </div>
        )}

        {/* OUTLIERS */}
        <div className="section-label">Outlier Detection</div>

        <div className="form-group">
          <label>Method</label>
          <div className="segmented-control">
            {(["none","zscore","iqr"] as OutlierMethod[]).map(m => (
              <button key={m}
                className={`seg-btn ${outlierMethod === m ? "active" : ""}`}
                onClick={() => setOutlierMethod(m)}>
                {m === "none" ? "None" : m === "zscore" ? "Z-Score" : "IQR"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {outlierMethod === "none"   && "No outlier flagging applied"}
            {outlierMethod === "zscore" && "Flag rows where any variable |z| > 3"}
            {outlierMethod === "iqr"    && "Flag rows outside 1.5 × IQR per variable"}
          </span>
        </div>

        {outlierMethod !== "none" && (
          <div className={`decomp-card ${markOutliers ? "active" : ""}`}
            onClick={() => setMarkOutliers(!markOutliers)}>
            <div className="decomp-card-top">
              <input type="checkbox" checked={markOutliers} readOnly />
              <span className="decomp-card-title">Mark Outliers Visually</span>
            </div>
            <span className="decomp-card-desc">
              Render outlier rows as hollow markers on scatter plots for visual identification.
            </span>
          </div>
        )}

        {/* SCATTER APPEARANCE */}
        <div className="section-label">Scatter Appearance</div>

        <div className="form-group">
          <label>Point Opacity</label>
          <div className="slider-group">
            <input type="range" min="0.05" max="1.0" step="0.05"
              value={scatterAlpha} onChange={e => setScatterAlpha(e.target.value)}
              className="slider" />
            <span className="slider-value">{scatterAlpha}</span>
          </div>
          <span className="input-hint">Lower opacity reveals density in dense overlap regions</span>
        </div>

        <div className="form-group">
          <label>Marker Size</label>
          <div className="slider-group">
            <input type="range" min="2" max="80" step="2"
              value={markerSize} onChange={e => setMarkerSize(e.target.value)}
              className="slider" />
            <span className="slider-value">{markerSize}</span>
          </div>
        </div>

        {/* AXIS */}
        <div className="section-label">Axis</div>

        <div className="form-group">
          <label>Scale</label>
          <div className="segmented-control">
            {(["linear","log"] as AxisScale[]).map(s => (
              <button key={s}
                className={`seg-btn ${axisScale === s ? "active" : ""}`}
                onClick={() => setAxisScale(s)}>
                {s === "linear" ? "Linear" : "Log"}
              </button>
            ))}
          </div>
        </div>

        <div className={`decomp-card ${pctClipping ? "active" : ""}`}
          onClick={() => setPctClipping(!pctClipping)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={pctClipping} readOnly />
            <span className="decomp-card-title">Percentile Axis Clipping</span>
          </div>
          <span className="decomp-card-desc">
            Clip axis range to [low%, high%] — suppresses extreme outlier axis distortion.
          </span>
        </div>

        {pctClipping && (
          <div className="form-group nested">
            <div className="dual-input">
              <div className="input-wrapper">
                <span className="mini-label">Low %</span>
                <input type="number" min="0" max="10" step="0.5"
                  value={pctLow} onChange={e => setPctLow(e.target.value)}
                  className="form-input-small" />
              </div>
              <div className="input-wrapper">
                <span className="mini-label">High %</span>
                <input type="number" min="90" max="100" step="0.5"
                  value={pctHigh} onChange={e => setPctHigh(e.target.value)}
                  className="form-input-small" />
              </div>
            </div>
            <span className="input-hint">e.g. 1 / 99 clips bottom and top 1%</span>
          </div>
        )}

        {/* VISUALS */}
        <div className="section-label">Visuals</div>

        <div className="form-group">
          <label>Color Palette</label>
          <select value={colorPalette} onChange={e => setColorPalette(e.target.value)}
            className="form-select">
            <optgroup label="Categorical">
              <option value="tab10">Tab10</option>
              <option value="Set1">Set1</option>
              <option value="Set2">Set2</option>
              <option value="Set3">Set3</option>
              <option value="Paired">Paired</option>
              <option value="Dark2">Dark2</option>
            </optgroup>
            <optgroup label="Sequential">
              <option value="viridis">Viridis</option>
              <option value="plasma">Plasma</option>
              <option value="coolwarm">Coolwarm</option>
              <option value="magma">Magma</option>
            </optgroup>
          </select>
        </div>

        <div className="checkbox-row">
          <div className="checkbox-group">
            <input type="checkbox" id="pp-legend" checked={showLegend}
              onChange={() => setShowLegend(!showLegend)} />
            <label htmlFor="pp-legend">Show Legend</label>
          </div>
          <div className="checkbox-group">
            <input type="checkbox" id="pp-dark" checked={darkTheme}
              onChange={() => setDarkTheme(!darkTheme)} />
            <label htmlFor="pp-dark">Dark Theme</label>
          </div>
        </div>

        {/* STATISTICAL INFERENCE */}
        <div className="section-label">Statistical Inference</div>
        <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
          Toggle categories to compute on generate
        </span>

        <div className="stat-category-cards">
          {([
            { key: "corr",  label: "Corr",    Icon: Unlink2,      desc: "matrix, multicollinearity", val: compCorr,  set: setCompCorr  },
            { key: "rel",   label: "Linear",  Icon: TrendingUp,   desc: "R², slope, p-value",        val: compRel,   set: setCompRel   },
            { key: "dist",  label: "Distrib", Icon: BarChart3,    desc: "skew, kurtosis, shape",     val: compDist,  set: setCompDist  },
            { key: "diag",  label: "Diagnos", Icon: FlaskConical, desc: "heterosced., outliers",     val: compDiag,  set: setCompDiag  },
            { key: "sep",   label: "Separab", Icon: Target,       desc: "class distinction",         val: compSep,   set: setCompSep   },
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
          {loading ? "Generating…" : "Generate Pair Plot"}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          PLOT AREA
          ══════════════════════════════════════════════════════════ */}
      <div className="plot-area">
        <div className="plot-area-content">
        {loading ? (
          <div className="loading-state">
            <div className="pp-loader">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="dot"
                  style={{ animationDelay: `${i * 0.1}s`,
                           transform: `rotate(${i * 30}deg) translateX(28px)` }} />
              ))}
            </div>
            <p className="placeholder-text">Building pairwise grid…</p>
            {selectedCols.length >= 2 && (
              <p className="placeholder-text" style={{ fontSize: "0.75rem", opacity: 0.6, margin: 0 }}>
                {gridSize} grid · {selectedCols.length * selectedCols.length} cells
              </p>
            )}
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="Pair Plot" className="plot-image" />
        ) : (
          <div className="empty-state">
            <div className="empty-pp-icon">
              <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
                {/* 3×3 grid preview */}
                {[0,1,2].map(row => [0,1,2].map(col => {
                  const x = 14 + col * 56, y = 14 + row * 56;
                  const isDiag = row === col;
                  const isLower = row > col;
                  return (
                    <g key={`${row}-${col}`}>
                      <rect x={x} y={y} width="48" height="48" rx="4"
                        fill="#0a1628"
                        stroke={isDiag ? "#00d4ff" : isLower ? "#1e3a5f" : "#152238"}
                        strokeWidth={isDiag ? "1.2" : "0.6"} opacity="0.85" />
                      {isDiag && (
                        /* histogram bars */
                        <>
                          <rect x={x+5}  y={y+32} width="7" height="10" fill="#00d4ff" opacity="0.45" rx="1" />
                          <rect x={x+14} y={y+25} width="7" height="17" fill="#00d4ff" opacity="0.55" rx="1" />
                          <rect x={x+23} y={y+18} width="7" height="24" fill="#00d4ff" opacity="0.65" rx="1" />
                          <rect x={x+32} y={y+26} width="7" height="16" fill="#00d4ff" opacity="0.5"  rx="1" />
                        </>
                      )}
                      {isLower && (
                        /* scatter dots + trend line */
                        <>
                          {([
                            [8,36],[14,29],[20,24],[28,20],[34,16],[40,12],
                            [12,34],[22,26],[30,18],[10,38],[38,14],
                          ] as const).map(([dx,dy], i) => (
                            <circle key={i} cx={x+dx} cy={y+dy} r="2.2"
                              fill="#00d4ff" opacity="0.45" />
                          ))}
                          <line x1={x+6} y1={y+40} x2={x+43} y2={y+10}
                            stroke="#ffaa00" strokeWidth="1.5" opacity="0.6"
                            strokeLinecap="round" />
                        </>
                      )}
                      {!isDiag && !isLower && (
                        /* correlation r text */
                        <text x={x+24} y={y+28} textAnchor="middle"
                          fontSize="11" fill="#7faddb" opacity="0.75"
                          fontFamily="monospace" fontWeight="600">
                          {["0.82","−0.41","0.65"][col - row - 1 + (row > 0 ? 1 : 0)] ?? "0.72"}
                        </text>
                      )}
                    </g>
                  );
                }))}
              </svg>
            </div>
            <p className="placeholder-text">Select columns and generate</p>
            <p className="placeholder-text"
              style={{ fontSize: "0.75rem", marginTop: 2, opacity: 0.55 }}>
              Scatter · KDE · Correlation · Regression
            </p>
          </div>
        )}
        </div>

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
          STATS PANEL — right overlay, does not compress plot
          ══════════════════════════════════════════════════════════ */}
      <div className={`stats-panel ${statsPanelOpen ? "open" : ""}`}>
        <div className="stats-panel-header">
          <h3 className="stats-panel-title">
            <span className="title-icon" aria-hidden="true"><Sigma /></span>
            Statistical Inference
          </h3>
          <button className="stats-close-btn" onClick={() => setStatsPanelOpen(false)} aria-label="Close statistics panel">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="stats-panel-body">
          {!statResults ? (
            <div className="stats-empty">
              <p>No statistics computed yet.</p>
              <p className="stats-hint">Enable categories above and regenerate.</p>
            </div>
          ) : (
            <>
              {/* ── CORRELATION ──────────────────────────────────── */}
              {compCorr && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Unlink2 /></span>
                    Correlation Structure
                  </h4>

                  {/* Heatmap matrix */}
                  {statResults.correlation_matrix &&
                    Object.keys(statResults.correlation_matrix).length > 0 && (() => {
                      const cols = Object.keys(statResults.correlation_matrix);
                      return (
                        <div className="corr-matrix-wrap">
                          <div className="corr-matrix"
                            style={{
                              gridTemplateColumns: `60px repeat(${cols.length}, 46px)`,
                            }}>
                            <div />
                            {cols.map(c => (
                              <div key={c} className="corr-col-label" title={c}>
                                {c.length > 6 ? c.slice(0,5) + "…" : c}
                              </div>
                            ))}
                            {cols.map(row => (
                              <React.Fragment key={row}>
                                <div key={row} className="corr-row-label" title={row}>
                                  {row.length > 6 ? row.slice(0,5) + "…" : row}
                                </div>
                                {cols.map(col => {
                                  const r = statResults.correlation_matrix?.[row]?.[col] ?? 0;
                                  const isDiag = row === col;
                                  return (
                                    <div key={col} className="corr-cell"
                                      style={{
                                        background: isDiag
                                          ? "rgba(0,212,255,0.08)"
                                          : `rgba(${r > 0
                                              ? "0,212,255"
                                              : "255,107,107"},${Math.min(Math.abs(r) * 0.4, 0.4)})`,
                                        color: isDiag ? "#5a7a9e"
                                          : Math.abs(r) >= parseFloat(corrThreshold)
                                            ? "#00d4ff" : "#7faddb",
                                      }}>
                                      {isDiag ? "—" : r.toFixed(2)}
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                  <div className="stat-rows">
                    <StatRow label="Mean |r|"
                      value={fmtN(statResults.mean_abs_corr)}
                      highlight={(statResults.mean_abs_corr ?? 0) > 0.5} />
                    {statResults.strongest_pair && (
                      <>
                        <StatRow label="Strongest pair"
                          value={`${statResults.strongest_pair.var1} × ${statResults.strongest_pair.var2}`}
                          highlight />
                        <StatRow label="r value"
                          value={fmtN(statResults.strongest_pair.r)} />
                      </>
                    )}
                    {statResults.weakest_pair && (
                      <StatRow label="Weakest pair"
                        value={`${statResults.weakest_pair.var1} × ${statResults.weakest_pair.var2} (r=${fmtN(statResults.weakest_pair.r)})`} />
                    )}
                  </div>

                  {statResults.multicollinear_pairs && statResults.multicollinear_pairs.length > 0 && (
                    <>
                      <div className="contrib-section-label">
                        <span className="label-icon" aria-hidden="true"><AlertTriangle /></span>
                        Multicollinear Pairs (|r| ≥ {corrThreshold})
                      </div>
                      <div className="pair-list">
                        {statResults.multicollinear_pairs.map((p, i) => (
                          <div key={i} className="pair-item">
                            <span className="pair-label">{p.var1} × {p.var2}</span>
                            <span className="pair-val strong"
                              style={{ color: rColor(p.r) }}>
                              r={fmtN(p.r)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="stat-note">
                        High |r| pairs may indicate feature redundancy — consider dimensionality reduction.
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── RELATIONSHIPS ────────────────────────────────── */}
              {compRel && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><TrendingUp /></span>
                    Linear Relationships
                  </h4>

                  {statResults.best_linear_pair && (
                    <div className="stat-rows">
                      <StatRow label="Best pair"
                        value={`${statResults.best_linear_pair.var1} → ${statResults.best_linear_pair.var2}`}
                        highlight />
                      <StatRow label="R²"
                        value={fmtN(statResults.best_linear_pair.r_squared)}
                        highlight={(statResults.best_linear_pair.r_squared ?? 0) > 0.5} />
                      <StatRow label="Slope"
                        value={fmtN(statResults.best_linear_pair.slope, 4)} />
                      <StatRow label="p-value"
                        value={fmtN(statResults.best_linear_pair.p_value, 5)} />
                    </div>
                  )}

                  {statResults.linear_pairs && statResults.linear_pairs.length > 1 && (
                    <>
                      <div className="contrib-section-label">All Pairs</div>
                      <div className="pair-list">
                        {statResults.linear_pairs.map((p, i) => (
                          <div key={i} className="pair-item">
                            <span className="pair-label">{p.var1} → {p.var2}</span>
                            <span className="pair-val"
                              style={{ color: p.r_squared >= 0.5 ? "#00d4ff" : "#7faddb" }}>
                              R²={fmtN(p.r_squared, 3)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {statResults.nonlinear_signal && (
                    <div className="stat-note">{statResults.nonlinear_signal}</div>
                  )}
                </div>
              )}

              {/* ── DISTRIBUTION ─────────────────────────────────── */}
              {compDist && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><BarChart3 /></span>
                    Distribution Shape
                  </h4>

                  {statResults.skew_summary
                    ? (
                      <>
                        <div className="stat-rows">
                          {Object.entries(statResults.skew_summary).map(([col, sk]) => (
                            <div key={col}
                              className={`stat-row ${Math.abs(sk) > 1 ? "highlight" : ""}`}>
                              <span className="stat-key">{col}</span>
                              <span className="stat-val">
                                skew={fmtN(sk, 3)}
                                {" "}
                                {statResults.distribution_shapes?.[col]
                                  ? `· ${statResults.distribution_shapes[col]}`
                                  : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                        {statResults.kurtosis_summary && (
                          <>
                            <div className="contrib-section-label">Kurtosis</div>
                            <div className="stat-rows">
                              {Object.entries(statResults.kurtosis_summary).map(([col, k]) => (
                                <div key={col} className="stat-row">
                                  <span className="stat-key">{col}</span>
                                  <span className="stat-val">{fmtN(k, 3)}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        <div className="stat-note">
                          |skew| &gt; 1 highlighted — may warrant transformation before modelling.
                        </div>
                      </>
                    )
                    : (
                      <div className="stat-rows">
                        <StatRow label="No distribution data" value="—" />
                      </div>
                    )
                  }
                </div>
              )}

              {/* ── DIAGNOSTICS ──────────────────────────────────── */}
              {compDiag && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><FlaskConical /></span>
                    Diagnostics
                  </h4>

                  <div className="stat-rows">
                    <StatRow label="Outlier count"
                      value={statResults.outlier_count != null
                        ? `${statResults.outlier_count} rows` : "—"}
                      highlight={(statResults.outlier_count ?? 0) > 0} />
                    <StatRow label="Outlier %"
                      value={statResults.outlier_pct != null
                        ? `${fmtN(statResults.outlier_pct, 2)}%` : "—"} />
                    <StatRow label="Method"
                      value={statResults.outlier_method ?? outlierMethod} />
                  </div>

                  {statResults.heteroscedastic_pairs && statResults.heteroscedastic_pairs.length > 0 && (
                    <>
                      <div className="contrib-section-label">
                        <span className="label-icon" aria-hidden="true"><AlertTriangle /></span>
                        Heteroscedastic Pairs
                      </div>
                      <div className="pair-list">
                        {statResults.heteroscedastic_pairs.map((p, i) => (
                          <div key={i} className="pair-item">
                            <span className="pair-label">{p.var1} × {p.var2}</span>
                            <span className="pair-val warning">
                              BP p={fmtN(p.p_value, 4)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="stat-note">
                        Breusch–Pagan p &lt; 0.05 — variance increases with fitted values.
                        OLS standard errors may be unreliable.
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── SEPARABILITY ─────────────────────────────────── */}
              {compSep && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Target /></span>
                    Class Separability
                  </h4>

                  {!hueField ? (
                    <div className="stat-rows">
                      <StatRow label="Hue not set" value="Set a Hue field to compute" />
                    </div>
                  ) : statResults.class_separability &&
                    Object.keys(statResults.class_separability).length > 0 ? (
                    <>
                      {statResults.best_separator && (
                        <div className="stat-rows">
                          <StatRow label="Best separator"
                            value={statResults.best_separator} highlight />
                        </div>
                      )}
                      <div className="contrib-section-label">
                        Fisher Discriminant Ratio
                      </div>
                      <div className="stat-rows">
                        {Object.entries(statResults.class_separability)
                          .sort(([, a], [, b]) => b - a)
                          .map(([col, score]) => (
                            <div key={col} className="stat-row">
                              <span className="stat-key">{col}</span>
                              <div className="contrib-bar-wrap">
                                <div className="contrib-bar"
                                  style={{
                                    width: `${Math.min(score * 80, 90)}px`,
                                    background: score > 0.5
                                      ? "#00d4ff" : "rgba(0,212,255,0.3)",
                                  }} />
                                <span className="stat-val">{fmtN(score, 3)}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                      <div className="stat-note">
                        Higher ratio = better class separation for that variable.
                        Values &gt; 0.5 indicate good discriminating power.
                      </div>
                    </>
                  ) : (
                    <div className="stat-rows">
                      <StatRow label="No separability data" value="—" />
                    </div>
                  )}
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