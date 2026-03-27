"use client";

import { useState, useEffect, useRef } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./LineChartPage.css";

export default function LineChartPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [numericHeaders, setNumericHeaders] = useState<string[]>([]);

  // Configuration states — ALL UNCHANGED
  const [xAxisField, setXAxisField] = useState("");
  const [yAxisField, setYAxisField] = useState("");
  const [seriesGroupField, setSeriesGroupField] = useState("");
  const [multiSeriesMode, setMultiSeriesMode] = useState<"single" | "multiple">("single");
  const [xAxisType, setXAxisType] = useState<"time" | "numeric" | "categorical">("numeric");
  const [yAxisScale, setYAxisScale] = useState<"linear" | "log" | "symlog">("linear");
  const [aggregationMethod, setAggregationMethod] = useState<"sum" | "mean" | "count" | "none">("none");
  const [sortingOrder, setSortingOrder] = useState<"chronological" | "ascending">("ascending");
  const [missingValueHandling, setMissingValueHandling] = useState<"connect" | "break" | "interpolate">("connect");
  const [enableSecondaryAxis, setEnableSecondaryAxis] = useState(false);
  const [secondaryYField, setSecondaryYField] = useState("");
  const [defaultLineStyle, setDefaultLineStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  const [colorMode, setColorMode] = useState<"auto" | "custom">("auto");
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState<"best" | "upper right" | "lower right">("best");
  const [gridStyle, setGridStyle] = useState<"none" | "horizontal" | "full">("horizontal");
  const [areaFill, setAreaFill] = useState(false);
  const [fillAlpha, setFillAlpha] = useState("0.3");
  const [smoothing, setSmoothing] = useState<"none" | "moving_average" | "spline">("none");
  const [smoothingWindow, setSmoothingWindow] = useState("3");
  const [lineWidth, setLineWidth] = useState("2.0");
  const [markerStyle, setMarkerStyle] = useState<"none" | "circle" | "square" | "triangle">("none");
  const [markerSize, setMarkerSize] = useState("6");
  const [darkTheme, setDarkTheme] = useState(false);

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);

  // Load headers — UNCHANGED
  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    if (stored) {
      const allHeaders = JSON.parse(stored);
      setHeaders(allHeaders);
      setNumericHeaders(allHeaders);
    }
  }, []);

  // Auto-adjust — UNCHANGED
  useEffect(() => {
    if (multiSeriesMode === "multiple" && seriesGroupField) {
      setShowLegend(true);
    } else if (multiSeriesMode === "single") {
      setSeriesGroupField("");
      setEnableSecondaryAxis(false);
    }
  }, [multiSeriesMode, seriesGroupField]);

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the line chart." };
    }
    if (!xAxisField) {
      return { valid: false, message: "X-axis field is required. Select a column for the X-axis before generating." };
    }
    if (!yAxisField) {
      return { valid: false, message: "Y-axis field is required. Select a numeric column for the Y-axis before generating." };
    }
    if (multiSeriesMode === "multiple" && !seriesGroupField) {
      return { valid: false, message: "Multi-series mode requires a series grouping field. Select a column to group by, or switch to Single Line mode." };
    }
    if (enableSecondaryAxis && !secondaryYField) {
      return { valid: false, message: "Secondary axis is enabled but no field is selected. Select a numeric column for Secondary Y-axis, or turn off Secondary Axis." };
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
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/bivariate/linechart`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          x_axis_field: xAxisField,
          y_axis_field: yAxisField,
          series_group_field: seriesGroupField || null,
          multi_series_mode: multiSeriesMode,
          x_axis_type: xAxisType,
          y_axis_scale: yAxisScale,
          aggregation_method: aggregationMethod,
          sorting_order: sortingOrder,
          missing_value_handling: missingValueHandling,
          enable_secondary_axis: enableSecondaryAxis,
          secondary_y_field: secondaryYField || null,
          default_line_style: defaultLineStyle,
          color_mode: colorMode,
          show_legend: showLegend,
          legend_position: legendPosition,
          grid_style: gridStyle,
          area_fill: areaFill,
          fill_alpha: parseFloat(fillAlpha),
          smoothing: smoothing,
          smoothing_window: parseInt(smoothingWindow),
          line_width: parseFloat(lineWidth),
          marker_style: markerStyle,
          marker_size: parseInt(markerSize),
          dark_theme: darkTheme,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(parseApiError(errorData.detail ?? "Failed to generate plot"));
      }
      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
    } catch (err: any) {
      let msg = err?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "Select numeric columns for Y-axis and Secondary Y-axis.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the line chart.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after preprocessing. Try selecting columns with fewer missing values or adjust the aggregation method.";
      }
      alert(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // handleDownload — upgraded to blob
  const handleDownload = async () => {
    if (!plotUrl) return;
    try {
      const response = await fetch(plotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `LineChart_${yAxisField}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { console.error("Download failed"); }
  };

  return (
    <div className="linechart-container">

      {/* BACK BUTTON */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* CONFIG PANEL */}
      <div className="config-panel">
        <h2 className="panel-title">Line Chart Config</h2>
        <p className="panel-subtitle">Bivariate Trend Analysis</p>

        {/* X-AXIS FIELD */}
        <div className="form-group">
          <label>X-Axis Field <span className="label-badge">Required</span></label>
          <select value={xAxisField} onChange={(e) => setXAxisField(e.target.value)} className="form-select">
            <option value="">Select Field</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Ordered axis (time or numeric)</span>
        </div>

        {/* Y-AXIS FIELD */}
        <div className="form-group">
          <label>Y-Axis Field <span className="label-badge">Required</span></label>
          <select value={yAxisField} onChange={(e) => setYAxisField(e.target.value)} className="form-select">
            <option value="">Select Field</option>
            {numericHeaders.filter(h => h !== xAxisField).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Numeric value field</span>
        </div>

        {/* MULTI-SERIES MODE */}
        <div className="form-group">
          <label>Multi-Series Support</label>
          <div className="segmented-control">
            <button className={`seg-btn ${multiSeriesMode === "single" ? "active" : ""}`} onClick={() => setMultiSeriesMode("single")}>Single Line</button>
            <button className={`seg-btn ${multiSeriesMode === "multiple" ? "active" : ""}`} onClick={() => setMultiSeriesMode("multiple")}>Multiple Lines</button>
          </div>
        </div>

        {/* SERIES GROUP FIELD */}
        {multiSeriesMode === "multiple" && (
          <div className="form-group nested">
            <label>Series Grouping Field</label>
            <select value={seriesGroupField} onChange={(e) => setSeriesGroupField(e.target.value)} className="form-select">
              <option value="">Select Field</option>
              {headers.filter(h => h !== xAxisField && h !== yAxisField).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="input-hint">Group by category</span>
          </div>
        )}

        {/* X-AXIS TYPE */}
        <div className="form-group">
          <label>X-Axis Type</label>
          <div className="segmented-control">
            <button className={`seg-btn ${xAxisType === "time" ? "active" : ""}`} onClick={() => setXAxisType("time")}>Time</button>
            <button className={`seg-btn ${xAxisType === "numeric" ? "active" : ""}`} onClick={() => setXAxisType("numeric")}>Numeric</button>
            <button className={`seg-btn ${xAxisType === "categorical" ? "active" : ""}`} onClick={() => setXAxisType("categorical")}>Categorical</button>
          </div>
        </div>

        {/* Y-AXIS SCALE */}
        <div className="form-group">
          <label>Y-Axis Scale Type</label>
          <div className="segmented-control">
            <button className={`seg-btn ${yAxisScale === "linear" ? "active" : ""}`} onClick={() => setYAxisScale("linear")}>Linear</button>
            <button className={`seg-btn ${yAxisScale === "log" ? "active" : ""}`} onClick={() => setYAxisScale("log")}>Log</button>
            <button className={`seg-btn ${yAxisScale === "symlog" ? "active" : ""}`} onClick={() => setYAxisScale("symlog")}>Symlog</button>
          </div>
        </div>

        {/* AGGREGATION METHOD */}
        <div className="form-group">
          <label>Aggregation Method</label>
          <select value={aggregationMethod} onChange={(e) => setAggregationMethod(e.target.value as any)} className="form-select">
            <option value="none">None (Raw Data)</option>
            <option value="sum">Sum</option>
            <option value="mean">Mean</option>
            <option value="count">Count</option>
          </select>
        </div>

        {/* SORTING ORDER */}
        <div className="form-group">
          <label>Sorting Order (X-Axis)</label>
          <div className="segmented-control">
            <button className={`seg-btn ${sortingOrder === "chronological" ? "active" : ""}`} onClick={() => setSortingOrder("chronological")}>Chronological</button>
            <button className={`seg-btn ${sortingOrder === "ascending" ? "active" : ""}`} onClick={() => setSortingOrder("ascending")}>Ascending</button>
          </div>
        </div>

        {/* MISSING VALUE HANDLING */}
        <div className="form-group">
          <label>Missing Value Handling</label>
          <div className="segmented-control">
            <button className={`seg-btn ${missingValueHandling === "connect" ? "active" : ""}`} onClick={() => setMissingValueHandling("connect")}>Connect</button>
            <button className={`seg-btn ${missingValueHandling === "break" ? "active" : ""}`} onClick={() => setMissingValueHandling("break")}>Break</button>
            <button className={`seg-btn ${missingValueHandling === "interpolate" ? "active" : ""}`} onClick={() => setMissingValueHandling("interpolate")}>Interpolate</button>
          </div>
        </div>

        {/* SECONDARY AXIS */}
        <div className="checkbox-group">
          <input type="checkbox" id="secondary-axis-check" checked={enableSecondaryAxis} onChange={() => setEnableSecondaryAxis(!enableSecondaryAxis)} disabled={multiSeriesMode === "multiple"} />
          <label htmlFor="secondary-axis-check">Secondary Axis Option</label>
        </div>

        {enableSecondaryAxis && (
          <div className="form-group nested">
            <label>Secondary Y-Axis Field</label>
            <select value={secondaryYField} onChange={(e) => setSecondaryYField(e.target.value)} className="form-select">
              <option value="">Select Field</option>
              {numericHeaders.filter(h => h !== xAxisField && h !== yAxisField).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="input-hint">Different units/scales</span>
          </div>
        )}

        {/* LINE STYLE */}
        <div className="form-group">
          <label>Line Style</label>
          <div className="segmented-control">
            <button className={`seg-btn ${defaultLineStyle === "solid" ? "active" : ""}`} onClick={() => setDefaultLineStyle("solid")}>━━━ Solid</button>
            <button className={`seg-btn ${defaultLineStyle === "dashed" ? "active" : ""}`} onClick={() => setDefaultLineStyle("dashed")}>┄┄┄ Dashed</button>
            <button className={`seg-btn ${defaultLineStyle === "dotted" ? "active" : ""}`} onClick={() => setDefaultLineStyle("dotted")}>···· Dotted</button>
          </div>
        </div>

        {/* LINE WIDTH */}
        <div className="form-group">
          <label>Line Width</label>
          <div className="slider-group">
            <input type="range" min="0.5" max="5.0" step="0.5" value={lineWidth} onChange={(e) => setLineWidth(e.target.value)} className="slider" />
            <span className="slider-value">{lineWidth}</span>
          </div>
        </div>

        {/* MARKER STYLE */}
        <div className="form-group">
          <label>Marker Style</label>
          <select value={markerStyle} onChange={(e) => setMarkerStyle(e.target.value as any)} className="form-select">
            <option value="none">None</option>
            <option value="circle">Circle ●</option>
            <option value="square">Square ■</option>
            <option value="triangle">Triangle ▲</option>
          </select>
        </div>

        {markerStyle !== "none" && (
          <div className="form-group nested">
            <label>Marker Size</label>
            <div className="slider-group">
              <input type="range" min="3" max="12" step="1" value={markerSize} onChange={(e) => setMarkerSize(e.target.value)} className="slider" />
              <span className="slider-value">{markerSize}</span>
            </div>
          </div>
        )}

        {/* GRID STYLE */}
        <div className="form-group">
          <label>Grid Style</label>
          <div className="segmented-control">
            <button className={`seg-btn ${gridStyle === "none" ? "active" : ""}`} onClick={() => setGridStyle("none")}>None</button>
            <button className={`seg-btn ${gridStyle === "horizontal" ? "active" : ""}`} onClick={() => setGridStyle("horizontal")}>Horizontal</button>
            <button className={`seg-btn ${gridStyle === "full" ? "active" : ""}`} onClick={() => setGridStyle("full")}>Full</button>
          </div>
        </div>

        {/* AREA FILL */}
        <div className="checkbox-group">
          <input type="checkbox" id="area-fill-check" checked={areaFill} onChange={() => setAreaFill(!areaFill)} />
          <label htmlFor="area-fill-check">Area Fill Option</label>
        </div>

        {areaFill && (
          <div className="form-group nested">
            <label>Fill Transparency</label>
            <div className="slider-group">
              <input type="range" min="0.1" max="0.8" step="0.1" value={fillAlpha} onChange={(e) => setFillAlpha(e.target.value)} className="slider" />
              <span className="slider-value">{fillAlpha}</span>
            </div>
          </div>
        )}

        {/* SMOOTHING */}
        <div className="form-group">
          <label>Smoothing Option</label>
          <select value={smoothing} onChange={(e) => setSmoothing(e.target.value as any)} className="form-select">
            <option value="none">None</option>
            <option value="moving_average">Moving Average</option>
            <option value="spline">Spline Interpolation</option>
          </select>
        </div>

        {smoothing === "moving_average" && (
          <div className="form-group nested">
            <label>Window Size</label>
            <input type="number" min="2" max="20" value={smoothingWindow} onChange={(e) => setSmoothingWindow(e.target.value)} className="form-input" />
            <span className="input-hint">Number of points to average</span>
          </div>
        )}

        {/* LEGEND */}
        <div className="checkbox-group">
          <input type="checkbox" id="legend-check" checked={showLegend} onChange={() => setShowLegend(!showLegend)} />
          <label htmlFor="legend-check">Show Legend</label>
        </div>

        {showLegend && (
          <div className="form-group nested">
            <label>Legend Position</label>
            <select value={legendPosition} onChange={(e) => setLegendPosition(e.target.value as any)} className="form-select">
              <option value="best">Best</option>
              <option value="upper right">Upper Right</option>
              <option value="lower right">Lower Right</option>
            </select>
          </div>
        )}

        {/* DARK THEME */}
        <div className="checkbox-group">
          <input type="checkbox" id="dark-check" checked={darkTheme} onChange={() => setDarkTheme(!darkTheme)} />
          <label htmlFor="dark-check">Dark Theme</label>
        </div>

        <button onClick={generatePlot} className="generate-button" disabled={loading}>
          {loading ? "Generating..." : "Generate Plot"}
        </button>
      </div>

      {/* PLOT AREA */}
      <div className="plot-area">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p className="placeholder-text">Generating plot...</p>
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="Line Chart" className="plot-image" />
        ) : (
          <div className="empty-state">
            <span className="placeholder-icon" aria-hidden="true">
              <LineChartIcon />
            </span>
            <p className="placeholder-text">Plot will appear here</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
              Visualize trends and patterns over time
            </p>
          </div>
        )}

        <button className="download-btn" onClick={handleDownload} disabled={!plotUrl || loading} title={plotUrl ? "Download plot as PNG" : "Generate a plot first"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PNG
        </button>
      </div>

    </div>
  );
}