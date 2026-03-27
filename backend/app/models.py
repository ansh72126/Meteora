from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Optional, Union, Any

# Request Models
class CSVScopedRequest(BaseModel):
    upload_id: Optional[str] = None

class HistogramRequest(CSVScopedRequest):
    x_column: str
    x_column_2: Optional[str] = None  # ✅ NEW: Second field (optional)
    bins: int = Field(default=20, ge=5, le=100)
    color: str = "#3366ff"
    color_2: Optional[str] = None  # ✅ NEW: Second color
    grid: bool = True
    legend: bool = False
    dark_theme: bool = False  # ✅ NEW: Dark theme toggle
    alpha: float = Field(default=0.7, ge=0.0, le=1.0)  # ✅ NEW: Transparency

class KDERequest(CSVScopedRequest):
    x_column: str
    x_column_2: Optional[str] = None  # ✅ NEW: Second field (optional)
    color: str = "#ff6633"
    color_2: Optional[str] = None  # ✅ NEW: Second color
    grid: bool = True
    legend: bool = False
    dark_theme: bool = False  # ✅ NEW: Dark theme toggle
    bw_adjust: float = Field(default=1.0, ge=0.5, le=1.5)  # ✅ NEW: Bandwidth adjustment
    alpha: float = Field(default=0.7, ge=0.0, le=1.0)  # ✅ NEW: Transparency
    fill: bool = True

class BellCurveRequest(CSVScopedRequest):
    x_column: str
    color: str = "#9b59b6"
    grid: bool = True
    dark_theme: bool = False
    line_width: float = Field(default=2.0, ge=0.5, le=5.0)
    alpha: float = Field(default=0.8, ge=0.0, le=1.0)
    overlay_histogram: bool = False
    show_confidence_interval: bool = True
    confidence_level: int = Field(default=95, ge=90, le=99)  # 90, 95, or 99

class ECDFRequest(CSVScopedRequest):
    # Multi-field support (1–N columns)
    x_columns: List[str]                               # replaces single x_column
    # Color
    colors: Optional[List[str]] = None                 # one per column; auto-fills if None
    color_mode: Literal["single", "per-field"] = "single"
    # Display
    legend: bool = True
    grid: bool = True
    dark_theme: bool = False
    # Scale / Type
    cumulative_scale: Literal["0-1", "0-100"] = "0-1"
    complementary: bool = False                        # show 1-ECDF
    # Theoretical overlay
    theoretical_overlay: Literal["none", "normal"] = "none"
    # Summary statistics
    show_summary_stats: bool = False
    summary_fields: Optional[Dict[str, bool]] = None  # {"mean": True, "median": True, "stdev": True, "n": True}

class BarChartRequest(CSVScopedRequest):
    value_columns: List[str]
    category_column: str
    series_color_mode: Literal["single", "per-field"] = "per-field"
    single_color: str = "#00d4ff"
    per_field_colors: Optional[List[str]] = None
    layout_mode: Literal["grouped", "stacked"] = "grouped"
    orientation: Literal["vertical", "horizontal"] = "vertical"
    bar_width: float = Field(default=0.8, ge=0.3, le=1.0)
    bar_spacing: float = Field(default=0.2, ge=0.0, le=0.5)
    y_axis_scale: Literal["auto", "manual"] = "auto"
    y_min: Optional[float] = None
    y_max: Optional[float] = None
    tick_format: Literal["none", "K", "M"] = "none"
    major_tick_interval: Optional[float] = None
    grid_style: bool = True
    zero_baseline: bool = True
    show_legend: bool = True
    dark_theme: bool = False

class BoxPlotRequest(CSVScopedRequest):
    numeric_column: str
    grouping_column: Optional[str] = None
    grouping_mode: Literal["single", "grouped"] = "single"
    orientation: Literal["vertical", "horizontal"] = "vertical"
    whisker_definition: Literal["iqr", "minmax"] = "iqr"
    outlier_detection: bool = True
    quartile_method: Literal["linear", "midpoint"] = "linear"
    axis_scale: Literal["linear", "log"] = "linear"
    axis_range: Literal["auto", "manual"] = "auto"
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    grid_style: Literal["none", "horizontal"] = "horizontal"
    color_mode: Literal["single", "distinct"] = "single"
    single_color: str = "#00d4ff"
    show_legend: bool = False
    dark_theme: bool = False
    category_sorting: Literal["original", "alphabetical", "median"] = "original"

