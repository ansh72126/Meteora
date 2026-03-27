from fastapi import APIRouter, HTTPException, Depends
from app.models import (
    HistogramRequest, KDERequest, ECDFRequest, 
    BellCurveRequest, BarChartRequest, PlotResponse,
    BoxPlotRequest,  BoxPlotResponse, PieChartRequest
)
from app.services.csv_handler import CSVHandler
from app.services.auth import get_current_user_id
from app.services.plotting.univariate.histogram import HistogramPlotter
from app.services.plotting.univariate.kde import KDEPlotter
from app.services.plotting.univariate.ecdf import ECDFPlotter
from app.services.plotting.univariate.bellcurve import BellCurvePlotter
from app.services.plotting.univariate.boxplot import BoxPlotPlotter
from app.services.plotting.univariate.barchart import BarChartPlotter
from app.services.plotting.univariate.piechart import PieChartPlotter

router = APIRouter(prefix="/univariate", tags=["univariate"])

@router.post("/histogram", response_model=PlotResponse)
async def create_histogram(request: HistogramRequest, user_id: str = Depends(get_current_user_id)):
    """Generate histogram plot"""
    
    try:
        # Load CSV
        df = CSVHandler.load_user_csv(user_id=user_id)
        
        # Validate first column
        if not CSVHandler.validate_column(request.x_column, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"Column '{request.x_column}' not found in CSV"
            )
        
        # ✅ NEW: Validate second column if provided
        if request.x_column_2:
            if not CSVHandler.validate_column(request.x_column_2, user_id=user_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Column '{request.x_column_2}' not found in CSV"
                )
        
        # Generate plot
        plotter = HistogramPlotter(df)
        image_path = plotter.plot(
            x_column=request.x_column,
            x_column_2=request.x_column_2,  # ✅ NEW
            bins=request.bins,
            color=request.color,
            color_2=request.color_2,  # ✅ NEW
            grid=request.grid,
            legend=request.legend,
            dark_theme=request.dark_theme,  # ✅ NEW
            alpha=request.alpha  # ✅ NEW
        )
        
        return PlotResponse(image_path=image_path)
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")

# ... KDE and ECDF routes remain the same
@router.post("/kde", response_model=PlotResponse)
async def create_kde(request: KDERequest, user_id: str = Depends(get_current_user_id)):
    """Generate KDE plot"""
    
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)
        
        # Validate first column
        if not CSVHandler.validate_column(request.x_column, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"Column '{request.x_column}' not found in CSV"
            )
        
        # ✅ NEW: Validate second column if provided
        if request.x_column_2:
            if not CSVHandler.validate_column(request.x_column_2, user_id=user_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Column '{request.x_column_2}' not found in CSV"
                )
        
        plotter = KDEPlotter(df)
        image_path = plotter.plot(
            x_column=request.x_column,
            x_column_2=request.x_column_2,  # ✅ NEW
            color=request.color,
            color_2=request.color_2,  # ✅ NEW
            grid=request.grid,
            legend=request.legend,
            dark_theme=request.dark_theme,  # ✅ NEW
            bw_adjust=request.bw_adjust,  # ✅ NEW
            alpha=request.alpha,  # ✅ NEW
            fill=request.fill
        )
        
        return PlotResponse(image_path=image_path)
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")


@router.post("/bell", response_model=PlotResponse)  # ✅ CHANGED from /bellcurve
async def create_bell(request: BellCurveRequest, user_id: str = Depends(get_current_user_id)):  # ✅ CHANGED function name
    """Generate bell curve (normal distribution) plot"""
    
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)
        
        # Validate column
        if not CSVHandler.validate_column(request.x_column, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"Column '{request.x_column}' not found in CSV"
            )
        
        plotter = BellCurvePlotter(df)
        image_path = plotter.plot(
            x_column=request.x_column,
            color=request.color,
            grid=request.grid,
            dark_theme=request.dark_theme,
            line_width=request.line_width,
            alpha=request.alpha,
            overlay_histogram=request.overlay_histogram,
            show_confidence_interval=request.show_confidence_interval,
            confidence_level=request.confidence_level
        )
        
        return PlotResponse(image_path=image_path)
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")


@router.post("/ecdf", response_model=PlotResponse)
async def create_ecdf(request: ECDFRequest, user_id: str = Depends(get_current_user_id)):
    """Generate ECDF plot"""
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        # Validate all columns
        for col in request.x_columns:
            if not CSVHandler.validate_column(col, user_id=user_id):
                raise HTTPException(status_code=400, detail=f"Column '{col}' not found in CSV")

        plotter = ECDFPlotter(df)
        image_path = plotter.plot(
            x_columns=request.x_columns,
            colors=request.colors,
            color_mode=request.color_mode,
            legend=request.legend,
            grid=request.grid,
            dark_theme=request.dark_theme,
            cumulative_scale=request.cumulative_scale,
            complementary=request.complementary,
            theoretical_overlay=request.theoretical_overlay,
            show_summary_stats=request.show_summary_stats,
            summary_fields=request.summary_fields,
        )
        return PlotResponse(image_path=image_path)

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()  # prints full stack to terminal
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")


