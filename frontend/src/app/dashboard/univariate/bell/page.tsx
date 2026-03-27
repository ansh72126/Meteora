"use client";

import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./BellPage.css";

export default function BellPage() {

  const [headers, setHeaders] = useState<string[]>([]);
  const [numericHeaders, setNumericHeaders] = useState<string[]>([]);
  const [categoricalHeaders, setCategoricalHeaders] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<Record<string, "numeric" | "categorical">>({});

  // Configuration states
  const [xField, setXField] = useState("");
  const [color, setColor] = useState("#9b59b6");
  const [grid, setGrid] = useState(true);
  const [darkTheme, setDarkTheme] = useState(false);
  const [lineWidth, setLineWidth] = useState("2.0");
  const [alpha, setAlpha] = useState("0.8");
  const [overlayHistogram, setOverlayHistogram] = useState(false);
  const [showConfidenceInterval, setShowConfidenceInterval] = useState(true);
  const [confidenceLevel, setConfidenceLevel] = useState("95");

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const colorInputRef = useRef<HTMLInputElement>(null);

  // Load headers from session storage
  useEffect(() => {
    const interval = setInterval(() => {
      const stored = sessionStorage.getItem("csvHeaders");
      const storedTypes = sessionStorage.getItem("csvColumnTypes");
      const storedNumeric = sessionStorage.getItem("csvNumericHeaders");
      const storedCategorical = sessionStorage.getItem("csvCategoricalHeaders");
      if (stored) {
        const allHeaders = JSON.parse(stored);
        setHeaders(allHeaders);
        setNumericHeaders(storedNumeric ? JSON.parse(storedNumeric) : allHeaders);
        setCategoricalHeaders(storedCategorical ? JSON.parse(storedCategorical) : []);
        if (storedTypes) setColumnTypes(JSON.parse(storedTypes));
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (numericHeaders.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the bell curve." };
    }
    if (!xField) {
      return { valid: false, message: "X field is required. Select a numeric column before generating." };
    }
    if (xField && columnTypes[xField] === "categorical") {
      return {
        valid: false,
        message: `Invalid X Field: "${xField}" is categorical. A bell curve requires numeric data.\n\nWhat to do instead:\n- Select a numeric column\n- If your data is categorical, use Pie Chart or Bar Chart instead.`,
      };
    }
    const confLevel = parseInt(confidenceLevel, 10);
    if (isNaN(confLevel) || confLevel < 50 || confLevel > 99) {
      return { valid: false, message: "Confidence level must be between 50 and 99." };
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/univariate/bell`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          x_column: xField,
          color: color,
          grid: grid,
          dark_theme: darkTheme,
          line_width: parseFloat(lineWidth),
          alpha: parseFloat(alpha),
          overlay_histogram: overlayHistogram,
          show_confidence_interval: showConfidenceInterval,
          confidence_level: parseInt(confidenceLevel)
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate bell curve"));
      }

      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
    } catch (err: unknown) {
      let msg = (err as Error)?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "Select a numeric column for the bell curve.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the bell curve.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after filtering. Try selecting a column with fewer missing values.";
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
    const plotTitle = `Bell_${xField}`;
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
    <div className="bell-container">

      {/* ── BACK BUTTON ── */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* ── CONFIG PANEL ── */}
      <div className="config-panel">
        <h2 className="panel-title">Bell Curve Config</h2>

        {/* X FIELD */}
        <div className="form-group">
          <label>X Field — Required</label>
          <select
            value={xField}
            onChange={(e) => {
              const v = e.target.value;
              if (v && columnTypes[v] === "categorical") {
                alert(
                  `You selected a categorical field.\n\n"${v}" is categorical, but Bell Curve needs a numeric field.\n\nSelect a numeric column instead.`
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

        {/* COLOR — Modern Picker */}
        <div className="form-group">
          <label>Bell Curve Color</label>
          <div className="color-picker-wrapper" onClick={() => colorInputRef.current?.click()}>
            <div className="color-swatch" style={{ backgroundColor: color }} />
            <span className="color-hex-value">{color}</span>
            <span className="color-edit-hint">Click to edit</span>
            <svg className="color-picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <input
              ref={colorInputRef}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-picker"
            />
          </div>
        </div>

        {/* LINE WIDTH */}
        <div className="form-group">
          <label>Line Width</label>
          <div className="slider-group">
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.5"
              value={lineWidth}
              onChange={(e) => setLineWidth(e.target.value)}
              className="slider"
            />
            <span className="slider-value">{lineWidth}</span>
          </div>
          <span className="input-hint">0.5 = Thin &nbsp;·&nbsp; 5.0 = Thick</span>
        </div>

        {/* ALPHA */}
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

        {/* OVERLAY HISTOGRAM */}
        <div className="checkbox-group highlight">
          <input
            type="checkbox"
            id="overlay-check"
            checked={overlayHistogram}
            onChange={() => setOverlayHistogram(!overlayHistogram)}
          />
          <label htmlFor="overlay-check">
            Overlay with Histogram
            <span className="label-hint">Compare empirical vs theoretical</span>
          </label>
        </div>

        {/* CONFIDENCE INTERVAL */}
        <div className="checkbox-group highlight">
          <input
            type="checkbox"
            id="confidence-check"
            checked={showConfidenceInterval}
            onChange={() => setShowConfidenceInterval(!showConfidenceInterval)}
          />
          <label htmlFor="confidence-check">Show Confidence Interval</label>
        </div>

        {/* CONFIDENCE LEVEL */}
        {showConfidenceInterval && (
          <div className="form-group nested">
            <label>Confidence Level</label>
            <select value={confidenceLevel} onChange={(e) => setConfidenceLevel(e.target.value)} className="form-select">
              <option value="90">90%</option>
              <option value="95">95%</option>
              <option value="99">99%</option>
            </select>
          </div>
        )}

        {/* GRID TOGGLE */}
        <div className="checkbox-group">
          <input type="checkbox" id="grid-check" checked={grid} onChange={() => setGrid(!grid)} />
          <label htmlFor="grid-check">Show Grid</label>
        </div>

        {/* DARK THEME TOGGLE */}
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
          <img src={plotUrl} alt="Bell Curve Plot" className="plot-image" />
        ) : (
          <div className="empty-state">
            <span className="placeholder-icon" aria-hidden="true">
              <Bell />
            </span>
            <p className="placeholder-text">Plot will appear here</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
              Fits a normal distribution to your data
            </p>
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