class PieChartRequest(CSVScopedRequest):
    category_column: str
    value_column: Optional[str] = None  # Not needed for count
    aggregation_method: Literal["sum", "count", "mean"] = "sum"
    chart_type: Literal["pie", "donut"] = "pie"
    inner_radius: float = Field(default=0.0, ge=0.0, le=0.8)
    slice_ordering: Literal["original", "ascending", "descending"] = "descending"
    start_angle: float = Field(default=0, ge=0, le=360)
    value_representation: Literal["values", "percentage", "both"] = "percentage"
    label_position: Literal["inside", "outside", "legend"] = "outside"
    min_slice_threshold: float = Field(default=2.0, ge=0, le=10)
    show_legend: bool = True
    legend_position: Literal["right", "bottom"] = "right"
    center_label: Optional[str] = None
    show_total: bool = False
    slice_border: bool = True
    border_width: float = Field(default=1.5, ge=0.5, le=3.0)
    angle_precision: int = Field(default=1, ge=0, le=2)
    dark_theme: bool = False

class LineChartRequest(CSVScopedRequest):
    x_axis_field: str
    y_axis_field: str
    series_group_field: Optional[str] = None
    multi_series_mode: Literal["single", "multiple"] = "single"
    x_axis_type: Literal["time", "numeric", "categorical"] = "numeric"
    y_axis_scale: Literal["linear", "log", "symlog"] = "linear"
    aggregation_method: Literal["sum", "mean", "count", "none"] = "none"
    sorting_order: Literal["chronological", "ascending"] = "ascending"
    missing_value_handling: Literal["connect", "break", "interpolate"] = "connect"
    enable_secondary_axis: bool = False
    secondary_y_field: Optional[str] = None
    default_line_style: Literal["solid", "dashed", "dotted"] = "solid"
    color_mode: Literal["auto", "custom"] = "auto"
    show_legend: bool = True
    legend_position: Literal["best", "upper right", "lower right"] = "best"
    grid_style: Literal["none", "horizontal", "full"] = "horizontal"
    area_fill: bool = False
    fill_alpha: float = Field(default=0.3, ge=0.0, le=1.0)
    smoothing: Literal["none", "moving_average", "spline"] = "none"
    smoothing_window: int = Field(default=3, ge=2, le=20)
    line_width: float = Field(default=2.0, ge=0.5, le=5.0)
    marker_style: Literal["none", "circle", "square", "triangle"] = "none"
    marker_size: int = Field(default=6, ge=3, le=12)
    dark_theme: bool = False

class ScatterStats(BaseModel):
    # Core
    correlation_coefficient: Optional[float] = None
    correlation_method: Optional[str] = None
    r_squared: Optional[float] = None
    p_value: Optional[float] = None
    slope: Optional[float] = None
    intercept: Optional[float] = None
    equation: Optional[str] = None
    confidence_interval_lower: Optional[float] = None
    confidence_interval_upper: Optional[float] = None
    # Error metrics
    mse: Optional[float] = None
    rmse: Optional[float] = None
    mae: Optional[float] = None
    # Distribution
    outlier_count: Optional[int] = None
    outlier_threshold: Optional[float] = None
    total_points: Optional[int] = None
    x_range: Optional[list] = None
    y_range: Optional[list] = None


# ── Scatter Plot Request ───────────────────────────────────────────────────────
class ScatterStats(BaseModel):
    # Core
    correlation_coefficient: Optional[float] = None
    correlation_method: Optional[str] = None
    r_squared: Optional[float] = None
    p_value: Optional[float] = None
    slope: Optional[float] = None
    intercept: Optional[float] = None
    equation: Optional[str] = None
    confidence_interval_lower: Optional[float] = None
    confidence_interval_upper: Optional[float] = None
    # Error metrics
    mse: Optional[float] = None
    rmse: Optional[float] = None
    mae: Optional[float] = None
    # Distribution
    outlier_count: Optional[int] = None
    outlier_threshold: Optional[float] = None
    total_points: Optional[int] = None
    x_range: Optional[list] = None
    y_range: Optional[list] = None


