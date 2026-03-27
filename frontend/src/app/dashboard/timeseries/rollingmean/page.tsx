"use client";

import { useState, useEffect } from "react";
import { Activity, AlertTriangle, BarChart3, LineChart, Sigma, TrendingUp, X } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./RollingMeanPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type ResampleFreq   = "none" | "sec" | "min" | "hour" | "day" | "week" | "month" | "year";
type AggMethod      = "mean" | "sum" | "median";
type MissingHandling = "ffill" | "bfill" | "interpolate" | "gap";
type RollingFn      = "mean" | "median" | "std" | "var" | "min" | "max";
type WindowType     = "fixed" | "time";
type AxisScale      = "linear" | "log" | "symlog";
type AnomalyRule    = "none" | "zscore" | "residual";
type TrendLine      = "none" | "linear" | "polynomial";
type TimeInputType  = "datetime-local" | "date" | "month" | "number";

const AGG_META: Record<AggMethod, { label: string; desc: string }> = {
  mean:   { label: "Mean",   desc: "Average value per interval" },
  sum:    { label: "Sum",    desc: "Total accumulated per interval" },
  median: { label: "Median", desc: "Middle value — spike-resistant" },
};

const ROLLING_FN_META: Record<RollingFn, { label: string; desc: string }> = {
  mean:   { label: "Mean",     desc: "Smoothed central tendency (rolling average)" },
  median: { label: "Median",   desc: "Spike-resistant rolling central value" },
  std:    { label: "Std Dev",  desc: "Rolling volatility / dispersion" },
  var:    { label: "Variance", desc: "Squared dispersion within each window" },
  min:    { label: "Min",      desc: "Minimum value observed in each window" },
  max:    { label: "Max",      desc: "Maximum value observed in each window" },
};

function detectTimeInputType(fieldName: string): TimeInputType {
  const f = fieldName.toLowerCase();
  if (f.includes("year") && !f.includes("month") && !f.includes("day")) return "number";
  if (f.includes("month") && !f.includes("day")) return "month";
  if (f.includes("date") || f.includes("day") || f.includes("dt")) return "date";
  return "datetime-local";
}

interface RollingStatResult {
  rolling_mean_level?: number;
  rolling_variance?: number;
  rolling_std?: number;
  signal_noise_ratio?: number;
  volatility_index?: number;
  trend_slope?: number;
  trend_direction?: string;
  r_squared?: number;
  p_value?: number;
  mae?: number;
  rmse?: number;
  mse?: number;
  acf_lag1?: number;
  acf_lag2?: number;
  pacf_lag1?: number;
  ci_lower?: number;
  ci_upper?: number;
  anomaly_count?: number;
  anomaly_method?: string;
}

