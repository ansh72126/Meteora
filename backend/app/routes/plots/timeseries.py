from fastapi import APIRouter, HTTPException, Depends
from app.models import TimeSeriesRequest, PlotResponse, RollingMeanRequest
from app.services.csv_handler import CSVHandler
from app.services.auth import get_current_user_id
from app.services.plotting.timeseries.timeseries import TimeSeriesPlotter
from app.services.plotting.timeseries.rollingmean import RollingMeanPlotter
from app.services.plotting.timeseries.area import AreaChartPlotter
from app.models import AreaChartRequest, AreaChartStats

router = APIRouter(prefix="/timeseries", tags=["timeseries"])


@router.post("/timeseries", response_model=PlotResponse)
async def create_timeseries(request: TimeSeriesRequest, user_id: str = Depends(get_current_user_id)):
    """Generate time series plot with statistical inference"""
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        if not CSVHandler.validate_column(request.time_column, user_id=user_id):
            raise HTTPException(400, f"Column '{request.time_column}' not found in CSV")
        if not CSVHandler.validate_column(request.value_column, user_id=user_id):
            raise HTTPException(400, f"Column '{request.value_column}' not found in CSV")
        if request.series_column and not CSVHandler.validate_column(request.series_column, user_id=user_id):
            raise HTTPException(400, f"Series column '{request.series_column}' not found in CSV")
        if request.secondary_value_column and not CSVHandler.validate_column(request.secondary_value_column, user_id=user_id):
            raise HTTPException(400, f"Secondary column '{request.secondary_value_column}' not found in CSV")

        plotter = TimeSeriesPlotter(df)
        image_path, stats = plotter.plot(
            time_column=request.time_column,
            value_column=request.value_column,
            start_date=request.start_date,           # ✅ ADD
            end_date=request.end_date,  
            series_column=request.series_column,
            secondary_value_column=request.secondary_value_column,
            resample_frequency=request.resample_frequency,
            aggregation_method=request.aggregation_method,
            missing_value_handling=request.missing_value_handling,
            smoothing_method=request.smoothing_method,
            rolling_window=request.rolling_window,
            show_confidence_band=request.show_confidence_band,
            confidence_band_alpha=request.confidence_band_alpha,
            trend_line=request.trend_line,
            trend_poly_degree=request.trend_poly_degree,
            seasonality_detection=request.seasonality_detection,
            seasonality_period=request.seasonality_period, 
            change_point_detection=request.change_point_detection,
            axis_scale=request.axis_scale,
            y_min=request.y_min,
            y_max=request.y_max,
            x_label=request.x_label,
            y_label=request.y_label,
            anomaly_rule=request.anomaly_rule,
            anomaly_threshold=request.anomaly_threshold,
            event_markers=request.event_markers,
            facet_column=request.facet_column,
            facet_cols=request.facet_cols,
            shared_axes=request.shared_axes,
            line_width=request.line_width,
            line_style=request.line_style,
            marker_style=request.marker_style,
            marker_size=request.marker_size,
            color_palette=request.color_palette,
            show_grid=request.show_grid,
            grid_style=request.grid_style,
            show_legend=request.show_legend,
            area_fill=request.area_fill,
            fill_alpha=request.fill_alpha,
            dark_theme=request.dark_theme,
            compute_descriptive=request.compute_descriptive,
            compute_trend=request.compute_trend,
            compute_autocorrelation=request.compute_autocorrelation,
            compute_seasonality=request.compute_seasonality,
            compute_error_metrics=request.compute_error_metrics,
            compute_anomaly_stats=request.compute_anomaly_stats,
        )

        return PlotResponse(image_path=image_path, stats=stats)

    except FileNotFoundError:
        raise HTTPException(404, "No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error generating plot: {str(e)}")


@router.post("/rollingmean", response_model=PlotResponse)
async def create_rollingmean(request: RollingMeanRequest, user_id: str = Depends(get_current_user_id)):
    """Generate rolling mean/median/std plot with statistical inference"""
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        for col, name in [
            (request.time_column,  "Time"),
            (request.value_column, "Value"),
        ]:
            if not CSVHandler.validate_column(col, user_id=user_id):
                raise HTTPException(400, f"{name} column '{col}' not found in CSV")

        for col, name in [
            (request.series_column, "Series"),
            (request.facet_column,  "Facet"),
        ]:
            if col and not CSVHandler.validate_column(col, user_id=user_id):
                raise HTTPException(400, f"{name} column '{col}' not found in CSV")

        plotter = RollingMeanPlotter(df)
        image_path, stats = plotter.plot(
            time_column=request.time_column,
            value_column=request.value_column,
            series_column=request.series_column,
            window_size=request.window_size,
            window_type=request.window_type,
            time_period=request.time_period,
            rolling_function=request.rolling_function,
            center_window=request.center_window,
            min_periods=request.min_periods,
            multi_window_enabled=request.multi_window_enabled,
            extra_windows=request.extra_windows,
            std_band_enabled=request.std_band_enabled,
            std_multiplier=request.std_multiplier,
            ci_band_enabled=request.ci_band_enabled,
            ci_level=request.ci_level,
            raw_overlay=request.raw_overlay,
            raw_alpha=request.raw_alpha,
            resample_frequency=request.resample_frequency,
            aggregation_method=request.aggregation_method,
            start_date=request.start_date,
            end_date=request.end_date,
            missing_value_handling=request.missing_value_handling,
            trend_line=request.trend_line,
            trend_poly_degree=request.trend_poly_degree,
            anomaly_rule=request.anomaly_rule,
            anomaly_threshold=request.anomaly_threshold,
            event_markers=request.event_markers,
            facet_column=request.facet_column,
            facet_cols=request.facet_cols,
            shared_axes=request.shared_axes,
            axis_scale=request.axis_scale,
            y_min=request.y_min,
            y_max=request.y_max,
            x_label=request.x_label,
            y_label=request.y_label,
            line_width=request.line_width,
            color_palette=request.color_palette,
            show_grid=request.show_grid,
            grid_style=request.grid_style,
            show_legend=request.show_legend,
            dark_theme=request.dark_theme,
            compute_rolling_stats=request.compute_rolling_stats,
            compute_trend=request.compute_trend,
            compute_smoothing_error=request.compute_smoothing_error,
            compute_autocorrelation=request.compute_autocorrelation,
            compute_anomaly_stats=request.compute_anomaly_stats,
        )
        return PlotResponse(image_path=image_path, stats=stats)

    except FileNotFoundError:
        raise HTTPException(404, "No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error generating rolling mean plot: {str(e)}")

@router.post("/area", response_model=PlotResponse)
async def create_areachart(request: AreaChartRequest, user_id: str = Depends(get_current_user_id)):
    """Generate area chart with statistical inference"""
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)
        for col, name in [(request.x_column, "X"), (request.y_column, "Y")]:
            if not CSVHandler.validate_column(col, user_id=user_id):
                raise HTTPException(400, f"{name} column '{col}' not found")
        for col, name in [(request.series_column, "Series"),
                          (request.secondary_column, "Secondary"),
                          (request.facet_column, "Facet")]:
            if col and not CSVHandler.validate_column(col, user_id=user_id):
                raise HTTPException(400, f"{name} column '{col}' not found")

        plotter = AreaChartPlotter(df)
        req_dict = request.dict()
        req_dict.pop("upload_id", None)
        image_path, stats = plotter.plot(**req_dict)
        return PlotResponse(image_path=image_path, stats=stats)
    except FileNotFoundError:
        raise HTTPException(404, "No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error generating area chart: {str(e)}")