# ── Scatter Plot Request ───────────────────────────────────────────────────────
class ScatterPlotRequest(CSVScopedRequest):
    x_column: str
    y_column: str
    series_column: Optional[str] = None
    size_column: Optional[str] = None

    overplot_strategy: Literal["none", "alpha", "jitter", "hexbin", "2d_hist"] = "none"
    alpha: float = Field(default=0.6, ge=0.05, le=1.0)
    jitter_amount: float = Field(default=0.1, ge=0.01, le=0.5)
    hexbin_grid_size: int = Field(default=30, ge=10, le=100)

    point_size: float = Field(default=50, ge=10, le=200)
    point_shape: Literal["circle", "square", "diamond", "triangle", "plus", "cross"] = "circle"
    color_palette: str = "tab10"
    dark_theme: bool = False
    show_grid: bool = True

    x_min: Optional[float] = None
    x_max: Optional[float] = None
    y_min: Optional[float] = None
    y_max: Optional[float] = None
    x_label: Optional[str] = None
    y_label: Optional[str] = None

    facet_column: Optional[str] = None
    facet_cols: int = Field(default=2, ge=1, le=6)
    shared_axes: bool = True

    show_fit: bool = False
    fit_model: Literal["linear", "polynomial", "lowess"] = "linear"
    poly_degree: int = Field(default=2, ge=2, le=6)
    show_confidence_band: bool = True
    confidence_level: float = Field(default=0.95, ge=0.8, le=0.99)

    compute_core_stats: bool = True
    compute_error_metrics: bool = False
    compute_distribution_stats: bool = False
    correlation_method: Literal["pearson", "spearman", "kendall"] = "pearson"
    outlier_method: Literal["iqr", "zscore"] = "iqr"
    show_kde_2d: bool = False

# ── Joint Plot Stats ───────────────────────────────────────────────────────────
class JointStats(BaseModel):
    # Correlation
    pearson_r: Optional[float] = None
    pearson_p: Optional[float] = None
    spearman_rho: Optional[float] = None
    spearman_p: Optional[float] = None
    sample_size: Optional[int] = None
    significance: Optional[str] = None
    # Regression
    r_squared: Optional[float] = None
    slope: Optional[float] = None
    intercept: Optional[float] = None
    std_error: Optional[float] = None
    equation: Optional[str] = None
    confidence_interval_lower: Optional[float] = None
    confidence_interval_upper: Optional[float] = None
    mse: Optional[float] = None
    rmse: Optional[float] = None
    mae: Optional[float] = None
    # Normality
    normality_x_stat: Optional[float] = None
    normality_x_p: Optional[float] = None
    normality_y_stat: Optional[float] = None
    normality_y_p: Optional[float] = None
    normality_test: Optional[str] = None
    # Outliers
    outlier_count: Optional[int] = None
    outlier_method: Optional[str] = None
    # Marginal descriptives
    x_mean: Optional[float] = None
    x_median: Optional[float] = None
    x_std: Optional[float] = None
    y_mean: Optional[float] = None
    y_median: Optional[float] = None
    y_std: Optional[float] = None


# ── Joint Plot Request ─────────────────────────────────────────────────────────
class JointPlotRequest(CSVScopedRequest):
    x_column: str
    y_column: str
    hue_column: Optional[str] = None

    # Joint panel
    joint_kind: Literal["scatter", "kde", "hex", "reg"] = "scatter"
    joint_alpha: float = Field(default=0.6, ge=0.05, le=1.0)
    joint_point_size: float = Field(default=40, ge=5, le=200)
    joint_point_color: str = "#00d4ff"
    joint_marker_style: str = "o"
    overplot_strategy: Literal["none", "alpha", "hexbin"] = "none"
    color_palette: str = "tab10"

    # Hexbin
    hexbin_gridsize: int = Field(default=30, ge=10, le=80)
    hexbin_count_scale: Literal["linear", "log"] = "linear"

    # Marginals
    marginal_kind: Literal["hist", "kde", "kde_lines"] = "hist"
    marginal_ratio: int = Field(default=5, ge=3, le=10)
    marginal_ticks: bool = True
    marginal_stat_lines: List[str] = []       # "mean", "median", "q1q3"
    marginal_normal_overlay: bool = False

    # Fit
    fit_overlay: Literal["none", "ols", "lowess"] = "none"
    confidence_band: bool = True
    confidence_band_alpha: float = Field(default=0.15, ge=0.05, le=0.5)
    confidence_level: float = Field(default=0.95, ge=0.8, le=0.99)

    # Density
    density_contours: bool = False
    density_contour_levels: int = Field(default=6, ge=3, le=15)

    # Style
    dark_theme: bool = False
    figure_size: float = Field(default=8, ge=5, le=14)

    # Stats flags
    compute_correlation: bool = True
    correlation_method: Literal["pearson", "spearman", "both"] = "pearson"
    compute_regression: bool = False
    compute_normality: bool = False
    compute_outliers: bool = False
    outlier_method: Literal["mahalanobis", "zscore", "iqr"] = "mahalanobis"
    compute_marginal_stats: bool = False

    # Annotations
    pearson_annotation: bool = True
    spearman_annotation: bool = False
    sample_size_annotation: bool = True
    fit_annotation_box: bool = False
    outlier_annotation: bool = False

