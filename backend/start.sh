#!/bin/bash
# Start the background worker daemon in the background
python -m app.worker.main &

# Start the FastAPI web server on the port assigned by Render
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
