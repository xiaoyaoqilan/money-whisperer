"""Standalone financial decision-safety engine.

This module intentionally has no AgentOS dependency and never produces
security-specific buy or sell instructions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable


IMPULSIVE_TERMS = ("清仓", "满仓", "梭哈", "抄底", "追涨", "借钱", "马上买", "马上卖")
FEAR_TERMS = ("害怕", "恐慌", "焦虑", "睡不着", "后悔", "怕错过")


def _contains(text: str, terms: Iterable[str]) -> bool:
    return any(term in text for term in terms)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def assess_decision(data: Dict[str, Any]) -> Dict[str, Any]:
    """Assess decision pressure and return a safe reflection protocol."""
    goal = str(data.get("goal") or "尚未填写的生活目标").strip()
    intended_action = str(data.get("intended_action") or "").strip()
    horizon_months = max(0, int(data.get("horizon_months") or 0))
    emergency_months = _clamp(float(data.get("emergency_months") or 0), 0, 60)
    risky_asset_pct = _clamp(float(data.get("risky_asset_pct") or 0), 0, 100)
    market_change_pct = _clamp(float(data.get("market_change_pct") or 0), -100, 100)
    goal_changed = bool(data.get("goal_changed", False))

    signals = []
    score = 0

    if emergency_months < 3:
        signals.append({"id": "liquidity", "label": "应急资金不足 3 个月", "weight": 25})
        score += 25
    if risky_asset_pct > 70:
        signals.append({"id": "concentration", "label": "高波动资产占比超过 70%", "weight": 20})
        score += 20
    if 0 < horizon_months <= 12:
        signals.append({"id": "short_horizon", "label": "生活目标将在 12 个月内发生", "weight": 20})
        score += 20
    if abs(market_change_pct) >= 7:
        signals.append({"id": "market_shock", "label": "近期市场处于显著波动", "weight": 15})
        score += 15
    if _contains(intended_action, IMPULSIVE_TERMS):
        signals.append({"id": "impulse", "label": "表达中出现高冲动操作", "weight": 25})
        score += 25
    if _contains(intended_action, FEAR_TERMS):
        signals.append({"id": "emotion", "label": "当前决定受到强烈情绪影响", "weight": 15})
        score += 15
    if not goal_changed and abs(market_change_pct) >= 5:
        signals.append({"id": "goal_anchor", "label": "市场变了，但生活目标没有变化", "weight": 10})
        score += 10

    score = min(score, 100)
    if score >= 60:
        state = "stop"
        headline = "先停一下，今天不做不可逆决定。"
        cooldown_hours = 24
    elif score >= 30:
        state = "slow"
        headline = "把动作放慢，先把目标和现金流重新对齐。"
        cooldown_hours = 12
    else:
        state = "steady"
        headline = "当前压力可控，但仍需按原计划确认。"
        cooldown_hours = 1

    questions = [
        f"“{goal}”的金额或使用时间真的发生变化了吗？",
        "如果市场明天继续反向波动，这个动作会不会影响日常现金流？",
        "这个决定来自原有计划，还是来自今天的恐惧或兴奋？",
    ]
    safe_next_steps = [
        f"设置 {cooldown_hours} 小时冷静期，不立即执行不可逆操作",
        "重新核对应急资金、目标期限和高波动资产占比",
        "涉及大额资金或生活刚性目标时，咨询持牌专业人士",
    ]

    return {
        "assessment_id": datetime.now(timezone.utc).strftime("mw-%Y%m%d%H%M%S%f"),
        "state": state,
        "pressure_score": score,
        "headline": headline,
        "goal_anchor": {
            "goal": goal,
            "horizon_months": horizon_months,
            "goal_changed": goal_changed,
            "principle": "市场价格变化不等于生活目标变化。",
        },
        "signals": signals,
        "reflection_questions": questions,
        "safe_next_steps": safe_next_steps,
        "cooldown_hours": cooldown_hours,
        "blocked_capabilities": [
            "自动交易",
            "具体证券买卖指令",
            "收益承诺",
            "代替用户确认",
        ],
        "requires_user_confirmation": True,
        "professional_review_recommended": score >= 60,
        "disclaimer": "本工具只用于理财教育和决策整理，不构成投资建议，也不执行任何交易。",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