# ── Time Series Stats ──────────────────────────────────────────────────────────
class TimeSeriesStats(BaseModel):
    # Descriptive
    sample_size: Optional[int] = None
    mean_value: Optional[float] = None
    median_value: Optional[float] = None
    std_dev: Optional[float] = None
    # Trend
    trend_slope: Optional[float] = None
    r_squared: Optional[float] = None
    p_value: Optional[float] = None
    trend_direction: Optional[str] = None
    # Autocorrelation
    acf_lag1: Optional[float] = None
    acf_lag2: Optional[float] = None
    acf_lag3: Optional[float] = None
    pacf_lag1: Optional[float] = None
    pacf_lag2: Optional[float] = None
    # Seasonality
    seasonal_strength: Optional[float] = None
    dominant_period: Optional[int] = None
    # Error metrics
    mse: Optional[float] = None
    rmse: Optional[float] = None
    mae: Optional[float] = None
    # Anomalies
    anomaly_count: Optional[int] = None
    anomaly_method: Optional[str] = None


# ── Time Series Request ────────────────────────────────────────────────────────
class TimeSeriesRequest(CSVScopedRequest):
    time_column: str
    value_column: str
    series_column: Optional[str] = None
    secondary_value_column: Optional[str] = None

    resample_frequency: Literal["none","sec","min","hour","day","week","month","year"] = "none"
    aggregation_method: Literal["mean","sum","median","count"] = "mean"
    missing_value_handling: Literal["ffill","bfill","interpolate","gap"] = "ffill"

    smoothing_method: Literal["none","moving_average","exponential","loess"] = "none"
    rolling_window: int = Field(default=7, ge=2, le=60)
    show_confidence_band: bool = True
    confidence_band_alpha: float = Field(default=0.15, ge=0.05, le=0.4)

    trend_line: Literal["none","linear","polynomial"] = "none"
    trend_poly_degree: int = Field(default=2, ge=2, le=6)

    # ✅ ADD — date range filter
    start_date: Optional[str] = None   # ISO string: "2020-01-01" / "2020-01" / "2020"
    end_date: Optional[str] = None

    # ✅ ADD — seasonality period (was hardcoded to 12 in plotter)
    seasonality_period: int = Field(default=12, ge=2, le=52)

    seasonality_detection: bool = False
    change_point_detection: bool = False

    axis_scale: Literal["linear","log","symlog"] = "linear"
    y_min: Optional[float] = None
    y_max: Optional[float] = None
    x_label: Optional[str] = None
    y_label: Optional[str] = None

    anomaly_rule: Literal["none","zscore","iqr"] = "none"
    anomaly_threshold: float = Field(default=3.0, ge=1.0, le=5.0)
    event_markers: List[str] = []

    facet_column: Optional[str] = None
    facet_cols: int = Field(default=2, ge=1, le=4)
    shared_axes: bool = True

    line_width: float = Field(default=2.0, ge=0.5, le=5.0)
    line_style: Literal["solid","dashed","dotted","dashdot"] = "solid"
    marker_style: Literal["none","o","s","^","D"] = "none"
    marker_size: int = Field(default=5, ge=2, le=12)
    color_palette: str = "tab10"
    show_grid: bool = True
    grid_style: Literal["none","horizontal","full"] = "horizontal"
    show_legend: bool = True
    area_fill: bool = False
    fill_alpha: float = Field(default=0.15, ge=0.05, le=0.5)
    dark_theme: bool = False

    compute_descriptive: bool = True
    compute_trend: bool = False
    compute_autocorrelation: bool = False
    compute_seasonality: bool = False
    compute_error_metrics: bool = False
    compute_anomaly_stats: bool = False

class RollingMeanStats(BaseModel):
    # Rolling descriptive
    rolling_mean_level:  Optional[float] = None
    rolling_variance:    Optional[float] = None
    rolling_std:         Optional[float] = None
    signal_noise_ratio:  Optional[float] = None
    volatility_index:    Optional[float] = None
    ci_lower:            Optional[float] = None
    ci_upper:            Optional[float] = None
    # Trend (computed on rolling values)
    trend_slope:         Optional[float] = None
    trend_direction:     Optional[str]   = None
    r_squared:           Optional[float] = None
    p_value:             Optional[float] = None
    # Smoothing error (raw vs rolling)
    mae:                 Optional[float] = None
    rmse:                Optional[float] = None
    mse:                 Optional[float] = None
    # Autocorrelation (on rolling series)
    acf_lag1:            Optional[float] = None
    acf_lag2:            Optional[float] = None
    pacf_lag1:           Optional[float] = None
    # Anomalies
    anomaly_count:       Optional[int]   = None
    anomaly_method:      Optional[str]   = None


