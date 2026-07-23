from app.suitability import evaluate_suitability


def test_gate_restricts_guidance_when_cashflow_is_unsafe():
    result = evaluate_suitability(
        {
            "monthly_income": 8000,
            "monthly_expenses": 6000,
            "monthly_debt_payment": 3000,
            "liquid_savings": 5000,
            "risk_tolerance": "low",
            "risky_asset_pct": 80,
            "horizon_months": 12,
        }
    )

    assert result["status"] == "restricted"
    assert result["guidance_level"] == "education_only"
    assert result["human_review_required"] is True
    assert len(result["hard_stops"]) >= 3


def test_gate_allows_general_principles_for_suitable_profile():
    result = evaluate_suitability(
        {
            "monthly_income": 20000,
            "monthly_expenses": 6000,
            "monthly_debt_payment": 1000,
            "liquid_savings": 60000,
            "risk_tolerance": "medium",
            "risky_asset_pct": 40,
            "horizon_months": 60,
        }
    )

    assert result["status"] == "eligible"
    assert result["guidance_level"] == "general_allocation"
    assert result["human_review_required"] is False
    assert "具体证券买卖指令" in result["prohibited_outputs"]


def test_missing_core_financial_data_blocks_advice():
    result = evaluate_suitability({"risk_tolerance": "medium"})
    assert result["status"] == "restricted"
    assert "月收入" in result["missing_information"]
    assert "必要生活支出" in result["missing_information"]
