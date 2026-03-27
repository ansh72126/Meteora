"use client";

import { useState, useEffect, useRef } from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./PieChartPage.css";

export default function PieChartPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [numericHeaders, setNumericHeaders] = useState<string[]>([]);
  const [categoricalHeaders, setCategoricalHeaders] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<Record<string, "numeric" | "categorical">>({});

  // Configuration states — ALL UNCHANGED
  const [categoryField, setCategoryField] = useState("");
  const [valueField, setValueField] = useState("");
  const [aggregationMethod, setAggregationMethod] = useState<"sum" | "count" | "mean">("sum");
  const [chartType, setChartType] = useState<"pie" | "donut">("pie");
  const [innerRadius, setInnerRadius] = useState("0.4");
  const [sliceOrdering, setSliceOrdering] = useState<"original" | "ascending" | "descending">("descending");
  const [startAngle, setStartAngle] = useState("0");
  const [valueRepresentation, setValueRepresentation] = useState<"values" | "percentage" | "both">("percentage");
  const [labelPosition] = useState<"inside" | "outside" | "legend">("outside");
  const [minSliceThreshold, setMinSliceThreshold] = useState("2");
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState<"right" | "bottom">("right");
  const [centerLabel, setCenterLabel] = useState("");
  const [showTotal, setShowTotal] = useState(false);
  const [sliceBorder, setSliceBorder] = useState(true);
  const [borderWidth, setBorderWidth] = useState("1.5");
  const [anglePrecision, setAnglePrecision] = useState("1");
  const [darkTheme, setDarkTheme] = useState(false);

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);

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

  // Auto-adjust inner radius — UNCHANGED
  useEffect(() => {
    if (chartType === "donut" && parseFloat(innerRadius) === 0) {
      setInnerRadius("0.4");
    } else if (chartType === "pie") {
      setInnerRadius("0");
    }
  }, [chartType]);

  const effectiveCategoricalHeaders =
    categoricalHeaders.length > 0
      ? categoricalHeaders
      : headers.filter((h) => columnTypes[h] === "categorical");

  const typesAvailable =
    Object.keys(columnTypes).length > 0 ||
    categoricalHeaders.length > 0 ||
    numericHeaders.length > 0;

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the pie chart." };
    }
    if (!typesAvailable) {
      return {
        valid: false,
        message:
          "Column types are not available for this dataset.\n\nWhat to do instead:\n- Re-upload your CSV from the upload page so the app can detect numeric vs categorical columns.\n- Then return here and select Category (categorical) and Value (numeric for Sum/Mean).",
      };
    }
    if (!categoryField) {
      return { valid: false, message: "Category field is required. Select a column for slice labels." };
    }
    if (categoryField && columnTypes[categoryField] === "numeric") {
      return {
        valid: false,
        message: `Invalid Category Field: "${categoryField}" looks numeric.\n\nPie/Donut categories must be categorical.\n\nWhat to do instead:\n- Select a categorical column for slice labels (e.g., category, region)\n- If you want to bucket a numeric variable, create bins in your dataset first, then re-upload.`,
      };
    }
    if (categoryField && columnTypes[categoryField] === undefined && effectiveCategoricalHeaders.length === 0) {
      return {
        valid: false,
        message: `Invalid Category Field: "${categoryField}".\n\nThis chart requires a categorical category field, but column types are unknown.\n\nWhat to do instead:\n- Re-upload your CSV so the app can detect column types\n- Then select a categorical column for Category Field.`,
      };
    }
    if (aggregationMethod !== "count" && !valueField) {
      return { valid: false, message: "Value field is required when using Sum or Mean aggregation. Select a numeric column, or switch to Count aggregation." };
    }
    if (aggregationMethod !== "count" && valueField && columnTypes[valueField] === "categorical") {
      return {
        valid: false,
        message: `Invalid Value Field: "${valueField}" is categorical.\n\nSum/Mean requires a numeric value column.\n\nWhat to do instead:\n- Select a numeric value column\n- Or switch aggregation to Count if you only need frequencies.`,
      };
    }
    if (aggregationMethod !== "count" && valueField && columnTypes[valueField] === undefined && numericHeaders.length === 0) {
      return {
        valid: false,
        message: `Invalid Value Field: "${valueField}".\n\nSum/Mean requires a numeric value column, but column types are unknown.\n\nWhat to do instead:\n- Re-upload your CSV so the app can detect column types\n- Then select a numeric column as Value Field.`,
      };
    }
    if (aggregationMethod !== "count" && categoryField === valueField) {
      return { valid: false, message: "Category and value fields must differ. Use one column for labels and a different numeric column for values." };
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/univariate/piechart`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          category_column: categoryField,
          value_column: valueField || null,
          aggregation_method: aggregationMethod,
          chart_type: chartType,
          inner_radius: parseFloat(innerRadius),
          slice_ordering: sliceOrdering,
          start_angle: parseFloat(startAngle),
          value_representation: valueRepresentation,
          label_position: labelPosition,
          min_slice_threshold: parseFloat(minSliceThreshold),
          show_legend: showLegend,
          legend_position: legendPosition,
          center_label: centerLabel || null,
          show_total: showTotal,
          slice_border: sliceBorder,
          border_width: parseFloat(borderWidth),
          angle_precision: parseInt(anglePrecision),
          dark_theme: darkTheme,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate pie chart"));
      }
      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
    } catch (err: unknown) {
      let msg = (err as Error)?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "For Sum or Mean aggregation, select a numeric value column. Use Count aggregation if you only have categorical data.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the pie chart.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after filtering. Try selecting columns with fewer missing values.";
      }
      alert(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // handleDownload — upgraded to blob (matches ECDF pattern)
  const handleDownload = async () => {
    if (!plotUrl) return;
    try {
      const response = await fetch(plotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `PieChart_${categoryField}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { console.error("Download failed"); }
  };

  return (
    <div className="piechart-container">

      {/* BACK BUTTON */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* CONFIG PANEL */}
      <div className="config-panel">
        <h2 className="panel-title">Pie Chart Config</h2>

        {/* CATEGORY FIELD */}
        <div className="form-group">
          <label>Category Field <span className="label-badge">Required</span></label>
          <select
            value={categoryField}
            onChange={(e) => {
              const v = e.target.value;
              if (v && columnTypes[v] === "numeric") {
                alert(
                  `You selected a numeric field for Category Field.\n\n"${v}" looks numeric, but Pie/Donut category must be categorical.\n\nSelect a categorical column instead.`
                );
                setCategoryField("");
                return;
              }
              if (v && columnTypes[v] === undefined && effectiveCategoricalHeaders.length === 0) {
                alert(
                  `Category Field must be categorical, but column types are not available.\n\nWhat to do instead:\n- Re-upload your CSV from the upload page (to detect column types)\n- Then select a categorical column for Category Field.`
                );
                setCategoryField("");
                return;
              }
              if (v && v === valueField && aggregationMethod !== "count") {
                alert(
                  `Category Field and Value Field cannot be the same column.\n\nWhat to do instead:\n- Pick a categorical column for Category Field\n- Pick a different numeric column for Value Field (or switch Aggregation to Count).`
                );
                setCategoryField("");
                return;
              }
              setCategoryField(v);
            }}
            className="form-select"
          >
            <option value="">Select Field</option>
            {(effectiveCategoricalHeaders.length > 0 ? effectiveCategoricalHeaders : []).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          {effectiveCategoricalHeaders.length === 0 && headers.length > 0 && (
            <span className="input-hint">No categorical columns detected. Re-upload the dataset to detect column types.</span>
          )}
        </div>

        {/* VALUE FIELD */}
        <div className="form-group">
          <label>Value Field <span className="label-badge">Numeric</span></label>
          <select
            value={valueField}
            onChange={(e) => {
              const v = e.target.value;
              if (v && aggregationMethod !== "count" && columnTypes[v] === "categorical") {
                alert(
                  `You selected a categorical field for Value Field.\n\n"${v}" is categorical, but Sum/Mean requires a numeric value column.\n\nSelect a numeric column instead, or switch Aggregation to Count.`
                );
                setValueField("");
                return;
              }
              if (v && aggregationMethod !== "count" && columnTypes[v] === undefined && numericHeaders.length === 0) {
                alert(
                  `Value Field must be numeric for Sum/Mean, but column types are not available.\n\nWhat to do instead:\n- Re-upload your CSV from the upload page (to detect column types)\n- Then select a numeric column for Value Field, or switch Aggregation to Count.`
                );
                setValueField("");
                return;
              }
              if (v && v === categoryField && aggregationMethod !== "count") {
                alert(
                  `Value Field cannot be the same as Category Field.\n\nWhat to do instead:\n- Keep Category Field as a categorical column\n- Choose a different numeric column for Value Field, or switch Aggregation to Count.`
                );
                setValueField("");
                return;
              }
              setValueField(v);
            }}
            className="form-select"
            disabled={aggregationMethod === "count"}
          >
            <option value="">Select Field</option>
            {numericHeaders.filter(h => h !== categoryField).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">{aggregationMethod === "count" ? "Not needed for count" : "Required for sum/mean"}</span>
        </div>

        {/* AGGREGATION METHOD */}
        <div className="form-group">
          <label>Aggregation Method</label>
          <div className="segmented-control">
            <button
              className={`seg-btn ${aggregationMethod === "sum" ? "active" : ""}`}
              onClick={() => {
                setAggregationMethod("sum");
                if (categoryField && categoryField === valueField) setValueField("");
              }}
            >Sum</button>
            <button
              className={`seg-btn ${aggregationMethod === "count" ? "active" : ""}`}
              onClick={() => {
                setAggregationMethod("count");
                setValueField("");
              }}
            >Count</button>
            <button
              className={`seg-btn ${aggregationMethod === "mean" ? "active" : ""}`}
              onClick={() => {
                setAggregationMethod("mean");
                if (categoryField && categoryField === valueField) setValueField("");
              }}
            >Mean</button>
          </div>
        </div>

        {/* CHART TYPE */}
        <div className="form-group">
          <label>Chart Type</label>
          <div className="segmented-control">
            <button className={`seg-btn ${chartType === "pie" ? "active" : ""}`} onClick={() => setChartType("pie")}>Standard Pie</button>
            <button className={`seg-btn ${chartType === "donut" ? "active" : ""}`} onClick={() => setChartType("donut")}>Donut</button>
          </div>
        </div>

        {/* INNER RADIUS (Donut only) */}
        {chartType === "donut" && (
          <div className="form-group nested">
            <label>Inner Radius</label>
            <div className="slider-group">
              <input type="range" min="0.2" max="0.8" step="0.1" value={innerRadius} onChange={(e) => setInnerRadius(e.target.value)} className="slider" />
              <span className="slider-value">{innerRadius}</span>
            </div>
            <span className="input-hint">Controls hollow center size</span>
          </div>
        )}

        {/* SLICE ORDERING */}
        <div className="form-group">
          <label>Slice Ordering</label>
          <select value={sliceOrdering} onChange={(e) => setSliceOrdering(e.target.value as any)} className="form-select">
            <option value="original">Original</option>
            <option value="ascending">Ascending</option>
            <option value="descending">Descending</option>
          </select>
        </div>

        {/* START ANGLE */}
        <div className="form-group">
          <label>Start Angle (Rotation)</label>
          <div className="slider-group">
            <input type="range" min="0" max="360" step="15" value={startAngle} onChange={(e) => setStartAngle(e.target.value)} className="slider" />
            <span className="slider-value">{startAngle}°</span>
          </div>
        </div>

        {/* VALUE REPRESENTATION */}
        <div className="form-group">
          <label>Value Representation</label>
          <div className="segmented-control">
            <button className={`seg-btn ${valueRepresentation === "values" ? "active" : ""}`} onClick={() => setValueRepresentation("values")}>Raw</button>
            <button className={`seg-btn ${valueRepresentation === "percentage" ? "active" : ""}`} onClick={() => setValueRepresentation("percentage")}>%</button>
            <button className={`seg-btn ${valueRepresentation === "both" ? "active" : ""}`} onClick={() => setValueRepresentation("both")}>Both</button>
          </div>
        </div>

        {/* MIN SLICE THRESHOLD */}
        <div className="form-group">
          <label>Min Slice Threshold (%)</label>
          <input type="number" min="0" max="10" step="0.5" value={minSliceThreshold} onChange={(e) => setMinSliceThreshold(e.target.value)} className="form-input" />
          <span className="input-hint">Group small slices into &quot;Other&quot;</span>
        </div>

        {/* LEGEND */}
        <div className="checkbox-group">
          <input type="checkbox" id="legend-check" checked={showLegend} onChange={() => setShowLegend(!showLegend)} />
          <label htmlFor="legend-check">Show Legend</label>
        </div>

        {/* LEGEND POSITION */}
        {showLegend && (
          <div className="form-group nested">
            <label>Legend Position</label>
            <div className="segmented-control">
              <button className={`seg-btn ${legendPosition === "right" ? "active" : ""}`} onClick={() => setLegendPosition("right")}>Right</button>
              <button className={`seg-btn ${legendPosition === "bottom" ? "active" : ""}`} onClick={() => setLegendPosition("bottom")}>Bottom</button>
            </div>
          </div>
        )}

        {/* CENTER LABEL & SHOW TOTAL (Donut only) */}
        {chartType === "donut" && (
          <>
            <div className="form-group">
              <label>Center Label <span className="label-badge">Donut only</span></label>
              <input type="text" value={centerLabel} onChange={(e) => setCenterLabel(e.target.value)} className="form-input" placeholder="e.g., Total, Custom Text" />
              <span className="input-hint">Display in donut center</span>
            </div>

            <div className="checkbox-group">
              <input type="checkbox" id="total-check" checked={showTotal} onChange={() => setShowTotal(!showTotal)} />
              <label htmlFor="total-check">Show Total Value</label>
            </div>
          </>
        )}

        {/* SLICE BORDER */}
        <div className="checkbox-group">
          <input type="checkbox" id="border-check" checked={sliceBorder} onChange={() => setSliceBorder(!sliceBorder)} />
          <label htmlFor="border-check">Slice Border / Separation</label>
        </div>

        {/* BORDER WIDTH */}
        {sliceBorder && (
          <div className="form-group nested">
            <label>Border Width</label>
            <div className="slider-group">
              <input type="range" min="0.5" max="3.0" step="0.5" value={borderWidth} onChange={(e) => setBorderWidth(e.target.value)} className="slider" />
              <span className="slider-value">{borderWidth}</span>
            </div>
          </div>
        )}

        {/* ANGLE PRECISION */}
        <div className="form-group">
          <label>Angle Precision (Decimals)</label>
          <input type="number" min="0" max="2" value={anglePrecision} onChange={(e) => setAnglePrecision(e.target.value)} className="form-input" />
          <span className="input-hint">Rounding for percentage labels</span>
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
          <img src={plotUrl} alt="Pie Chart" className="plot-image" />
        ) : (
          <div className="empty-state">
            <span className="placeholder-icon" aria-hidden="true">
              <PieChartIcon />
            </span>
            <p className="placeholder-text">Plot will appear here</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
              Proportional representation of categorical data
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