# ── Rolling Mean Request ───────────────────────────────────────────────────────
class RollingMeanRequest(CSVScopedRequest):
    time_column:          str
    value_column:         str
    series_column:        Optional[str]  = None

    window_size:          int            = Field(default=7, ge=2, le=365)
    window_type:          Literal["fixed","time"] = "fixed"
    time_period:          str            = "7D"    # pandas offset e.g. "7D", "30D"
    rolling_function:     Literal["mean","median","std","var","min","max"] = "mean"
    center_window:        bool           = False
    min_periods:          int            = Field(default=1, ge=1)

    multi_window_enabled: bool           = False
    extra_windows:        List[int]      = []

    std_band_enabled:     bool           = False
    std_multiplier:       float          = Field(default=1.0, ge=0.5, le=3.0)
    ci_band_enabled:      bool           = False
    ci_level:             int            = Field(default=95, ge=80, le=99)

    raw_overlay:          bool           = True
    raw_alpha:            float          = Field(default=0.3, ge=0.1, le=0.8)

    resample_frequency:   Literal["none","sec","min","hour","day","week","month","year"] = "none"
    aggregation_method:   Literal["mean","sum","median"] = "mean"
    start_date:           Optional[str]  = None
    end_date:             Optional[str]  = None

    missing_value_handling: Literal["ffill","bfill","interpolate","gap"] = "ffill"

    trend_line:           Literal["none","linear","polynomial"] = "none"
    trend_poly_degree:    int            = Field(default=2, ge=2, le=6)

    anomaly_rule:         Literal["none","zscore","residual"] = "none"
    anomaly_threshold:    float          = Field(default=2.5, ge=1.0, le=5.0)
    event_markers:        List[str]      = []

    facet_column:         Optional[str]  = None
    facet_cols:           int            = Field(default=2, ge=1, le=4)
    shared_axes:          bool           = True

    axis_scale:           Literal["linear","log","symlog"] = "linear"
    y_min:                Optional[float] = None
    y_max:                Optional[float] = None
    x_label:              Optional[str]  = None
    y_label:              Optional[str]  = None

    line_width:           float          = Field(default=2.0, ge=0.5, le=5.0)
    color_palette:        str            = "tab10"
    show_grid:            bool           = True
    grid_style:           Literal["none","horizontal","full"] = "horizontal"
    show_legend:          bool           = True
    dark_theme:           bool           = False

    compute_rolling_stats:   bool        = True
    compute_trend:           bool        = False
    compute_smoothing_error: bool        = False
    compute_autocorrelation: bool        = False
    compute_anomaly_stats:   bool        = False

# ── Area Chart Stats ───────────────────────────────────────────────────────────
class AreaChartStats(BaseModel):
    # Area & composition
    total_area_integral:          Optional[float]            = None
    category_contribution_ratio:  Optional[Dict[str, float]] = None
    cumulative_growth:            Optional[float]            = None
    # Trend & smoothing
    trend_slope:                  Optional[float]            = None
    trend_direction:              Optional[str]              = None
    r_squared:                    Optional[float]            = None
    p_value:                      Optional[float]            = None
    rolling_mean:                 Optional[float]            = None
    rolling_std:                  Optional[float]            = None
    # Peak / trough
    peak_value:                   Optional[float]            = None
    peak_time:                    Optional[str]              = None
    trough_value:                 Optional[float]            = None
    trough_time:                  Optional[str]              = None
    # Growth & change
    growth_rate:                  Optional[float]            = None
    rate_of_change:               Optional[float]            = None
    variance_over_time:           Optional[float]            = None
    # Seasonality
    seasonality_signal:           Optional[float]            = None
    dominant_period:              Optional[int]              = None
    # Anomalies
    anomaly_count:                Optional[int]              = None
    anomaly_method:               Optional[str]              = None


