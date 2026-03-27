"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./BoxPlotPage.css";

interface StatisticalData {
  group: string;
  n: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
  outlier_count: number;
}

export default function BoxPlotPage() {
  const router = useRouter();

  const [headers, setHeaders] = useState<string[]>([]);
  const [numericHeaders, setNumericHeaders] = useState<string[]>([]);
  const [categoricalHeaders, setCategoricalHeaders] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<Record<string, "numeric" | "categorical">>({});

  // Configuration states — ALL UNCHANGED
  const [numericField, setNumericField] = useState("");
  const [groupingField, setGroupingField] = useState("");
  const [groupingMode, setGroupingMode] = useState<"single" | "grouped">("single");
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");
  const [whiskerDefinition, setWhiskerDefinition] = useState<"iqr" | "minmax">("iqr");
  const [outlierDetection, setOutlierDetection] = useState(true);
  const [quartileMethod, setQuartileMethod] = useState<"linear" | "midpoint">("linear");
  const [axisScale, setAxisScale] = useState<"linear" | "log">("linear");
  const [axisRange, setAxisRange] = useState<"auto" | "manual">("auto");
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [gridStyle, setGridStyle] = useState<"none" | "horizontal">("horizontal");
  const [colorMode, setColorMode] = useState<"single" | "distinct">("single");
  const [singleColor, setSingleColor] = useState("#00d4ff");
  const [showLegend, setShowLegend] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [categorySorting, setCategorySorting] = useState<"original" | "alphabetical" | "median">("original");

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [statsData, setStatsData] = useState<StatisticalData[]>([]);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  const colorInputRef = useRef<HTMLInputElement>(null);

  // Load headers — UNCHANGED
  useEffect(() => {
    const stored = sessionStorage.getItem("csvHeaders");
    const storedTypes = sessionStorage.getItem("csvColumnTypes");
    const storedNumeric = sessionStorage.getItem("csvNumericHeaders");
    const storedCategorical = sessionStorage.getItem("csvCategoricalHeaders");
    if (stored) {
      const allHeaders = JSON.parse(stored);
      setHeaders(allHeaders);
      setNumericHeaders(storedNumeric ? JSON.parse(storedNumeric) : allHeaders);
      setCategoricalHeaders(storedCategorical ? JSON.parse(storedCategorical) : []);
    }
    if (storedTypes) setColumnTypes(JSON.parse(storedTypes));
  }, []);

  // Auto-set grouping mode — UNCHANGED
  useEffect(() => {
    if (groupingField) {
      setGroupingMode("grouped");
      setShowLegend(true);
    } else {
      setGroupingMode("single");
      setShowLegend(false);
    }
  }, [groupingField]);

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the box plot." };
    }
    if (!numericField) {
      return { valid: false, message: "Numeric field is required. Select a numeric column before generating." };
    }
    if (numericField && columnTypes[numericField] === "categorical") {
      return {
        valid: false,
        message: `Invalid Numeric Field: "${numericField}" is categorical.\n\nWhat to do instead:\n- Select a numeric column for the box values\n- If you want to visualize categorical proportions, use Pie Chart or Bar Chart.`,
      };
    }
    if (groupingMode === "grouped" && groupingField === numericField) {
      return { valid: false, message: "Numeric and grouping fields must differ. Use a categorical column for grouping." };
    }
    if (groupingField && columnTypes[groupingField] === "numeric") {
      return {
        valid: false,
        message: `Invalid Grouping Field: "${groupingField}" looks numeric.\n\nGrouping / Group By fields must be categorical.\n\nWhat to do instead:\n- Select a categorical column (e.g., category, region, gender)\n- Or leave Grouping Field as None for a single boxplot.`,
      };
    }
    if (axisRange === "manual" && rangeMin !== "" && rangeMax !== "") {
      const lo = parseFloat(rangeMin);
      const hi = parseFloat(rangeMax);
      if (!isNaN(lo) && !isNaN(hi) && lo >= hi) {
        return { valid: false, message: "Range Min must be less than Range Max when using manual axis range." };
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
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/univariate/boxplot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          numeric_column: numericField,
          grouping_column: groupingField || null,
          grouping_mode: groupingMode,
          orientation: orientation,
          whisker_definition: whiskerDefinition,
          outlier_detection: outlierDetection,
          quartile_method: quartileMethod,
          axis_scale: axisScale,
          axis_range: axisRange,
          range_min: rangeMin ? parseFloat(rangeMin) : null,
          range_max: rangeMax ? parseFloat(rangeMax) : null,
          grid_style: gridStyle,
          color_mode: colorMode,
          single_color: singleColor,
          show_legend: showLegend,
          dark_theme: darkTheme,
          category_sorting: categorySorting,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate box plot"));
      }

      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
      setStatsData(data.statistics || []);
    } catch (err: unknown) {
      let msg = (err as Error)?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "Select a numeric column for the value field; use a categorical column for grouping.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the box plot.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after filtering. Try selecting columns with fewer missing values.";
      }
      alert(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // handleDownload — upgraded to blob (matches barchart pattern)
  const handleDownload = async () => {
    if (!plotUrl) return;
    try {
      const response = await fetch(plotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `BoxPlot_${numericField}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { console.error("Download failed"); }
  };

  return (
    <div className="boxplot-container">

      {/* BACK BUTTON */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* CONFIG PANEL */}
      <div className="config-panel">
        <h2 className="panel-title">Boxplot Config</h2>

        {/* NUMERIC FIELD */}
        <div className="form-group">
          <label>Numeric Field <span className="label-badge">Required</span></label>
          <select
            value={numericField}
            onChange={(e) => {
              const v = e.target.value;
              if (v && columnTypes[v] === "categorical") {
                alert(
                  `You selected a categorical field.\n\n"${v}" is categorical, but Numeric Field must be numeric.\n\nSelect a numeric column instead.`
                );
                setNumericField("");
                return;
              }
              setNumericField(v);
            }}
            className="form-select"
          >
            <option value="">Select Field</option>
            {numericHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {/* GROUPING FIELD */}
        <div className="form-group">
          <label>Grouping Field <span className="label-badge">Optional</span></label>
          <select
            value={groupingField}
            onChange={(e) => {
              const v = e.target.value;
              if (v && columnTypes[v] === "numeric") {
                alert(
                  `You selected a numeric field for Grouping.\n\n"${v}" looks numeric, but Grouping / Group By fields must be categorical.\n\nSelect a categorical column instead, or choose None.`
                );
                setGroupingField("");
                return;
              }
              setGroupingField(v);
            }}
            className="form-select"
          >
            <option value="">None (Single Box)</option>
            {(categoricalHeaders.length > 0 ? categoricalHeaders : headers).filter(h => h !== numericField).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Categorical grouping</span>
        </div>

        {/* ORIENTATION */}
        <div className="form-group">
          <label>Orientation</label>
          <div className="segmented-control">
            <button className={`seg-btn ${orientation === "vertical" ? "active" : ""}`} onClick={() => setOrientation("vertical")}>Vertical</button>
            <button className={`seg-btn ${orientation === "horizontal" ? "active" : ""}`} onClick={() => setOrientation("horizontal")}>Horizontal</button>
          </div>
        </div>

        {/* WHISKER DEFINITION */}
        <div className="form-group">
          <label>Whisker Definition</label>
          <div className="segmented-control">
            <button className={`seg-btn ${whiskerDefinition === "iqr" ? "active" : ""}`} onClick={() => setWhiskerDefinition("iqr")}>1.5×IQR</button>
            <button className={`seg-btn ${whiskerDefinition === "minmax" ? "active" : ""}`} onClick={() => setWhiskerDefinition("minmax")}>Min-Max</button>
          </div>
        </div>

        {/* OUTLIER DETECTION */}
        <div className="checkbox-group">
          <input type="checkbox" id="outlier-check" checked={outlierDetection} onChange={() => setOutlierDetection(!outlierDetection)} />
          <label htmlFor="outlier-check">Outlier Detection Rule</label>
        </div>

        {/* QUARTILE METHOD */}
        <div className="form-group">
          <label>Quartile Calculation Method</label>
          <select value={quartileMethod} onChange={(e) => setQuartileMethod(e.target.value as any)} className="form-select">
            <option value="linear">Linear Interpolation</option>
            <option value="midpoint">Midpoint Method</option>
          </select>
        </div>

        {/* AXIS SCALE */}
        <div className="form-group">
          <label>Axis Scale Type</label>
          <div className="segmented-control">
            <button className={`seg-btn ${axisScale === "linear" ? "active" : ""}`} onClick={() => setAxisScale("linear")}>Linear</button>
            <button className={`seg-btn ${axisScale === "log" ? "active" : ""}`} onClick={() => setAxisScale("log")}>Logarithmic</button>
          </div>
        </div>

        {/* AXIS RANGE */}
        <div className="form-group">
          <label>Axis Range Control</label>
          <div className="segmented-control">
            <button className={`seg-btn ${axisRange === "auto" ? "active" : ""}`} onClick={() => setAxisRange("auto")}>Auto</button>
            <button className={`seg-btn ${axisRange === "manual" ? "active" : ""}`} onClick={() => setAxisRange("manual")}>Manual</button>
          </div>
        </div>

        {/* MANUAL RANGE */}
        {axisRange === "manual" && (
          <div className="form-group nested">
            <div className="dual-input">
              <div className="input-wrapper">
                <label className="mini-label">Min</label>
                <input type="number" value={rangeMin} onChange={(e) => setRangeMin(e.target.value)} className="form-input-small" placeholder="Auto" />
              </div>
              <div className="input-wrapper">
                <label className="mini-label">Max</label>
                <input type="number" value={rangeMax} onChange={(e) => setRangeMax(e.target.value)} className="form-input-small" placeholder="Auto" />
              </div>
            </div>
          </div>
        )}

        {/* GRID STYLE */}
        <div className="form-group">
          <label>Grid Style</label>
          <div className="segmented-control">
            <button className={`seg-btn ${gridStyle === "none" ? "active" : ""}`} onClick={() => setGridStyle("none")}>None</button>
            <button className={`seg-btn ${gridStyle === "horizontal" ? "active" : ""}`} onClick={() => setGridStyle("horizontal")}>Horizontal</button>
          </div>
        </div>

        {/* COLOR MODE */}
        <div className="form-group">
          <label>Color Mapping</label>
          <div className="segmented-control">
            <button className={`seg-btn ${colorMode === "single" ? "active" : ""}`} onClick={() => setColorMode("single")}>Single</button>
            <button className={`seg-btn ${colorMode === "distinct" ? "active" : ""}`} onClick={() => setColorMode("distinct")}>Distinct</button>
          </div>
        </div>

        {/* SINGLE COLOR */}
        {colorMode === "single" && (
          <div className="form-group">
            <label>Box Color</label>
            <div className="color-picker-wrapper" onClick={() => colorInputRef.current?.click()}>
              <div className="color-swatch" style={{ backgroundColor: singleColor }} />
              <span className="color-hex-value">{singleColor}</span>
              <span className="color-edit-hint">Click to edit</span>
              <svg className="color-picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <input ref={colorInputRef} type="color" value={singleColor} onChange={(e) => setSingleColor(e.target.value)} className="color-picker" />
            </div>
          </div>
        )}

        {/* CATEGORY SORTING */}
        {groupingField && (
          <div className="form-group">
            <label>Category Sorting</label>
            <select value={categorySorting} onChange={(e) => setCategorySorting(e.target.value as any)} className="form-select">
              <option value="original">Original Order</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="median">Median-Based</option>
            </select>
          </div>
        )}

        {/* LEGEND */}
        <div className="checkbox-group">
          <input type="checkbox" id="legend-check" checked={showLegend} onChange={() => setShowLegend(!showLegend)} />
          <label htmlFor="legend-check">Legend Control</label>
        </div>

        {/* DARK THEME */}
        <div className="checkbox-group">
          <input type="checkbox" id="dark-check" checked={darkTheme} onChange={() => setDarkTheme(!darkTheme)} />
          <label htmlFor="dark-check">Dark Theme</label>
        </div>

        {/* GENERATE */}
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
          <img src={plotUrl} alt="Box Plot" className="plot-image" />
        ) : (
          <div className="empty-state">
            <span className="placeholder-icon" aria-hidden="true">
              <Package />
            </span>
            <p className="placeholder-text">Plot will appear here</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
              Shows distribution quartiles and outliers
            </p>
          </div>
        )}

        {/* DOWNLOAD */}
        <button className="download-btn" onClick={handleDownload} disabled={!plotUrl || loading} title={plotUrl ? "Download plot as PNG" : "Generate a plot first"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PNG
        </button>

        {/* STATS TOGGLE */}
        {statsData.length > 0 && !loading && plotUrl && (
          <button className="stats-toggle-btn" onClick={() => setStatsPanelOpen(!statsPanelOpen)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Statistics
          </button>
        )}
      </div>

      {/* STATISTICS PANEL */}
      <div className={`stats-panel ${statsPanelOpen ? "open" : ""}`}>
        <div className="stats-header">
          <h3 className="stats-title">Statistical Inferences</h3>
          <button className="close-stats" onClick={() => setStatsPanelOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="stats-scroll">
          {statsData.map((stat, idx) => (
            <div key={idx} className="stat-group">
              <h4 className="stat-group-title">{stat.group}</h4>
              <div className="stat-grid">
                {[
                  { label: "N (Sample Size)", value: stat.n, raw: true },
                  { label: "Median (Q2)", value: stat.median.toFixed(2) },
                  { label: "Q1 (Lower Quartile)", value: stat.q1.toFixed(2) },
                  { label: "Q3 (Upper Quartile)", value: stat.q3.toFixed(2) },
                  { label: "IQR (Q3 − Q1)", value: stat.iqr.toFixed(2) },
                  { label: "Minimum", value: stat.min.toFixed(2) },
                  { label: "Maximum", value: stat.max.toFixed(2) },
                  { label: "Outlier Count", value: stat.outlier_count, highlight: true, raw: true },
                ].map(({ label, value, highlight, raw }) => (
                  <div key={label} className={`stat-item ${highlight ? "highlight" : ""}`}>
                    <span className="stat-label">{label}</span>
                    <span className="stat-value">{raw ? value : value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BACKDROP */}
      {statsPanelOpen && (
        <div className="stats-backdrop" onClick={() => setStatsPanelOpen(false)} />
      )}

    </div>
  );
}