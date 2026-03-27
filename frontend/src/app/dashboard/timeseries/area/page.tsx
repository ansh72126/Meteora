"use client";

import { useState, useEffect } from "react";
import { Activity, AlertTriangle, RefreshCcw, Ruler, Sigma, Target, TrendingUp, Waves, X } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./AreaChartPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type ChartMode       = "single_area" | "stacked" | "normalized_stacked";
type AggMethod       = "sum" | "mean" | "count";
type ResampleFreq    = "none" | "sec" | "min" | "hour" | "day" | "week" | "month" | "year";
type MissingHandling = "ffill" | "bfill" | "interpolate" | "drop";
type AxisScale       = "linear" | "log";
type AnomalyRule     = "none" | "zscore" | "iqr";
type SortOrder       = "auto" | "asc" | "desc" | "total_desc";
type TimeInputType   = "datetime-local" | "date" | "month" | "number";
type XAxisType       = "auto" | "temporal" | "categorical";

// Auto-detect if a field name looks temporal
function looksLikeTemporal(name: string): boolean {
  const f = name.toLowerCase();
  return ["date","time","year","month","day","dt","period","ts"].some(k => f.includes(k));
}

// ── Validation & Sanitization Utilities ───────────────────────────────────────
const validateNumericRange = (
  value: string,
  min: number,
  max: number,
  defaultVal: number,
  fieldName: string
): number => {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    console.warn(`${fieldName}: Invalid number "${value}", using default ${defaultVal}`);
    return defaultVal;
  }
  if (parsed < min) {
    console.warn(`${fieldName}: Value ${parsed} below min ${min}, clamping`);
    return min;
  }
  if (parsed > max) {
    console.warn(`${fieldName}: Value ${parsed} above max ${max}, clamping`);
    return max;
  }
  return parsed;
};

const validateIntegerRange = (
  value: string,
  min: number,
  max: number,
  defaultVal: number,
  fieldName: string
): number => {
  const parsed = parseInt(value);
  if (isNaN(parsed)) {
    console.warn(`${fieldName}: Invalid integer "${value}", using default ${defaultVal}`);
    return defaultVal;
  }
  if (parsed < min) {
    console.warn(`${fieldName}: Value ${parsed} below min ${min}, clamping`);
    return min;
  }
  if (parsed > max) {
    console.warn(`${fieldName}: Value ${parsed} above max ${max}, clamping`);
    return max;
  }
  return parsed;
};

const sanitizeEventMarkers = (markers: string): string[] => {
  if (!markers.trim()) return [];
  return markers
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100)
    .slice(0, 20);
};

const validateDateRange = (start: string, end: string): { valid: boolean; message?: string } => {
  if (!start || !end) return { valid: true };
  
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { valid: false, message: "Invalid date format" };
    }
    
    if (startDate >= endDate) {
      return { valid: false, message: "Start date must be before end date" };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, message: "Date parsing error" };
  }
};

// ── Aggregation metadata ───────────────────────────────────────────────────────
const AGG_META: Record<AggMethod, { label: string; desc: string }> = {
  sum:   { label: "Sum",   desc: "Total accumulated value per interval" },
  mean:  { label: "Mean",  desc: "Average of all values in each interval" },
  count: { label: "Count", desc: "Number of records per interval" },
};

// ── Chart mode metadata ────────────────────────────────────────────────────────
const MODE_META: Record<ChartMode, { label: string; desc: string }> = {
  single_area:        { label: "Single",     desc: "One filled area per series, overlapping" },
  stacked:            { label: "Stacked",    desc: "Series stacked — total height = sum" },
  normalized_stacked: { label: "Normalized", desc: "100% stacked — proportional contribution" },
};

// ── Auto-detect time input type from field name ────────────────────────────────
function detectTimeInputType(fieldName: string): TimeInputType {
  const f = fieldName.toLowerCase();
  if (f.includes("year") && !f.includes("month") && !f.includes("day")) return "number";
  if (f.includes("month") && !f.includes("day")) return "month";
  if (f.includes("date") || f.includes("day") || f.includes("dt")) return "date";
  return "datetime-local";
}