# ── Area Chart Request ─────────────────────────────────────────────────────────
class AreaChartRequest(CSVScopedRequest):
    x_column:               str
    y_column:               str
    series_column:          Optional[str]  = None
    secondary_column:       Optional[str]  = None
    facet_column:           Optional[str]  = None
    chart_mode:             Literal["single_area","stacked","normalized_stacked"] = "single_area"
    series_sort_order:      Literal["auto","asc","desc","total_desc"] = "auto"
    resample_frequency:     Literal["none","sec","min","hour","day","week","month","year"] = "none"
    aggregation_method:     Literal["sum","mean","count"] = "sum"
    start_date:             Optional[str]  = None
    end_date:               Optional[str]  = None
    missing_value_handling: Literal["ffill","bfill","interpolate","drop"] = "ffill"
    fill_alpha:             float          = Field(default=0.6,  ge=0.1,  le=1.0)
    line_boundary_overlay:  bool           = True
    line_width:             float          = Field(default=1.5,  ge=0.5,  le=4.0)
    baseline_value:         float          = 0.0
    rolling_enabled:        bool           = False
    rolling_window:         int            = Field(default=7,   ge=2,    le=90)
    cumulative_mode:        bool           = False
    conf_band_enabled:      bool           = False
    conf_band_window:       int            = Field(default=14,  ge=2,    le=60)
    conf_band_alpha:        float          = Field(default=0.15,ge=0.05, le=0.4)
    anomaly_rule:           Literal["none","zscore","iqr"] = "none"
    anomaly_threshold:      float          = Field(default=3.0, ge=1.0,  le=5.0)
    density_reduction:      bool           = False
    density_points:         int            = Field(default=500, ge=100,  le=2000)
    event_markers:          List[str]      = []
    facet_cols:             int            = Field(default=2,   ge=1,    le=4)
    shared_axes:            bool           = True
    axis_scale:             Literal["linear","log"] = "linear"
    y_min:                  Optional[float] = None
    y_max:                  Optional[float] = None
    x_label:                Optional[str]  = None
    y_label:                Optional[str]  = None
    color_palette:          str            = "tab10"
    show_grid:              bool           = True
    grid_style:             Literal["none","horizontal","full"] = "horizontal"
    show_legend:            bool           = True
    dark_theme:             bool           = False
    compute_area_metrics:   bool           = True
    compute_trend:          bool           = False
    compute_rolling_stats:  bool           = False
    compute_peaks:          bool           = False
    compute_seasonality:    bool           = False
    compute_anomaly_stats:  bool           = False

class PairPlotStats(BaseModel):
    # 🔗 Correlation
    correlation_matrix:      Optional[Dict[str, Dict[str, float]]] = None
    strongest_pair:          Optional[Dict[str, Any]] = None   # {var1, var2, r}
    weakest_pair:            Optional[Dict[str, Any]] = None
    multicollinear_pairs:    Optional[List[Dict[str, Any]]] = None  # [{var1,var2,r}]
    mean_abs_corr:           Optional[float] = None
    # 📈 Relationships
    linear_pairs:            Optional[List[Dict[str, Any]]] = None  # [{var1,var2,r_squared,slope,p_value}]
    best_linear_pair:        Optional[Dict[str, Any]] = None
    nonlinear_signal:        Optional[str] = None
    # 📊 Distribution
    skew_summary:            Optional[Dict[str, float]] = None
    kurtosis_summary:        Optional[Dict[str, float]] = None
    distribution_shapes:     Optional[Dict[str, str]] = None   # {col: "right-skewed"|"symmetric"|...}
    # 🔬 Diagnostics
    heteroscedastic_pairs:   Optional[List[Dict[str, Any]]] = None  # [{var1,var2,bp_stat,p_value}]
    outlier_count:           Optional[int] = None
    outlier_pct:             Optional[float] = None
    outlier_method:          Optional[str] = None
    # 🎯 Separability
    class_separability:      Optional[Dict[str, float]] = None  # {col: fisher_ratio}
    best_separator:          Optional[str] = None