export default function RollingMeanPage() {
  const [headers, setHeaders] = useState<string[]>([]);

  const [timeField,  setTimeField]  = useState("");
  const [valueField, setValueField] = useState("");
  const [seriesField, setSeriesField] = useState("");

  const [windowSize,   setWindowSize]   = useState("7");
  const [windowType,   setWindowType]   = useState<WindowType>("fixed");
  const [timePeriod,   setTimePeriod]   = useState("7D");
  const [rollingFn,    setRollingFn]    = useState<RollingFn>("mean");
  const [centerWindow, setCenterWindow] = useState(false);
  const [minPeriods,   setMinPeriods]   = useState("1");

  const [multiWindowEnabled, setMultiWindowEnabled] = useState(false);
  const [extraWindows,       setExtraWindows]       = useState("30");

  const [stdBandEnabled, setStdBandEnabled] = useState(false);
  const [stdMultiplier,  setStdMultiplier]  = useState("1");
  const [ciBandEnabled,  setCiBandEnabled]  = useState(false);
  const [ciLevel,        setCiLevel]        = useState("95");

  const [rawOverlay, setRawOverlay] = useState(true);
  const [rawAlpha,   setRawAlpha]   = useState("0.3");

  const [resampleFreq, setResampleFreq] = useState<ResampleFreq>("none");
  const [aggMethod,    setAggMethod]    = useState<AggMethod>("mean");

  const [dateRangeEnabled, setDateRangeEnabled] = useState(false);
  const [startDate,        setStartDate]        = useState("");
  const [endDate,          setEndDate]          = useState("");
  const [timeInputType,    setTimeInputType]    = useState<TimeInputType>("date");

  const [missingHandling, setMissingHandling] = useState<MissingHandling>("ffill");

  const [trendLine,       setTrendLine]       = useState<TrendLine>("none");
  const [trendPolyDegree, setTrendPolyDegree] = useState("2");

  const [anomalyRule,      setAnomalyRule]      = useState<AnomalyRule>("none");
  const [anomalyThreshold, setAnomalyThreshold] = useState("2.5");

  const [eventMarkers, setEventMarkers] = useState("");

  const [facetField,  setFacetField]  = useState("");
  const [facetCols,   setFacetCols]   = useState("2");
  const [sharedAxes,  setSharedAxes]  = useState(true);

  const [axisScale, setAxisScale] = useState<AxisScale>("linear");
  const [yAxisAuto, setYAxisAuto] = useState(true);
  const [yMin,      setYMin]      = useState("");
  const [yMax,      setYMax]      = useState("");
  const [xLabel,    setXLabel]    = useState("");
  const [yLabel,    setYLabel]    = useState("");

  const [lineWidth,     setLineWidth]     = useState("2");
  const [colorPalette,  setColorPalette]  = useState("tab10");
  const [showGrid,      setShowGrid]      = useState(true);
  const [gridStyle,     setGridStyle]     = useState("horizontal");
  const [showLegend,    setShowLegend]    = useState(true);
  const [darkTheme,     setDarkTheme]     = useState(false);

  const [computeRollingStats,    setComputeRollingStats]    = useState(true);
  const [computeTrend,           setComputeTrend]           = useState(false);
  const [computeSmoothing,       setComputeSmoothing]       = useState(false);
  const [computeAutocorrelation, setComputeAutocorrelation] = useState(false);
  const [computeAnomalyStats,    setComputeAnomalyStats]    = useState(false);

  const [plotUrl,        setPlotUrl]        = useState("");
  const [loading,        setLoading]        = useState(false);
  const [statResults,    setStatResults]    = useState<RollingStatResult | null>(null);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    if (stored) setHeaders(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (timeField) setTimeInputType(detectTimeInputType(timeField));
  }, [timeField]);

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the rolling plot." };
    }
    if (!timeField || !valueField) {
      return { valid: false, message: "Both Time Field and Value Field are required. Select a column for each before generating." };
    }
    const selectedFields = [timeField, valueField, seriesField, facetField].filter(Boolean);
    if (new Set(selectedFields).size !== selectedFields.length) {
      return { valid: false, message: "The same field is selected for multiple roles. Choose different fields for Time, Value, Series, and Facet." };
    }
    if (dateRangeEnabled && startDate && endDate) {
      try {
        const s = new Date(startDate);
        const e = new Date(endDate);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) {
          return { valid: false, message: "Invalid date format. Ensure Start and End dates are valid." };
        }
        if (s >= e) {
          return { valid: false, message: "Start date must be before End date. Adjust the date range." };
        }
      } catch {
        return { valid: false, message: "Invalid date range. Check Start and End date formats." };
      }
    }
    const winSz = parseInt(windowSize, 10);
    if (isNaN(winSz) || winSz < 1) {
      return { valid: false, message: "Window size must be at least 1. Enter a valid integer for the rolling window." };
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

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/timeseries/rollingmean`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          time_column:         timeField,
          value_column:        valueField,
          series_column:       seriesField || null,
          window_size:         parseInt(windowSize),
          window_type:         windowType,
          time_period:         timePeriod,
          rolling_function:    rollingFn,
          center_window:       centerWindow,
          min_periods:         parseInt(minPeriods),
          multi_window_enabled: multiWindowEnabled,
          extra_windows:       multiWindowEnabled
                                 ? extraWindows.split(",").map(s => parseInt(s.trim())).filter(Boolean)
                                 : [],
          std_band_enabled:    stdBandEnabled,
          std_multiplier:      parseFloat(stdMultiplier),
          ci_band_enabled:     ciBandEnabled,
          ci_level:            parseInt(ciLevel),
          raw_overlay:         rawOverlay,
          raw_alpha:           parseFloat(rawAlpha),
          resample_frequency:  resampleFreq,
          aggregation_method:  aggMethod,
          start_date:          dateRangeEnabled && startDate ? startDate : null,
          end_date:            dateRangeEnabled && endDate   ? endDate   : null,
          missing_value_handling: missingHandling,
          trend_line:          trendLine,
          trend_poly_degree:   parseInt(trendPolyDegree),
          anomaly_rule:        anomalyRule,
          anomaly_threshold:   parseFloat(anomalyThreshold),
          event_markers:       eventMarkers
                                 ? eventMarkers.split(",").map(s => s.trim()).filter(Boolean)
                                 : [],
          facet_column:        facetField || null,
          facet_cols:          parseInt(facetCols),
          shared_axes:         sharedAxes,
          axis_scale:          axisScale,
          y_min:               !yAxisAuto && yMin ? parseFloat(yMin) : null,
          y_max:               !yAxisAuto && yMax ? parseFloat(yMax) : null,
          x_label:             xLabel || null,
          y_label:             yLabel || null,
          line_width:          parseFloat(lineWidth),
          color_palette:       colorPalette,
          show_grid:           showGrid,
          grid_style:          gridStyle,
          show_legend:         showLegend,
          dark_theme:          darkTheme,
          compute_rolling_stats:    computeRollingStats,
          compute_trend:            computeTrend,
          compute_smoothing_error:  computeSmoothing,
          compute_autocorrelation:  computeAutocorrelation,
          compute_anomaly_stats:    computeAnomalyStats,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate rolling plot"));
      }

      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
      if (data.stats) setStatResults(data.stats);
    } catch (err: any) {
      let msg = err?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += ".";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the rolling plot.";
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
      link.download = `RollingMean_${valueField}_w${windowSize}.png`;
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

  return (
    <div className="rm-container">

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

      {/* ── CONFIG PANEL ─────────────────────────────────────────────────── */}
      <div className="config-panel">
        <h2 className="panel-title">Rolling Mean</h2>
        <p className="panel-subtitle">Windowed Smoothing Analysis</p>

        {/* ── FIELDS ── */}
        <div className="section-label">Fields</div>

        <div className="form-group">
          <label>Time Axis <span className="label-badge">Required</span></label>
          <select value={timeField} onChange={e => setTimeField(e.target.value)} className="form-select">
            <option value="">Select time field</option>
            {headers.filter(h => h !== valueField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Datetime, timestamp, or ordered index</span>
        </div>

        <div className="form-group">
          <label>Value Field <span className="label-badge">Required</span></label>
          <select value={valueField} onChange={e => setValueField(e.target.value)} className="form-select">
            <option value="">Select numeric field</option>
            {headers.filter(h => h !== timeField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Series / Group By</label>
          <select value={seriesField} onChange={e => setSeriesField(e.target.value)} className="form-select">
            <option value="">None (single series)</option>
            {headers.filter(h => h !== timeField && h !== valueField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Compare rolling stats across groups</span>
        </div>

        {/* ── WINDOW ── */}
        <div className="section-label">Window Configuration</div>

        <div className="form-group">
          <label>Window Type</label>
          <div className="segmented-control">
            {(["fixed","time"] as WindowType[]).map(t => (
              <button key={t} className={`seg-btn ${windowType === t ? "active" : ""}`}
                onClick={() => setWindowType(t)}>
                {t === "fixed" ? "Fixed (obs)" : "Time-based"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {windowType === "fixed"
              ? "Window measured in number of observations"
              : "Window measured in time duration (e.g. 7D, 30D)"}
          </span>
        </div>

        {windowType === "fixed" ? (
          <div className="form-group nested">
            <label>Window Size <span className="label-badge">Required</span></label>
            <div className="slider-group">
              <input type="range" min="2" max="365" step="1" value={windowSize}
                onChange={e => setWindowSize(e.target.value)} className="slider" />
              <input type="number" min="2" max="365" value={windowSize}
                onChange={e => setWindowSize(e.target.value)}
                className="window-num-input" />
            </div>
            <span className="input-hint">Observations in each rolling window</span>
          </div>
        ) : (
          <div className="form-group nested">
            <label>Time Period</label>
            <input type="text" value={timePeriod}
              onChange={e => setTimePeriod(e.target.value)}
              placeholder="7D / 30D / 4W / 3M"
              className="form-input" />
            <span className="input-hint">Pandas offset string: D=days, W=weeks, M=months</span>
          </div>
        )}

        <div className="form-group">
          <label>Min Periods</label>
          <div className="slider-group">
            <input type="range" min="1" max={Math.max(1, parseInt(windowSize) || 7)} step="1"
              value={minPeriods} onChange={e => setMinPeriods(e.target.value)} className="slider" />
            <span className="slider-value">{minPeriods}</span>
          </div>
          <span className="input-hint">Min observations before producing output (1 = fill from start)</span>
        </div>

        <div className={`decomp-card ${centerWindow ? "active" : ""}`}
          onClick={() => setCenterWindow(!centerWindow)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={centerWindow} readOnly />
            <span className="decomp-card-title">Center Window</span>
          </div>
          <span className="decomp-card-desc">
            Window is centered on each point (uses future data).
            Off = trailing window (uses only past observations).
          </span>
        </div>

        {/* ── ROLLING FUNCTION ── */}
        <div className="section-label">Rolling Function</div>

        <div className="agg-cards" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {(["mean","median","std","var","min","max"] as RollingFn[]).map(fn => (
            <label key={fn} className={`agg-card ${rollingFn === fn ? "active" : ""}`}>
              <input type="radio" name="rollingfn" value={fn} checked={rollingFn === fn}
                onChange={() => setRollingFn(fn)} />
              <span className="agg-label">{ROLLING_FN_META[fn].label}</span>
              <span className="agg-desc">{ROLLING_FN_META[fn].desc}</span>
            </label>
          ))}
        </div>

        {/* ── MULTI-WINDOW ── */}
        <div className="section-label">Multi-Window</div>

        <div className={`decomp-card ${multiWindowEnabled ? "active" : ""}`}
          onClick={() => setMultiWindowEnabled(!multiWindowEnabled)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={multiWindowEnabled} readOnly />
            <span className="decomp-card-title">Multiple Windows</span>
          </div>
          <span className="decomp-card-desc">
            Overlay additional rolling windows on same plot (e.g. compare 7-day vs 30-day).
          </span>
        </div>

        {multiWindowEnabled && (
          <div className="form-group nested">
            <label>Additional Window Sizes</label>
            <input type="text" value={extraWindows}
              onChange={e => setExtraWindows(e.target.value)}
              placeholder="30, 90, 180"
              className="form-input" />
            <span className="input-hint">Comma-separated. E.g. &quot;30, 90&quot;</span>
          </div>
        )}

        {/* ── BANDS ── */}
        <div className="section-label">Bands & Envelopes</div>

        <div className={`decomp-card ${stdBandEnabled ? "active" : ""}`}
          onClick={() => setStdBandEnabled(!stdBandEnabled)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={stdBandEnabled} readOnly />
            <span className="decomp-card-title">Std Dev Band</span>
          </div>
          <span className="decomp-card-desc">
            Shaded ±k×σ volatility envelope around rolling mean. Shows local dispersion.
          </span>
        </div>

        {stdBandEnabled && (
          <div className="form-group nested">
            <label>Multiplier (k)</label>
            <div className="slider-group">
              <input type="range" min="0.5" max="3" step="0.5" value={stdMultiplier}
                onChange={e => setStdMultiplier(e.target.value)} className="slider" />
              <span className="slider-value">{stdMultiplier}σ</span>
            </div>
          </div>
        )}

        <div className={`decomp-card ${ciBandEnabled ? "active" : ""}`}
          onClick={() => setCiBandEnabled(!ciBandEnabled)}
          style={{ marginTop: 8 }}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={ciBandEnabled} readOnly />
            <span className="decomp-card-title">Confidence Band</span>
          </div>
          <span className="decomp-card-desc">
            Statistical confidence interval (t-distribution) around rolling estimate.
          </span>
        </div>

        {ciBandEnabled && (
          <div className="form-group nested">
            <label>Confidence Level</label>
            <div className="segmented-control">
              {["80","90","95","99"].map(l => (
                <button key={l} className={`seg-btn ${ciLevel === l ? "active" : ""}`}
                  onClick={() => setCiLevel(l)}>
                  {l}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── RAW OVERLAY ── */}
        <div className="section-label">Raw Series Overlay</div>

        <div className={`decomp-card ${rawOverlay ? "active" : ""}`}
          onClick={() => setRawOverlay(!rawOverlay)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={rawOverlay} readOnly />
            <span className="decomp-card-title">Show Raw Signal</span>
          </div>
          <span className="decomp-card-desc">
            Display original unsmoothed series beneath rolling line for direct deviation comparison.
          </span>
        </div>

        {rawOverlay && (
          <div className="form-group nested">
            <label>Raw Series Opacity</label>
            <div className="slider-group">
              <input type="range" min="0.1" max="0.8" step="0.05" value={rawAlpha}
                onChange={e => setRawAlpha(e.target.value)} className="slider" />
              <span className="slider-value">{rawAlpha}</span>
            </div>
          </div>
        )}

        {/* ── RESAMPLING ── */}
        <div className="section-label">Resampling</div>

        <div className="form-group">
          <label>Resample Frequency</label>
          <div className="freq-grid">
            {(["none","sec","min","hour","day","week","month","year"] as ResampleFreq[]).map(f => (
              <button key={f}
                className={`freq-btn ${resampleFreq === f ? "active" : ""}`}
                onClick={() => setResampleFreq(f)}>
                {f === "none" ? "None" : f === "sec" ? "Sec" : f === "min" ? "Min"
                  : f === "hour" ? "Hour" : f === "day" ? "Day" : f === "week" ? "Week"
                  : f === "month" ? "Month" : "Year"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {resampleFreq === "none"   && "No resampling — raw data used for rolling"}
            {resampleFreq === "sec"    && "Bucket into 1-second intervals before rolling"}
            {resampleFreq === "min"    && "Bucket into 1-minute intervals before rolling"}
            {resampleFreq === "hour"   && "Bucket into hourly intervals before rolling"}
            {resampleFreq === "day"    && "Bucket into daily intervals before rolling"}
            {resampleFreq === "week"   && "Bucket into weekly intervals before rolling"}
            {resampleFreq === "month"  && "Bucket into monthly intervals before rolling"}
            {resampleFreq === "year"   && "Bucket into yearly intervals before rolling"}
          </span>
        </div>

        {resampleFreq !== "none" && (
          <div className="form-group nested">
            <label>Aggregation Method</label>
            <div className="agg-cards">
              {(["mean","sum","median"] as AggMethod[]).map(m => (
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

        {/* DATE RANGE */}
        <div className="form-group" style={{ marginTop: 14 }}>
          <div className="range-header">
            <label style={{ margin: 0 }}>Date Range Filter</label>
            <div className="range-toggle-row">
              <button
                className={`range-toggle-btn ${dateRangeEnabled ? "active" : ""}`}
                onClick={() => setDateRangeEnabled(!dateRangeEnabled)}>
                {dateRangeEnabled ? "On" : "Off"}
              </button>
              {dateRangeEnabled && timeField && (
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
                Only data within this window will be used for rolling computation
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

        {/* ── MISSING VALUES ── */}
        <div className="section-label">Missing Values</div>

        <div className="form-group">
          <label>Handling Strategy</label>
          <div className="segmented-control">
            {(["ffill","bfill","interpolate","gap"] as MissingHandling[]).map(m => (
              <button key={m} className={`seg-btn ${missingHandling === m ? "active" : ""}`}
                onClick={() => setMissingHandling(m as MissingHandling)}>
                {m === "ffill" ? "Fwd Fill" : m === "bfill" ? "Bwd Fill"
                  : m === "interpolate" ? "Interp" : "Gap Break"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {missingHandling === "ffill"       && "Carry last valid value forward"}
            {missingHandling === "bfill"       && "Fill using next valid value"}
            {missingHandling === "interpolate" && "Linear interpolation between valid points"}
            {missingHandling === "gap"         && "Leave gaps visible — breaks rolling line"}
          </span>
        </div>

        {/* ── TREND OVERLAY ── */}
        <div className="section-label">Trend Overlay</div>

        <div className="form-group">
          <label>Trend on Rolling Values</label>
          <div className="segmented-control">
            {(["none","linear","polynomial"] as TrendLine[]).map(t => (
              <button key={t} className={`seg-btn ${trendLine === t ? "active" : ""}`}
                onClick={() => setTrendLine(t)}>
                {t === "none" ? "None" : t === "linear" ? "Linear" : "Polynomial"}
              </button>
            ))}
          </div>
          <span className="input-hint">Regression fitted on smoothed rolling values (not raw)</span>
        </div>

        {trendLine === "polynomial" && (
          <div className="form-group nested">
            <label>Polynomial Degree</label>
            <input type="number" min="2" max="6" value={trendPolyDegree}
              onChange={e => setTrendPolyDegree(e.target.value)} className="form-input" />
          </div>
        )}

        {/* ── ANOMALY ── */}
        <div className="section-label">Anomaly Detection</div>

        <div className="form-group">
          <label>Detection Rule</label>
          <div className="segmented-control">
            {(["none","zscore","residual"] as AnomalyRule[]).map(r => (
              <button key={r} className={`seg-btn ${anomalyRule === r ? "active" : ""}`}
                onClick={() => setAnomalyRule(r)}>
                {r === "none" ? "None" : r === "zscore" ? "Z-Score" : "Residual"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {anomalyRule === "zscore"   && "Flag points where |Z| exceeds threshold (standardized raw vs rolling)"}
            {anomalyRule === "residual" && "Flag where |raw − rolling| exceeds k × rolling std"}
          </span>
        </div>

        {anomalyRule !== "none" && (
          <div className="form-group nested">
            <label>Threshold ({anomalyRule === "zscore" ? "σ" : "k × std"})</label>
            <div className="slider-group">
              <input type="range" min="1" max="5" step="0.5" value={anomalyThreshold}
                onChange={e => setAnomalyThreshold(e.target.value)} className="slider" />
              <span className="slider-value">{anomalyThreshold}</span>
            </div>
          </div>
        )}

        {/* ── EVENT MARKERS ── */}
        <div className="section-label">Event Markers</div>

        <div className="form-group">
          <label>Marker Timestamps</label>
          <input type="text" value={eventMarkers}
            onChange={e => setEventMarkers(e.target.value)}
            placeholder="2024-01-15, 2024-06-01"
            className="form-input" />
          <span className="input-hint">Comma-separated dates for vertical reference lines</span>
        </div>

        {/* ── FACET ── */}
        <div className="section-label">Panel Facet</div>

        <div className="form-group">
          <label>Facet By</label>
          <select value={facetField} onChange={e => setFacetField(e.target.value)} className="form-select">
            <option value="">None</option>
            {headers.filter(h => h !== timeField && h !== valueField && h !== seriesField).map(h =>
              <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Small multiples per group</span>
        </div>

        {facetField && (
          <>
            <div className="form-group nested">
              <label>Columns Per Row</label>
              <input type="number" min="1" max="4" value={facetCols}
                onChange={e => setFacetCols(e.target.value)} className="form-input" />
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="shared-check" checked={sharedAxes}
                onChange={() => setSharedAxes(!sharedAxes)} />
              <label htmlFor="shared-check">Shared Axes Across Panels</label>
            </div>
          </>
        )}

        {/* ── AXIS ── */}
        <div className="section-label">Axis</div>

        <div className="form-group">
          <label>Y Scale</label>
          <div className="segmented-control">
            {(["linear","log","symlog"] as AxisScale[]).map(s => (
              <button key={s} className={`seg-btn ${axisScale === s ? "active" : ""}`}
                onClick={() => setAxisScale(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>X Label</label>
          <input type="text" value={xLabel} onChange={e => setXLabel(e.target.value)}
            placeholder={timeField || "Auto from field name"} className="form-input" />
        </div>

        <div className="form-group">
          <label>Y Label</label>
          <input type="text" value={yLabel} onChange={e => setYLabel(e.target.value)}
            placeholder={valueField || "Auto from field name"} className="form-input" />
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
                <input type="number" value={yMin} onChange={e => setYMin(e.target.value)}
                  className="form-input-small" placeholder="0" />
              </div>
              <div className="input-wrapper">
                <span className="mini-label">Y Max</span>
                <input type="number" value={yMax} onChange={e => setYMax(e.target.value)}
                  className="form-input-small" placeholder="100" />
              </div>
            </div>
          </div>
        )}

        {/* ── VISUALS ── */}
        <div className="section-label">Visuals</div>

        <div className="form-group">
          <label>Rolling Line Width</label>
          <div className="slider-group">
            <input type="range" min="0.5" max="5" step="0.5" value={lineWidth}
              onChange={e => setLineWidth(e.target.value)} className="slider" />
            <span className="slider-value">{lineWidth}</span>
          </div>
        </div>

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
            </optgroup>
          </select>
        </div>

        <div className="form-group">
          <label>Grid Style</label>
          <div className="segmented-control">
            {([
              ["none", "None"],
              ["horizontal", "Horiz"],
              ["full", "Full"],
            ] as const).map(([v, l]) => (
              <button key={v} className={`seg-btn ${gridStyle === v ? "active" : ""}`}
                onClick={() => { setGridStyle(v); setShowGrid(v !== "none"); }}>
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

        {/* ── STATISTICAL INFERENCE ── */}
        <div className="section-label">Statistical Inference</div>
        <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
          Select categories to compute on generate
        </span>

        <div className="stat-category-cards">
          <label className={`stat-category-card ${computeRollingStats ? "active" : ""}`}>
            <input type="checkbox" checked={computeRollingStats} onChange={() => setComputeRollingStats(!computeRollingStats)} />
            <div className="stat-cat-icon" aria-hidden="true"><BarChart3 /></div>
            <div className="stat-cat-label">Rolling</div>
            <div className="stat-cat-desc">mean, σ, variance, SNR</div>
          </label>
          <label className={`stat-category-card ${computeTrend ? "active" : ""}`}>
            <input type="checkbox" checked={computeTrend} onChange={() => setComputeTrend(!computeTrend)} />
            <div className="stat-cat-icon" aria-hidden="true"><TrendingUp /></div>
            <div className="stat-cat-label">Trend</div>
            <div className="stat-cat-desc">slope, R², p</div>
          </label>
          <label className={`stat-category-card ${computeSmoothing ? "active" : ""}`}>
            <input type="checkbox" checked={computeSmoothing} onChange={() => setComputeSmoothing(!computeSmoothing)} />
            <div className="stat-cat-icon" aria-hidden="true"><LineChart /></div>
            <div className="stat-cat-label">Error</div>
            <div className="stat-cat-desc">MAE, RMSE, MSE</div>
          </label>
          <label className={`stat-category-card ${computeAutocorrelation ? "active" : ""}`}>
            <input type="checkbox" checked={computeAutocorrelation} onChange={() => setComputeAutocorrelation(!computeAutocorrelation)} />
            <div className="stat-cat-icon" aria-hidden="true"><Activity /></div>
            <div className="stat-cat-label">Auto-corr</div>
            <div className="stat-cat-desc">ACF, PACF lags</div>
          </label>
          <label className={`stat-category-card ${computeAnomalyStats ? "active" : ""}`}>
            <input type="checkbox" checked={computeAnomalyStats} onChange={() => setComputeAnomalyStats(!computeAnomalyStats)} />
            <div className="stat-cat-icon" aria-hidden="true"><AlertTriangle /></div>
            <div className="stat-cat-label">Anomalies</div>
            <div className="stat-cat-desc">count, method</div>
          </label>
        </div>

        <button onClick={generatePlot} className="generate-button"
          disabled={loading || !timeField || !valueField}>
          {loading ? "Generating..." : "Generate Plot"}
        </button>
      </div>

      {/* ── PLOT AREA ─────────────────────────────────────────────────────── */}
      <div className="plot-area">
        {loading ? (
          <div className="plot-area-center">
            <div className="loading-state">
              <div className="rm-loader">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="dot" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p className="placeholder-text">Computing rolling statistics…</p>
            </div>
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="Rolling Mean Plot" className="plot-image" />
        ) : (
          <div className="plot-area-center">
            <div className="empty-state">
              <div className="empty-rm-icon">
                <svg width="140" height="80" viewBox="0 0 200 90" fill="none">
                  <line x1="10" y1="70" x2="190" y2="70" stroke="#00d4ff" strokeWidth="0.5" opacity="0.15"/>
                  <line x1="10" y1="50" x2="190" y2="50" stroke="#00d4ff" strokeWidth="0.5" opacity="0.1"/>
                  <line x1="10" y1="30" x2="190" y2="30" stroke="#00d4ff" strokeWidth="0.5" opacity="0.1"/>
                  <line x1="10" y1="70" x2="190" y2="70" stroke="#00d4ff" strokeWidth="1" opacity="0.3"/>
                  <line x1="10" y1="10" x2="10" y2="70" stroke="#00d4ff" strokeWidth="1" opacity="0.3"/>
                  <path d="M15 55 L25 38 L35 62 L45 30 L55 58 L65 42 L75 35 L85 50 L95 28 L105 45 L115 60 L125 32 L135 48 L145 22 L155 40 L165 35 L175 50 L185 28"
                    stroke="#7faddb" strokeWidth="1" fill="none" opacity="0.35" strokeDasharray="2 2"/>
                  <path d="M25 50 L45 46 L65 42 L85 40 L105 38 L125 35 L145 33 L165 38 L185 32"
                    stroke="#00d4ff" strokeWidth="2.5" fill="none" opacity="0.85" strokeLinecap="round"/>
                  <path d="M25 50 L45 46 L65 42 L85 40 L105 38 L125 35 L145 33 L165 38 L185 32
                           L185 42 L165 48 L145 43 L125 45 L105 48 L85 50 L65 52 L45 56 L25 60Z"
                    fill="#00d4ff" opacity="0.07"/>
                  <circle cx="35" cy="62" r="4" fill="none" stroke="#ffaa00" strokeWidth="1.5" opacity="0.7"/>
                  <circle cx="45" cy="30" r="4" fill="none" stroke="#ffaa00" strokeWidth="1.5" opacity="0.7"/>
                </svg>
              </div>
              <p className="placeholder-text">Configure and generate rolling mean</p>
              <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: 4, opacity: 0.6 }}>
                Smoothing · Volatility Bands · Multi-Window · Anomalies
              </p>
            </div>
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
              {computeRollingStats && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><BarChart3 /></span> Rolling Statistics</h4>
                  <div className="stat-rows">
                    <StatRow label="Rolling Mean Level"  value={fmt(statResults.rolling_mean_level)} />
                    <StatRow label="Rolling Std Dev"     value={fmt(statResults.rolling_std)} />
                    <StatRow label="Rolling Variance"    value={fmt(statResults.rolling_variance)} />
                    <StatRow label="Signal/Noise Ratio"  value={fmt(statResults.signal_noise_ratio, 3)}
                      highlight={(statResults.signal_noise_ratio ?? 0) > 5} />
                    <StatRow label="Volatility Index"    value={fmt(statResults.volatility_index, 4)} />
                    {statResults.ci_lower !== undefined && (
                      <StatRow label="CI Bounds"
                        value={`[${fmt(statResults.ci_lower, 3)}, ${fmt(statResults.ci_upper, 3)}]`} />
                    )}
                  </div>
                </div>
              )}
              {computeTrend && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><TrendingUp /></span> Trend (on Rolling Values)</h4>
                  <div className="stat-rows">
                    <StatRow label="Slope"     value={fmt(statResults.trend_slope, 6)}
                      highlight={(statResults.trend_slope ?? 0) !== 0} />
                    <StatRow label="Direction" value={statResults.trend_direction ?? "—"} />
                    <StatRow label="R²"        value={fmt(statResults.r_squared, 4)} />
                    <StatRow label="p-value"   value={sigLabel(statResults.p_value)}
                      highlight={(statResults.p_value ?? 1) < 0.05} />
                  </div>
                </div>
              )}
              {computeSmoothing && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><LineChart /></span> Smoothing Error (Raw vs Rolling)</h4>
                  <div className="stat-rows">
                    <StatRow label="MAE"  value={fmt(statResults.mae, 4)} />
                    <StatRow label="RMSE" value={fmt(statResults.rmse, 4)} />
                    <StatRow label="MSE"  value={fmt(statResults.mse, 4)} />
                  </div>
                  <div className="stat-note">Lower values indicate a tighter fit between raw and rolling signal.</div>
                </div>
              )}
              {computeAutocorrelation && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><Activity /></span> Autocorrelation (Rolling Series)</h4>
                  <div className="stat-rows">
                    <StatRow label="ACF lag-1"  value={fmt(statResults.acf_lag1, 4)}
                      highlight={Math.abs(statResults.acf_lag1 ?? 0) > 0.7} />
                    <StatRow label="ACF lag-2"  value={fmt(statResults.acf_lag2, 4)} />
                    <StatRow label="PACF lag-1" value={fmt(statResults.pacf_lag1, 4)}
                      highlight={Math.abs(statResults.pacf_lag1 ?? 0) > 0.7} />
                  </div>
                  {(statResults.acf_lag1 ?? 0) > 0.9 && (
                    <div className="stat-note">
                      <span className="note-icon" aria-hidden="true"><AlertTriangle /></span>
                      Very high ACF — rolling series has strong persistence (common with large windows).
                    </div>
                  )}
                </div>
              )}
              {computeAnomalyStats && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><AlertTriangle /></span> Anomaly Detection</h4>
                  <div className="stat-rows">
                    <StatRow label="Anomaly Count" value={String(statResults.anomaly_count ?? "—")}
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

function StatRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`stat-row ${highlight ? "highlight" : ""}`}>
      <span className="stat-key">{label}</span>
      <span className="stat-val">{value}</span>
    </div>
  );
}