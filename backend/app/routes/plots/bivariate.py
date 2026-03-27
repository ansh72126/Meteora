from fastapi import APIRouter, HTTPException, Depends
from app.models import LineChartRequest, ScatterPlotRequest, PlotResponse, JointPlotRequest
from app.services.csv_handler import CSVHandler
from app.services.auth import get_current_user_id
from app.services.plotting.bivariate.linechart import LineChartPlotter
from app.services.plotting.bivariate.scatterplot import ScatterPlotPlotter
from app.services.plotting.bivariate.jointplot import JointPlotPlotter

router = APIRouter(prefix="/bivariate", tags=["bivariate"])

@router.post("/linechart", response_model=PlotResponse)
async def create_linechart(request: LineChartRequest, user_id: str = Depends(get_current_user_id)):
    """Generate line chart"""
    
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)
        
        # Validate x-axis field
        if not CSVHandler.validate_column(request.x_axis_field, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"X-axis field '{request.x_axis_field}' not found in CSV"
            )
        
        # Validate y-axis field
        if not CSVHandler.validate_column(request.y_axis_field, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"Y-axis field '{request.y_axis_field}' not found in CSV"
            )
        
        # Validate series group field if provided
        if request.series_group_field:
            if not CSVHandler.validate_column(request.series_group_field, user_id=user_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Series group field '{request.series_group_field}' not found in CSV"
                )
        
        # Validate secondary y field if enabled
        if request.enable_secondary_axis and request.secondary_y_field:
            if not CSVHandler.validate_column(request.secondary_y_field, user_id=user_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Secondary Y field '{request.secondary_y_field}' not found in CSV"
                )
        
        plotter = LineChartPlotter(df)
        image_path = plotter.plot(
            x_axis_field=request.x_axis_field,
            y_axis_field=request.y_axis_field,
            series_group_field=request.series_group_field,
            multi_series_mode=request.multi_series_mode,
            x_axis_type=request.x_axis_type,
            y_axis_scale=request.y_axis_scale,
            aggregation_method=request.aggregation_method,
            sorting_order=request.sorting_order,
            missing_value_handling=request.missing_value_handling,
            enable_secondary_axis=request.enable_secondary_axis,
            secondary_y_field=request.secondary_y_field,
            default_line_style=request.default_line_style,
            color_mode=request.color_mode,
            show_legend=request.show_legend,
            legend_position=request.legend_position,
            grid_style=request.grid_style,
            area_fill=request.area_fill,
            fill_alpha=request.fill_alpha,
            smoothing=request.smoothing,
            smoothing_window=request.smoothing_window,
            line_width=request.line_width,
            marker_style=request.marker_style,
            marker_size=request.marker_size,
            dark_theme=request.dark_theme
        )
        
        return PlotResponse(image_path=image_path)
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")

