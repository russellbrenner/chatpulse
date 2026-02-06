# ---------------------------------------------------------------------------
# ChatPulse Extraction Microservice — Multi-stage Dockerfile
# ---------------------------------------------------------------------------
# Build stage: install Python dependencies into a virtual environment.
# Production stage: copy only the venv and source code into a slim image.
# ---------------------------------------------------------------------------

# -- Build stage ------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /build

# Copy project metadata and source for installation.
COPY pyproject.toml ./
COPY src/ ./src/

# Create a virtual environment and install the project with its dependencies.
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir .

# -- Production stage -------------------------------------------------------
FROM python:3.12-slim

LABEL org.opencontainers.image.title="chatpulse-extraction" \
      org.opencontainers.image.description="Apple Messages data extraction and analysis service" \
      org.opencontainers.image.source="https://github.com/russellbrenner/chatpulse"

# Create a non-root user for the application.
RUN groupadd --system app && useradd --system --gid app app

WORKDIR /app

# Copy the virtual environment from the builder stage.
COPY --from=builder /opt/venv /opt/venv

# Copy application source.
COPY src/ ./src/

# Create uploads directory (shared volume with web service).
RUN mkdir -p /app/uploads && chown app:app /app/uploads

# Ensure the venv's Python and binaries are on PATH.
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

# Switch to non-root user.
USER app

EXPOSE 8001

# Run uvicorn.  The host 0.0.0.0 is required inside a container.
CMD ["uvicorn", "chatpulse_extraction.main:app", "--host", "0.0.0.0", "--port", "8001"]
