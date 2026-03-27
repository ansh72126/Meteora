"use client";

import { useState, useEffect, useRef } from "react";
import { BarChart3, Check } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import "./BarChartPage.css";

const DISTINCT_COLORS = [
    "#33cc66", "#3366ff", "#ff6633", "#9b59b6",
    "#e91e8c", "#00bcd4", "#ff9800", "#4caf50",
];

export default function BarChartPage() {
    const [headers, setHeaders] = useState<string[]>([]);
    const [numericHeaders, setNumericHeaders] = useState<string[]>([]);
    const [categoricalHeaders, setCategoricalHeaders] = useState<string[]>([]);
    const [columnTypes, setColumnTypes] = useState<Record<string, "numeric" | "categorical">>({});

    const [selectedFields, setSelectedFields] = useState<string[]>([]);
    const [perFieldColors, setPerFieldColors] = useState<Record<string, string>>({});
    const chipColorRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const [categoryColumn, setCategoryColumn] = useState("");
    const [seriesColorMode, setSeriesColorMode] = useState<"single" | "per-field">("per-field");
    const [singleColor, setSingleColor] = useState("#00d4ff");
    const [layoutMode, setLayoutMode] = useState<"grouped" | "stacked">("grouped");
    const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");
    const [barWidth, setBarWidth] = useState("0.8");
    const [barSpacing, setBarSpacing] = useState("0.2");
    const [yAxisScale, setYAxisScale] = useState<"auto" | "manual">("auto");
    const [yMin, setYMin] = useState("");
    const [yMax, setYMax] = useState("");
    const [tickFormat, setTickFormat] = useState<"none" | "K" | "M">("none");
    const [majorTickInterval, setMajorTickInterval] = useState("");
    const [gridStyle, setGridStyle] = useState(true);
    const [zeroBaseline, setZeroBaseline] = useState(true);
    const [showLegend, setShowLegend] = useState(true);
    const [darkTheme, setDarkTheme] = useState(false);

    const [plotUrl, setPlotUrl] = useState("");
    const [loading, setLoading] = useState(false);

    const colorInputRef = useRef<HTMLInputElement>(null);

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

    useEffect(() => {
        if (selectedFields.length > 1) setShowLegend(true);
    }, [selectedFields]);

    const handleFieldToggle = (field: string) => {
        if (columnTypes[field] === "categorical") {
            alert(
                `You selected a categorical field as a value field.\n\n"${field}" is categorical, but Bar Chart value fields must be numeric.\n\nSelect a numeric column instead. If you need counts per category, use Pie Chart (Count) or a categorical Bar Chart configuration.`
            );
            return;
        }
        setSelectedFields(prev => {
            if (prev.includes(field)) {
                return prev.filter(f => f !== field);
            } else {
                setPerFieldColors(c => ({
                    ...c,
                    [field]: c[field] ?? (DISTINCT_COLORS[prev.length % DISTINCT_COLORS.length] ?? "#33cc66"),
                }));
                return [...prev, field];
            }
        });
    };

    const validateConfig = (): { valid: boolean; message?: string } => {
        if (headers.length === 0) {
            return { valid: false, message: "No data loaded. Upload a CSV file first from the upload page, then return here to generate the bar chart." };
        }
        if (selectedFields.length === 0) {
            return { valid: false, message: "At least one value field is required. Select numeric columns before generating." };
        }
        if (!categoryColumn) {
            return { valid: false, message: "Category column is required. Select a column for bar labels (can be categorical or numeric)." };
        }
        if (selectedFields.includes(categoryColumn)) {
            return { valid: false, message: "Category column must differ from value fields. Use one column for categories and others for values." };
        }
        const categoricalChosen = selectedFields.filter((f) => columnTypes[f] === "categorical");
        if (categoricalChosen.length > 0) {
            const list = categoricalChosen.map((s) => `"${s}"`).join(", ");
            return {
                valid: false,
                message: `Invalid value field selection: Bar values must be numeric, but you selected categorical field(s): ${list}.\n\nWhat to do instead:\n- Select only numeric columns as value fields\n- If you want counts per category, use Pie Chart with Aggregation = Count.`,
            };
        }
        if (yAxisScale === "manual" && yMin !== "" && yMax !== "") {
            const lo = parseFloat(yMin);
            const hi = parseFloat(yMax);
            if (!isNaN(lo) && !isNaN(hi) && lo >= hi) {
                return { valid: false, message: "Y Min must be less than Y Max when using manual axis range." };
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

        const resolvedColors = selectedFields.map(
            (f, i) => seriesColorMode === "single"
                ? singleColor
                : (perFieldColors[f] ?? DISTINCT_COLORS[i % DISTINCT_COLORS.length])
        );

        setLoading(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/univariate/barchart`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    value_columns: selectedFields,
                    category_column: categoryColumn,
                    series_color_mode: seriesColorMode,
                    single_color: singleColor,
                    per_field_colors: resolvedColors,
                    layout_mode: layoutMode,
                    orientation: orientation,
                    bar_width: parseFloat(barWidth),
                    bar_spacing: parseFloat(barSpacing),
                    y_axis_scale: yAxisScale,
                    y_min: yMin ? parseFloat(yMin) : null,
                    y_max: yMax ? parseFloat(yMax) : null,
                    tick_format: tickFormat,
                    major_tick_interval: majorTickInterval ? parseFloat(majorTickInterval) : null,
                    grid_style: gridStyle,
                    zero_baseline: zeroBaseline,
                    show_legend: showLegend,
                    dark_theme: darkTheme,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(parseApiError(err.detail ?? "Failed to generate bar chart"));
            }
            const data = await res.json();
            setPlotUrl(`${process.env.NEXT_PUBLIC_API_URL}/${data.image_path}`);
        } catch (err: unknown) {
            let msg = (err as Error)?.message ?? "An unexpected error occurred.";
            if (msg.toLowerCase().includes("categorical") || msg.toLowerCase().includes("non-numeric")) {
                msg = msg.trim();
                if (!msg.endsWith(".")) msg += " ";
                msg += "Select numeric columns for value fields; category column can be categorical.";
            } else if (msg.toLowerCase().includes("no csv") || msg.toLowerCase().includes("file uploaded")) {
                msg = "No CSV file loaded. Upload a CSV from the upload page first, then return here to generate the bar chart.";
            } else if (msg.toLowerCase().includes("not enough rows")) {
                msg = "Not enough rows after filtering. Try selecting columns with fewer missing values.";
            }
            alert(msg);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!plotUrl) return;
        const label = selectedFields.join("_") || "barchart";
        try {
            const response = await fetch(plotUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `BarChart_${label}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch { console.error("Download failed"); }
    };

    return (
        <div className="barchart-container">

            <button className="back-button" onClick={() => window.history.back()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
            </button>

            <div className="config-panel">
                <h2 className="panel-title">Bar Chart Config</h2>

                {/* CATEGORY COLUMN */}
                <div className="form-group">
                    <label>Categories — Primary Axis</label>
                    <select value={categoryColumn} onChange={(e) => setCategoryColumn(e.target.value)} className="form-select">
                        <option value="">Select Field</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                </div>

                {/* VALUE FIELDS */}
                <div className="form-group">
                    <label>
                        Fields <span className="label-badge">Required · 1–N</span>
                    </label>
                    <div className="field-selection-grid">
                        {numericHeaders.filter(h => h !== categoryColumn).map((field) => {
                            const isSelected = selectedFields.includes(field);
                            const chipColor = perFieldColors[field] ?? DISTINCT_COLORS[selectedFields.indexOf(field) % DISTINCT_COLORS.length];
                            return (
                                <div
                                    key={field}
                                    className={`field-chip ${isSelected ? "selected" : ""}`}
                                    onClick={() => handleFieldToggle(field)}
                                >
                                    {isSelected && seriesColorMode === "per-field" && (
                                        <div
                                            className="chip-color-dot"
                                            style={{ backgroundColor: chipColor }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                chipColorRefs.current[field]?.click();
                                            }}
                                            title="Click to change color"
                                        >
                                            <input
                                                ref={(el) => { chipColorRefs.current[field] = el; }}
                                                type="color"
                                                value={chipColor}
                                                onChange={(e) => {
                                                    setPerFieldColors(c => ({ ...c, [field]: e.target.value }));
                                                }}
                                                className="chip-color-input"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    )}
                                    <span className="field-name">{field}</span>
                                    {isSelected && (
                                      <span className="check-icon" aria-hidden="true">
                                        <Check />
                                      </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <span className="input-hint">
                        {selectedFields.length} field{selectedFields.length !== 1 ? "s" : ""} selected
                        {seriesColorMode === "per-field" && selectedFields.length > 0 && " · tap dot to change color"}
                    </span>
                </div>

                {/* SERIES COLOR MODE */}
                <div className="form-group">
                    <label>Series Color Mode</label>
                    <div className="segmented-control">
                        <button className={`seg-btn ${seriesColorMode === "single" ? "active" : ""}`} onClick={() => setSeriesColorMode("single")}>Single</button>
                        <button className={`seg-btn ${seriesColorMode === "per-field" ? "active" : ""}`} onClick={() => setSeriesColorMode("per-field")}>Per-Field</button>
                    </div>
                </div>

                {/* SINGLE COLOR */}
                {seriesColorMode === "single" && (
                    <div className="form-group">
                        <label>Bar Color</label>
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

                {/* LAYOUT MODE */}
                <div className="form-group">
                    <label>Multi-Series Grouping</label>
                    <div className="segmented-control">
                        <button className={`seg-btn ${layoutMode === "grouped" ? "active" : ""}`} onClick={() => setLayoutMode("grouped")}>Grouped</button>
                        <button className={`seg-btn ${layoutMode === "stacked" ? "active" : ""}`} onClick={() => setLayoutMode("stacked")}>Stacked</button>
                    </div>
                    <span className="input-hint">Comparison vs Composition</span>
                </div>

                {/* ORIENTATION */}
                <div className="form-group">
                    <label>Orientation</label>
                    <div className="segmented-control">
                        <button className={`seg-btn ${orientation === "vertical" ? "active" : ""}`} onClick={() => setOrientation("vertical")}>Vertical</button>
                        <button className={`seg-btn ${orientation === "horizontal" ? "active" : ""}`} onClick={() => setOrientation("horizontal")}>Horizontal</button>
                    </div>
                </div>

                {/* BAR WIDTH */}
                <div className="form-group">
                    <label>Bar Width</label>
                    <div className="slider-group">
                        <input type="range" min="0.3" max="1.0" step="0.1" value={barWidth} onChange={(e) => setBarWidth(e.target.value)} className="slider" />
                        <span className="slider-value">{barWidth}</span>
                    </div>
                </div>

                {/* BAR SPACING */}
                <div className="form-group">
                    <label>Bar Spacing</label>
                    <div className="slider-group">
                        <input type="range" min="0.0" max="0.5" step="0.05" value={barSpacing} onChange={(e) => setBarSpacing(e.target.value)} className="slider" />
                        <span className="slider-value">{barSpacing}</span>
                    </div>
                </div>

                {/* Y-AXIS SCALE */}
                <div className="form-group">
                    <label>Y-Axis Scale</label>
                    <div className="segmented-control">
                        <button className={`seg-btn ${yAxisScale === "auto" ? "active" : ""}`} onClick={() => setYAxisScale("auto")}>Auto</button>
                        <button className={`seg-btn ${yAxisScale === "manual" ? "active" : ""}`} onClick={() => setYAxisScale("manual")}>Manual</button>
                    </div>
                </div>

                {yAxisScale === "manual" && (
                    <div className="form-group nested">
                        <div className="dual-input">
                            <div className="input-wrapper">
                                <label className="mini-label">Min</label>
                                <input type="number" value={yMin} onChange={(e) => setYMin(e.target.value)} className="form-input-small" placeholder="Auto" />
                            </div>
                            <div className="input-wrapper">
                                <label className="mini-label">Max</label>
                                <input type="number" value={yMax} onChange={(e) => setYMax(e.target.value)} className="form-input-small" placeholder="Auto" />
                            </div>
                        </div>
                    </div>
                )}

                {/* TICK FORMAT */}
                <div className="form-group">
                    <label>Y-Axis Tick Format</label>
                    <select value={tickFormat} onChange={(e) => setTickFormat(e.target.value as any)} className="form-select">
                        <option value="none">None</option>
                        <option value="K">1K (Thousands)</option>
                        <option value="M">1M (Millions)</option>
                    </select>
                </div>

                {/* MAJOR TICK INTERVAL */}
                <div className="form-group">
                    <label>Major Tick Interval</label>
                    <input type="number" value={majorTickInterval} onChange={(e) => setMajorTickInterval(e.target.value)} className="form-input" placeholder="Auto" />
                    <span className="input-hint">Leave empty for auto</span>
                </div>

                <div className="checkbox-group">
                    <input type="checkbox" id="grid-check" checked={gridStyle} onChange={() => setGridStyle(!gridStyle)} />
                    <label htmlFor="grid-check">Show Grid</label>
                </div>
                <div className="checkbox-group">
                    <input type="checkbox" id="baseline-check" checked={zeroBaseline} onChange={() => setZeroBaseline(!zeroBaseline)} />
                    <label htmlFor="baseline-check">Zero Baseline</label>
                </div>
                <div className="checkbox-group">
                    <input type="checkbox" id="legend-check" checked={showLegend} onChange={() => setShowLegend(!showLegend)} />
                    <label htmlFor="legend-check">Show Legend</label>
                </div>
                <div className="checkbox-group">
                    <input type="checkbox" id="dark-check" checked={darkTheme} onChange={() => setDarkTheme(!darkTheme)} />
                    <label htmlFor="dark-check">Dark Theme</label>
                </div>

                <button onClick={generatePlot} className="generate-button" disabled={loading}>
                    {loading ? "Generating..." : "Generate Plot"}
                </button>
            </div>

            <div className="plot-area">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p className="placeholder-text">Generating plot...</p>
                    </div>
                ) : plotUrl ? (
                    <img src={plotUrl} alt="Bar Chart Plot" className="plot-image" />
                ) : (
                    <div className="empty-state">
                        <span className="placeholder-icon" aria-hidden="true">
                          <BarChart3 />
                        </span>
                        <p className="placeholder-text">Plot will appear here</p>
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

        </div>
    );
}