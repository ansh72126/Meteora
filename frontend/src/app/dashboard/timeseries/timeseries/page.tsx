"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  LineChart,
  Sigma,
  TrendingUp,
  Waves,
  X,
} from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./TimeSeriesPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type ResampleFreq = "none" | "sec" | "min" | "hour" | "day" | "week" | "month" | "year";
type AggMethod = "mean" | "sum" | "median" | "count";
type MissingHandling = "ffill" | "bfill" | "interpolate" | "gap";
type SmoothingMethod = "none" | "moving_average" | "exponential" | "loess";
type TrendLine = "none" | "linear" | "polynomial";
type AxisScale = "linear" | "log" | "symlog";
type AnomalyRule = "none" | "zscore" | "iqr";
type TimeInputType = "datetime-local" | "date" | "month" | "number";

const AGG_META: Record<AggMethod, { label: string; desc: string }> = {
  mean:   { label: "Mean",   desc: "Average of all values in each interval" },
  sum:    { label: "Sum",    desc: "Total accumulated value per interval" },
  median: { label: "Median", desc: "Middle value — ignores extreme spikes" },
  count:  { label: "Count",  desc: "Number of data points per interval" },
};

function detectTimeInputType(fieldName: string): TimeInputType {
  const f = fieldName.toLowerCase();
  if (f.includes("year") && !f.includes("month") && !f.includes("day")) return "number";
  if (f.includes("month") && !f.includes("day")) return "month";
  if (f.includes("date") || f.includes("day") || f.includes("dt")) return "date";
  return "datetime-local";
}

interface StatResult {
  sample_size?: number;
  mean_value?: number;
  median_value?: number;
  std_dev?: number;
  trend_slope?: number;
  r_squared?: number;
  p_value?: number;
  trend_direction?: string;
  acf_lag1?: number;
  acf_lag2?: number;
  acf_lag3?: number;
  pacf_lag1?: number;
  pacf_lag2?: number;
  seasonal_strength?: number;
  dominant_period?: number;
  rmse?: number;
  mae?: number;
  mse?: number;
  anomaly_count?: number;
  anomaly_method?: string;
}

