"use client";

import { useState, useEffect } from "react";
import { Activity, AlertTriangle, BarChart3, Bell, LineChart, Sigma, TrendingDown, TrendingUp, X } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./JointPlotPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type JointKind = "scatter" | "kde" | "hex" | "reg";
type MarginalKind = "hist" | "kde" | "kde_lines";
type OverplotStrategy = "none" | "alpha" | "hexbin";
type FitOverlay = "none" | "ols" | "lowess";
type CorrelationMethod = "pearson" | "spearman" | "both";
type OutlierMethod = "mahalanobis" | "zscore" | "iqr";
type MarginalStatLine = "mean" | "median" | "q1q3";

interface StatResult {
  pearson_r?: number;
  pearson_p?: number;
  spearman_rho?: number;
  spearman_p?: number;
  r_squared?: number;
  slope?: number;
  intercept?: number;
  std_error?: number;
  equation?: string;
  confidence_interval_lower?: number;
  confidence_interval_upper?: number;
  sample_size?: number;
  significance?: string;
  mse?: number;
  rmse?: number;
  mae?: number;
  outlier_count?: number;
  outlier_method?: string;
  normality_x_stat?: number;
  normality_x_p?: number;
  normality_y_stat?: number;
  normality_y_p?: number;
  normality_test?: string;
  x_mean?: number;
  x_median?: number;
  x_std?: number;
  y_mean?: number;
  y_median?: number;
  y_std?: number;
}

