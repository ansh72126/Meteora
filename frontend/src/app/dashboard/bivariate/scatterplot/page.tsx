"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, BarChart3, Sigma, TrendingUp, X } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./ScatterPlotPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type OverplotStrategy = "none" | "alpha" | "jitter" | "hexbin" | "2d_hist";
type FitModel = "linear" | "polynomial" | "lowess" | "none";
type CorrelationMethod = "pearson" | "spearman" | "kendall";
type OutlierMethod = "iqr" | "zscore";

interface StatResult {
  correlation_coefficient?: number;
  correlation_method?: string;
  r_squared?: number;
  p_value?: number;
  slope?: number;
  intercept?: number;
  equation?: string;
  confidence_interval_lower?: number;
  confidence_interval_upper?: number;
  mse?: number;
  rmse?: number;
  mae?: number;
  outlier_count?: number;
  outlier_threshold?: number;
  total_points?: number;
  x_range?: [number, number];
  y_range?: [number, number];
}

export default function ScatterPlotPage() {
  // Column state — single flat list
  const [headers, setHeaders] = useState<string[]>([]);

  // Required fields
  const [xField, setXField] = useState("");
  const [yField, setYField] = useState("");

  // Optional fields
  const [seriesField, setSeriesField] = useState("");
  const [sizeField, setSizeField] = useState("");

  // Overplot strategy
  const [overplotStrategy, setOverplotStrategy] = useState<OverplotStrategy>("none");
  const [alphaValue, setAlphaValue] = useState("0.6");
  const [jitterAmount, setJitterAmount] = useState("0.1");
  const [hexbinGridSize, setHexbinGridSize] = useState("30");

  // Visuals
  const [pointSize, setPointSize] = useState("50");
  const [pointShape, setPointShape] = useState("circle");
  const [colorPalette, setColorPalette] = useState("tab10");
  const [darkTheme, setDarkTheme] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  // Axis
  const [xAxisAuto, setXAxisAuto] = useState(true);
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [yAxisAuto, setYAxisAuto] = useState(true);
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");

  // Facet
  const [facetField, setFacetField] = useState("");
  const [facetCols, setFacetCols] = useState("2");
  const [sharedAxes, setSharedAxes] = useState(true);

  // Fit overlay
  const [showFit, setShowFit] = useState(false);
  const [fitModel, setFitModel] = useState<FitModel>("linear");
  const [polyDegree, setPolyDegree] = useState("2");
  const [showConfidenceBand, setShowConfidenceBand] = useState(true);
  const [confidenceLevel, setConfidenceLevel] = useState("95");

  // Stats categories
  const [computeCore, setComputeCore] = useState(true);
  const [computeErrors, setComputeErrors] = useState(false);
  const [computeDistribution, setComputeDistribution] = useState(false);

  // Correlation & outlier config
  const [correlationMethod, setCorrelationMethod] = useState<CorrelationMethod>("pearson");
  const [outlierMethod, setOutlierMethod] = useState<OutlierMethod>("iqr");
  const [showKDE2D, setShowKDE2D] = useState(false);

  // Plot state
  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [statResults, setStatResults] = useState<StatResult | null>(null);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  // ── Load headers ───────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    if (stored) setHeaders(JSON.parse(stored));
  }, []);

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the scatter plot." };
    }
    if (!xField || !yField) {
      return { valid: false, message: "X Field and Y Field are required. Select numeric columns for both axes before generating." };
    }
    if (xField === yField) {
      return { valid: false, message: "X and Y must be different columns. Choose a different column for either X or Y axis." };
    }
    if (sizeField && (sizeField === xField || sizeField === yField)) {
      return { valid: false, message: "Bubble Size field must differ from X and Y. Choose a separate numeric column for bubble size or deselect it." };
    }
    if (!xAxisAuto && xMin !== "" && xMax !== "") {
      const lo = parseFloat(xMin);
      const hi = parseFloat(xMax);
      if (!isNaN(lo) && !isNaN(hi) && lo >= hi) {
        return { valid: false, message: "X Min must be less than X Max when using manual axis range. Adjust the values." };
      }
    }
    if (!yAxisAuto && yMin !== "" && yMax !== "") {
      const lo = parseFloat(yMin);
      const hi = parseFloat(yMax);
      if (!isNaN(lo) && !isNaN(hi) && lo >= hi) {
        return { valid: false, message: "Y Min must be less than Y Max when using manual axis range. Adjust the values." };
      }
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

  // ── Generate Plot ──────────────────────────────────────────────────────────
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bivariate/scatterplot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          x_column: xField,
          y_column: yField,
          series_column: seriesField || null,
          size_column: sizeField || null,
          overplot_strategy: overplotStrategy,
          alpha: parseFloat(alphaValue),
          jitter_amount: parseFloat(jitterAmount),
          hexbin_grid_size: parseInt(hexbinGridSize),
          point_size: parseFloat(pointSize),
          point_shape: pointShape,
          color_palette: colorPalette,
          dark_theme: darkTheme,
          show_grid: showGrid,
          x_min: !xAxisAuto && xMin ? parseFloat(xMin) : null,
          x_max: !xAxisAuto && xMax ? parseFloat(xMax) : null,
          y_min: !yAxisAuto && yMin ? parseFloat(yMin) : null,
          y_max: !yAxisAuto && yMax ? parseFloat(yMax) : null,
          x_label: xLabel || null,
          y_label: yLabel || null,
          facet_column: facetField || null,
          facet_cols: parseInt(facetCols),
          shared_axes: sharedAxes,
          show_fit: showFit,
          fit_model: fitModel,
          poly_degree: parseInt(polyDegree),
          show_confidence_band: showConfidenceBand,
          confidence_level: parseFloat(confidenceLevel) / 100,
          compute_core_stats: computeCore,
          compute_error_metrics: computeErrors,
          compute_distribution_stats: computeDistribution,
          correlation_method: correlationMethod,
          outlier_method: outlierMethod,
          show_kde_2d: showKDE2D,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate plot"));
      }

      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
      if (data.stats) { setStatResults(data.stats); }
    } catch (err: any) {
      let msg = err?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "Select numeric columns for X and Y axes; if using Bubble Size, select a numeric column for it.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the scatter plot.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after filtering. Try selecting columns with fewer missing values or use a different dataset.";
      }
      alert(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!plotUrl) return;
    try {
      const response = await fetch(plotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ScatterPlot_${xField}_vs_${yField}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { console.error("Download failed"); }
  };

  // ── Stat helpers ───────────────────────────────────────────────────────────
  const formatStat = (val: number | undefined, decimals = 4) =>
    val !== undefined && val !== null ? val.toFixed(decimals) : "—";

  const pValueLabel = (p: number | undefined) => {
    if (p === undefined || p === null) return "—";
    if (p < 0.001) return `${p.toExponential(2)} ***`;
    if (p < 0.01)  return `${p.toFixed(4)} **`;
    if (p < 0.05)  return `${p.toFixed(4)} *`;
    return `${p.toFixed(4)} (ns)`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="scatter-container">

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

      {/* CONFIG PANEL */}
      <div className="config-panel">
        <h2 className="panel-title">Scatter Plot</h2>

        {/* ── FIELDS ── */}
        <div className="section-label">Fields</div>

        <div className="form-group">
          <label>X Axis <span className="label-badge">Required</span></label>
          <select value={xField} onChange={(e) => setXField(e.target.value)} className="form-select">
            <option value="">Select field</option>
            {headers.filter(h => h !== yField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Y Axis <span className="label-badge">Required</span></label>
          <select value={yField} onChange={(e) => setYField(e.target.value)} className="form-select">
            <option value="">Select field</option>
            {headers.filter(h => h !== xField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Color / Group By</label>
          <select value={seriesField} onChange={(e) => setSeriesField(e.target.value)} className="form-select">
            <option value="">None (single series)</option>
            {headers.filter(h => h !== xField && h !== yField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Colors points by group</span>
        </div>

        <div className="form-group">
          <label>Bubble Size Field</label>
          <select value={sizeField} onChange={(e) => setSizeField(e.target.value)} className="form-select">
            <option value="">None (uniform size)</option>
            {headers.filter(h => h !== xField && h !== yField && h !== seriesField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Maps values to point radius</span>
        </div>

        {/* ── OVERPLOT STRATEGY ── */}
        <div className="section-label">Overplot Strategy</div>
        <div className="form-group">
          <div className="segmented-control">
            {(["none","alpha","jitter","hexbin","2d_hist"] as OverplotStrategy[]).map(s => (
              <button key={s} className={`seg-btn ${overplotStrategy === s ? "active" : ""}`} onClick={() => setOverplotStrategy(s)}>
                {s === "none" ? "None" : s === "alpha" ? "Alpha" : s === "jitter" ? "Jitter" : s === "hexbin" ? "Hexbin" : "2D Hist"}
              </button>
            ))}
          </div>
        </div>

        {overplotStrategy === "alpha" && (
          <div className="form-group nested">
            <label>Opacity</label>
            <div className="slider-group">
              <input type="range" min="0.05" max="1" step="0.05" value={alphaValue} onChange={(e) => setAlphaValue(e.target.value)} className="slider" />
              <span className="slider-value">{alphaValue}</span>
            </div>
          </div>
        )}
        {overplotStrategy === "jitter" && (
          <div className="form-group nested">
            <label>Jitter Amount</label>
            <div className="slider-group">
              <input type="range" min="0.01" max="0.5" step="0.01" value={jitterAmount} onChange={(e) => setJitterAmount(e.target.value)} className="slider" />
              <span className="slider-value">{jitterAmount}</span>
            </div>
          </div>
        )}
        {overplotStrategy === "hexbin" && (
          <div className="form-group nested">
            <label>Grid Size</label>
            <input type="number" min="10" max="100" step="5" value={hexbinGridSize} onChange={(e) => setHexbinGridSize(e.target.value)} className="form-input" />
          </div>
        )}

        {/* ── POINT STYLE ── */}
        <div className="section-label">Point Style</div>

        <div className="form-group">
          <label>Point Size</label>
          <div className="slider-group">
            <input type="range" min="10" max="200" step="10" value={pointSize} onChange={(e) => setPointSize(e.target.value)} className="slider" />
            <span className="slider-value">{pointSize}</span>
          </div>
        </div>

        <div className="form-group">
          <label>Point Shape</label>
          <select value={pointShape} onChange={(e) => setPointShape(e.target.value)} className="form-select">
            <option value="circle">● Circle</option>
            <option value="square">■ Square</option>
            <option value="diamond">◆ Diamond</option>
            <option value="triangle">▲ Triangle</option>
            <option value="plus">+ Plus</option>
            <option value="cross">× Cross</option>
          </select>
        </div>

        <div className="form-group">
          <label>Color Palette</label>
          <select value={colorPalette} onChange={(e) => setColorPalette(e.target.value)} className="form-select">
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
              <option value="magma">Magma</option>
              <option value="cividis">Cividis</option>
            </optgroup>
          </select>
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="grid-check" checked={showGrid} onChange={() => setShowGrid(!showGrid)} />
          <label htmlFor="grid-check">Show Grid</label>
        </div>
        <div className="checkbox-group">
          <input type="checkbox" id="dark-check" checked={darkTheme} onChange={() => setDarkTheme(!darkTheme)} />
          <label htmlFor="dark-check">Dark Theme</label>
        </div>

        {/* ── AXIS LIMITS & LABELS ── */}
        <div className="section-label">Axis Limits & Labels</div>

        <div className="form-group">
          <label>X Axis Label</label>
          <input type="text" value={xLabel} onChange={(e) => setXLabel(e.target.value)} placeholder={xField || "Auto from field name"} className="form-input" />
        </div>
        <div className="form-group">
          <label>Y Axis Label</label>
          <input type="text" value={yLabel} onChange={(e) => setYLabel(e.target.value)} placeholder={yField || "Auto from field name"} className="form-input" />
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="xauto-check" checked={xAxisAuto} onChange={() => setXAxisAuto(!xAxisAuto)} />
          <label htmlFor="xauto-check">X Axis Auto Range</label>
        </div>
        {!xAxisAuto && (
          <div className="form-group nested">
            <div className="dual-input">
              <div className="input-wrapper">
                <span className="mini-label">X Min</span>
                <input type="number" value={xMin} onChange={(e) => setXMin(e.target.value)} className="form-input-small" placeholder="0" />
              </div>
              <div className="input-wrapper">
                <span className="mini-label">X Max</span>
                <input type="number" value={xMax} onChange={(e) => setXMax(e.target.value)} className="form-input-small" placeholder="100" />
              </div>
            </div>
          </div>
        )}

        <div className="checkbox-group">
          <input type="checkbox" id="yauto-check" checked={yAxisAuto} onChange={() => setYAxisAuto(!yAxisAuto)} />
          <label htmlFor="yauto-check">Y Axis Auto Range</label>
        </div>
        {!yAxisAuto && (
          <div className="form-group nested">
            <div className="dual-input">
              <div className="input-wrapper">
                <span className="mini-label">Y Min</span>
                <input type="number" value={yMin} onChange={(e) => setYMin(e.target.value)} className="form-input-small" placeholder="0" />
              </div>
              <div className="input-wrapper">
                <span className="mini-label">Y Max</span>
                <input type="number" value={yMax} onChange={(e) => setYMax(e.target.value)} className="form-input-small" placeholder="100" />
              </div>
            </div>
          </div>
        )}

        {/* ── PANEL FACET ── */}
        <div className="section-label">Panel Facet</div>
        <div className="form-group">
          <label>Facet By</label>
          <select value={facetField} onChange={(e) => setFacetField(e.target.value)} className="form-select">
            <option value="">None</option>
            {headers.filter(h => h !== xField && h !== yField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Creates small multiples per group</span>
        </div>
        {facetField && (
          <>
            <div className="form-group nested">
              <label>Columns Per Row</label>
              <input type="number" min="1" max="6" value={facetCols} onChange={(e) => setFacetCols(e.target.value)} className="form-input" />
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="shared-check" checked={sharedAxes} onChange={() => setSharedAxes(!sharedAxes)} />
              <label htmlFor="shared-check">Shared Axes Across Panels</label>
            </div>
          </>
        )}

        {/* ── FIT OVERLAY ── */}
        <div className="section-label">Fit Overlay</div>
        <div className="checkbox-group">
          <input type="checkbox" id="fit-check" checked={showFit} onChange={() => setShowFit(!showFit)} />
          <label htmlFor="fit-check">Show Regression Fit</label>
        </div>
        {showFit && (
          <>
            <div className="form-group nested">
              <label>Fit Model</label>
              <div className="segmented-control">
                {(["linear","polynomial","lowess"] as FitModel[]).map(m => (
                  <button key={m} className={`seg-btn ${fitModel === m ? "active" : ""}`} onClick={() => setFitModel(m)}>
                    {m === "linear" ? "Linear" : m === "polynomial" ? "Polynomial" : "LOWESS"}
                  </button>
                ))}
              </div>
            </div>
            {fitModel === "polynomial" && (
              <div className="form-group nested">
                <label>Polynomial Degree</label>
                <input type="number" min="2" max="6" value={polyDegree} onChange={(e) => setPolyDegree(e.target.value)} className="form-input" />
              </div>
            )}
            <div className="checkbox-group">
              <input type="checkbox" id="ci-check" checked={showConfidenceBand} onChange={() => setShowConfidenceBand(!showConfidenceBand)} />
              <label htmlFor="ci-check">Confidence Band</label>
            </div>
            {showConfidenceBand && (
              <div className="form-group nested">
                <label>Confidence Level (%)</label>
                <div className="slider-group">
                  <input type="range" min="80" max="99" step="1" value={confidenceLevel} onChange={(e) => setConfidenceLevel(e.target.value)} className="slider" />
                  <span className="slider-value">{confidenceLevel}%</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── STATISTICAL INFERENCE ── */}
        <div className="section-label">Statistical Inference</div>
        <span className="input-hint" style={{ marginBottom: 8, display: "block" }}>Select categories to compute on generate</span>

        <div className="stat-category-cards">
          <label className={`stat-category-card ${computeCore ? "active" : ""}`}>
            <input type="checkbox" checked={computeCore} onChange={() => setComputeCore(!computeCore)} />
            <div className="stat-cat-icon" aria-hidden="true"><BarChart3 /></div>
            <div className="stat-cat-label">Core Stats</div>
            <div className="stat-cat-desc">r, R², p-value, CI</div>
          </label>
          <label className={`stat-category-card ${computeErrors ? "active" : ""}`}>
            <input type="checkbox" checked={computeErrors} onChange={() => setComputeErrors(!computeErrors)} />
            <div className="stat-cat-icon" aria-hidden="true"><TrendingUp /></div>
            <div className="stat-cat-label">Error Metrics</div>
            <div className="stat-cat-desc">MSE, RMSE, MAE</div>
          </label>
          <label className={`stat-category-card ${computeDistribution ? "active" : ""}`}>
            <input type="checkbox" checked={computeDistribution} onChange={() => setComputeDistribution(!computeDistribution)} />
            <div className="stat-cat-icon" aria-hidden="true"><AlertTriangle /></div>
            <div className="stat-cat-label">Distribution</div>
            <div className="stat-cat-desc">Outliers, KDE</div>
          </label>
        </div>

        {computeCore && (
          <div className="form-group" style={{ marginTop: 10 }}>
            <label>Correlation Method</label>
            <div className="segmented-control">
              {(["pearson","spearman","kendall"] as CorrelationMethod[]).map(m => (
                <button key={m} className={`seg-btn ${correlationMethod === m ? "active" : ""}`} onClick={() => setCorrelationMethod(m)}>
                  {m === "pearson" ? "Pearson" : m === "spearman" ? "Spearman" : "Kendall"}
                </button>
              ))}
            </div>
          </div>
        )}

        {computeDistribution && (
          <>
            <div className="form-group nested">
              <label>Outlier Detection</label>
              <div className="segmented-control">
                <button className={`seg-btn ${outlierMethod === "iqr" ? "active" : ""}`} onClick={() => setOutlierMethod("iqr")}>IQR (1.5×)</button>
                <button className={`seg-btn ${outlierMethod === "zscore" ? "active" : ""}`} onClick={() => setOutlierMethod("zscore")}>Z-Score (|z|&gt;3)</button>
              </div>
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="kde2d-check" checked={showKDE2D} onChange={() => setShowKDE2D(!showKDE2D)} />
              <label htmlFor="kde2d-check">Overlay 2D KDE Density</label>
            </div>
          </>
        )}

        <button onClick={generatePlot} className="generate-button" disabled={loading || !xField || !yField}>
          {loading ? "Generating..." : "Generate Plot"}
        </button>
      </div>

      {/* PLOT AREA */}
      <div className="plot-area">
        {loading ? (
          <div className="loading-state">
            <div className="scatter-loader">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="dot" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <p className="placeholder-text">Rendering plot...</p>
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="Scatter Plot" className="plot-image" />
        ) : (
          <div className="empty-state">
            <div className="empty-scatter-icon">
              <svg width="100" height="100" viewBox="0 0 120 120" fill="none">
                <circle cx="30" cy="90" r="5" fill="#00d4ff" opacity="0.3" />
                <circle cx="50" cy="70" r="4" fill="#00d4ff" opacity="0.4" />
                <circle cx="45" cy="50" r="6" fill="#00d4ff" opacity="0.3" />
                <circle cx="70" cy="55" r="5" fill="#00d4ff" opacity="0.5" />
                <circle cx="80" cy="35" r="4" fill="#00d4ff" opacity="0.4" />
                <circle cx="90" cy="25" r="7" fill="#00d4ff" opacity="0.35" />
                <circle cx="60" cy="75" r="3" fill="#00d4ff" opacity="0.25" />
                <circle cx="75" cy="60" r="5" fill="#00d4ff" opacity="0.4" />
                <line x1="25" y1="100" x2="100" y2="20" stroke="#00d4ff" strokeWidth="1" strokeDasharray="4 4" opacity="0.2" />
              </svg>
            </div>
            <p className="placeholder-text">Configure fields and generate</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
              Correlation · Regression · Distribution — all in one view
            </p>
          </div>
        )}

        <button className="download-btn" onClick={handleDownload} disabled={!plotUrl || loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PNG
        </button>
      </div>

      {/* STATS PANEL */}
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
              {computeCore && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><BarChart3 /></span> Core Statistical Inference</h4>
                  <div className="stat-rows">
                    <StatRow label={`Correlation (${correlationMethod === "pearson" ? "r" : correlationMethod === "spearman" ? "ρ" : "τ"})`} value={formatStat(statResults.correlation_coefficient, 4)} highlight={Math.abs(statResults.correlation_coefficient ?? 0) > 0.7} />
                    <StatRow label="R² (Explained Variance)" value={formatStat(statResults.r_squared, 4)} />
                    <StatRow label="p-value" value={pValueLabel(statResults.p_value)} highlight={(statResults.p_value ?? 1) < 0.05} />
                    {statResults.slope !== undefined && <StatRow label="Slope" value={formatStat(statResults.slope, 4)} />}
                    {statResults.intercept !== undefined && <StatRow label="Intercept" value={formatStat(statResults.intercept, 4)} />}
                    {statResults.equation && (
                      <div className="stat-equation">
                        <span className="stat-eq-label">Equation</span>
                        <code className="stat-eq-value">{statResults.equation}</code>
                      </div>
                    )}
                    {statResults.confidence_interval_lower !== undefined && (
                      <StatRow label={`${confidenceLevel}% CI`} value={`[${formatStat(statResults.confidence_interval_lower, 3)}, ${formatStat(statResults.confidence_interval_upper, 3)}]`} />
                    )}
                  </div>
                </div>
              )}
              {computeErrors && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><TrendingUp /></span> Model Error Metrics</h4>
                  <div className="stat-rows">
                    <StatRow label="MSE"  value={formatStat(statResults.mse,  4)} />
                    <StatRow label="RMSE" value={formatStat(statResults.rmse, 4)} />
                    <StatRow label="MAE"  value={formatStat(statResults.mae,  4)} />
                  </div>
                </div>
              )}
              {computeDistribution && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><AlertTriangle /></span> Distribution & Robustness</h4>
                  <div className="stat-rows">
                    <StatRow label="Total Points" value={String(statResults.total_points ?? "—")} />
                    <StatRow label={`Outliers (${outlierMethod.toUpperCase()})`} value={String(statResults.outlier_count ?? "—")} highlight={(statResults.outlier_count ?? 0) > 0} />
                    <StatRow label="Outlier Threshold" value={formatStat(statResults.outlier_threshold, 4)} />
                    {statResults.x_range && <StatRow label="X Range" value={`[${statResults.x_range[0].toFixed(2)}, ${statResults.x_range[1].toFixed(2)}]`} />}
                    {statResults.y_range && <StatRow label="Y Range" value={`[${statResults.y_range[0].toFixed(2)}, ${statResults.y_range[1].toFixed(2)}]`} />}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {statsPanelOpen && <div className="stats-backdrop" onClick={() => setStatsPanelOpen(false)} />}
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