export default function TimeSeriesPage() {
  const [headers, setHeaders] = useState<string[]>([]);

  const [timeField, setTimeField] = useState("");
  const [valueField, setValueField] = useState("");
  const [seriesField, setSeriesField] = useState("");
  const [secondaryValueField, setSecondaryValueField] = useState("");

  const [resampleFreq, setResampleFreq] = useState<ResampleFreq>("none");
  const [aggMethod, setAggMethod] = useState<AggMethod>("mean");

  const [dateRangeEnabled, setDateRangeEnabled] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeInputType, setTimeInputType] = useState<TimeInputType>("date");

  const [missingHandling, setMissingHandling] = useState<MissingHandling>("ffill");

  const [smoothingMethod, setSmoothingMethod] = useState<SmoothingMethod>("none");
  const [rollingWindow, setRollingWindow] = useState("7");
  const [showConfidenceBand, setShowConfidenceBand] = useState(true);
  const [confidenceBandAlpha, setConfidenceBandAlpha] = useState("0.15");

  const [trendLine, setTrendLine] = useState<TrendLine>("none");
  const [trendPolyDegree, setTrendPolyDegree] = useState("2");

  const [seasonalityDetection, setSeasonalityDetection] = useState(false);
  const [seasonalityPeriod, setSeasonalityPeriod] = useState("12");
  const [changePointDetection, setChangePointDetection] = useState(false);

  const [axisScale, setAxisScale] = useState<AxisScale>("linear");
  const [yAxisAuto, setYAxisAuto] = useState(true);
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");

  const [anomalyRule, setAnomalyRule] = useState<AnomalyRule>("none");
  const [anomalyThreshold, setAnomalyThreshold] = useState("3");

  const [eventMarkers, setEventMarkers] = useState("");

  const [facetField, setFacetField] = useState("");
  const [facetCols, setFacetCols] = useState("2");
  const [sharedAxes, setSharedAxes] = useState(true);

  const [lineWidth, setLineWidth] = useState("2");
  const [lineStyle, setLineStyle] = useState("solid");
  const [markerStyle, setMarkerStyle] = useState("none");
  const [markerSize, setMarkerSize] = useState("5");
  const [colorPalette, setColorPalette] = useState("tab10");
  const [showGrid, setShowGrid] = useState(true);
  const [gridStyle, setGridStyle] = useState("horizontal");
  const [showLegend, setShowLegend] = useState(true);
  const [areaFill, setAreaFill] = useState(false);
  const [fillAlpha, setFillAlpha] = useState("0.15");
  const [darkTheme, setDarkTheme] = useState(false);

  const [computeDescriptive, setComputeDescriptive] = useState(true);
  const [computeTrend, setComputeTrend] = useState(false);
  const [computeAutocorrelation, setComputeAutocorrelation] = useState(false);
  const [computeSeasonality, setComputeSeasonality] = useState(false);
  const [computeErrorMetrics, setComputeErrorMetrics] = useState(false);
  const [computeAnomalyStats, setComputeAnomalyStats] = useState(false);

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [statResults, setStatResults] = useState<StatResult | null>(null);
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
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the time series." };
    }
    if (!timeField || !valueField) {
      return { valid: false, message: "Both Time Field and Value Field are required. Select a column for each before generating." };
    }
    const selectedFields = [timeField, valueField, seriesField, secondaryValueField, facetField].filter(Boolean);
    if (new Set(selectedFields).size !== selectedFields.length) {
      return { valid: false, message: "The same field is selected for multiple roles. Choose different fields for Time, Value, Series, Secondary, and Facet." };
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/timeseries/timeseries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          time_column: timeField,
          value_column: valueField,
          series_column: seriesField || null,
          secondary_value_column: secondaryValueField || null,
          start_date: dateRangeEnabled && startDate ? startDate : null,
          end_date: dateRangeEnabled && endDate ? endDate : null,
          resample_frequency: resampleFreq,
          aggregation_method: aggMethod,
          missing_value_handling: missingHandling,
          smoothing_method: smoothingMethod,
          rolling_window: parseInt(rollingWindow),
          show_confidence_band: showConfidenceBand,
          confidence_band_alpha: parseFloat(confidenceBandAlpha),
          trend_line: trendLine,
          trend_poly_degree: parseInt(trendPolyDegree),
          seasonality_detection: seasonalityDetection,
          seasonality_period: parseInt(seasonalityPeriod),
          change_point_detection: changePointDetection,
          axis_scale: axisScale,
          y_min: !yAxisAuto && yMin ? parseFloat(yMin) : null,
          y_max: !yAxisAuto && yMax ? parseFloat(yMax) : null,
          x_label: xLabel || null,
          y_label: yLabel || null,
          anomaly_rule: anomalyRule,
          anomaly_threshold: parseFloat(anomalyThreshold),
          event_markers: eventMarkers
            ? eventMarkers.split(",").map(s => s.trim()).filter(Boolean)
            : [],
          facet_column: facetField || null,
          facet_cols: parseInt(facetCols),
          shared_axes: sharedAxes,
          line_width: parseFloat(lineWidth),
          line_style: lineStyle,
          marker_style: markerStyle,
          marker_size: parseInt(markerSize),
          color_palette: colorPalette,
          show_grid: showGrid,
          grid_style: gridStyle,
          show_legend: showLegend,
          area_fill: areaFill,
          fill_alpha: parseFloat(fillAlpha),
          dark_theme: darkTheme,
          compute_descriptive: computeDescriptive,
          compute_trend: computeTrend,
          compute_autocorrelation: computeAutocorrelation,
          compute_seasonality: computeSeasonality || seasonalityDetection,
          compute_error_metrics: computeErrorMetrics,
          compute_anomaly_stats: computeAnomalyStats,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate time series"));
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
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the time series.";
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
      link.download = `TimeSeries_${valueField}_over_${timeField}.png`;
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
    <div className="ts-container">

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
        <h2 className="panel-title">Time Series</h2>
        <p className="panel-subtitle">Temporal Trend Analysis</p>

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
          <label>Value Axis <span className="label-badge">Required</span></label>
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
          <span className="input-hint">Multi-series comparison by category</span>
        </div>

        <div className="form-group">
          <label>Secondary Y Field</label>
          <select value={secondaryValueField} onChange={e => setSecondaryValueField(e.target.value)} className="form-select">
            <option value="">None</option>
            {headers.filter(h => h !== timeField && h !== valueField && h !== seriesField).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Dual-axis overlay for different scales</span>
        </div>

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
            {resampleFreq === "none"  && "No resampling — use raw data points"}
            {resampleFreq === "sec"   && "Group into 1-second buckets"}
            {resampleFreq === "min"   && "Group into 1-minute buckets"}
            {resampleFreq === "hour"  && "Group into hourly buckets"}
            {resampleFreq === "day"   && "Group into daily buckets"}
            {resampleFreq === "week"  && "Group into weekly buckets"}
            {resampleFreq === "month" && "Group into monthly buckets"}
            {resampleFreq === "year"  && "Group into yearly buckets"}
          </span>
        </div>

        {resampleFreq !== "none" && (
          <div className="form-group nested">
            <label>Aggregation Method</label>
            <div className="agg-cards">
              {(["mean","sum","median","count"] as AggMethod[]).map(m => (
                <label key={m} className={`agg-card ${aggMethod === m ? "active" : ""}`}>
                  <input type="radio" name="agg" value={m} checked={aggMethod === m} onChange={() => setAggMethod(m)} />
                  <span className="agg-label">{AGG_META[m].label}</span>
                  <span className="agg-desc">{AGG_META[m].desc}</span>
                </label>
              ))}
            </div>
          </div>
        )}

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
              <span className="input-hint" style={{ marginBottom: 8 }}>Only data within this window will be plotted</span>
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
                <button className="clear-range-btn" onClick={() => { setStartDate(""); setEndDate(""); }}>
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
                onClick={() => setMissingHandling(m)}>
                {m === "ffill" ? "Fwd Fill" : m === "bfill" ? "Bwd Fill" : m === "interpolate" ? "Interp" : "Gap Break"}
              </button>
            ))}
          </div>
          <span className="input-hint">
            {missingHandling === "ffill"        && "Carry last valid value forward"}
            {missingHandling === "bfill"        && "Fill using next valid value"}
            {missingHandling === "interpolate"  && "Linear interpolation between valid points"}
            {missingHandling === "gap"          && "Leave gaps visible in the line"}
          </span>
        </div>

        {/* ── SMOOTHING ── */}
        <div className="section-label">Smoothing</div>

        <div className="form-group">
          <label>Smoothing Method</label>
          <div className="segmented-control">
            {(["none","moving_average","exponential","loess"] as SmoothingMethod[]).map(m => (
              <button key={m} className={`seg-btn ${smoothingMethod === m ? "active" : ""}`}
                onClick={() => setSmoothingMethod(m)}>
                {m === "none" ? "None" : m === "moving_average" ? "MA" : m === "exponential" ? "EWM" : "LOESS"}
              </button>
            ))}
          </div>
        </div>

        {smoothingMethod !== "none" && (
          <>
            <div className="form-group nested">
              <label>Rolling Window</label>
              <div className="slider-group">
                <input type="range" min="2" max="60" step="1" value={rollingWindow}
                  onChange={e => setRollingWindow(e.target.value)} className="slider" />
                <span className="slider-value">{rollingWindow}</span>
              </div>
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="ci-check" checked={showConfidenceBand}
                onChange={() => setShowConfidenceBand(!showConfidenceBand)} />
              <label htmlFor="ci-check">Confidence Band</label>
            </div>
            {showConfidenceBand && (
              <div className="form-group nested">
                <label>Band Alpha</label>
                <div className="slider-group">
                  <input type="range" min="0.05" max="0.4" step="0.05" value={confidenceBandAlpha}
                    onChange={e => setConfidenceBandAlpha(e.target.value)} className="slider" />
                  <span className="slider-value">{confidenceBandAlpha}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TREND ── */}
        <div className="section-label">Trend Line</div>

        <div className="form-group">
          <label>Trend Model</label>
          <div className="segmented-control">
            {(["none","linear","polynomial"] as TrendLine[]).map(t => (
              <button key={t} className={`seg-btn ${trendLine === t ? "active" : ""}`}
                onClick={() => setTrendLine(t)}>
                {t === "none" ? "None" : t === "linear" ? "Linear" : "Polynomial"}
              </button>
            ))}
          </div>
        </div>

        {trendLine === "polynomial" && (
          <div className="form-group nested">
            <label>Polynomial Degree</label>
            <input type="number" min="2" max="6" value={trendPolyDegree}
              onChange={e => setTrendPolyDegree(e.target.value)} className="form-input" />
          </div>
        )}

        {/* ── DECOMPOSITION ── */}
        <div className="section-label">Decomposition</div>

        <div className={`decomp-card ${seasonalityDetection ? "active" : ""}`}
          onClick={() => setSeasonalityDetection(!seasonalityDetection)}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={seasonalityDetection} readOnly />
            <span className="decomp-card-title">Seasonality Detection</span>
          </div>
          <span className="decomp-card-desc">
            Decomposes into trend + seasonal + residual using STL.
            Computes seasonal strength and dominant cycle period.
          </span>
        </div>

        {seasonalityDetection && (
          <div className="form-group nested">
            <label>Season Period
              <span className="input-hint" style={{ display: "inline", marginLeft: 8 }}>
                (intervals per cycle, e.g. 12 for monthly → yearly)
              </span>
            </label>
            <div className="slider-group">
              <input type="range" min="2" max="52" step="1" value={seasonalityPeriod}
                onChange={e => setSeasonalityPeriod(e.target.value)} className="slider" />
              <span className="slider-value">{seasonalityPeriod}</span>
            </div>
            <div className="period-presets">
              {([["7","Weekly"],["12","Monthly"],["24","Hourly"],["52","Yearly"]] as const).map(([v, l]) => (
                <button key={v}
                  className={`period-preset-btn ${seasonalityPeriod === v ? "active" : ""}`}
                  onClick={e => { e.stopPropagation(); setSeasonalityPeriod(v); }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`decomp-card ${changePointDetection ? "active" : ""}`}
          onClick={() => setChangePointDetection(!changePointDetection)}
          style={{ marginTop: 8 }}>
          <div className="decomp-card-top">
            <input type="checkbox" checked={changePointDetection} readOnly />
            <span className="decomp-card-title">Change Point Detection</span>
          </div>
          <span className="decomp-card-desc">
            Identifies structural breaks using CUSUM.
            Marked as dotted vertical lines on the plot.
          </span>
        </div>

        {/* ── AXIS ── */}
        <div className="section-label">Axis</div>

        <div className="form-group">
          <label>Y Axis Scale</label>
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

        {/* ── ANOMALIES ── */}
        <div className="section-label">Anomaly Detection</div>

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
        </div>

        {anomalyRule !== "none" && (
          <div className="form-group nested">
            <label>Threshold ({anomalyRule === "zscore" ? "σ" : "×IQR"})</label>
            <div className="slider-group">
              <input type="range"
                min={anomalyRule === "zscore" ? "1.5" : "1"}
                max={anomalyRule === "zscore" ? "5" : "3"}
                step="0.5"
                value={anomalyThreshold}
                onChange={e => setAnomalyThreshold(e.target.value)}
                className="slider" />
              <span className="slider-value">{anomalyThreshold}</span>
            </div>
          </div>
        )}

        {/* ── EVENT MARKERS ── */}
        <div className="section-label">Event Markers</div>

        <div className="form-group">
          <label>Marker Timestamps</label>
          <input type="text" value={eventMarkers} onChange={e => setEventMarkers(e.target.value)}
            placeholder="2024-01-15, 2024-06-01" className="form-input" />
          <span className="input-hint">Comma-separated dates for vertical reference lines</span>
        </div>

        {/* ── FACET ── */}
        <div className="section-label">Panel Facet</div>

        <div className="form-group">
          <label>Facet By</label>
          <select value={facetField} onChange={e => setFacetField(e.target.value)} className="form-select">
            <option value="">None</option>
            {headers.filter(h => h !== timeField && h !== valueField).map(h =>
              <option key={h} value={h}>{h}</option>
            )}
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

        {/* ── LINE STYLE ── */}
        <div className="section-label">Line Style</div>

        <div className="form-group">
          <label>Line Width</label>
          <div className="slider-group">
            <input type="range" min="0.5" max="5" step="0.5" value={lineWidth}
              onChange={e => setLineWidth(e.target.value)} className="slider" />
            <span className="slider-value">{lineWidth}</span>
          </div>
        </div>

        <div className="form-group">
          <label>Line Style</label>
          <div className="segmented-control">
            {([["solid","—"],["dashed","- -"],["dotted","···"],["dashdot","-·-"]] as const).map(([v, label]) => (
              <button key={v} className={`seg-btn ${lineStyle === v ? "active" : ""}`}
                onClick={() => setLineStyle(v)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Marker Style</label>
          <div className="segmented-control">
            {([["none","None"],["o","●"],["s","■"],["^","▲"],["D","◆"]] as const).map(([v, label]) => (
              <button key={v} className={`seg-btn ${markerStyle === v ? "active" : ""}`}
                onClick={() => setMarkerStyle(v)}>{label}</button>
            ))}
          </div>
        </div>

        {markerStyle !== "none" && (
          <div className="form-group nested">
            <label>Marker Size</label>
            <div className="slider-group">
              <input type="range" min="2" max="12" step="1" value={markerSize}
                onChange={e => setMarkerSize(e.target.value)} className="slider" />
              <span className="slider-value">{markerSize}</span>
            </div>
          </div>
        )}

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

        {/* ── VISUAL OPTIONS ── */}
        <div className="section-label">Visual Options</div>

        <div className="form-group">
          <label>Grid Style</label>
          <div className="segmented-control">
            {([["none","None"],["horizontal","Horiz"],["full","Full"]] as const).map(([v, label]) => (
              <button key={v} className={`seg-btn ${gridStyle === v ? "active" : ""}`}
                onClick={() => { setGridStyle(v); setShowGrid(v !== "none"); }}>{label}</button>
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

        <div className="checkbox-group">
          <input type="checkbox" id="area-check" checked={areaFill}
            onChange={() => setAreaFill(!areaFill)} />
          <label htmlFor="area-check">Area Fill Under Line</label>
        </div>

        {areaFill && (
          <div className="form-group nested">
            <label>Fill Alpha</label>
            <div className="slider-group">
              <input type="range" min="0.05" max="0.5" step="0.05" value={fillAlpha}
                onChange={e => setFillAlpha(e.target.value)} className="slider" />
              <span className="slider-value">{fillAlpha}</span>
            </div>
          </div>
        )}

        {/* ── STATISTICAL INFERENCE ── */}
        <div className="section-label">Statistical Inference</div>
        <span className="input-hint" style={{ marginBottom: 10, display: "block" }}>
          Select categories to compute on generate
        </span>

        <div className="stat-category-cards">
          <label className={`stat-category-card ${computeDescriptive ? "active" : ""}`}>
            <input type="checkbox" checked={computeDescriptive} onChange={() => setComputeDescriptive(!computeDescriptive)} />
            <div className="stat-cat-icon" aria-hidden="true"><BarChart3 /></div>
            <div className="stat-cat-label">Descriptive</div>
            <div className="stat-cat-desc">N, μ, σ, median</div>
          </label>
          <label className={`stat-category-card ${computeTrend ? "active" : ""}`}>
            <input type="checkbox" checked={computeTrend} onChange={() => setComputeTrend(!computeTrend)} />
            <div className="stat-cat-icon" aria-hidden="true"><TrendingUp /></div>
            <div className="stat-cat-label">Trend</div>
            <div className="stat-cat-desc">slope, R², p</div>
          </label>
          <label className={`stat-category-card ${computeAutocorrelation ? "active" : ""}`}>
            <input type="checkbox" checked={computeAutocorrelation} onChange={() => setComputeAutocorrelation(!computeAutocorrelation)} />
            <div className="stat-cat-icon" aria-hidden="true"><Activity /></div>
            <div className="stat-cat-label">Auto-corr</div>
            <div className="stat-cat-desc">ACF, PACF</div>
          </label>
          <label className={`stat-category-card ${computeSeasonality ? "active" : ""}`}>
            <input type="checkbox" checked={computeSeasonality} onChange={() => setComputeSeasonality(!computeSeasonality)} />
            <div className="stat-cat-icon" aria-hidden="true"><Waves /></div>
            <div className="stat-cat-label">Seasonal</div>
            <div className="stat-cat-desc">strength, period</div>
          </label>
          <label className={`stat-category-card ${computeErrorMetrics ? "active" : ""}`}>
            <input type="checkbox" checked={computeErrorMetrics} onChange={() => setComputeErrorMetrics(!computeErrorMetrics)} />
            <div className="stat-cat-icon" aria-hidden="true"><LineChart /></div>
            <div className="stat-cat-label">Error</div>
            <div className="stat-cat-desc">MSE, RMSE, MAE</div>
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
              <div className="ts-loader">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="dot" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p className="placeholder-text">Rendering time series...</p>
            </div>
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="Time Series Plot" className="plot-image" />
        ) : (
          <div className="plot-area-center">
            <div className="empty-state">
              <div className="empty-ts-icon">
                <svg width="120" height="80" viewBox="0 0 160 90" fill="none">
                  <line x1="10" y1="70" x2="150" y2="70" stroke="#00d4ff" strokeWidth="0.5" opacity="0.15"/>
                  <line x1="10" y1="50" x2="150" y2="50" stroke="#00d4ff" strokeWidth="0.5" opacity="0.1"/>
                  <line x1="10" y1="30" x2="150" y2="30" stroke="#00d4ff" strokeWidth="0.5" opacity="0.1"/>
                  <line x1="10" y1="70" x2="150" y2="70" stroke="#00d4ff" strokeWidth="1" opacity="0.3"/>
                  <line x1="10" y1="10" x2="10" y2="70" stroke="#00d4ff" strokeWidth="1" opacity="0.3"/>
                  <path d="M15 62 L30 55 L45 58 L60 42 L75 45 L90 30 L105 35 L120 22 L135 28 L148 18"
                    stroke="#00d4ff" strokeWidth="2" fill="none" opacity="0.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 62 L30 55 L45 58 L60 42 L75 45 L90 30 L105 35 L120 22 L135 28 L148 18 L148 70 L15 70Z"
                    fill="#00d4ff" opacity="0.06"/>
                  <line x1="15" y1="64" x2="148" y2="20" stroke="#ff6b6b" strokeWidth="1.2" strokeDasharray="5 3" opacity="0.35"/>
                  <circle cx="75" cy="45" r="4" fill="none" stroke="#ffaa00" strokeWidth="1.5" opacity="0.6"/>
                </svg>
              </div>
              <p className="placeholder-text">Configure fields and generate</p>
              <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
                Trend · Seasonality · Autocorrelation · Anomalies
              </p>
            </div>
          </div>
        )}

        <button className="download-btn" onClick={handleDownload} disabled={!plotUrl || loading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
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
              {computeDescriptive && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><BarChart3 /></span> Descriptive Statistics</h4>
                  <div className="stat-rows">
                    <StatRow label="Sample Size (N)" value={String(statResults.sample_size ?? "—")} />
                    <StatRow label="Mean"            value={fmt(statResults.mean_value, 4)} />
                    <StatRow label="Median"          value={fmt(statResults.median_value, 4)} />
                    <StatRow label="Std Deviation"   value={fmt(statResults.std_dev, 4)} />
                  </div>
                </div>
              )}
              {computeTrend && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><TrendingUp /></span> Trend Analysis</h4>
                  <div className="stat-rows">
                    <StatRow label="Trend Slope" value={fmt(statResults.trend_slope, 6)}
                      highlight={(statResults.trend_slope ?? 0) !== 0} />
                    <StatRow label="Direction"   value={statResults.trend_direction ?? "—"} />
                    <StatRow label="R²"          value={fmt(statResults.r_squared, 4)} />
                    <StatRow label="p-value"     value={sigLabel(statResults.p_value)}
                      highlight={(statResults.p_value ?? 1) < 0.05} />
                  </div>
                </div>
              )}
              {computeAutocorrelation && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><Activity /></span> Autocorrelation (ACF / PACF)</h4>
                  <div className="stat-rows">
                    <StatRow label="ACF lag-1"  value={fmt(statResults.acf_lag1, 4)}
                      highlight={Math.abs(statResults.acf_lag1 ?? 0) > 0.5} />
                    <StatRow label="ACF lag-2"  value={fmt(statResults.acf_lag2, 4)} />
                    <StatRow label="ACF lag-3"  value={fmt(statResults.acf_lag3, 4)} />
                    <StatRow label="PACF lag-1" value={fmt(statResults.pacf_lag1, 4)}
                      highlight={Math.abs(statResults.pacf_lag1 ?? 0) > 0.5} />
                    <StatRow label="PACF lag-2" value={fmt(statResults.pacf_lag2, 4)} />
                  </div>
                </div>
              )}
              {computeSeasonality && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><Waves /></span> Seasonality</h4>
                  <div className="stat-rows">
                    <StatRow label="Seasonal Strength" value={fmt(statResults.seasonal_strength, 4)}
                      highlight={(statResults.seasonal_strength ?? 0) > 0.5} />
                    <StatRow label="Dominant Period" value={
                      statResults.dominant_period !== undefined ? `${statResults.dominant_period} periods` : "—"
                    } />
                  </div>
                  {(statResults.seasonal_strength ?? 0) > 0.5 && (
                    <div className="stat-note">
                      <span className="note-icon" aria-hidden="true"><AlertTriangle /></span>
                      Strong seasonal component detected
                    </div>
                  )}
                </div>
              )}
              {computeErrorMetrics && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><LineChart /></span> Error Metrics (vs Trend)</h4>
                  <div className="stat-rows">
                    <StatRow label="MSE"  value={fmt(statResults.mse,  4)} />
                    <StatRow label="RMSE" value={fmt(statResults.rmse, 4)} />
                    <StatRow label="MAE"  value={fmt(statResults.mae,  4)} />
                  </div>
                </div>
              )}
              {computeAnomalyStats && (
                <div className="stat-block">
                  <h4 className="stat-block-title"><span className="stat-block-icon" aria-hidden="true"><AlertTriangle /></span> Anomaly Detection</h4>
                  <div className="stat-rows">
                    <StatRow label="Anomaly Count" value={String(statResults.anomaly_count ?? "—")}
                      highlight={(statResults.anomaly_count ?? 0) > 0} />
                    <StatRow label="Method" value={statResults.anomaly_method ?? anomalyRule} />
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