class PairPlotRequest(CSVScopedRequest):
    # Required
    columns:                         List[str]

    # Optional fields
    hue_column:                      Optional[str]   = None
    sampling_strategy:               Literal["none","random","stratified"] = "none"
    sample_size:                     int             = Field(default=2000, ge=100, le=50000)
    missing_value_handling:          Literal["none","drop","mean_impute","median_impute"] = "drop"

    # Grid layout
    corner_mode:                     bool            = False
    upper_triangle_type:             Literal["none","scatter","kde","regression","correlation_text"] = "correlation_text"
    lower_triangle_type:             Literal["scatter","kde","regression"] = "scatter"
    diagonal_type:                   Literal["histogram","kde","density_histogram"] = "histogram"
    histogram_bins:                  Optional[int]   = None   # None = auto

    # Correlation
    correlation_method:              Literal["pearson","spearman"] = "pearson"
    correlation_overlay:             bool            = True
    correlation_highlight_threshold: float           = Field(default=0.7, ge=0.0, le=1.0)

    # Regression
    regression_overlay:              bool            = False
    regression_type:                 Literal["linear","robust"] = "linear"
    confidence_interval_level:       int             = Field(default=95, ge=50, le=99)
    show_r_squared:                  bool            = True

    # Outliers
    outlier_detection_method:        Literal["none","zscore","iqr"] = "none"
    mark_outliers:                   bool            = True

    # Scatter appearance
    scatter_point_alpha:             float           = Field(default=0.6, ge=0.05, le=1.0)
    scatter_marker_size:             float           = Field(default=18,  ge=2,    le=80)

    # Axis
    axis_scale:                      Literal["linear","log"] = "linear"
    percentile_clip_low:             Optional[float] = None
    percentile_clip_high:            Optional[float] = None

    # Visuals
    color_palette:                   str             = "tab10"
    show_legend:                     bool            = True
    dark_theme:                      bool            = False

    # Stats
    compute_correlation:             bool            = True
    compute_relationships:           bool            = False
    compute_distribution:            bool            = False
    compute_diagnostics:             bool            = False
    compute_separability:            bool            = False

class ClusterScatterStats(BaseModel):
    # ⭐ Quality
    silhouette_score:       Optional[float] = None
    inertia:                Optional[float] = None
    between_cluster_var:    Optional[float] = None
    within_cluster_var:     Optional[float] = None
    separation_strength:    Optional[str]   = None   # "Strong" | "Moderate" | "Weak"

    # 📦 Sizes
    cluster_sizes:          Optional[Dict[str, int]]   = None
    cluster_balance_ratio:  Optional[float]            = None
    largest_cluster:        Optional[int]              = None
    smallest_cluster:       Optional[int]              = None

    # ↔️ Separation
    centroid_distances:     Optional[Dict[str, float]] = None  # "C0↔C1" → distance
    max_centroid_distance:  Optional[float]            = None
    min_centroid_distance:  Optional[float]            = None
    overlap_detected:       Optional[bool]             = None
    overlap_pairs:          Optional[List[str]]        = None

    # 🔍 Feature dominance
    feature_variance:       Optional[Dict[str, float]] = None
    dominant_feature:       Optional[str]              = None

    # ⚠️ Outliers
    outlier_count:          Optional[int]   = None
    outlier_pct:            Optional[float] = None

class ClusterScatterRequest(CSVScopedRequest):
    # ── Required ──────────────────────────────────────────────────────────────
    feature_columns:                  List[str]

    # ── Preprocessing ─────────────────────────────────────────────────────────
    standardization_method:           Literal["none", "standard", "minmax"]       = "standard"
    dimensionality_reduction_method:  Literal["none", "pca"]                      = "none"
    missing_value_handling:           Literal["drop", "mean_impute", "median_impute"] = "drop"
    sampling_strategy:                Literal["none", "random"]                   = "none"
    sample_size:                      int   = Field(default=3000, ge=100, le=100000)

    # ── K-Means parameters ────────────────────────────────────────────────────
    n_clusters:                       int   = Field(default=3,    ge=2,   le=15)
    init_method:                      Literal["k-means++", "random"]              = "k-means++"
    n_init:                           int   = Field(default=10,   ge=1,   le=50)
    max_iterations:                   int   = Field(default=300,  ge=50,  le=2000)
    tolerance:                        float = Field(default=1e-4, ge=1e-8, le=1e-1)
    random_state:                     int   = Field(default=42,   ge=0,   le=9999)

    # ── Visualization controls ────────────────────────────────────────────────
    show_centroids:                   bool  = True
    centroid_marker_size:             int   = Field(default=200,  ge=50,  le=600)
    centroid_coordinate_annotation:   bool  = False
    cluster_color_mode:               Literal["distinct_colors", "monochrome"]    = "distinct_colors"
    point_alpha:                      float = Field(default=0.65, ge=0.05, le=1.0)
    point_size:                       float = Field(default=25,   ge=2,   le=100)
    density_contour_overlays:         bool  = False
    show_cluster_boundary:            bool  = True
    axis_scale:                       Literal["linear", "log"]                    = "linear"
    enable_3d_visualization:          bool  = False
    figure_scale:                     Literal["small", "medium", "large", "xlarge"] = "medium"
    dark_theme:                       bool  = False
    

    # ── Evaluation display (annotate plot) ────────────────────────────────────
    display_inertia_value:            bool  = True
    display_silhouette_score:         bool  = True
    display_cluster_sizes:            bool  = True
    highlight_outliers:               bool  = False

    # ── Stat computation ──────────────────────────────────────────────────────
    compute_quality:                  bool  = True
    compute_sizes:                    bool  = False
    compute_separation:               bool  = False
    compute_features:                 bool  = False
    compute_outliers:                 bool  = False

