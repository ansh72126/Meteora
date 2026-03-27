"use client";

import { useState, useEffect, useRef } from "react";
import { TrendingUp } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./ECDFPage.css";

export default function ECDFPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [numericHeaders, setNumericHeaders] = useState<string[]>([]);
  const [categoricalHeaders, setCategoricalHeaders] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<Record<string, "numeric" | "categorical">>({});

  // ── FIELD SELECTION ──────────────────────────────────
  const [selectedFields, setSelectedFields] = useState<string[]>([""]);

  // ── CONFIG STATES ────────────────────────────────────
  const [colorMode, setColorMode] = useState<"single" | "per-field">("single");
  const [singleColor, setSingleColor] = useState("#33cc66");
  const [perFieldColors, setPerFieldColors] = useState<string[]>(["#33cc66"]);
  const [legend, setLegend] = useState(true);
  const [grid, setGrid] = useState(true);
  const [darkTheme, setDarkTheme] = useState(false);
  const [cumulativeScale, setCumulativeScale] = useState<"0-1" | "0-100">("0-1");
  const [complementary, setComplementary] = useState(false);
  const [theoreticalOverlay, setTheoreticalOverlay] = useState<"none" | "normal">("none");
  const [showSummaryStats, setShowSummaryStats] = useState(false);
  const [summaryFields, setSummaryFields] = useState({
    mean: true,
    median: true,
    stdev: true,
    n: true,
  });

  const [plotUrl, setPlotUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const colorInputRef = useRef<HTMLInputElement>(null);
  const perFieldColorRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── DEFAULT DISTINCT COLORS ──────────────────────────
  const DISTINCT_COLORS = [
    "#33cc66", "#3366ff", "#ff6633", "#9b59b6",
    "#e91e8c", "#00bcd4", "#ff9800", "#4caf50",
  ];

  // ── LOAD HEADERS ────────────────────────────────────
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

  // ── FIELD MANAGEMENT ────────────────────────────────
  const addField = () => {
    if (selectedFields.length >= numericHeaders.length) return;
    setSelectedFields([...selectedFields, ""]);
    setPerFieldColors([
      ...perFieldColors,
      DISTINCT_COLORS[selectedFields.length % DISTINCT_COLORS.length] ?? "#33cc66",
    ]);
    perFieldColorRefs.current = [...perFieldColorRefs.current, null];
  };

  const removeField = (index: number) => {
    if (selectedFields.length === 1) return;
    setSelectedFields(selectedFields.filter((_, i) => i !== index));
    setPerFieldColors(perFieldColors.filter((_, i) => i !== index));
  };

  const updateField = (index: number, value: string) => {
    if (value && columnTypes[value] === "categorical") {
      alert(
        `You selected a categorical field.\n\n"${value}" is categorical, but ECDF needs numeric fields.\n\nSelect a numeric column instead.`
      );
      const updated = [...selectedFields];
      updated[index] = "";
      setSelectedFields(updated);
      return;
    }
    const updated = [...selectedFields];
    updated[index] = value;
    setSelectedFields(updated);
  };

  const updatePerFieldColor = (index: number, value: string) => {
    const updated = [...perFieldColors];
    updated[index] = value;
    setPerFieldColors(updated);
  };

  // ── AVAILABLE HEADERS (exclude already chosen) ──────
  const availableFor = (index: number) =>
    numericHeaders.filter(
      (h) => !selectedFields.includes(h) || selectedFields[index] === h
    );

  const validateConfig = (): { valid: boolean; message?: string } => {
    if (numericHeaders.length === 0) {
      return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the ECDF plot." };
    }
    const validFields = selectedFields.filter((f) => f !== "");
    if (validFields.length === 0) {
      return { valid: false, message: "At least one field is required. Select numeric columns before generating." };
    }
    const categoricalChosen = validFields.filter((f) => columnTypes[f] === "categorical");
    if (categoricalChosen.length > 0) {
      const list = categoricalChosen.map((s) => `"${s}"`).join(", ");
      return {
        valid: false,
        message: `Invalid field selection: ECDF requires numeric columns, but you selected categorical field(s): ${list}.\n\nWhat to do instead:\n- Select only numeric columns\n- If you need distributions per category, use Box Plot (numeric by group).`,
      };
    }
    if (new Set(validFields).size !== validFields.length) {
      return { valid: false, message: "Duplicate fields selected. Each field must be unique." };
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

  // ── GENERATE PLOT ────────────────────────────────────
  const generatePlot = async () => {
    const validFields = selectedFields.filter((f) => f !== "");
    const v = validateConfig();
    if (!v.valid) {
      alert(v.message);
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      // Resolve colors per field
      const colors =
        colorMode === "single"
          ? validFields.map(() => singleColor)
          : validFields.map((_, i) => perFieldColors[i] ?? DISTINCT_COLORS[i % DISTINCT_COLORS.length]);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/univariate/ecdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          x_columns: validFields,
          colors: colors,
          color_mode: colorMode,
          legend: legend,
          grid: grid,
          dark_theme: darkTheme,
          cumulative_scale: cumulativeScale,
          complementary: complementary,
          theoretical_overlay: theoreticalOverlay,
          show_summary_stats: showSummaryStats,
          summary_fields: showSummaryStats ? summaryFields : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(parseApiError(err.detail ?? "Failed to generate ECDF plot"));
      }

      const data = await res.json();
      setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
    } catch (err: unknown) {
      let msg = (err as Error)?.message ?? "An unexpected error occurred.";
      if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
        msg = msg.trim();
        if (!msg.endsWith(".")) msg += " ";
        msg += "Select numeric columns for the ECDF plot.";
      } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
        msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the ECDF plot.";
      } else if (msg.toLowerCase().includes("not enough rows")) {
        msg = "Not enough rows after filtering. Try selecting columns with fewer missing values.";
      }
      alert(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── DOWNLOAD ─────────────────────────────────────────
  const handleDownload = async () => {
    if (!plotUrl) return;
    const label = selectedFields.filter(Boolean).join("_") || "ecdf";
    try {
      const response = await fetch(plotUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ECDF_${label}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      console.error("Download failed");
    }
  };

  return (
    <div className="ecdf-container">

      {/* ── BACK BUTTON ── */}
      <button className="back-button" onClick={() => window.history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* ── CONFIG PANEL (scrollable) ── */}
      <div className="config-panel">
        <h2 className="panel-title">ECDF Config</h2>

        {/* ── FIELDS (1–N) ── */}
        <div className="form-group">
          <label>Fields <span className="label-badge">Required · 1–N</span></label>

          <div className="field-list">
            {selectedFields.map((field, idx) => (
              <div key={idx} className="field-row">
                <select
                  value={field}
                  onChange={(e) => updateField(idx, e.target.value)}
                  className="form-select field-select"
                >
                  <option value="">Select Field</option>
                  {availableFor(idx).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>

                {/* Per-field color swatch when in per-field mode */}
                {colorMode === "per-field" && (
                  <div
                    className="inline-color-swatch"
                    style={{ backgroundColor: perFieldColors[idx] ?? DISTINCT_COLORS[idx % DISTINCT_COLORS.length] }}
                    title="Click to change color"
                    onClick={() => perFieldColorRefs.current[idx]?.click()}
                  >
                    <input
                      ref={(el) => { perFieldColorRefs.current[idx] = el; }}
                      type="color"
                      value={perFieldColors[idx] ?? DISTINCT_COLORS[idx % DISTINCT_COLORS.length]}
                      onChange={(e) => updatePerFieldColor(idx, e.target.value)}
                      className="color-picker"
                    />
                  </div>
                )}

                {selectedFields.length > 1 && (
                  <button className="remove-field-btn" onClick={() => removeField(idx)} title="Remove field">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            className="add-field-btn"
            onClick={addField}
            disabled={selectedFields.length >= numericHeaders.length}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Field
          </button>
        </div>

        {/* ── COLOR MODE ── */}
        <div className="form-group">
          <label>Series Color Mode</label>
          <div className="segmented-control">
            <button
              className={`seg-btn ${colorMode === "single" ? "active" : ""}`}
              onClick={() => setColorMode("single")}
            >Single</button>
            <button
              className={`seg-btn ${colorMode === "per-field" ? "active" : ""}`}
              onClick={() => setColorMode("per-field")}
            >Per-field</button>
          </div>
          {colorMode === "per-field" && (
            <span className="input-hint">Click the color swatches next to each field above</span>
          )}
        </div>

        {/* SINGLE COLOR PICKER */}
        {colorMode === "single" && (
          <div className="form-group">
            <label>Series Color</label>
            <div className="color-picker-wrapper" onClick={() => colorInputRef.current?.click()}>
              <div className="color-swatch" style={{ backgroundColor: singleColor }} />
              <span className="color-hex-value">{singleColor}</span>
              <span className="color-edit-hint">Click to edit</span>
              <svg className="color-picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <input
                ref={colorInputRef}
                type="color"
                value={singleColor}
                onChange={(e) => setSingleColor(e.target.value)}
                className="color-picker"
              />
            </div>
          </div>
        )}

        {/* ── CUMULATIVE SCALE ── */}
        <div className="form-group">
          <label>Cumulative Scale</label>
          <div className="segmented-control">
            <button
              className={`seg-btn ${cumulativeScale === "0-1" ? "active" : ""}`}
              onClick={() => setCumulativeScale("0-1")}
            >0 – 1</button>
            <button
              className={`seg-btn ${cumulativeScale === "0-100" ? "active" : ""}`}
              onClick={() => setCumulativeScale("0-100")}
            >0 – 100%</button>
          </div>
          <span className="input-hint">
            {cumulativeScale === "0-1"
              ? "Fractional probability (0.0 – 1.0)"
              : "Percentage scale (0% – 100%)"}
          </span>
        </div>

        {/* ── ECDF TYPE / COMPLEMENTARY ── */}
        <div className="form-group">
          <label>ECDF Type</label>
          <div className="segmented-control">
            <button
              className={`seg-btn ${!complementary ? "active" : ""}`}
              onClick={() => setComplementary(false)}
            >Empirical (Step)</button>
            <button
              className={`seg-btn ${complementary ? "active" : ""}`}
              onClick={() => setComplementary(true)}
            >Complementary (1−F)</button>
          </div>
          <span className="input-hint">
            {complementary
              ? "Shows survival / tail probability"
              : "Standard staircase from sorted values"}
          </span>
        </div>

        {/* ── THEORETICAL OVERLAY ── */}
        <div className="form-group">
          <label>Theoretical Overlay</label>
          <div className="segmented-control">
            <button
              className={`seg-btn ${theoreticalOverlay === "none" ? "active" : ""}`}
              onClick={() => setTheoreticalOverlay("none")}
            >None</button>
            <button
              className={`seg-btn ${theoreticalOverlay === "normal" ? "active" : ""}`}
              onClick={() => setTheoreticalOverlay("normal")}
            >Normal CDF</button>
          </div>
          {theoreticalOverlay === "normal" && (
            <span className="input-hint">Fitted normal curve overlaid for comparison</span>
          )}
        </div>

        {/* ── SUMMARY STATISTICS ── */}
        <div className="checkbox-group highlight">
          <input
            type="checkbox"
            id="summary-check"
            checked={showSummaryStats}
            onChange={() => setShowSummaryStats(!showSummaryStats)}
          />
          <label htmlFor="summary-check">
            Summary Statistics Panel
            <span className="label-hint">Annotate plot with key statistics</span>
          </label>
        </div>

        {showSummaryStats && (
          <div className="form-group nested stats-toggle-group">
            {(["mean", "median", "stdev", "n"] as const).map((key) => (
              <div key={key} className="checkbox-group compact">
                <input
                  type="checkbox"
                  id={`stat-${key}`}
                  checked={summaryFields[key]}
                  onChange={() =>
                    setSummaryFields((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                />
                <label htmlFor={`stat-${key}`}>
                  {key === "stdev" ? "StDev" : key === "n" ? "N (count)" : key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
              </div>
            ))}
          </div>
        )}

        {/* ── LEGEND ── */}
        <div className="checkbox-group">
          <input type="checkbox" id="legend-check" checked={legend} onChange={() => setLegend(!legend)} />
          <label htmlFor="legend-check">Show Legend</label>
        </div>

        {/* ── GRID ── */}
        <div className="checkbox-group">
          <input type="checkbox" id="grid-check" checked={grid} onChange={() => setGrid(!grid)} />
          <label htmlFor="grid-check">Show Grid</label>
        </div>

        {/* ── DARK THEME ── */}
        <div className="checkbox-group">
          <input type="checkbox" id="dark-check" checked={darkTheme} onChange={() => setDarkTheme(!darkTheme)} />
          <label htmlFor="dark-check">Dark Theme</label>
        </div>

        {/* ── GENERATE ── */}
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
          <img src={plotUrl} alt="ECDF Plot" className="plot-image" />
        ) : (
          <div className="empty-state">
            <span className="placeholder-icon" aria-hidden="true">
              <TrendingUp />
            </span>
            <p className="placeholder-text">Plot will appear here</p>
            <p className="placeholder-text" style={{ fontSize: "0.75rem", marginTop: "4px", opacity: 0.6 }}>
              Empirical Cumulative Distribution Function
            </p>
          </div>
        )}

        {/* DOWNLOAD */}
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