@router.post("/scatterplot", response_model=PlotResponse)
async def create_scatterplot(request: ScatterPlotRequest, user_id: str = Depends(get_current_user_id)):
    """Generate scatter / bubble plot with optional statistical inference"""
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        if not CSVHandler.validate_column(request.x_column, user_id=user_id):
            raise HTTPException(400, f"Column '{request.x_column}' not found in CSV")
        if not CSVHandler.validate_column(request.y_column, user_id=user_id):
            raise HTTPException(400, f"Column '{request.y_column}' not found in CSV")
        if request.series_column and not CSVHandler.validate_column(request.series_column, user_id=user_id):
            raise HTTPException(400, f"Series column '{request.series_column}' not found in CSV")
        if request.size_column and not CSVHandler.validate_column(request.size_column, user_id=user_id):
            raise HTTPException(400, f"Size column '{request.size_column}' not found in CSV")
        if request.facet_column and not CSVHandler.validate_column(request.facet_column, user_id=user_id):
            raise HTTPException(400, f"Facet column '{request.facet_column}' not found in CSV")

        plotter = ScatterPlotPlotter(df)
        image_path, stats = plotter.plot(
            x_column=request.x_column,
            y_column=request.y_column,
            series_column=request.series_column,
            size_column=request.size_column,
            overplot_strategy=request.overplot_strategy,
            alpha=request.alpha,
            jitter_amount=request.jitter_amount,
            hexbin_grid_size=request.hexbin_grid_size,
            point_size=request.point_size,
            point_shape=request.point_shape,
            color_palette=request.color_palette,
            dark_theme=request.dark_theme,
            show_grid=request.show_grid,
            x_min=request.x_min,
            x_max=request.x_max,
            y_min=request.y_min,
            y_max=request.y_max,
            x_label=request.x_label,
            y_label=request.y_label,
            facet_column=request.facet_column,
            facet_cols=request.facet_cols,
            shared_axes=request.shared_axes,
            show_fit=request.show_fit,
            fit_model=request.fit_model,
            poly_degree=request.poly_degree,
            show_confidence_band=request.show_confidence_band,
            confidence_level=request.confidence_level,
            compute_core_stats=request.compute_core_stats,
            compute_error_metrics=request.compute_error_metrics,
            compute_distribution_stats=request.compute_distribution_stats,
            correlation_method=request.correlation_method,
            outlier_method=request.outlier_method,
            show_kde_2d=request.show_kde_2d,
        )

        return PlotResponse(image_path=image_path, stats=stats)

    except FileNotFoundError:
        raise HTTPException(404, "No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error generating plot: {str(e)}")

# Add after the scatterplot route:
@router.post("/jointplot", response_model=PlotResponse)
async def create_jointplot(request: JointPlotRequest, user_id: str = Depends(get_current_user_id)):
    """Generate joint plot with marginals and statistical inference"""
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        if not CSVHandler.validate_column(request.x_column, user_id=user_id):
            raise HTTPException(400, f"Column '{request.x_column}' not found in CSV")
        if not CSVHandler.validate_column(request.y_column, user_id=user_id):
            raise HTTPException(400, f"Column '{request.y_column}' not found in CSV")
        if request.hue_column and not CSVHandler.validate_column(request.hue_column, user_id=user_id):
            raise HTTPException(400, f"Hue column '{request.hue_column}' not found in CSV")

        plotter = JointPlotPlotter(df)
        image_path, stats = plotter.plot(
            x_column=request.x_column,
            y_column=request.y_column,
            hue_column=request.hue_column,
            joint_kind=request.joint_kind,
            joint_alpha=request.joint_alpha,
            joint_point_size=request.joint_point_size,
            joint_point_color=request.joint_point_color,
            joint_marker_style=request.joint_marker_style,
            overplot_strategy=request.overplot_strategy,
            color_palette=request.color_palette,
            hexbin_gridsize=request.hexbin_gridsize,
            hexbin_count_scale=request.hexbin_count_scale,
            marginal_kind=request.marginal_kind,
            marginal_ratio=request.marginal_ratio,
            marginal_ticks=request.marginal_ticks,
            marginal_stat_lines=request.marginal_stat_lines,
            marginal_normal_overlay=request.marginal_normal_overlay,
            fit_overlay=request.fit_overlay,
            confidence_band=request.confidence_band,
            confidence_band_alpha=request.confidence_band_alpha,
            confidence_level=request.confidence_level,
            density_contours=request.density_contours,
            density_contour_levels=request.density_contour_levels,
            dark_theme=request.dark_theme,
            figure_size=request.figure_size,
            compute_correlation=request.compute_correlation,
            correlation_method=request.correlation_method,
            compute_regression=request.compute_regression,
            compute_normality=request.compute_normality,
            compute_outliers=request.compute_outliers,
            outlier_method=request.outlier_method,
            compute_marginal_stats=request.compute_marginal_stats,
            pearson_annotation=request.pearson_annotation,
            spearman_annotation=request.spearman_annotation,
            sample_size_annotation=request.sample_size_annotation,
            fit_annotation_box=request.fit_annotation_box,
            outlier_annotation=request.outlier_annotation,
        )

        return PlotResponse(image_path=image_path, stats=stats)

    except FileNotFoundError:
        raise HTTPException(404, "No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error generating plot: {str(e)}")