@router.post("/barchart", response_model=PlotResponse)
async def create_barchart(request: BarChartRequest, user_id: str = Depends(get_current_user_id)):
    """Generate bar chart plot"""
    
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)
        
        # Validate category column
        if not CSVHandler.validate_column(request.category_column, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"Category column '{request.category_column}' not found in CSV"
            )
        
        # Validate value columns
        for col in request.value_columns:
            if not CSVHandler.validate_column(col, user_id=user_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Column '{col}' not found in CSV"
                )
        
        # Check minimum number of columns
        if len(request.value_columns) == 0:
            raise HTTPException(
                status_code=400,
                detail="At least one value column must be selected"
            )
        
        plotter = BarChartPlotter(df)
        image_path = plotter.plot(
            value_columns=request.value_columns,
            category_column=request.category_column,
            series_color_mode=request.series_color_mode,
            single_color=request.single_color,
            per_field_colors=request.per_field_colors,  # ← added
            layout_mode=request.layout_mode,
            orientation=request.orientation,
            bar_width=request.bar_width,
            bar_spacing=request.bar_spacing,
            y_axis_scale=request.y_axis_scale,
            y_min=request.y_min,
            y_max=request.y_max,
            tick_format=request.tick_format,
            major_tick_interval=request.major_tick_interval,
            grid_style=request.grid_style,
            zero_baseline=request.zero_baseline,
            show_legend=request.show_legend,
            dark_theme=request.dark_theme
        )
        
        return PlotResponse(image_path=image_path)
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")


@router.post("/boxplot", response_model=BoxPlotResponse)
async def create_boxplot(request: BoxPlotRequest, user_id: str = Depends(get_current_user_id)):
    """Generate box plot with statistics"""
    
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)
        
        # Validate numeric column
        if not CSVHandler.validate_column(request.numeric_column, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"Column '{request.numeric_column}' not found in CSV"
            )
        
        # Validate grouping column if provided
        if request.grouping_column:
            if not CSVHandler.validate_column(request.grouping_column, user_id=user_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Grouping column '{request.grouping_column}' not found in CSV"
                )
        
        plotter = BoxPlotPlotter(df)
        image_path, statistics = plotter.plot(
            numeric_column=request.numeric_column,
            grouping_column=request.grouping_column,
            grouping_mode=request.grouping_mode,
            orientation=request.orientation,
            whisker_definition=request.whisker_definition,
            outlier_detection=request.outlier_detection,
            quartile_method=request.quartile_method,
            axis_scale=request.axis_scale,
            axis_range=request.axis_range,
            range_min=request.range_min,
            range_max=request.range_max,
            grid_style=request.grid_style,
            color_mode=request.color_mode,
            single_color=request.single_color,
            show_legend=request.show_legend,
            dark_theme=request.dark_theme,
            category_sorting=request.category_sorting
        )
        
        return BoxPlotResponse(
            image_path=image_path,
            statistics=statistics
        )
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")

@router.post("/piechart", response_model=PlotResponse)
async def create_piechart(request: PieChartRequest, user_id: str = Depends(get_current_user_id)):
    """Generate pie/donut chart"""
    
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)
        
        # Validate category column
        if not CSVHandler.validate_column(request.category_column, user_id=user_id):
            raise HTTPException(
                status_code=400,
                detail=f"Category column '{request.category_column}' not found in CSV"
            )
        
        # Validate value column if needed
        if request.value_column:
            if not CSVHandler.validate_column(request.value_column, user_id=user_id):
                raise HTTPException(
                    status_code=400,
                    detail=f"Value column '{request.value_column}' not found in CSV"
                )
        elif request.aggregation_method in ["sum", "mean"]:
            raise HTTPException(
                status_code=400,
                detail=f"Value column required for {request.aggregation_method} aggregation"
            )
        
        plotter = PieChartPlotter(df)
        image_path = plotter.plot(
            category_column=request.category_column,
            value_column=request.value_column,
            aggregation_method=request.aggregation_method,
            chart_type=request.chart_type,
            inner_radius=request.inner_radius,
            slice_ordering=request.slice_ordering,
            start_angle=request.start_angle,
            value_representation=request.value_representation,
            label_position=request.label_position,
            min_slice_threshold=request.min_slice_threshold,
            show_legend=request.show_legend,
            legend_position=request.legend_position,
            center_label=request.center_label,
            show_total=request.show_total,
            slice_border=request.slice_border,
            border_width=request.border_width,
            angle_precision=request.angle_precision,
            dark_theme=request.dark_theme
        )
        
        return PlotResponse(image_path=image_path)
    
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating plot: {str(e)}")