export default function JointPlotPage() {
  const [headers, setHeaders] = useState<string[]>([]);

  const [xField, setXField] = useState("");
  const [yField, setYField] = useState("");
  const [hueField, setHueField] = useState("");

  const [jointKind, setJointKind] = useState<JointKind>("scatter");
  const [jointAlpha, setJointAlpha] = useState("0.6");
  const [jointPointSize, setJointPointSize] = useState("40");
  const [jointPointColor, setJointPointColor] = useState("#00d4ff");
  const [jointMarkerStyle, setJointMarkerStyle] = useState("o");
  const [overplotStrategy, setOverplotStrategy] = useState<OverplotStrategy>("none");
  const [colorPalette, setColorPalette] = useState("tab10");

  const [hexbinGridSize, setHexbinGridSize] = useState("30");
  const [hexbinCountScale, setHexbinCountScale] = useState("linear");

  const [marginalKind, setMarginalKind] = useState<MarginalKind>("hist");
  const [marginalRatio, setMarginalRatio] = useState("5");
  const [marginalTicks, setMarginalTicks] = useState(true);
  const [marginalStatLines, setMarginalStatLines] = useState<MarginalStatLine[]>(["mean"]);
  const [marginalNormalOverlay, setMarginalNormalOverlay] = useState(false);

  const [fitOverlay, setFitOverlay] = useState<FitOverlay>("none");
  const [confidenceBand, setConfidenceBand] = useState(true);
  const [confidenceBandAlpha, setConfidenceBandAlpha] = useState("0.15");
  const [confidenceLevel, setConfidenceLevel] = useState("95");

  const [densityContours, setDensityContours] = useState(false);
  const [densityContourLevels, setDensityContourLevels] = useState("6");

  const [darkTheme, setDarkTheme] = useState(false);
  const [figureSize, setFigureSize] = useState("6");

  // Stats categories
  const [computeCorrelation, setComputeCorrelation] = useState(true);
  const [correlationMethod, setCorrelationMethod] = useState<CorrelationMethod>("pearson");
  const [computeRegression, setComputeRegression] = useState(false);
  const [computeNormality, setComputeNormality] = useState(false);
  const [computeOutliers, setComputeOutliers] = useState(false);
  const [outlierMethod, setOutlierMethod] = useState<OutlierMethod>("mahalanobis");
  const [computeMarginalStats, setComputeMarginalStats] = useState(false);

  // Annotations
  const [pearsonAnnotation, setPearsonAnnotation] = useState(false);
  const [spearmanAnnotation, setSpearmanAnnotation] = useState(false);
  const [sampleSizeAnnotation, setSampleSizeAnnotation] = useState(false);
  const [outlierAnnotation, setOutlierAnnotation] = useState(false);

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [statResults, setStatResults] = useState<StatResult | null>(null);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    if (stored) setHeaders(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!computeCorrelation) {
      setPearsonAnnotation(false);
      setSpearmanAnnotation(false);
    }
  }, [computeCorrelation]);

  useEffect(() => {
    if (!computeOutliers) setOutlierAnnotation(false);
  }, [computeOutliers]);

  const toggleMarginalStatLine = (val: MarginalStatLine) => {
    setMarginalStatLines(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const canShowPearson  = computeCorrelation && (correlationMethod === "pearson"  || correlationMethod === "both");
  const canShowSpearman = computeCorrelation && (correlationMethod === "spearman" || correlationMethod === "both");
  const canShowOutlierAnn  = computeOutliers;
  const canShowSampleSize  = computeCorrelation;

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the joint plot." };
    }
    if (!xField || !yField) {
      return { valid: false, message: "X Field and Y Field are required. Select numeric columns for both axes before generating." };
    }
    if (xField === yField) {
      return { valid: false, message: "X and Y must be different columns. Choose a different column for either X or Y axis." };
    }
    return { valid: true };
  };

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

  const generatePlot = async () => {
    const v = validateConfig();
    if (!v.valid) {
      alert(v.message);
      return;
    }

    setLoading(true);
    setStatResults(null);

    const effectivePearsonAnn  = pearsonAnnotation  && canShowPearson;
    const effectiveSpearmanAnn = spearmanAnnotation && canShowSpearman;
    const effectiveSampleAnn   = sampleSizeAnnotation && canShowSampleSize;
    const effectiveOutlierAnn  = outlierAnnotation  && canShowOutlierAnn;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bivariate/jointplot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          x_column: xField,
          y_column: yField,
          hue_column: hueField || null,
          joint_kind: jointKind,
          joint_alpha: parseFloat(jointAlpha),
          joint_point_size: parseFloat(jointPointSize),
          joint_point_color: jointPointColor,
          joint_marker_style: jointMarkerStyle,
          overplot_strategy: overplotStrategy,
          color_palette: colorPalette,
          hexbin_gridsize: parseInt(hexbinGridSize),
          hexbin_count_scale: hexbinCountScale,
          marginal_kind: marginalKind,
          marginal_ratio: parseInt(marginalRatio),
          marginal_ticks: marginalTicks,
          marginal_stat_lines: marginalStatLines,
          marginal_normal_overlay: marginalNormalOverlay,
          fit_overlay: fitOverlay,
          confidence_band: confidenceBand,
          confidence_band_alpha: parseFloat(confidenceBandAlpha),
          confidence_level: parseFloat(confidenceLevel) / 100,
          density_contours: densityContours,
          density_contour_levels: parseInt(densityContourLevels),
          dark_theme: darkTheme,
          figure_size: parseFloat(figureSize),
          compute_correlation: computeCorrelation,
          correlation_method: correlationMethod,
          compute_regression: computeRegression,
          compute_normality: computeNormality,
          compute_outliers: computeOutliers,
          outlier_method: outlierMethod,
          compute_marginal_stats: computeMarginalStats,
          pearson_annotation:     effectivePearsonAnn,
          spearman_annotation:    effectiveSpearmanAnn,
          sample_size_annotation: effectiveSampleAnn,
          outlier_annotation:     effectiveOutlierAnn,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate plot"));
      }

      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
      if (data.stats) setStatResults(data.stats);
    } catch (err: any) {
      let msg = err?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "Select numeric columns for X and Y axes.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the joint plot.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after filtering. Try selecting columns with fewer missing values or use a different dataset.";
      }
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!plotUrl) return;
    try {
      const response = await fetch(plotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `JointPlot_${xField}_vs_${yField}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { console.error("Download failed"); }
  };

  const fmt = (v: number | undefined, d = 4) =>
    v !== undefined && v !== null ? v.toFixed(d) : "—";

  const sigLabel = (p: number | undefined) => {
    if (p === undefined || p === null) return "—";
    if (p < 0.001) return `${p.toExponential(2)} ***`;
    if (p < 0.01)  return `${p.toFixed(4)} **`;
    if (p < 0.05)  return `${p.toFixed(4)} *`;
    return `${p.toFixed(4)} (ns)`;
  };

  const normalityLabel = (p: number | undefined) => {
    if (p === undefined || p === null) return "—";
    return p < 0.05 ? `${p.toFixed(4)} — Non-normal` : `${p.toFixed(4)} — Normal`;
  };

  const AnnotationToggle = ({
    id, label, checked, onChange, disabled, disabledReason,
  }: {
    id: string; label: string; checked: boolean; onChange: () => void;
    disabled: boolean; disabledReason?: string;
  }) => (
    <div
      className={`checkbox-group annotation-toggle ${disabled ? "disabled" : ""} ${checked && !disabled ? "ann-active" : ""}`}
      title={disabled ? disabledReason : undefined}
    >
      <input type="checkbox" id={id} checked={checked && !disabled} disabled={disabled} onChange={onChange} />
      <label htmlFor={id} style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
        {label}
        {disabled && <span className="ann-disabled-badge"> — {disabledReason}</span>}
      </label>
      {!disabled && <span className={`ann-indicator ${checked ? "on" : "off"}`} />}
    </div>
  );

  return (
    <div className="joint-container">

      {/* BACK BUTTON */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* STATS TOGGLE */}
      {plotUrl && (
        <button
          className={`stats-toggle-btn ${statsPanelOpen ? "active" : ""}`}
          onClick={() => setStatsPanelOpen(!statsPanelOpen)}
        >
          <span className="btn-icon" aria-hidden="true">
            {statsPanelOpen ? <X /> : <Sigma />}
          </span>
          {statsPanelOpen ? "Close Stats" : "Stats"}
        </button>
      )}

      {/* ── CONFIG PANEL ─────────────────────────────────────────────────── */}
      <div className="config-panel">
        <h2 className="panel-title">Joint Plot</h2>
        <p className="panel-subtitle">Bivariate Distribution Analysis</p>

        {/* ── FIELDS ── */}
        <div className="section-label">Fields</div>

        <div className="form-group">
          <label>X Axis <span className="label-badge">Required</span></label>
          <select value={xField} onChange={e => setXField(e.target.value)} className="form-select">
            <option value="">Select field</option>
            {headers.filter(h => h !== yField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Y Axis <span className="label-badge">Required</span></label>
          <select value={yField} onChange={e => setYField(e.target.value)} className="form-select">
            <option value="">Select field</option>
            {headers.filter(h => h !== xField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Hue / Group By</label>
          <select value={hueField} onChange={e => setHueField(e.target.value)} className="form-select">
            <option value="">None</option>
            {headers.filter(h => h !== xField && h !== yField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Colors scatter + marginals by group</span>
        </div>

        {/* ── JOINT PANEL ── */}
        <div className="section-label">Joint Panel</div>

        <div className="form-group">
          <label>Joint Kind</label>
          <div className="segmented-control">
            {(["scatter","kde","hex","reg"] as JointKind[]).map(k => (
              <button key={k} className={`seg-btn ${jointKind === k ? "active" : ""}`} onClick={() => setJointKind(k)}>
                {k === "scatter" ? "Scatter" : k === "kde" ? "KDE" : k === "hex" ? "Hex" : "Reg"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {jointKind === "scatter" && "Raw point cloud"}
            {jointKind === "kde"     && "2D density estimation"}
            {jointKind === "hex"     && "Hexbin density grid"}
            {jointKind === "reg"     && "Regression with CI band"}
          </span>
        </div>

        {jointKind === "scatter" && (
          <>
            <div className="form-group">
              <label>Overplot Strategy</label>
              <div className="segmented-control">
                {(["none","alpha","hexbin"] as OverplotStrategy[]).map(s => (
                  <button key={s} className={`seg-btn ${overplotStrategy === s ? "active" : ""}`} onClick={() => setOverplotStrategy(s)}>
                    {s === "none" ? "None" : s === "alpha" ? "Alpha" : "Hexbin"}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Point Alpha</label>
              <div className="slider-group">
                <input type="range" min="0.05" max="1" step="0.05" value={jointAlpha}
                  onChange={e => setJointAlpha(e.target.value)} className="slider" />
                <span className="slider-value">{jointAlpha}</span>
              </div>
            </div>

            <div className="form-group">
              <label>Point Size</label>
              <div className="slider-group">
                <input type="range" min="5" max="200" step="5" value={jointPointSize}
                  onChange={e => setJointPointSize(e.target.value)} className="slider" />
                <span className="slider-value">{jointPointSize}</span>
              </div>
            </div>

            <div className="form-group">
              <label>Marker Style</label>
              <div className="segmented-control">
                {([
                  ["o","Circle"],
                  ["s","Square"],
                  ["^","Triangle"],
                  ["+","Plus"],
                  ["x","X"],
                  ["D","Diamond"],
                ] as const).map(([v, lbl]) => (
                  <button key={v} className={`seg-btn ${jointMarkerStyle === v ? "active" : ""}`} onClick={() => setJointMarkerStyle(v)}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {!hueField && (
              <div className="form-group">
                <label>Point Color</label>
                <div className="color-input-row">
                  <input type="color" value={jointPointColor}
                    onChange={e => setJointPointColor(e.target.value)} className="color-picker" />
                  <span className="color-hex">{jointPointColor}</span>
                </div>
              </div>
            )}

            {hueField && (
              <div className="form-group">
                <label>Color Palette</label>
                <select value={colorPalette} onChange={e => setColorPalette(e.target.value)} className="form-select">
                  <optgroup label="Categorical">
                    <option value="tab10">Tab10</option>
                    <option value="Set1">Set1</option>
                    <option value="Set2">Set2</option>
                    <option value="Paired">Paired</option>
                    <option value="Dark2">Dark2</option>
                  </optgroup>
                  <optgroup label="Sequential">
                    <option value="viridis">Viridis</option>
                    <option value="plasma">Plasma</option>
                    <option value="inferno">Inferno</option>
                  </optgroup>
                </select>
              </div>
            )}
          </>
        )}

        {(jointKind === "hex" || overplotStrategy === "hexbin") && (
          <>
            <div className="form-group">
              <label>Hexbin Grid Size</label>
              <div className="slider-group">
                <input type="range" min="10" max="80" step="5" value={hexbinGridSize}
                  onChange={e => setHexbinGridSize(e.target.value)} className="slider" />
                <span className="slider-value">{hexbinGridSize}</span>
              </div>
            </div>
            <div className="form-group">
              <label>Count Scale</label>
              <div className="segmented-control">
                <button className={`seg-btn ${hexbinCountScale === "linear" ? "active" : ""}`} onClick={() => setHexbinCountScale("linear")}>Linear</button>
                <button className={`seg-btn ${hexbinCountScale === "log"    ? "active" : ""}`} onClick={() => setHexbinCountScale("log")}>Log</button>
              </div>
            </div>
          </>
        )}

        {/* ── MARGINAL PLOTS ── */}
        <div className="section-label">Marginal Plots</div>

        <div className="form-group">
          <label>Marginal Kind</label>
          <div className="segmented-control">
            {(["hist","kde","kde_lines"] as MarginalKind[]).map(m => (
              <button key={m} className={`seg-btn ${marginalKind === m ? "active" : ""}`} onClick={() => setMarginalKind(m)}>
                {m === "hist" ? "Histogram" : m === "kde" ? "KDE Fill" : "KDE Lines"}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Marginal Ratio</label>
          <div className="slider-group">
            <input type="range" min="3" max="10" step="1" value={marginalRatio}
              onChange={e => setMarginalRatio(e.target.value)} className="slider" />
            <span className="slider-value">{marginalRatio}</span>
          </div>
          <span className="input-hint">Joint:Marginal size ratio</span>
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="ticks-check" checked={marginalTicks}
            onChange={() => setMarginalTicks(!marginalTicks)} />
          <label htmlFor="ticks-check">Marginal Ticks</label>
        </div>

        <div className="form-group">
          <label>Marginal Stat Lines</label>
          <div className="multi-check-row">
            {(["mean","median","q1q3"] as MarginalStatLine[]).map(v => (
              <label key={v} className={`check-chip ${marginalStatLines.includes(v) ? "active" : ""}`}>
                <input type="checkbox" checked={marginalStatLines.includes(v)}
                  onChange={() => toggleMarginalStatLine(v)} />
                {v === "q1q3" ? "Q1/Q3" : v.charAt(0).toUpperCase() + v.slice(1)}
              </label>
            ))}
          </div>
          <span className="input-hint">Drawn as lines on marginals</span>
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="normal-overlay-check" checked={marginalNormalOverlay}
            onChange={() => setMarginalNormalOverlay(!marginalNormalOverlay)} />
          <label htmlFor="normal-overlay-check">Normal Curve Overlay on Marginals</label>
        </div>

        {/* ── FIT & REGRESSION ── */}
        <div className="section-label">Fit & Regression</div>

        <div className="form-group">
          <label>Fit Overlay</label>
          <div className="segmented-control">
            {(["none","ols","lowess"] as FitOverlay[]).map(f => (
              <button key={f} className={`seg-btn ${fitOverlay === f ? "active" : ""}`} onClick={() => setFitOverlay(f)}>
                {f === "none" ? "None" : f === "ols" ? "OLS" : "LOWESS"}
              </button>
            ))}
          </div>
        </div>

        {fitOverlay !== "none" && (
          <>
            <div className="checkbox-group">
              <input type="checkbox" id="ci-band-check" checked={confidenceBand}
                onChange={() => setConfidenceBand(!confidenceBand)} />
              <label htmlFor="ci-band-check">Confidence Band</label>
            </div>

            {confidenceBand && (
              <>
                <div className="form-group nested">
                  <label>Band Alpha</label>
                  <div className="slider-group">
                    <input type="range" min="0.05" max="0.5" step="0.05" value={confidenceBandAlpha}
                      onChange={e => setConfidenceBandAlpha(e.target.value)} className="slider" />
                    <span className="slider-value">{confidenceBandAlpha}</span>
                  </div>
                </div>
                <div className="form-group nested">
                  <label>Confidence Level (%)</label>
                  <div className="slider-group">
                    <input type="range" min="80" max="99" step="1" value={confidenceLevel}
                      onChange={e => setConfidenceLevel(e.target.value)} className="slider" />
                    <span className="slider-value">{confidenceLevel}%</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── DENSITY ── */}
        <div className="section-label">Density</div>

        <div className="checkbox-group">
          <input type="checkbox" id="density-check" checked={densityContours}
            onChange={() => setDensityContours(!densityContours)} />
          <label htmlFor="density-check">2D Density Contours</label>
        </div>

        {densityContours && (
          <div className="form-group nested">
            <label>Contour Levels</label>
            <div className="slider-group">
              <input type="range" min="3" max="15" step="1" value={densityContourLevels}
                onChange={e => setDensityContourLevels(e.target.value)} className="slider" />
              <span className="slider-value">{densityContourLevels}</span>
            </div>
          </div>
        )}

        {/* ── STYLE ── */}
        <div className="section-label">Style</div>

        <div className="form-group">
          <label>Figure Size</label>
          <div className="slider-group">
            <input type="range" min="5" max="10" step="1" value={figureSize}
              onChange={e => setFigureSize(e.target.value)} className="slider" />
            <span className="slider-value">{figureSize}</span>
          </div>
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="dark-check" checked={darkTheme}
            onChange={() => setDarkTheme(!darkTheme)} />
          <label htmlFor="dark-check">Dark Theme</label>
        </div>

        {/* ── STATISTICAL INFERENCE ── */}
        <div className="section-label">Statistical Inference</div>
        <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
          Select categories to compute on generate
        </span>

        <div className="stat-category-cards">
          <label className={`stat-category-card ${computeCorrelation ? "active" : ""}`}>
            <input type="checkbox" checked={computeCorrelation} onChange={() => setComputeCorrelation(!computeCorrelation)} />
            <div className="stat-cat-icon" aria-hidden="true"><BarChart3 /></div>
            <div className="stat-cat-label">Correlation</div>
            <div className="stat-cat-desc">r, ρ, p-value</div>
          </label>
          <label className={`stat-category-card ${computeRegression ? "active" : ""}`}>
            <input type="checkbox" checked={computeRegression} onChange={() => setComputeRegression(!computeRegression)} />
            <div className="stat-cat-icon" aria-hidden="true"><TrendingUp /></div>
            <div className="stat-cat-label">Regression</div>
            <div className="stat-cat-desc">MSE, RMSE, MAE</div>
          </label>
          <label className={`stat-category-card ${computeNormality ? "active" : ""}`}>
            <input type="checkbox" checked={computeNormality} onChange={() => setComputeNormality(!computeNormality)} />
            <div className="stat-cat-icon" aria-hidden="true"><Bell /></div>
            <div className="stat-cat-label">Normality</div>
            <div className="stat-cat-desc">Shapiro-Wilk</div>
          </label>
          <label className={`stat-category-card ${computeOutliers ? "active" : ""}`}>
            <input type="checkbox" checked={computeOutliers} onChange={() => setComputeOutliers(!computeOutliers)} />
            <div className="stat-cat-icon" aria-hidden="true"><AlertTriangle /></div>
            <div className="stat-cat-label">Outliers</div>
            <div className="stat-cat-desc">Mahalanobis</div>
          </label>
          <label className={`stat-category-card ${computeMarginalStats ? "active" : ""}`}>
            <input type="checkbox" checked={computeMarginalStats} onChange={() => setComputeMarginalStats(!computeMarginalStats)} />
            <div className="stat-cat-icon" aria-hidden="true"><TrendingDown /></div>
            <div className="stat-cat-label">Marginal</div>
            <div className="stat-cat-desc">μ, σ, median</div>
          </label>
        </div>

        {computeCorrelation && (
          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Correlation Method</label>
            <div className="segmented-control">
              {(["pearson","spearman","both"] as CorrelationMethod[]).map(m => (
                <button key={m} className={`seg-btn ${correlationMethod === m ? "active" : ""}`} onClick={() => setCorrelationMethod(m)}>
                  {m === "pearson" ? "Pearson" : m === "spearman" ? "Spearman" : "Both"}
                </button>
              ))}
            </div>
          </div>
        )}

        {computeOutliers && (
          <div className="form-group nested">
            <label>Outlier Method</label>
            <div className="segmented-control">
              {(["mahalanobis","zscore","iqr"] as OutlierMethod[]).map(m => (
                <button key={m} className={`seg-btn ${outlierMethod === m ? "active" : ""}`} onClick={() => setOutlierMethod(m)}>
                  {m === "mahalanobis" ? "Mahalanobis" : m === "zscore" ? "Z-Score" : "IQR"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── PLOT ANNOTATIONS ── */}
        <div className="section-label">Plot Annotations</div>
        <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
          Text boxes rendered directly on the plot image
        </span>

        <div className="ann-preview-bar">
          <span className="ann-preview-label">Will render:</span>
          <span className={`ann-tag ${pearsonAnnotation  && canShowPearson    ? "on" : "off"}`}>r</span>
          <span className={`ann-tag ${spearmanAnnotation && canShowSpearman   ? "on" : "off"}`}>ρ</span>
          <span className={`ann-tag ${sampleSizeAnnotation && canShowSampleSize ? "on" : "off"}`}>n=</span>
          <span className={`ann-tag ${outlierAnnotation  && canShowOutlierAnn ? "on" : "off"}`}>outliers</span>
        </div>

        <AnnotationToggle id="pearson-ann"  label="Pearson r + p-value box"
          checked={pearsonAnnotation}  onChange={() => setPearsonAnnotation(v  => !v)}
          disabled={!canShowPearson}
          disabledReason={!computeCorrelation ? "Enable Correlation" : "Set method to Pearson or Both"} />

        <AnnotationToggle id="spearman-ann" label="Spearman ρ annotation"
          checked={spearmanAnnotation} onChange={() => setSpearmanAnnotation(v => !v)}
          disabled={!canShowSpearman}
          disabledReason={!computeCorrelation ? "Enable Correlation" : "Set method to Spearman or Both"} />

        <AnnotationToggle id="n-ann" label="Sample size (n=)"
          checked={sampleSizeAnnotation} onChange={() => setSampleSizeAnnotation(v => !v)}
          disabled={!canShowSampleSize} disabledReason="Enable Correlation or Regression" />

        <AnnotationToggle id="outlier-ann" label="Flag outlier points"
          checked={outlierAnnotation} onChange={() => setOutlierAnnotation(v => !v)}
          disabled={!canShowOutlierAnn} disabledReason="Enable Outlier Detection" />

        <button onClick={generatePlot} className="generate-button"
          disabled={loading || !xField || !yField}>
          {loading ? "Generating..." : "Generate Plot"}
        </button>
      </div>

      {/* ── PLOT AREA ─────────────────────────────────────────────────────── */}
      <div className="plot-area">
        {loading ? (
          <div className="plot-area-center">
            <div className="loading-state">
              <div className="joint-loader">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="dot" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p className="placeholder-text">Rendering joint plot...</p>
            </div>
          </div>
        ) : plotUrl ? (
          <img
            src={plotUrl}
            alt="Joint Plot"
            className="plot-image"
            style={{ width: `${parseFloat(figureSize) * 96}px`, maxWidth: '100%' }}
          />
        ) : (
          <div className="plot-area-center">
          <div className="empty-state">
            <div className="empty-joint-icon">
              <svg width="110" height="110" viewBox="0 0 130 130" fill="none">
                <rect x="25" y="5"   width="80" height="18" rx="3" fill="#00d4ff" opacity="0.12"/>
                <path d="M30 23 Q45 8 55 16 Q65 24 75 10 Q85 5 100 14" stroke="#00d4ff" strokeWidth="1.5" fill="none" opacity="0.4"/>
                <rect x="107" y="25" width="18" height="80" rx="3" fill="#00d4ff" opacity="0.12"/>
                <path d="M107 30 Q119 45 112 55 Q105 65 118 75 Q125 85 113 100" stroke="#00d4ff" strokeWidth="1.5" fill="none" opacity="0.4"/>
                <rect x="25" y="25"  width="80" height="80" rx="4" fill="#00d4ff" opacity="0.04" stroke="#00d4ff" strokeWidth="0.5" strokeOpacity="0.2"/>
                <circle cx="40" cy="95" r="3"   fill="#00d4ff" opacity="0.35"/>
                <circle cx="55" cy="80" r="3.5" fill="#00d4ff" opacity="0.45"/>
                <circle cx="50" cy="65" r="2.5" fill="#00d4ff" opacity="0.3"/>
                <circle cx="70" cy="70" r="3"   fill="#00d4ff" opacity="0.5"/>
                <circle cx="80" cy="50" r="3"   fill="#00d4ff" opacity="0.4"/>
                <circle cx="90" cy="38" r="4"   fill="#00d4ff" opacity="0.35"/>
                <circle cx="65" cy="85" r="2"   fill="#00d4ff" opacity="0.25"/>
                <circle cx="75" cy="60" r="3.5" fill="#00d4ff" opacity="0.4"/>
                <line x1="35" y1="100" x2="100" y2="32" stroke="#00d4ff" strokeWidth="1" strokeDasharray="4 3" opacity="0.25"/>
              </svg>
            </div>
            <p className="placeholder-text">Configure fields and generate</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
              Joint distribution · Marginals · Regression · Correlation
            </p>
          </div>
          </div>
        )}

        <button className="download-btn" onClick={handleDownload} disabled={!plotUrl || loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PNG
        </button>
      </div>

      {/* ── STATS PANEL ───────────────────────────────────────────────────── */}
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
              <p>No stats computed yet.</p>
              <p className="stats-hint">Enable stat categories and regenerate.</p>
            </div>
          ) : (
            <>
              {computeCorrelation && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><BarChart3 /></span> Correlation</h4>
                  <div className="stat-rows">
                    {(correlationMethod === "pearson" || correlationMethod === "both") && (
                      <>
                        <StatRow label="Pearson r" value={fmt(statResults.pearson_r, 4)}
                          highlight={Math.abs(statResults.pearson_r ?? 0) > 0.7} />
                        <StatRow label="p-value (Pearson)" value={sigLabel(statResults.pearson_p)}
                          highlight={(statResults.pearson_p ?? 1) < 0.05} />
                      </>
                    )}
                    {(correlationMethod === "spearman" || correlationMethod === "both") && (
                      <>
                        <StatRow label="Spearman ρ" value={fmt(statResults.spearman_rho, 4)}
                          highlight={Math.abs(statResults.spearman_rho ?? 0) > 0.7} />
                        <StatRow label="p-value (Spearman)" value={sigLabel(statResults.spearman_p)}
                          highlight={(statResults.spearman_p ?? 1) < 0.05} />
                      </>
                    )}
                    <StatRow label="Sample Size (n)" value={String(statResults.sample_size ?? "—")} />
                  </div>
                </div>
              )}

              {computeRegression && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><TrendingUp /></span> Regression & Error</h4>
                  <div className="stat-rows">
                    <StatRow label="R²"        value={fmt(statResults.r_squared, 4)} />
                    <StatRow label="Slope"     value={fmt(statResults.slope, 4)} />
                    <StatRow label="Intercept" value={fmt(statResults.intercept, 4)} />
                    <StatRow label="Std Error" value={fmt(statResults.std_error, 4)} />
                    {statResults.equation && (
                      <div className="stat-equation">
                        <span className="stat-eq-label">Equation</span>
                        <code className="stat-eq-value">{statResults.equation}</code>
                      </div>
                    )}
                    {statResults.confidence_interval_lower !== undefined && (
                      <StatRow label={`${confidenceLevel}% CI (slope)`}
                        value={`[${fmt(statResults.confidence_interval_lower, 3)}, ${fmt(statResults.confidence_interval_upper, 3)}]`} />
                    )}
                    <StatRow label="MSE"  value={fmt(statResults.mse,  4)} />
                    <StatRow label="RMSE" value={fmt(statResults.rmse, 4)} />
                    <StatRow label="MAE"  value={fmt(statResults.mae,  4)} />
                  </div>
                </div>
              )}

              {computeNormality && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><Bell /></span> Normality ({statResults.normality_test ?? "Shapiro-Wilk"})</h4>
                  <div className="stat-rows">
                    <StatRow label={`${xField} — stat`}    value={fmt(statResults.normality_x_stat, 4)} />
                    <StatRow label={`${xField} — p-value`} value={normalityLabel(statResults.normality_x_p)}
                      highlight={(statResults.normality_x_p ?? 1) < 0.05} />
                    <StatRow label={`${yField} — stat`}    value={fmt(statResults.normality_y_stat, 4)} />
                    <StatRow label={`${yField} — p-value`} value={normalityLabel(statResults.normality_y_p)}
                      highlight={(statResults.normality_y_p ?? 1) < 0.05} />
                  </div>
                  <div className="stat-note">
                    <span className="note-icon" aria-hidden="true">
                      {((statResults.normality_x_p ?? 1) < 0.05 || (statResults.normality_y_p ?? 1) < 0.05)
                        ? <AlertTriangle />
                        : <BarChart3 />}
                    </span>
                    {((statResults.normality_x_p ?? 1) < 0.05 || (statResults.normality_y_p ?? 1) < 0.05)
                      ? "Non-normal — prefer Spearman ρ over Pearson r"
                      : "Both distributions appear normal — Pearson r is appropriate"}
                  </div>
                </div>
              )}

              {computeOutliers && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><AlertTriangle /></span> Outlier Detection ({outlierMethod})</h4>
                  <div className="stat-rows">
                    <StatRow label="Outlier Count" value={String(statResults.outlier_count ?? "—")}
                      highlight={(statResults.outlier_count ?? 0) > 0} />
                    <StatRow label="Method" value={statResults.outlier_method ?? outlierMethod} />
                  </div>
                </div>
              )}

              {computeMarginalStats && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><TrendingDown /></span> Marginal Descriptives</h4>
                  <div className="stat-rows">
                    <StatRow label={`${xField} — Mean`}   value={fmt(statResults.x_mean,   4)} />
                    <StatRow label={`${xField} — Median`} value={fmt(statResults.x_median, 4)} />
                    <StatRow label={`${xField} — Std`}    value={fmt(statResults.x_std,    4)} />
                    <StatRow label={`${yField} — Mean`}   value={fmt(statResults.y_mean,   4)} />
                    <StatRow label={`${yField} — Median`} value={fmt(statResults.y_median, 4)} />
                    <StatRow label={`${yField} — Std`}    value={fmt(statResults.y_std,    4)} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {statsPanelOpen && (
        <div className="stats-backdrop" onClick={() => setStatsPanelOpen(false)} />
      )}
    </div>
  );
}

function StatRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`stat-row ${highlight ? "highlight" : ""}`}>
      <span className="stat-key">{label}</span>
      <span className="stat-val">{value}</span>
    </div>
  );
}