// ─── Stat result ──────────────────────────────────────────────────────────────
interface AreaStatResult {
  total_area_integral?:    number;
  cumulative_growth?:      number;
  category_contribution?:  Record<string, number>;
  trend_slope?:            number;
  trend_direction?:        string;
  r_squared?:              number;
  p_value?:                number;
  growth_rate?:            number;
  rate_of_change?:         number;
  rolling_mean?:           number;
  rolling_std?:            number;
  variance_over_time?:     number;
  peak_value?:             number;
  peak_time?:              string;
  trough_value?:           number;
  trough_time?:            string;
  seasonality_signal?:     number;
  dominant_period?:        number;
  anomaly_count?:          number;
  anomaly_method?:         string;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AreaChartPage() {
  const [headers, setHeaders] = useState<string[]>([]);

  // Required
  const [xField, setXField] = useState("");
  const [yField, setYField] = useState("");

  // Optional fields
  const [seriesField,    setSeriesField]    = useState("");
  const [secondaryField, setSecondaryField] = useState("");
  const [facetField,     setFacetField]     = useState("");
  const [xAxisType,      setXAxisType]      = useState<XAxisType>("auto");

  // Chart mode
  const [chartMode,       setChartMode]       = useState<ChartMode>("single_area");
  const [seriesSortOrder, setSeriesSortOrder] = useState<SortOrder>("auto");

  // Resampling
  const [resampleFreq, setResampleFreq] = useState<ResampleFreq>("none");
  const [aggMethod,    setAggMethod]    = useState<AggMethod>("sum");

  // Date range
  const [dateRangeEnabled, setDateRangeEnabled] = useState(false);
  const [startDate,        setStartDate]        = useState("");
  const [endDate,          setEndDate]          = useState("");
  const [timeInputType,    setTimeInputType]    = useState<TimeInputType>("date");

  // Missing values
  const [missingHandling, setMissingHandling] = useState<MissingHandling>("ffill");

  // Area appearance
  const [fillAlpha,            setFillAlpha]            = useState("0.6");
  const [lineBoundaryOverlay,  setLineBoundaryOverlay]  = useState(true);
  const [lineWidth,            setLineWidth]            = useState("1.5");
  const [baselineValue,        setBaselineValue]        = useState("0");

  // Rolling smoothing
  const [rollingEnabled, setRollingEnabled] = useState(false);
  const [rollingWindow,  setRollingWindow]  = useState("7");

  // Cumulative mode
  const [cumulativeMode, setCumulativeMode] = useState(false);

  // Confidence band
  const [confBandEnabled, setConfBandEnabled] = useState(false);
  const [confBandWindow,  setConfBandWindow]  = useState("14");
  const [confBandAlpha,   setConfBandAlpha]   = useState("0.15");

  // Anomaly / outlier
  const [anomalyRule,      setAnomalyRule]      = useState<AnomalyRule>("none");
  const [anomalyThreshold, setAnomalyThreshold] = useState("3");

  // Density reduction
  const [densityReduction, setDensityReduction] = useState(false);
  const [densityPoints,    setDensityPoints]    = useState("500");

  // Event markers
  const [eventMarkers, setEventMarkers] = useState("");

  // Facet
  const [facetCols,  setFacetCols]  = useState("2");
  const [sharedAxes, setSharedAxes] = useState(true);

  // Axis
  const [axisScale, setAxisScale] = useState<AxisScale>("linear");
  const [yAxisAuto, setYAxisAuto] = useState(true);
  const [yMin,      setYMin]      = useState("");
  const [yMax,      setYMax]      = useState("");
  const [xLabel,    setXLabel]    = useState("");
  const [yLabel,    setYLabel]    = useState("");

  // Visuals
  const [colorPalette, setColorPalette] = useState("tab10");
  const [showGrid,     setShowGrid]     = useState(true);
  const [gridStyle,    setGridStyle]    = useState("horizontal");
  const [showLegend,   setShowLegend]   = useState(true);
  const [darkTheme,    setDarkTheme]    = useState(false);

  // Stat categories
  const [computeAreaMetrics,  setComputeAreaMetrics]  = useState(true);
  const [computeTrend,        setComputeTrend]        = useState(false);
  const [computeRollingStats, setComputeRollingStats] = useState(false);
  const [computePeaks,        setComputePeaks]        = useState(false);
  const [computeSeasonality,  setComputeSeasonality]  = useState(false);
  const [computeAnomalyStats, setComputeAnomalyStats] = useState(false);

  // Plot state
  const [plotUrl,        setPlotUrl]        = useState("");
  const [loading,        setLoading]        = useState(false);
  const [statResults,    setStatResults]    = useState<AreaStatResult | null>(null);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    if (stored) {
      try {
        const parsed: string[] = JSON.parse(stored);
        const cleaned = parsed
          .map((h: string) => h.replace(/^["']|["']$/g, "").trim())
          .filter((h: string) => h.length > 0 && h.length < 200);
        
        if (cleaned.length === 0) {
          console.error("No valid CSV headers found");
          alert("No valid column headers found in uploaded data. Please upload a valid CSV file.");
          return;
        }
        
        const uniqueHeaders = new Set(cleaned);
        if (uniqueHeaders.size !== cleaned.length) {
          console.warn("Duplicate column headers detected");
          alert("Duplicate column headers detected. This may cause unexpected behavior.");
        }
        
        setHeaders(cleaned);
      } catch (err) {
        console.error("Failed to parse CSV headers:", err);
        alert("Failed to load data headers. Please re-upload your CSV file.");
      }
    } else {
      console.warn("No CSV headers in session storage");
    }
  }, []);

  useEffect(() => {
    if (xField) {
      setTimeInputType(detectTimeInputType(xField));
      if (xAxisType === "auto")
        setXAxisType(looksLikeTemporal(xField) ? "temporal" : "categorical");
    }
  }, [xField]);

  // ── Derived: is temporal mode active
  const isTemporal = xAxisType === "auto"
    ? looksLikeTemporal(xField)
    : xAxisType === "temporal";

  // ── Generate ─────────────────────────────────────────────────────────────────
  const clean = (s: string) => s.replace(/^["']|["']$/g, "").trim();

  /** Returns { valid, message } for client-side validation. Message includes suggestion when invalid. */
  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the area chart." };
    }
    if (!xField || !yField) {
      return { valid: false, message: "Both X Field and Y Field are required. Select a column for each before generating." };
    }
    const selectedFields = [xField, yField, seriesField, secondaryField, facetField].filter(Boolean);
    const uniqueFields = new Set(selectedFields);
    if (selectedFields.length !== uniqueFields.size) {
      return { valid: false, message: "The same field is selected for multiple roles. Choose different fields for X, Y, Series, Secondary, and Facet." };
    }
    if (dateRangeEnabled && startDate && endDate) {
      const dateCheck = validateDateRange(startDate, endDate);
      if (!dateCheck.valid) {
        return { valid: false, message: `Invalid date range: ${dateCheck.message}. Ensure Start is before End and dates are valid.` };
      }
    }
    if ((chartMode === "stacked" || chartMode === "normalized_stacked") && !seriesField) {
      return { valid: false, message: "Stacked or Normalized mode requires a Series field. Select a grouping column for Series, or switch to Single mode." };
    }
    if (rollingEnabled && cumulativeMode) {
      return { valid: false, message: "Rolling smoothing and Cumulative mode together apply smoothing after cumulative sum, which can be confusing. Disable one of them before generating." };
    }
    if (confBandEnabled && cumulativeMode) {
      return { valid: false, message: "Confidence bands on cumulative data are not meaningful. Turn off Confidence Band or Cumulative mode before generating." };
    }
    const baseVal = parseFloat(baselineValue);
    if (axisScale === "log" && (isNaN(baseVal) || baseVal <= 0)) {
      return { valid: false, message: "Log scale requires a positive baseline. Set Baseline Value to a number greater than 0, or switch to Linear scale." };
    }
    const rollWin = parseInt(rollingWindow, 10);
    const densPts = parseInt(densityPoints, 10);
    if (densityReduction && rollingEnabled && !isNaN(rollWin) && !isNaN(densPts) && densPts < rollWin * 3) {
      return { valid: false, message: `Density points (${densPts}) is low compared to rolling window (${rollWin}). Increase Density Points to at least ${rollWin * 3}, or reduce the rolling window.` };
    }
    if (!yAxisAuto && yMin && yMax) {
      const lo = parseFloat(yMin);
      const hi = parseFloat(yMax);
      if (!isNaN(lo) && !isNaN(hi) && lo >= hi) {
        return { valid: false, message: "Y Min must be less than Y Max when using manual axis range. Adjust the values." };
      }
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

  const generatePlot = async () => {
    const v = validateConfig();
    if (!v.valid) {
      alert(v.message);
      return;
    }

    // ── Validate and sanitize numeric inputs with safe defaults
    const safeRollingWindow = validateIntegerRange(rollingWindow, 2, 90, 7, "Rolling Window");
    const safeConfBandWindow = validateIntegerRange(confBandWindow, 2, 60, 14, "Confidence Band Window");
    const safeDensityPoints = validateIntegerRange(densityPoints, 100, 2000, 500, "Density Points");
    const safeFacetCols = validateIntegerRange(facetCols, 1, 4, 2, "Facet Columns");

    const safeFillAlpha = validateNumericRange(fillAlpha, 0.1, 1.0, 0.6, "Fill Opacity");
    const safeLineWidth = validateNumericRange(lineWidth, 0.5, 4.0, 1.5, "Line Width");
    const safeConfBandAlpha = validateNumericRange(confBandAlpha, 0.05, 0.4, 0.15, "Confidence Band Opacity");
    const safeAnomalyThreshold = validateNumericRange(anomalyThreshold, 1.0, 5.0, 3.0, "Anomaly Threshold");

    // ── Validate baseline value (allow negative, but must be numeric)
    const safeBaselineValue = (() => {
      const parsed = parseFloat(baselineValue);
      if (isNaN(parsed)) {
        console.warn(`Baseline Value: Invalid number "${baselineValue}", using 0`);
        return 0;
      }
      return parsed;
    })();

    // ── Validate Y-axis range if manual
    let safeYMin = null;
    let safeYMax = null;
    if (!yAxisAuto) {
      if (yMin) {
        const parsed = parseFloat(yMin);
        safeYMin = isNaN(parsed) ? null : parsed;
      }
      if (yMax) {
        const parsed = parseFloat(yMax);
        safeYMax = isNaN(parsed) ? null : parsed;
      }
    }

    // ── Sanitize event markers
    const safeEventMarkers = sanitizeEventMarkers(eventMarkers);

    setLoading(true);
    setStatResults(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const payload = {
        x_column:               clean(xField),
        y_column:               clean(yField),
        series_column:          seriesField    ? clean(seriesField)    : null,
        secondary_column:       secondaryField ? clean(secondaryField) : null,
        facet_column:           facetField     ? clean(facetField)     : null,
        chart_mode:             chartMode,
        series_sort_order:      seriesSortOrder,
        resample_frequency:     resampleFreq,
        aggregation_method:     aggMethod,
        start_date:             dateRangeEnabled && startDate ? startDate : null,
        end_date:               dateRangeEnabled && endDate   ? endDate   : null,
        missing_value_handling: missingHandling,
        fill_alpha:             safeFillAlpha,
        line_boundary_overlay:  lineBoundaryOverlay,
        line_width:             safeLineWidth,
        baseline_value:         safeBaselineValue,
        rolling_enabled:        rollingEnabled,
        rolling_window:         safeRollingWindow,
        cumulative_mode:        cumulativeMode,
        conf_band_enabled:      confBandEnabled,
        conf_band_window:       safeConfBandWindow,
        conf_band_alpha:        safeConfBandAlpha,
        anomaly_rule:           anomalyRule,
        anomaly_threshold:      safeAnomalyThreshold,
        density_reduction:      densityReduction,
        density_points:         safeDensityPoints,
        event_markers:          safeEventMarkers,
        axis_scale:             axisScale,
        y_min:                  safeYMin,
        y_max:                  safeYMax,
        x_label:                xLabel  || null,
        y_label:                yLabel  || null,
        facet_cols:             safeFacetCols,
        shared_axes:            sharedAxes,
        color_palette:          colorPalette,
        show_grid:              showGrid,
        grid_style:             gridStyle,
        show_legend:            showLegend,
        dark_theme:             darkTheme,
        compute_area_metrics:   computeAreaMetrics,
        compute_trend:          computeTrend,
        compute_rolling_stats:  computeRollingStats,
        compute_peaks:          computePeaks,
        compute_seasonality:    computeSeasonality,
        compute_anomaly_stats:  computeAnomalyStats,
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/timeseries/area`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        let errorMessage = "Failed to generate area chart";
        if (contentType && contentType.includes("application/json")) {
          try {
            const err = await res.json().catch(() => ({}));
            errorMessage = parseApiError(err.detail ?? errorMessage);
          } catch {
            errorMessage = `Server error (${res.status})`;
          }
        } else {
          const text = await res.text();
          errorMessage = text.substring(0, 200) || `HTTP ${res.status}`;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      
      if (!data.image_path) {
        throw new Error("Server response missing image path");
      }

      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
      if (data.stats) setStatResults(data.stats);

    } catch (err: any) {
      let msg = err?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += ".";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the area chart.";
      } else if (msg.toLowerCase().includes("not found")) {
        msg = msg.trim();
      }
      console.error("Plot generation error:", err);
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!plotUrl) return;
    try {
      const response = await fetch(plotUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image (HTTP ${response.status})`);
      }
      
      const blob = await response.blob();
      
      if (blob.size === 0) {
        throw new Error("Downloaded file is empty");
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      const filename = `AreaChart_${yField || "plot"}_${chartMode}_${new Date().getTime()}.png`;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download failed:", err);
      alert(`Download failed.\n\n${err.message || "Unable to download the chart image."}`);
    }
  };

  // ── Stat helpers ─────────────────────────────────────────────────────────────
  const fmt = (v: number | undefined, d = 4) =>
    v !== undefined && v !== null ? v.toFixed(d) : "—";

  const sigLabel = (p: number | undefined) => {
    if (p == null) return "—";
    if (p < 0.001) return `${p.toExponential(2)} ***`;
    if (p < 0.01)  return `${p.toFixed(4)} **`;
    if (p < 0.05)  return `${p.toFixed(4)} *`;
    return `${p.toFixed(4)} (ns)`;
  };

  // ── Configuration summary for debugging
  const getConfigSummary = (): string => {
    const config: string[] = [
      `X: ${xField || "Not set"}`,
      `Y: ${yField || "Not set"}`,
    ];
    if (seriesField) config.push(`Series: ${seriesField}`);
    if (secondaryField) config.push(`Secondary: ${secondaryField}`);
    if (facetField) config.push(`Facet: ${facetField}`);
    config.push(`Mode: ${chartMode}`);
    if (resampleFreq !== "none") config.push(`Resample: ${resampleFreq} (${aggMethod})`);
    if (rollingEnabled) config.push(`Rolling: ${rollingWindow} window`);
    if (cumulativeMode) config.push(`Cumulative: Yes`);
    if (confBandEnabled) config.push(`Confidence Band: ${confBandWindow} window`);
    if (anomalyRule !== "none") config.push(`Anomaly: ${anomalyRule} (${anomalyThreshold})`);
    if (densityReduction) config.push(`Density: ${densityPoints} points`);
    return config.join("\n");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="ac-container">

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
          onClick={() => setStatsPanelOpen(!statsPanelOpen)}
        >
          <span className="btn-icon" aria-hidden="true">
            {statsPanelOpen ? <X /> : <Sigma />}
          </span>
          {statsPanelOpen ? "Close Stats" : "Stats"}
        </button>
      )}

      {/* ══ CONFIG PANEL ══════════════════════════════════════════════ */}
      <div className="config-panel">
        <h2 className="panel-title">Area Chart</h2>

        {/* FIELDS */}
        <div className="section-label">Fields</div>

        <div className="form-group">
          <label>X Axis <span className="label-badge">Required</span></label>
          <select value={xField} onChange={e => setXField(e.target.value)} className="form-select">
            <option value="">Select time / sequence field</option>
            {headers.filter(h => h !== yField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Ordered temporal or sequential variable</span>
        </div>

        <div className="form-group">
          <label>X Axis Type</label>
          <div className="segmented-control">
            {(["auto","temporal","categorical"] as XAxisType[]).map(t => (
              <button key={t} className={`seg-btn ${xAxisType === t ? "active" : ""}`}
                onClick={() => setXAxisType(t)}>
                {t === "auto" ? "Auto-detect" : t === "temporal" ? "Temporal" : "Categorical"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {xAxisType === "auto"        && "Auto-detected from field name"}
            {xAxisType === "temporal"    && "Date / time / numeric sequence — enables resampling"}
            {xAxisType === "categorical" && "Text labels like countries, products, categories"}
          </span>
        </div>

        <div className="form-group">
          <label>Y Axis <span className="label-badge">Required</span></label>
          <select value={yField} onChange={e => setYField(e.target.value)} className="form-select">
            <option value="">Select numeric value field</option>
            {headers.filter(h => h !== xField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Numeric magnitude defining the filled area</span>
        </div>

        <div className="form-group">
          <label>Series / Group By</label>
          <select value={seriesField} onChange={e => setSeriesField(e.target.value)} className="form-select">
            <option value="">None (single area)</option>
            {headers.filter(h => h !== xField && h !== yField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Categorical field for multi-area grouping</span>
        </div>

        <div className="form-group">
          <label>Secondary Y Field</label>
          <select value={secondaryField} onChange={e => setSecondaryField(e.target.value)} className="form-select">
            <option value="">None</option>
            {headers.filter(h => h !== xField && h !== yField && h !== seriesField).map(h =>
              <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Dual-axis line overlay for different scales</span>
        </div>

        {/* CHART MODE */}
        <div className="section-label">Chart Mode</div>

        <div className="agg-cards" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {(["single_area","stacked","normalized_stacked"] as ChartMode[]).map(m => (
            <label key={m} className={`agg-card ${chartMode === m ? "active" : ""}`}>
              <input type="radio" name="chartmode" value={m} checked={chartMode === m}
                onChange={() => setChartMode(m)} />
              <span className="agg-label">{MODE_META[m].label}</span>
              <span className="agg-desc">{MODE_META[m].desc}</span>
            </label>
          ))}
        </div>

        {chartMode !== "single_area" && (
          <div className="form-group nested">
            <label>Stack Order</label>
            <div className="segmented-control">
              {(["auto","asc","desc","total_desc"] as SortOrder[]).map(s => (
                <button key={s} className={`seg-btn ${seriesSortOrder === s ? "active" : ""}`}
                  onClick={() => setSeriesSortOrder(s)}>
                  {s === "auto" ? "Auto" : s === "asc" ? "Asc" : s === "desc" ? "Desc" : "By Total"}
                </button>
              ))}
            </div>
            <span className="input-hint">Controls which series sits at the base of the stack</span>
          </div>
        )}

        {/* RESAMPLING — temporal only */}
        {isTemporal && (
          <>
            <div className="section-label">Resampling</div>
            <div className="form-group">
              <label>Resample Frequency</label>
              <div className="freq-grid">
                {(["none","sec","min","hour","day","week","month","year"] as ResampleFreq[]).map(f => (
                  <button key={f} className={`freq-btn ${resampleFreq === f ? "active" : ""}`}
                    onClick={() => setResampleFreq(f)}>
                    {f === "none" ? "None" : f === "sec" ? "Sec" : f === "min" ? "Min"
                      : f === "hour" ? "Hour" : f === "day" ? "Day" : f === "week" ? "Week"
                      : f === "month" ? "Month" : "Year"}
                  </button>
                ))}
              </div>
              <span className="input-hint">
                {resampleFreq === "none"  && "Raw data — no resampling applied"}
                {resampleFreq === "sec"   && "Aggregate into 1-second buckets"}
                {resampleFreq === "min"   && "Aggregate into 1-minute buckets"}
                {resampleFreq === "hour"  && "Aggregate into hourly buckets"}
                {resampleFreq === "day"   && "Aggregate into daily buckets"}
                {resampleFreq === "week"  && "Aggregate into weekly buckets"}
                {resampleFreq === "month" && "Aggregate into monthly buckets"}
                {resampleFreq === "year"  && "Aggregate into yearly buckets"}
              </span>
            </div>
            {resampleFreq !== "none" && (
              <div className="form-group nested">
                <label>Aggregation Method</label>
                <div className="agg-cards">
                  {(["sum","mean","count"] as AggMethod[]).map(m => (
                    <label key={m} className={`agg-card ${aggMethod === m ? "active" : ""}`}>
                      <input type="radio" name="agg" value={m} checked={aggMethod === m}
                        onChange={() => setAggMethod(m)} />
                      <span className="agg-label">{AGG_META[m].label}</span>
                      <span className="agg-desc">{AGG_META[m].desc}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* DATE RANGE — temporal only */}
        {isTemporal && (
          <div className="form-group" style={{ marginTop: 14 }}>
            <div className="range-header">
              <label style={{ margin: 0 }}>Date Range Filter</label>
              <div className="range-toggle-row">
                <button className={`range-toggle-btn ${dateRangeEnabled ? "active" : ""}`}
                  onClick={() => setDateRangeEnabled(!dateRangeEnabled)}>
                  {dateRangeEnabled ? "On" : "Off"}
                </button>
                {dateRangeEnabled && xField && (
                  <div className="time-type-chips">
                    {(["date","datetime-local","month","number"] as TimeInputType[]).map(t => (
                      <button key={t}
                        className={`time-chip ${timeInputType === t ? "active" : ""}`}
                        onClick={() => setTimeInputType(t)}>
                        {t === "datetime-local" ? "datetime" : t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {dateRangeEnabled && (
              <>
                <span className="input-hint" style={{ marginBottom: 8 }}>
                  Crop data to this window before plotting
                </span>
                <div className="date-range-row">
                  <div className="date-input-wrap">
                    <span className="date-range-label">From</span>
                    <input type={timeInputType} value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="form-input date-input"
                      placeholder={timeInputType === "number" ? "e.g. 2018" : ""} />
                  </div>
                  <div className="date-range-sep">→</div>
                  <div className="date-input-wrap">
                    <span className="date-range-label">To</span>
                    <input type={timeInputType} value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="form-input date-input"
                      placeholder={timeInputType === "number" ? "e.g. 2024" : ""} />
                  </div>
                </div>
                {startDate && endDate && (
                  <button className="clear-range-btn"
                    onClick={() => { setStartDate(""); setEndDate(""); }}>
                    <span className="btn-icon" aria-hidden="true"><X /></span>
                    Clear Range
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* MISSING VALUES */}
        <div className="section-label">Missing Values</div>

        <div className="form-group">
          <label>Handling Strategy</label>
          <div className="segmented-control">
            {(["ffill","bfill","interpolate","drop"] as MissingHandling[]).map(m => (
              <button key={m} className={`seg-btn ${missingHandling === m ? "active" : ""}`}
                onClick={() => setMissingHandling(m)}>
                {m === "ffill" ? "Fwd Fill" : m === "bfill" ? "Bwd Fill"
                  : m === "interpolate" ? "Interp" : "Drop"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {missingHandling === "ffill"       && "Carry last valid value forward across gap"}
            {missingHandling === "bfill"       && "Fill using next valid observation"}
            {missingHandling === "interpolate" && "Linear interpolation between valid points"}
            {missingHandling === "drop"        && "Remove rows with missing values entirely"}
          </span>
        </div>

        {/* AREA APPEARANCE */}
        <div className="section-label">Area Appearance</div>

        <div className="form-group">
          <label>Fill Opacity</label>
          <div className="slider-group">
            <input type="range" min="0.1" max="1.0" step="0.05" value={fillAlpha}
              onChange={e => setFillAlpha(e.target.value)} className="slider" />
            <span className="slider-value">{fillAlpha}</span>
          </div>
          <span className="input-hint">Transparency of the filled area region</span>
        </div>

        <div className="form-group">
          <label>Baseline Value</label>
          <input type="number" value={baselineValue}
            onChange={e => setBaselineValue(e.target.value)}
            className="form-input" placeholder="0" />
          <span className="input-hint">Reference level from which area fills (default: 0)</span>
        </div>

        <div className={`decomp-card ${lineBoundaryOverlay ? "active" : ""}`}
          onClick={() => setLineBoundaryOverlay(!lineBoundaryOverlay)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={lineBoundaryOverlay} readOnly />
            <span className="decomp-card-title">Line Boundary Overlay</span>
          </div>
          <span className="decomp-card-desc">
            Draws a solid line along the top edge of each filled area for clearer boundary definition.
          </span>
        </div>

        {lineBoundaryOverlay && (
          <div className="form-group nested">
            <label>Line Width</label>
            <div className="slider-group">
              <input type="range" min="0.5" max="4" step="0.5" value={lineWidth}
                onChange={e => setLineWidth(e.target.value)} className="slider" />
              <span className="slider-value">{lineWidth}</span>
            </div>
          </div>
        )}

        {/* ROLLING SMOOTHING */}
        <div className="section-label">Rolling Smoothing</div>

        <div className={`decomp-card ${rollingEnabled ? "active" : ""}`}
          onClick={() => setRollingEnabled(!rollingEnabled)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={rollingEnabled} readOnly />
            <span className="decomp-card-title">Apply Moving Average</span>
          </div>
          <span className="decomp-card-desc">
            Smooth the series before rendering. Area reflects trend rather than raw fluctuation.
          </span>
        </div>

        {rollingEnabled && (
          <div className="form-group nested">
            <label>Window Size (observations)</label>
            <div className="slider-group">
              <input type="range" min="2" max="90" step="1" value={rollingWindow}
                onChange={e => setRollingWindow(e.target.value)} className="slider" />
              <input type="number" min="2" max="90" value={rollingWindow}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) setRollingWindow(String(Math.max(2, Math.min(90, val))));
                }}
                className="window-num-input" />
            </div>
          </div>
        )}

        {/* CUMULATIVE MODE */}
        <div className="section-label">Cumulative Mode</div>

        <div className={`decomp-card ${cumulativeMode ? "active" : ""}`}
          onClick={() => setCumulativeMode(!cumulativeMode)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={cumulativeMode} readOnly />
            <span className="decomp-card-title">Cumulative Sum</span>
          </div>
          <span className="decomp-card-desc">
            Replace raw values with running total. Area height = total accumulated quantity up to each point.
          </span>
        </div>

        {/* CONFIDENCE BAND */}
        <div className="section-label">Confidence Band</div>

        <div className={`decomp-card ${confBandEnabled ? "active" : ""}`}
          onClick={() => setConfBandEnabled(!confBandEnabled)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={confBandEnabled} readOnly />
            <span className="decomp-card-title">Rolling ±1.96σ Band</span>
          </div>
          <span className="decomp-card-desc">
            Shaded uncertainty band around rolling mean. Visualizes temporal volatility.
          </span>
        </div>

        {confBandEnabled && (
          <div className="form-group nested">
            <label>Band Window</label>
            <div className="slider-group">
              <input type="range" min="2" max="60" step="1" value={confBandWindow}
                onChange={e => setConfBandWindow(e.target.value)} className="slider" />
              <span className="slider-value">{confBandWindow}</span>
            </div>
            <label style={{ marginTop: 10 }}>Band Opacity</label>
            <div className="slider-group">
              <input type="range" min="0.05" max="0.4" step="0.05" value={confBandAlpha}
                onChange={e => setConfBandAlpha(e.target.value)} className="slider" />
              <span className="slider-value">{confBandAlpha}</span>
            </div>
          </div>
        )}

        {/* OUTLIER HIGHLIGHT */}
        <div className="section-label">Outlier Highlight</div>

        <div className="form-group">
          <label>Detection Rule</label>
          <div className="segmented-control">
            {(["none","zscore","iqr"] as AnomalyRule[]).map(r => (
              <button key={r} className={`seg-btn ${anomalyRule === r ? "active" : ""}`}
                onClick={() => setAnomalyRule(r)}>
                {r === "none" ? "None" : r === "zscore" ? "Z-Score" : "IQR"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {anomalyRule === "zscore" && "Flag where standardized value exceeds threshold"}
            {anomalyRule === "iqr"    && "Flag where value is outside Q1−k×IQR or Q3+k×IQR"}
          </span>
        </div>

        {anomalyRule !== "none" && (
          <div className="form-group nested">
            <label>Threshold ({anomalyRule === "zscore" ? "σ" : "k × IQR"})</label>
            <div className="slider-group">
              <input type="range" min="1" max="5" step="0.5" value={anomalyThreshold}
                onChange={e => setAnomalyThreshold(e.target.value)} className="slider" />
              <span className="slider-value">{anomalyThreshold}</span>
            </div>
          </div>
        )}

        {/* DENSITY REDUCTION */}
        <div className="section-label">Density Reduction</div>

        <div className={`decomp-card ${densityReduction ? "active" : ""}`}
          onClick={() => setDensityReduction(!densityReduction)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={densityReduction} readOnly />
            <span className="decomp-card-title">Server-side Downsampling</span>
          </div>
          <span className="decomp-card-desc">
            Limit rendered points for large datasets. Preserves visual shape while reducing render time.
          </span>
        </div>

        {densityReduction && (
          <div className="form-group nested">
            <label>Max Points</label>
            <div className="slider-group">
              <input type="range" min="100" max="2000" step="50" value={densityPoints}
                onChange={e => setDensityPoints(e.target.value)} className="slider" />
              <span className="slider-value">{densityPoints}</span>
            </div>
          </div>
        )}

        {/* EVENT MARKERS */}
        <div className="section-label">Event Markers</div>

        <div className="form-group">
          <label>Marker Timestamps</label>
          <input type="text" value={eventMarkers}
            onChange={e => setEventMarkers(e.target.value)}
            onBlur={() => {
              const markers = sanitizeEventMarkers(eventMarkers);
              if (eventMarkers.trim() && markers.length === 0) {
                alert("Event markers could not be parsed. Ensure they are comma-separated values.");
              }
              if (markers.length > 20) {
                alert("Too many event markers. Maximum of 20 will be used for better visualization.");
              }
            }}
            placeholder="2024-01-15, 2024-06-01"
            className="form-input" />
          <span className="input-hint">Comma-separated — vertical reference lines on the plot</span>
        </div>

        {/* FACET */}
        <div className="section-label">Panel Facet</div>

        <div className="form-group">
          <label>Facet By</label>
          <select value={facetField} onChange={e => setFacetField(e.target.value)} className="form-select">
            <option value="">None</option>
            {headers.filter(h => h !== xField && h !== yField && h !== seriesField).map(h =>
              <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Small multiples of area chart per group</span>
        </div>

        {facetField && (
          <>
            <div className="form-group nested">
              <label>Columns Per Row</label>
              <input type="number" min="1" max="4" value={facetCols}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) setFacetCols(String(Math.max(1, Math.min(4, val))));
                }}
                className="form-input" />
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="shared-check" checked={sharedAxes}
                onChange={() => setSharedAxes(!sharedAxes)} />
              <label htmlFor="shared-check">Shared Axes Across Panels</label>
            </div>
          </>
        )}

        {/* AXIS */}
        <div className="section-label">Axis</div>

        <div className="form-group">
          <label>Y Scale</label>
          <div className="segmented-control">
            {(["linear","log"] as AxisScale[]).map(s => (
              <button key={s} className={`seg-btn ${axisScale === s ? "active" : ""}`}
                onClick={() => setAxisScale(s)}>
                {s === "linear" ? "Linear" : "Log"}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>X Label</label>
          <input type="text" value={xLabel}
            onChange={e => setXLabel(e.target.value)}
            placeholder={xField || "Auto"} className="form-input" />
        </div>

        <div className="form-group">
          <label>Y Label</label>
          <input type="text" value={yLabel}
            onChange={e => setYLabel(e.target.value)}
            placeholder={yField || "Auto"} className="form-input" />
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="yauto-check" checked={yAxisAuto}
            onChange={() => setYAxisAuto(!yAxisAuto)} />
          <label htmlFor="yauto-check">Y Axis Auto Range</label>
        </div>

        {!yAxisAuto && (
          <div className="form-group nested">
            <div className="dual-input">
              <div className="input-wrapper">
                <span className="mini-label">Y Min</span>
                <input type="number" value={yMin}
                  onChange={e => setYMin(e.target.value)}
                  onBlur={() => {
                    if (yMin && yMax) {
                      const min = parseFloat(yMin);
                      const max = parseFloat(yMax);
                      if (!isNaN(min) && !isNaN(max) && min >= max) {
                        alert("Y Min must be less than Y Max.");
                        setYMin("");
                      }
                    }
                  }}
                  className="form-input-small" placeholder="0" />
              </div>
              <div className="input-wrapper">
                <span className="mini-label">Y Max</span>
                <input type="number" value={yMax}
                  onChange={e => setYMax(e.target.value)}
                  onBlur={() => {
                    if (yMin && yMax) {
                      const min = parseFloat(yMin);
                      const max = parseFloat(yMax);
                      if (!isNaN(min) && !isNaN(max) && min >= max) {
                        alert("Y Max must be greater than Y Min.");
                        setYMax("");
                      }
                    }
                  }}
                  className="form-input-small" placeholder="100" />
              </div>
            </div>
          </div>
        )}

        {/* VISUALS */}
        <div className="section-label">Visuals</div>

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
              <option value="Blues">Blues</option>
              <option value="Greens">Greens</option>
            </optgroup>
          </select>
        </div>

        <div className="form-group">
          <label>Grid Style</label>
          <div className="segmented-control">
            {[["none","None"],["horizontal","Horiz"],["full","Full"]].map(([v,l]) => (
              <button key={v} className={`seg-btn ${gridStyle === v ? "active" : ""}`}
                onClick={() => { 
                  if (v) {
                    setGridStyle(v);
                    setShowGrid(v !== "none");
                  }
                }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="checkbox-row">
          <div className="checkbox-group">
            <input type="checkbox" id="legend-check" checked={showLegend}
              onChange={() => setShowLegend(!showLegend)} />
            <label htmlFor="legend-check">Show Legend</label>
          </div>
          <div className="checkbox-group">
            <input type="checkbox" id="dark-check" checked={darkTheme}
              onChange={() => setDarkTheme(!darkTheme)} />
            <label htmlFor="dark-check">Dark Theme</label>
          </div>
        </div>

        {/* STATISTICAL INFERENCE */}
        <div className="section-label">Statistical Inference</div>
        <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
          Select categories to compute on generate
        </span>

        <div className="stat-category-cards">
          <label className={`stat-category-card ${computeAreaMetrics ? "active" : ""}`}>
            <input type="checkbox" checked={computeAreaMetrics}
              onChange={() => setComputeAreaMetrics(!computeAreaMetrics)} />
            <div className="stat-cat-icon" aria-hidden="true"><Ruler /></div>
            <div className="stat-cat-label">Area</div>
            <div className="stat-cat-desc">integral, contribution</div>
          </label>
          <label className={`stat-category-card ${computeTrend ? "active" : ""}`}>
            <input type="checkbox" checked={computeTrend}
              onChange={() => setComputeTrend(!computeTrend)} />
            <div className="stat-cat-icon" aria-hidden="true"><TrendingUp /></div>
            <div className="stat-cat-label">Trend</div>
            <div className="stat-cat-desc">slope, growth, ROC</div>
          </label>
          <label className={`stat-category-card ${computeRollingStats ? "active" : ""}`}>
            <input type="checkbox" checked={computeRollingStats}
              onChange={() => setComputeRollingStats(!computeRollingStats)} />
            <div className="stat-cat-icon" aria-hidden="true"><Waves /></div>
            <div className="stat-cat-label">Rolling</div>
            <div className="stat-cat-desc">mean, σ, variance</div>
          </label>
          <label className={`stat-category-card ${computePeaks ? "active" : ""}`}>
            <input type="checkbox" checked={computePeaks}
              onChange={() => setComputePeaks(!computePeaks)} />
            <div className="stat-cat-icon" aria-hidden="true"><Target /></div>
            <div className="stat-cat-label">Peaks</div>
            <div className="stat-cat-desc">max, min, timing</div>
          </label>
          <label className={`stat-category-card ${computeSeasonality ? "active" : ""}`}>
            <input type="checkbox" checked={computeSeasonality}
              onChange={() => setComputeSeasonality(!computeSeasonality)} />
            <div className="stat-cat-icon" aria-hidden="true"><RefreshCcw /></div>
            <div className="stat-cat-label">Season</div>
            <div className="stat-cat-desc">signal, period</div>
          </label>
          <label className={`stat-category-card ${computeAnomalyStats ? "active" : ""}`}>
            <input type="checkbox" checked={computeAnomalyStats}
              onChange={() => setComputeAnomalyStats(!computeAnomalyStats)} />
            <div className="stat-cat-icon" aria-hidden="true"><AlertTriangle /></div>
            <div className="stat-cat-label">Anomalies</div>
            <div className="stat-cat-desc">count, method</div>
          </label>
        </div>

        <button onClick={generatePlot} className="generate-button"
          disabled={loading || !xField || !yField}
          title={!xField || !yField ? "X Field and Y Field are required" : "Generate area chart with current configuration"}>
          {loading ? "Generating..." : "Generate Plot"}
        </button>
      </div>

      {/* ══ PLOT AREA ═════════════════════════════════════════════════ */}
      <div className="plot-area">
        {loading ? (
          <div className="loading-state">
            <div className="ac-loader">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="dot" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <p className="placeholder-text">Rendering area chart…</p>
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="Area Chart" className="plot-image" />
        ) : (
          <div className="empty-state">
            <div className="empty-ac-icon">
              <svg width="160" height="90" viewBox="0 0 220 100" fill="none">
                <line x1="15" y1="80" x2="205" y2="80" stroke="#00d4ff" strokeWidth="1" opacity="0.3"/>
                <line x1="15" y1="10" x2="15"  y2="80" stroke="#00d4ff" strokeWidth="1" opacity="0.3"/>
                <line x1="15" y1="57" x2="205" y2="57" stroke="#00d4ff" strokeWidth="0.4" opacity="0.12"/>
                <line x1="15" y1="35" x2="205" y2="35" stroke="#00d4ff" strokeWidth="0.4" opacity="0.12"/>
                <path d="M15 70 L55 55 L95 60 L135 45 L175 48 L205 38 L205 80 L15 80Z"
                  fill="#ffaa00" opacity="0.2"/>
                <path d="M15 70 L55 55 L95 60 L135 45 L175 48 L205 38"
                  stroke="#ffaa00" strokeWidth="1.5" fill="none" opacity="0.5"/>
                <path d="M15 75 L55 62 L95 68 L135 54 L175 57 L205 48 L205 80 L15 80Z"
                  fill="#00d4ff" opacity="0.25"/>
                <path d="M15 75 L55 62 L95 68 L135 54 L175 57 L205 48"
                  stroke="#00d4ff" strokeWidth="2" fill="none" opacity="0.7"/>
                <line x1="105" y1="15" x2="105" y2="80" stroke="#ffaa00"
                  strokeWidth="1" strokeDasharray="3 2" opacity="0.45"/>
                <circle cx="55" cy="62" r="5" fill="none" stroke="#ff6b6b"
                  strokeWidth="1.5" opacity="0.7"/>
              </svg>
            </div>
            <p className="placeholder-text">Configure and generate area chart</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: 4, opacity: 0.6 }}>
              Single · Stacked · Normalized · Cumulative
            </p>
          </div>
        )}

        <button className="download-btn" onClick={handleDownload} disabled={!plotUrl || loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PNG
        </button>
      </div>

      {/* ══ STATS PANEL — right slide-in, overlays plot ═══════════════ */}
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
              {/* Area Metrics */}
              {computeAreaMetrics && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Ruler /></span> Area Metrics
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Total Area (integral)"
                      value={fmt(statResults.total_area_integral, 2)} highlight />
                    <StatRow label="Cumulative Growth"
                      value={statResults.cumulative_growth != null
                        ? `${statResults.cumulative_growth.toFixed(2)}%` : "—"} />
                  </div>
                  {statResults.category_contribution &&
                    Object.keys(statResults.category_contribution).length > 0 && (
                    <>
                      <div className="contrib-section-label">Category Contributions</div>
                      <div className="stat-rows">
                        {Object.entries(statResults.category_contribution).map(([k, v]) => (
                          <div key={k} className="stat-row">
                            <span className="stat-key">{k}</span>
                            <div className="contrib-bar-wrap">
                              <div className="contrib-bar"
                                style={{ width: `${Math.min(v * 100, 100).toFixed(1)}%` }} />
                              <span className="stat-val">{(v * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Trend & Growth */}
              {computeTrend && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><TrendingUp /></span> Trend &amp; Growth
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Slope (per interval)"
                      value={fmt(statResults.trend_slope, 6)}
                      highlight={(statResults.trend_slope ?? 0) !== 0} />
                    <StatRow label="Direction"  value={statResults.trend_direction ?? "—"} />
                    <StatRow label="R²"         value={fmt(statResults.r_squared, 4)} />
                    <StatRow label="p-value"    value={sigLabel(statResults.p_value)}
                      highlight={(statResults.p_value ?? 1) < 0.05} />
                    <StatRow label="Growth Rate"
                      value={statResults.growth_rate != null
                        ? `${statResults.growth_rate.toFixed(2)}%` : "—"} />
                    <StatRow label="Rate of Change"  value={fmt(statResults.rate_of_change, 4)} />
                  </div>
                </div>
              )}

              {/* Rolling Stats */}
              {computeRollingStats && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Waves /></span> Rolling Statistics
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Rolling Mean"     value={fmt(statResults.rolling_mean, 4)} />
                    <StatRow label="Rolling Std Dev"  value={fmt(statResults.rolling_std, 4)} />
                    <StatRow label="Local Variance"   value={fmt(statResults.variance_over_time, 4)} />
                  </div>
                </div>
              )}

              {/* Peaks & Troughs */}
              {computePeaks && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><Target /></span> Peaks &amp; Troughs
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Peak Value"   value={fmt(statResults.peak_value, 4)} highlight />
                    <StatRow label="Peak At"      value={statResults.peak_time   ?? "—"} />
                    <StatRow label="Trough Value" value={fmt(statResults.trough_value, 4)} />
                    <StatRow label="Trough At"    value={statResults.trough_time ?? "—"} />
                  </div>
                </div>
              )}

              {/* Seasonality */}
              {computeSeasonality && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><RefreshCcw /></span> Seasonality
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Seasonal Strength"
                      value={fmt(statResults.seasonality_signal, 4)}
                      highlight={(statResults.seasonality_signal ?? 0) > 0.3} />
                    <StatRow label="Dominant Period"
                      value={statResults.dominant_period != null
                        ? `${statResults.dominant_period} intervals` : "—"} />
                  </div>
                  {(statResults.seasonality_signal ?? 0) > 0.5 && (
                    <div className="stat-note">
                      <span className="note-icon" aria-hidden="true"><AlertTriangle /></span>
                      Strong seasonal signal — consider deseasonalizing before regression.
                    </div>
                  )}
                </div>
              )}

              {/* Anomalies */}
              {computeAnomalyStats && (
                <div className="stat-block">
                  <h4 className="stat-block-title">
                    <span className="stat-block-icon" aria-hidden="true"><AlertTriangle /></span> Anomaly Detection
                  </h4>
                  <div className="stat-rows">
                    <StatRow label="Anomaly Count"
                      value={String(statResults.anomaly_count ?? "—")}
                      highlight={(statResults.anomaly_count ?? 0) > 0} />
                    <StatRow label="Method"    value={statResults.anomaly_method ?? anomalyRule} />
                    <StatRow label="Threshold" value={anomalyThreshold} />
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

function StatRow({ label, value, highlight = false }:
  { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`stat-row ${highlight ? "highlight" : ""}`}>
      <span className="stat-key">{label}</span>
      <span className="stat-val">{value}</span>
    </div>
  );
}