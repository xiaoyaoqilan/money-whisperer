"""FastAPI entry point for the standalone Money Whisperer product."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.engine import assess_decision


ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"

app = FastAPI(
    title="冷静一下｜Money Whisperer",
    description="A standalone safety companion for high-pressure financial decisions.",
    version="1.0.0",
)


class AssessmentRequest(BaseModel):
    goal: str = Field(min_length=2, max_length=120)
    horizon_months: int = Field(ge=0, le=600)
    emergency_months: float = Field(ge=0, le=60)
    risky_asset_pct: float = Field(ge=0, le=100)
    market_change_pct: float = Field(ge=-100, le=100)
    intended_action: str = Field(min_length=2, max_length=500)
    goal_changed: bool = False


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "product": "money_whisperer",
        "standalone": True,
        "agentos_dependency": False,
    }


@app.post("/api/assess")
def assess(request: AssessmentRequest):
    return assess_decision(request.model_dump())


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
