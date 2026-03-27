"use client";

import { useState, useEffect, useRef } from "react";
import { TrendingUp } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./KDEPage.css";

export default function KDEPage() {

  const [headers, setHeaders] = useState<string[]>([]);
  const [numericHeaders, setNumericHeaders] = useState<string[]>([]);
  const [categoricalHeaders, setCategoricalHeaders] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<Record<string, "numeric" | "categorical">>({});

  // Configuration states
  const [xField, setXField] = useState("");
  const [xField2, setXField2] = useState("");
  const [color, setColor] = useState("#ff6633");
  const [color2, setColor2] = useState("#3366ff");
  const [grid, setGrid] = useState(true);
  const [legend, setLegend] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const [bwAdjust, setBwAdjust] = useState("1.0");
  const [alpha, setAlpha] = useState("0.7");
  const [fill, setFill] = useState(true);

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const colorInputRef1 = useRef<HTMLInputElement>(null);
  const colorInputRef2 = useRef<HTMLInputElement>(null);

  // Load headers from session storage
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

  // Auto-enable legend if two fields are selected
  useEffect(() => {
    if (xField && xField2) {
      setLegend(true);
    }
  }, [xField, xField2]);

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (headers.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the KDE plot." };
    }
    if (!xField) {
      return { valid: false, message: "At least one X field is required. Select a numeric column before generating." };
    }
    if (xField && columnTypes[xField] === "categorical") {
      return {
        valid: false,
        message: `Invalid X Field 1: "${xField}" is categorical. KDE requires numeric data.\n\nWhat to do instead:\n- Select a numeric column\n- If you want category comparisons, use a Box Plot (numeric by group) or a Bar Chart (counts by category).`,
      };
    }
    if (xField2 && columnTypes[xField2] === "categorical") {
      return {
        valid: false,
        message: `Invalid X Field 2: "${xField2}" is categorical. KDE comparison requires numeric data.\n\nWhat to do instead:\n- Select a numeric column for X Field 2\n- Or leave X Field 2 empty.`,
      };
    }
    if (xField2 && xField === xField2) {
      return { valid: false, message: "The two X fields must be different. Select different columns or use only one field." };
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/univariate/kde`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          x_column: xField,
          x_column_2: xField2 || null,
          color: color,
          color_2: xField2 ? color2 : null,
          grid: grid,
          legend: legend,
          dark_theme: darkTheme,
          bw_adjust: parseFloat(bwAdjust),
          alpha: parseFloat(alpha),
          fill: fill
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate KDE plot"));
      }

      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
    } catch (err: unknown) {
      let msg = (err as Error)?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "Select numeric columns for the KDE plot.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the KDE plot.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after filtering. Try selecting columns with fewer missing values.";
      }
      alert(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── DOWNLOAD HANDLER ─────────────────────────────────
  const handleDownload = async () => {
    if (!plotUrl) return;
    const plotTitle = xField2
      ? `KDE_${xField}_vs_${xField2}`
      : `KDE_${xField}`;
    try {
      const response = await fetch(plotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${plotTitle}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      console.error("Download failed");
    }
  };

  return (
    <div className="kde-container">

      {/* ── BACK BUTTON ── */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* ── CONFIG PANEL ── */}
      <div className="config-panel">
        <h2 className="panel-title">KDE Plot Config</h2>

        {/* X FIELD 1 */}
        <div className="form-group">
          <label>X Field 1 — Required</label>
          <select
            value={xField}
            onChange={(e) => {
              const v = e.target.value;
              if (v && columnTypes[v] === "categorical") {
                alert(
                  `You selected a categorical field for X Field 1.\n\n"${v}" is categorical, but KDE needs a numeric field.\n\nSelect a numeric column instead.`
                );
                setXField("");
                return;
              }
              setXField(v);
            }}
            className="form-select"
          >
            <option value="">Select Field</option>
            {numericHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {/* X FIELD 2 */}
        <div className="form-group">
          <label>X Field 2 — Optional</label>
          <select
            value={xField2}
            onChange={(e) => {
              const v = e.target.value;
              if (v && columnTypes[v] === "categorical") {
                alert(
                  `You selected a categorical field for X Field 2.\n\n"${v}" is categorical, but KDE needs a numeric field.\n\nSelect a numeric column instead, or leave X Field 2 as None.`
                );
                setXField2("");
                return;
              }
              setXField2(v);
            }}
            className="form-select"
          >
            <option value="">None (Single Field)</option>
            {numericHeaders.filter(h => h !== xField).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="input-hint">Compare distributions</span>
        </div>

        {/* COLOR 1 — Modern Picker */}
        <div className="form-group">
          <label>Color {xField2 ? "— Field 1" : ""}</label>
          <div className="color-picker-wrapper" onClick={() => colorInputRef1.current?.click()}>
            <div className="color-swatch" style={{ backgroundColor: color }} />
            <span className="color-hex-value">{color}</span>
            <span className="color-edit-hint">Click to edit</span>
            <svg className="color-picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <input
              ref={colorInputRef1}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-picker"
            />
          </div>
        </div>

        {/* COLOR 2 */}
        {xField2 && (
          <div className="form-group">
            <label>Color — Field 2</label>
            <div className="color-picker-wrapper" onClick={() => colorInputRef2.current?.click()}>
              <div className="color-swatch" style={{ backgroundColor: color2 }} />
              <span className="color-hex-value">{color2}</span>
              <span className="color-edit-hint">Click to edit</span>
              <svg className="color-picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <input
                ref={colorInputRef2}
                type="color"
                value={color2}
                onChange={(e) => setColor2(e.target.value)}
                className="color-picker"
              />
            </div>
          </div>
        )}

        {/* BANDWIDTH ADJUSTMENT */}
        <div className="form-group">
          <label>Bandwidth — Smoothness</label>
          <div className="slider-group">
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={bwAdjust}
              onChange={(e) => setBwAdjust(e.target.value)}
              className="slider"
            />
            <span className="slider-value">{bwAdjust}</span>
          </div>
          <span className="input-hint">0.5 = Sharp &nbsp;·&nbsp; 1.5 = Smooth</span>
        </div>

        {/* ALPHA SLIDER */}
        <div className="form-group">
          <label>Transparency — Alpha</label>
          <div className="slider-group">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={alpha}
              onChange={(e) => setAlpha(e.target.value)}
              className="slider"
            />
            <span className="slider-value">{alpha}</span>
          </div>
        </div>

        {/* TOGGLES */}
        <div className="checkbox-group">
          <input type="checkbox" id="fill-check" checked={fill} onChange={() => setFill(!fill)} />
          <label htmlFor="fill-check">Fill Under Curve</label>
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="grid-check" checked={grid} onChange={() => setGrid(!grid)} />
          <label htmlFor="grid-check">Show Grid</label>
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="legend-check" checked={legend} onChange={() => setLegend(!legend)} />
          <label htmlFor="legend-check">Show Legend</label>
        </div>

        <div className="checkbox-group">
          <input type="checkbox" id="dark-check" checked={darkTheme} onChange={() => setDarkTheme(!darkTheme)} />
          <label htmlFor="dark-check">Dark Theme</label>
        </div>

        {/* GENERATE */}
        <button onClick={generatePlot} className="generate-button" disabled={loading}>
          {loading ? "Generating..." : "Generate Plot"}
        </button>
      </div>

      {/* ── PLOT AREA ── */}
      <div className="plot-area">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p className="placeholder-text">Generating plot...</p>
          </div>
        ) : plotUrl ? (
          <img src={plotUrl} alt="KDE Plot" className="plot-image" />
        ) : (
          <div className="empty-state">
            <span className="placeholder-icon" aria-hidden="true">
              <TrendingUp />
            </span>
            <p className="placeholder-text">Plot will appear here</p>
          </div>
        )}

        {/* DOWNLOAD BUTTON */}
        <button
          className="download-btn"
          onClick={handleDownload}
          disabled={!plotUrl || loading}
          title={plotUrl ? "Download plot as PNG" : "Generate a plot first"}
        >
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