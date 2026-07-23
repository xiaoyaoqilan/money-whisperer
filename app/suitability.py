"""User suitability and compliance gate for financial guidance."""

from __future__ import annotations

from typing import Any, Dict


RISK_LIMITS = {"low": 30, "medium": 60, "high": 85}
RISK_LABELS = {"low": "低", "medium": "中", "high": "高"}


def _number(data: Dict[str, Any], key: str) -> float:
    try:
        return max(0.0, float(data.get(key) or 0))
    except (TypeError, ValueError):
        return 0.0


def evaluate_suitability(data: Dict[str, Any]) -> Dict[str, Any]:
    """Decide what level of guidance the product is allowed to provide."""
    income = _number(data, "monthly_income")
    expenses = _number(data, "monthly_expenses")
    debt_payment = _number(data, "monthly_debt_payment")
    liquid_savings = _number(data, "liquid_savings")
    risky_asset_pct = min(100.0, _number(data, "risky_asset_pct"))
    horizon_months = int(_number(data, "horizon_months"))
    risk_tolerance = str(data.get("risk_tolerance") or "medium").lower()
    if risk_tolerance not in RISK_LIMITS:
        risk_tolerance = "medium"

    missing = []
    if income <= 0:
        missing.append("月收入")
    if expenses <= 0:
        missing.append("必要生活支出")

    monthly_surplus = income - expenses - debt_payment
    emergency_coverage = liquid_savings / expenses if expenses > 0 else 0
    debt_burden = debt_payment / income if income > 0 else 0
    allowed_risky_pct = RISK_LIMITS[risk_tolerance]

    hard_stops = []
    cautions = []
    if missing:
        hard_stops.append("关键财务信息不完整")
    if monthly_surplus < 0:
        hard_stops.append("每月现金流为负")
    if debt_burden > 0.5:
        hard_stops.append("月偿债负担超过收入的 50%")
    elif debt_burden > 0.35:
        cautions.append("月偿债负担超过收入的 35%")
    if emergency_coverage < 3:
        hard_stops.append("流动储备不足 3 个月必要支出")
    elif emergency_coverage < 6:
        cautions.append("流动储备尚未达到 6 个月")
    if risky_asset_pct > allowed_risky_pct:
        hard_stops.append(
            f"高波动资产占比超过{RISK_LABELS[risk_tolerance]}风险承受档位上限"
        )
    if 0 < horizon_months <= 12:
        cautions.append("生活目标将在 12 个月内发生")

    if hard_stops:
        status = "restricted"
        guidance_level = "education_only"
        plain_language = "当前只提供风险教育和现金流整理，不进入配置建议。"
    elif cautions:
        status = "caution"
        guidance_level = "planning_discussion"
        plain_language = "可以讨论规划原则，但任何调整都需要用户再次确认。"
    else:
        status = "eligible"
        guidance_level = "general_allocation"
        plain_language = "可以讨论一般资产配置原则，但仍不提供具体证券买卖指令。"

    return {
        "status": status,
        "guidance_level": guidance_level,
        "plain_language": plain_language,
        "profile": {
            "monthly_surplus": round(monthly_surplus, 2),
            "emergency_coverage_months": round(emergency_coverage, 1),
            "debt_burden_pct": round(debt_burden * 100, 1),
            "risk_tolerance": risk_tolerance,
            "risky_asset_pct": risky_asset_pct,
            "allowed_risky_asset_pct": allowed_risky_pct,
        },
        "hard_stops": hard_stops,
        "cautions": cautions,
        "missing_information": missing,
        "human_review_required": bool(hard_stops),
        "allowed_outputs": [
            "财务现状解释",
            "风险教育",
            "目标与现金流核对",
            "一般配置原则",
        ] if not hard_stops else [
            "财务现状解释",
            "风险教育",
            "补全信息清单",
        ],
        "prohibited_outputs": [
            "具体证券买卖指令",
            "收益承诺",
            "自动交易",
            "绕过用户确认",
        ],
    }
