"""Vercel Python serverless entrypoint. Re-exports the FastAPI ASGI app."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

from server import app  # noqa: E402