class HeatmapStats(BaseModel):
    # 🔗 Dependency structure
    strongest_positive:     Optional[Dict[str, Any]]        = None  # {var1, var2, r}
    strongest_negative:     Optional[Dict[str, Any]]        = None
    mean_abs_corr:          Optional[float]                 = None
    median_abs_corr:        Optional[float]                 = None
    high_corr_pairs:        Optional[List[Dict[str, Any]]]  = None  # [{var1, var2, r}]

    # ⚠️ Multicollinearity
    multicollinear_pairs:   Optional[List[Dict[str, Any]]]  = None  # [{var1, var2, r}]
    redundant_features:     Optional[List[str]]             = None

    # 🧩 Clustering
    feature_clusters:       Optional[List[List[str]]]       = None
    n_clusters_detected:    Optional[int]                   = None

    # 📉 Significance
    insignificant_pairs:    Optional[List[Dict[str, Any]]]  = None  # [{var1, var2, p}]
    significant_pair_pct:   Optional[float]                 = None

    # 📐 Structure
    avg_corr_per_feature:   Optional[Dict[str, float]]      = None
    most_connected:         Optional[str]                   = None
    most_isolated:          Optional[str]                   = None
    corr_matrix_det:        Optional[float]                 = None


class HeatmapRequest(CSVScopedRequest):
    # ── Required ──────────────────────────────────────────────────────────────
    feature_columns:                  List[str]

    # ── Data controls ─────────────────────────────────────────────────────────
    max_variable_cap:                 int   = Field(default=20,   ge=2,    le=50)
    missing_value_handling:           Literal["drop", "pairwise_drop", "mean_impute"] = "drop"
    sampling_strategy:                Literal["none", "random"]                       = "none"
    sample_size:                      int   = Field(default=5000, ge=100,  le=100000)

    # ── Correlation computation ────────────────────────────────────────────────
    correlation_method:               Literal["pearson", "spearman", "kendall"]       = "pearson"
    absolute_correlation_mode:        bool  = False
    significance_test_enabled:        bool  = False
    significance_threshold:           float = Field(default=0.05, ge=0.001, le=0.2)
    diagonal_display_mode:            Literal["show", "hide", "constant_one"]         = "constant_one"

    # ── Matrix structure ───────────────────────────────────────────────────────
    matrix_triangle_mode:             Literal["full", "upper", "lower"]               = "full"
    variable_sorting_method:          Literal["input_order", "alphabetical", "correlation_strength"] = "input_order"
    hierarchical_clustering_enabled:  bool  = False
    clustering_distance_metric:       Literal["euclidean", "correlation", "cosine"]   = "euclidean"
    clustering_linkage_method:        Literal["average", "complete", "ward", "single"] = "average"
    dendrogram_display:               bool  = False

    # ── Rendering ─────────────────────────────────────────────────────────────
    color_scale_mode:                 Literal["diverging", "sequential"]              = "diverging"
    color_range_limits:               List[float] = Field(default=[-1.0, 1.0])
    cell_annotation_enabled:          bool  = True
    annotation_precision:             int   = Field(default=2, ge=1, le=4)
    cell_gridlines_enabled:           bool  = True
    axis_label_rotation:              int   = Field(default=45, ge=0, le=90)
    figure_scale:                     Literal["small", "medium", "large", "xlarge"]   = "medium"
    dark_theme:                       bool  = False

    # ── Stat computation ──────────────────────────────────────────────────────
    compute_dependency:               bool  = True
    compute_multicollinearity:        bool  = False
    compute_clustering:               bool  = False
    compute_significance:             bool  = False
    compute_structure:                bool  = False

class BoxPlotResponse(BaseModel):
    image_path: str
    message: str = "Plot generated successfully"
    statistics: List[dict]  # Statistical data for each box

# Response Models
class PlotResponse(BaseModel):
    image_path: str
    message: str = "Plot generated successfully"
    stats: Optional[Union[ScatterStats, JointStats, TimeSeriesStats, RollingMeanStats, AreaChartStats, PairPlotStats, ClusterScatterStats, HeatmapStats]] = None 

class UploadResponse(BaseModel):
    message: str
    columns: list[str]
    rows: int
    numeric_columns: list[str] = []
    categorical_columns: list[str] = []
    column_types: Dict[str, Literal["numeric", "categorical"]] = {}


class ErrorResponse(BaseModel):
    error: str