"""FastAPI entry point for the standalone Money Whisperer product."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.engine import assess_decision
from app.llm_client import chat as llm_chat, get_provider_info

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"

app = FastAPI(
    title="冷静一下｜Money Whisperer",
    description="A standalone safety companion for high-pressure financial decisions.",
    version="2.0.0",
)


# ---- 模型定义 ----

class AssessmentRequest(BaseModel):
    goal: str = Field(min_length=2, max_length=120)
    horizon_months: int = Field(ge=0, le=600)
    emergency_months: float = Field(ge=0, le=60)
    risky_asset_pct: float = Field(ge=0, le=100)
    market_change_pct: float = Field(ge=-100, le=100)
    intended_action: str = Field(min_length=2, max_length=500)
    goal_changed: bool = False


class ChatRequest(BaseModel):
    messages: list[dict] = Field(min_length=1, max_length=50)
    # Each message: {"role": "user"|"assistant", "content": "..."}


class ExtensionReport(BaseModel):
    date: str = Field(min_length=8, max_length=10)
    total_seconds: int = Field(ge=0)
    domains: dict[str, int] = Field(default_factory=dict)
    warnings_shown: int = Field(ge=0, default=0)


# ---- API 端点 ----

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "product": "money_whisperer",
        "version": "2.0.0",
        "standalone": True,
        "agentos_dependency": False,
        "llm_provider": get_provider_info(),
    }


@app.post("/api/assess")
def assess(request: AssessmentRequest):
    """Original structured assessment endpoint (rules engine directly)."""
    return assess_decision(request.model_dump())


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """AI-powered chat assessment endpoint.

    The LLM (or mock engine) will analyze the user's natural language,
    extract structured decision parameters, run the safety engine,
    and return a personalized, empathetic response.

    Supports:
      - Anthropic Claude (set ANTHROPIC_API_KEY)
      - OpenAI / DeepSeek / etc. (set OPENAI_API_KEY + OPENAI_BASE_URL)
      - Mock mode (no API key required, uses rules engine + NLU)
    """
    response_text = await llm_chat(request.messages)
    return {
        "role": "assistant",
        "content": response_text,
        "provider": get_provider_info(),
    }


@app.post("/api/extension/report")
def extension_report(report: ExtensionReport):
    """接收浏览器扩展上报的监控数据（可选，用于统计分析）。"""
    total_minutes = round(report.total_seconds / 60, 1)
    return {
        "status": "received",
        "message": f"已收到 {report.date} 的监控数据：{total_minutes} 分钟，{report.warnings_shown} 次警告",
        "advice": (
            "继续保持冷静！"
            if total_minutes < 30
            else "今天盯盘时间有点长了，考虑出门走走？"
        ),
    }


# ---- 静态文件 ----

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
