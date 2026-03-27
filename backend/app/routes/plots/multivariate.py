from fastapi import APIRouter, HTTPException, Depends
from app.models import PairPlotRequest, PlotResponse, ClusterScatterRequest, HeatmapRequest
from app.services.plotting.multivariate.pairplot import PairPlotPlotter
from app.services.plotting.multivariate.clusterscatter import ClusterScatterPlotter
from app.services.plotting.multivariate.heatmap import HeatmapPlotter
from app.services.csv_handler import CSVHandler
from app.services.auth import get_current_user_id

router = APIRouter(prefix="/multivariate", tags=["multivariate"])


@router.post("/pairplot", response_model=PlotResponse)
async def create_pairplot(request: PairPlotRequest, user_id: str = Depends(get_current_user_id)):
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        # Validate columns
        for col in request.columns:
            if col not in df.columns:
                raise HTTPException(400, f"Column '{col}' not found in CSV")
        if request.hue_column and request.hue_column not in df.columns:
            raise HTTPException(400, f"Hue column '{request.hue_column}' not found in CSV")

        plotter = PairPlotPlotter(df)
        req_dict = request.dict()
        req_dict.pop("upload_id", None)
        image_path, stats = plotter.plot(**req_dict)
        return PlotResponse(image_path=image_path, stats=stats)

    except FileNotFoundError:
        raise HTTPException(404, "No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error generating pair plot: {str(e)}")

@router.post("/clusterscatter", response_model=PlotResponse)
async def create_clusterscatter(request: ClusterScatterRequest, user_id: str = Depends(get_current_user_id)):
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        # Validate feature columns exist
        for col in request.feature_columns:
            if col not in df.columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"Feature column '{col}' not found in CSV"
                )

        # Validate 3D constraint
        if request.enable_3d_visualization and len(request.feature_columns) != 3:
            raise HTTPException(
                status_code=400,
                detail="3D visualization requires exactly 3 feature columns"
            )

        # Validate minimum columns
        if len(request.feature_columns) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 feature columns are required"
            )

        plotter = ClusterScatterPlotter(df)
        req_dict = request.dict()
        req_dict.pop("upload_id", None)
        image_path, stats = plotter.plot(**req_dict)
        return PlotResponse(image_path=image_path, stats=stats)

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating cluster scatter: {str(e)}")


@router.post("/heatmap", response_model=PlotResponse)
async def create_heatmap(request: HeatmapRequest, user_id: str = Depends(get_current_user_id)):
    try:
        df = CSVHandler.load_user_csv(user_id=user_id)

        # Validate columns
        for col in request.feature_columns:
            if col not in df.columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"Column '{col}' not found in CSV"
                )

        if len(request.feature_columns) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 feature columns are required"
            )

        # Cap columns silently if over max_variable_cap
        cols = request.feature_columns[:request.max_variable_cap]
        req_dict = request.dict()
        req_dict.pop("upload_id", None)
        req_dict["feature_columns"] = cols

        plotter = HeatmapPlotter(df)
        image_path, stats = plotter.plot(**req_dict)
        return PlotResponse(image_path=image_path, stats=stats)

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No CSV file uploaded")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating heatmap: {str(e)}")