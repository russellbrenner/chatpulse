"""FastAPI application entry point for the ChatPulse extraction microservice."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from chatpulse_extraction import __version__
from chatpulse_extraction.models import HealthResponse
from chatpulse_extraction.routes.analysis import router as analysis_router
from chatpulse_extraction.routes.extraction import router as extraction_router

app = FastAPI(
    title="ChatPulse Extraction Service",
    description=(
        "Data extraction and analysis microservice for Apple Messages chat.db. "
        "Provides raw data access and computed analytics over iMessage history."
    ),
    version=__version__,
)

# ---------------------------------------------------------------------------
# CORS -- allow the Node.js web frontend (and local dev) to call this service.
# In production the API gateway handles CORS; these defaults are generous for
# local development.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(extraction_router)
app.include_router(analysis_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    """Simple liveness probe."""
    return HealthResponse(status="ok", version=__version__)
