from app.engine import assess_decision


def test_high_pressure_decision_is_stopped_without_trade_instruction():
    result = assess_decision(
        {
            "goal": "一年后交学费",
            "horizon_months": 12,
            "emergency_months": 1,
            "risky_asset_pct": 80,
            "market_change_pct": -12,
            "intended_action": "我很害怕，想马上清仓",
            "goal_changed": False,
        }
    )

    assert result["state"] == "stop"
    assert result["pressure_score"] >= 60
    assert result["requires_user_confirmation"] is True
    assert "自动交易" in result["blocked_capabilities"]
    assert "不构成投资建议" in result["disclaimer"]


def test_low_pressure_decision_keeps_user_in_control():
    result = assess_decision(
        {
            "goal": "十年后的长期目标",
            "horizon_months": 120,
            "emergency_months": 8,
            "risky_asset_pct": 30,
            "market_change_pct": -2,
            "intended_action": "按照原计划复盘",
            "goal_changed": False,
        }
    )

    assert result["state"] == "steady"
    assert result["pressure_score"] < 30
    assert result["requires_user_confirmation"] is True


def test_output_always_contains_three_reflection_questions():
    result = assess_decision(
        {
            "goal": "买车",
            "horizon_months": 24,
            "emergency_months": 4,
            "risky_asset_pct": 50,
            "market_change_pct": 5,
            "intended_action": "重新评估",
        }
    )
    assert len(result["reflection_questions"]) == 3
