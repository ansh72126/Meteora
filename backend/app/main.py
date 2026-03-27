from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Load backend/.env if present (local dev secrets) BEFORE importing app.config
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=False)

from app.config import ALLOWED_ORIGINS, STATIC_DIR
from app.routes import upload
from app.routes.plots import univariate
from app.routes.plots import bivariate
from app.routes.plots import timeseries
from app.routes.plots import multivariate
from app.routes import session


app = FastAPI(
    title="Meteora API",
    description="API for generating plots from CSV data using Meteora",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router)
app.include_router(univariate.router)
app.include_router(bivariate.router) 
app.include_router(timeseries.router)
app.include_router(multivariate.router)
app.include_router(session.router)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def root():
    return {
        "message": "CSV Plotter API",
        "version": "1.0.0",
        "endpoints": {
            "upload": "/upload/",
            "histogram": "/univariate/histogram",
            "kde": "/univariate/kde",
            "ecdf": "/univariate/ecdf",
            "bell": "/univariate/bell",
            "barchart": "/univariate/barchart",
            "boxplot": "/univariate/boxplot",
            "piechart": "/univariate/piechart",
            "linechart": "/bivariate/linechart",
            "scatterplot": "/bivariate/scatterplot",
            "jointplot": "/bivariate/jointplot",
            "timeseries": "/timeseries/timeseries",
            "rollingmean": "/timeseries/rollingmean",
            "areachart": "/timeseries/area",
            "pairplot": "/multivariate/pairplot",
            "clusterscatter": "/multivariate/clusterscatter",
            "heatmap": "/multivariate/heatmap"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}