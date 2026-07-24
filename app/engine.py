"""Standalone financial decision-safety engine.

This module intentionally has no AgentOS dependency and never produces
security-specific buy or sell instructions.

Architecture:
  - Rules engine: deterministic scoring (always runs, acts as safety guardrail)
  - LLM tool layer: function definitions so an LLM can call the engine as a tool
  - NLU extraction: best-effort free-text parsing for demo/mock mode
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional


# ============================================================
#  常量定义
# ============================================================

IMPULSIVE_TERMS = (
    "清仓", "满仓", "梭哈", "抄底", "追涨", "借钱", "马上买", "马上卖",
    "all in", "allin", "杠杆", "合约", "做空", "做多", "重仓",
)

FEAR_TERMS = (
    "害怕", "恐慌", "焦虑", "睡不着", "后悔", "怕错过", "踏空",
    "亏了", "跌了", "暴跌", "崩盘", "完了", "救命",
)

GREED_TERMS = (
    "暴涨", "翻倍", "十倍", "百倍", "暴富", "发财", "冲", "起飞",
    "稳赚", "必涨", "内幕", "消息",
)

LIFE_GOAL_KEYWORDS = {
    "买车": 36,
    "买房": 60,
    "首付": 24,
    "结婚": 12,
    "养老": 120,
    "教育": 48,
    "孩子": 48,
    "上学": 36,
    "旅游": 6,
    "装修": 12,
    "备用金": 3,
    "应急": 3,
    "存款": 12,
    "储蓄": 12,
}

# ============================================================
#  工具函数
# ============================================================

def _contains(text: str, terms: Iterable[str]) -> bool:
    return any(term in text for term in terms)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _extract_number(text: str) -> Optional[float]:
    """Extract the first number (including 万/亿 units) from text."""
    # 处理中文单位
    wan_match = re.search(r"(\d+\.?\d*)\s*万", text)
    if wan_match:
        return float(wan_match.group(1)) * 10000
    yi_match = re.search(r"(\d+\.?\d*)\s*亿", text)
    if yi_match:
        return float(yi_match.group(1)) * 100000000
    num_match = re.search(r"(\d+\.?\d*)", text)
    if num_match:
        return float(num_match.group(1))
    return None


# ============================================================
#  LLM Tool / Function Definitions
# ============================================================

ASSESS_TOOL_OPENAI = {
    "type": "function",
    "function": {
        "name": "assess_financial_decision",
        "description": (
            "评估用户当前的理财决策是否理智。"
            "在给出任何理财建议之前，必须先调用此工具获取安全评估结果。"
            "该工具会检查：应急资金充足度、高波动资产占比、目标期限紧迫度、"
            "市场波动冲击、用户情绪状态、以及生活目标是否发生变化。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "goal": {
                    "type": "string",
                    "description": "用户原本的理财目标，如'三年后买车'、'攒首付'。如果用户没有明确说，尝试从对话中推断。",
                },
                "horizon_months": {
                    "type": "integer",
                    "description": "距离目标实现的剩余月数。短期=0-12个月，中期=12-60个月，长期=60+个月。",
                    "minimum": 0,
                    "maximum": 600,
                },
                "emergency_months": {
                    "type": "number",
                    "description": "用户当前应急资金可覆盖的生活月数。3个月以下为危险，3-6个月为一般，6个月以上为安全。",
                    "minimum": 0,
                    "maximum": 60,
                },
                "risky_asset_pct": {
                    "type": "number",
                    "description": "高波动资产（股票、加密货币等）在总资产中的占比百分比。70%以上为高风险集中。",
                    "minimum": 0,
                    "maximum": 100,
                },
                "market_change_pct": {
                    "type": "number",
                    "description": "近期相关市场的涨跌百分比。负数为下跌，正数为上涨。绝对值>=7%视为显著波动。",
                    "minimum": -100,
                    "maximum": 100,
                },
                "intended_action": {
                    "type": "string",
                    "description": "用户现在想做的操作，用其原话或总结。例如'想清仓'、'想抄底'、'想加杠杆'。",
                },
                "goal_changed": {
                    "type": "boolean",
                    "description": "用户的生活目标或用钱时间是否确实发生了变化。多数情况下为false（市场波动≠目标变化）。",
                },
            },
            "required": ["goal", "horizon_months", "emergency_months", "risky_asset_pct", "market_change_pct", "intended_action"],
        },
    },
}

ASSESS_TOOL_ANTHROPIC = {
    "name": "assess_financial_decision",
    "description": (
        "评估用户当前的理财决策是否理智。"
        "在给出任何理财建议之前，必须先调用此工具获取安全评估结果。"
        "该工具会检查：应急资金充足度、高波动资产占比、目标期限紧迫度、"
        "市场波动冲击、用户情绪状态、以及生活目标是否发生变化。"
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "goal": {
                "type": "string",
                "description": "用户原本的理财目标，如'三年后买车'、'攒首付'。如果用户没有明确说，尝试从对话中推断。",
            },
            "horizon_months": {
                "type": "integer",
                "description": "距离目标实现的剩余月数。短期=0-12个月，中期=12-60个月，长期=60+个月。",
            },
            "emergency_months": {
                "type": "number",
                "description": "用户当前应急资金可覆盖的生活月数。3个月以下为危险。",
            },
            "risky_asset_pct": {
                "type": "number",
                "description": "高波动资产占比百分比。70%以上为高风险集中。",
            },
            "market_change_pct": {
                "type": "number",
                "description": "近期市场涨跌百分比。负数为下跌。",
            },
            "intended_action": {
                "type": "string",
                "description": "用户现在想做的操作，用其原话或总结。",
            },
            "goal_changed": {
                "type": "boolean",
                "description": "用户的生活目标是否确实发生了变化。多数情况下为false。",
            },
        },
        "required": ["goal", "horizon_months", "emergency_months", "risky_asset_pct", "market_change_pct", "intended_action"],
    },
}

# ============================================================
#  NLU: 从自由文本中提取结构化字段 (Mock/Demo 模式)
# ============================================================

def parse_free_text(text: str) -> Dict[str, Any]:
    """Best-effort extraction of assessment fields from free-text user input.

    This is used when no LLM is available (mock/demo mode).
    When an LLM is connected, it extracts these fields and calls the tool directly.
    """
    goal = "未明确的生活目标"
    horizon_months = 36  # default
    emergency_months = 3.0  # default
    risky_asset_pct = 50.0  # default
    market_change_pct = 0.0  # default
    intended_action = text[:200] if text else "未说明"
    goal_changed = False

    # ---- 检测生活目标 ----
    for keyword, default_horizon in LIFE_GOAL_KEYWORDS.items():
        if keyword in text:
            goal = f"与'{keyword}'相关的目标"
            horizon_months = default_horizon
            break

    # 尝试从文本中提取时间信息
    year_match = re.search(r"(\d+)\s*年", text)
    if year_match:
        horizon_months = int(year_match.group(1)) * 12
    else:
        month_match = re.search(r"(\d+)\s*个?\s*月", text)
        if month_match:
            horizon_months = int(month_match.group(1))

    # ---- 检测应急资金 ----
    if _contains(text, ("没存款", "月光", "没积蓄", "没应急", "没备用金")):
        emergency_months = 0.5
    elif _contains(text, ("有点存款", "少量存款", "有一点积蓄")):
        emergency_months = 2.0
    elif _contains(text, ("存款充足", "积蓄够", "财务自由", "不缺钱")):
        emergency_months = 12.0

    # ---- 检测高风险资产占比 ----
    if _contains(text, ("全仓", "满仓", "全部身家", "所有钱")):
        risky_asset_pct = 95.0
    elif _contains(text, ("大部分", "七成", "八成", "九成", "70%", "80%", "90%")):
        risky_asset_pct = 80.0
    elif _contains(text, ("一半", "五成", "50%")):
        risky_asset_pct = 50.0
    elif _contains(text, ("小部分", "一点", "试试", "玩玩", "10%", "20%")):
        risky_asset_pct = 15.0

    # ---- 检测市场变化 ----
    if _contains(text, ("暴跌", "崩盘", "大跌", "腰斩")):
        market_change_pct = -15.0
    elif _contains(text, ("跌了", "下跌", "回调", "亏损")):
        market_change_pct = -8.0
    elif _contains(text, ("暴涨", "大涨", "起飞", "翻倍")):
        market_change_pct = 15.0
    elif _contains(text, ("涨了", "上涨", "盈利")):
        market_change_pct = 8.0

    # ---- 检测生活目标是否真的变了 ----
    if _contains(text, ("目标变了", "计划变了", "不买了", "推迟", "取消")):
        goal_changed = True

    return {
        "goal": goal,
        "horizon_months": min(max(horizon_months, 0), 600),
        "emergency_months": _clamp(emergency_months, 0, 60),
        "risky_asset_pct": _clamp(risky_asset_pct, 0, 100),
        "market_change_pct": _clamp(market_change_pct, -100, 100),
        "intended_action": intended_action[:500],
        "goal_changed": goal_changed,
    }


# ============================================================
#  核心评估引擎
# ============================================================

def assess_decision(data: Dict[str, Any]) -> Dict[str, Any]:
    """Assess decision pressure and return a safe reflection protocol.

    This is the deterministic safety engine. It runs on structured input
    and produces a scored assessment. When used with an LLM, the LLM
    extracts structured fields from user conversation, calls this function
    (as a tool), and then personalizes the response based on the output.

    Returns:
        dict with: state, pressure_score, headline, signals,
                   reflection_questions, safe_next_steps, cooldown_hours,
                   requires_user_confirmation, disclaimer, etc.
    """
    goal = str(data.get("goal") or "尚未填写的生活目标").strip()
    intended_action = str(data.get("intended_action") or "").strip()
    horizon_months = max(0, int(data.get("horizon_months") or 0))
    emergency_months = _clamp(float(data.get("emergency_months") or 0), 0, 60)
    risky_asset_pct = _clamp(float(data.get("risky_asset_pct") or 0), 0, 100)
    market_change_pct = _clamp(float(data.get("market_change_pct") or 0), -100, 100)
    goal_changed = bool(data.get("goal_changed", False))

    # ---- 信号检测 ----
    signals: list[dict] = []
    score = 0

    if emergency_months < 3:
        severity = "critical" if emergency_months < 1 else "warning"
        signals.append({
            "id": "liquidity",
            "label": f"应急资金仅覆盖 {emergency_months:.1f} 个月（建议 ≥ 3 个月）",
            "severity": severity,
            "weight": 25,
        })
        score += 25

    if risky_asset_pct > 70:
        signals.append({
            "id": "concentration",
            "label": f"高波动资产占比 {risky_asset_pct:.0f}%，超过 70% 警戒线",
            "severity": "critical" if risky_asset_pct > 90 else "warning",
            "weight": 20,
        })
        score += 20

    if 0 < horizon_months <= 12:
        signals.append({
            "id": "short_horizon",
            "label": f"生活目标将在 {horizon_months} 个月内发生，不宜承担过高波动",
            "severity": "warning",
            "weight": 20,
        })
        score += 20

    if abs(market_change_pct) >= 7:
        direction = "下跌" if market_change_pct < 0 else "上涨"
        signals.append({
            "id": "market_shock",
            "label": f"近期市场{direction} {abs(market_change_pct):.0f}%，处于显著波动中",
            "severity": "warning",
            "weight": 15,
        })
        score += 15

    if _contains(intended_action, IMPULSIVE_TERMS):
        signals.append({
            "id": "impulse",
            "label": "表达中出现高冲动操作信号（如清仓/梭哈/加杠杆等）",
            "severity": "critical",
            "weight": 25,
        })
        score += 25

    if _contains(intended_action, FEAR_TERMS):
        signals.append({
            "id": "emotion_fear",
            "label": "当前决定受到恐惧/焦虑等情绪影响",
            "severity": "warning",
            "weight": 15,
        })
        score += 15

    if _contains(intended_action, GREED_TERMS):
        signals.append({
            "id": "emotion_greed",
            "label": "当前决定可能受到贪婪/FOMO情绪驱动",
            "severity": "warning",
            "weight": 15,
        })
        score += 15

    if not goal_changed and abs(market_change_pct) >= 5:
        signals.append({
            "id": "goal_anchor",
            "label": "市场变了，但你的生活目标没有变化——市场波动不等于目标变化",
            "severity": "info",
            "weight": 10,
        })
        score += 10

    # ---- 状态判定 ----
    score = min(score, 100)

    if score >= 60:
        state = "stop"
        headline = "先停一下，今天不做不可逆决定。"
        cooldown_hours = 24
        state_description = "强烈建议暂停当前决策，等待冷静期过后重新评估。"
    elif score >= 30:
        state = "slow"
        headline = "把动作放慢，先把目标和现金流重新对齐。"
        cooldown_hours = 12
        state_description = "当前存在若干风险信号，建议放慢决策节奏，逐一排查后再行动。"
    else:
        state = "steady"
        headline = "当前压力可控，但仍需按原计划确认。"
        cooldown_hours = 1
        state_description = "压力水平在可控范围内，但仍建议按计划执行并做好记录。"

    # ---- 反思问题 ----
    reflection_questions = [
        f"「{goal}」的金额或使用时间真的发生变化了吗？",
        "如果市场明天继续反向波动，这个动作会不会影响日常现金流？",
        "这个决定来自原有计划，还是来自今天的恐惧或兴奋？",
    ]

    # ---- 安全下一步 ----
    safe_next_steps = [
        f"设置 {cooldown_hours} 小时冷静期，不立即执行不可逆操作",
        "重新核对应急资金、目标期限和高波动资产占比",
        "涉及大额资金或生活刚性目标时，咨询持牌专业人士",
    ]

    return {
        "assessment_id": datetime.now(timezone.utc).strftime("mw-%Y%m%d%H%M%S%f"),
        "state": state,
        "state_description": state_description,
        "pressure_score": score,
        "headline": headline,
        "goal_anchor": {
            "goal": goal,
            "horizon_months": horizon_months,
            "goal_changed": goal_changed,
            "principle": "市场价格变化不等于生活目标变化。",
        },
        "signals": signals,
        "reflection_questions": reflection_questions,
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


# ============================================================
#  LLM 系统提示词 (Guardrail)
# ============================================================

GUARDRAIL_SYSTEM_PROMPT = """你是一个 AI 理财决策陪伴助手，名叫「冷静一下｜Money Whisperer」。

## 你的角色
你不预测涨跌、不推荐具体证券、不执行交易。你帮助用户：
1. 在市场波动时整理思路，看清自己真正的财务状况和目标
2. 识别情绪驱动的冲动决策
3. 把注意力从短期市场波动拉回到长期生活目标

## 核心原则
- **安全优先**：在给出任何回应前，必须先调用 assess_financial_decision 工具评估用户的决策安全性
- **目标锚定**：始终引导用户思考"我的生活目标变了吗？"——市场变了不等于目标变了
- **不替用户做决定**：你提供框架和问题，最终决定始终由用户自己做出
- **承认边界**：涉及具体产品选择、税务、法律问题时，明确建议用户咨询持牌专业人士
- **风险透明**：不粉饰任何投资的风险，尤其是高波动资产

## 沟通风格
- 温暖但专业，像一个关心你的老朋友
- 用通俗语言解释理财概念，避免 jargon
- 在用户焦虑时给予共情，但不过度迎合
- 在用户过度自信时温和提醒风险
- 每次对话结束时，引导用户关注生活本身而非账户数字

## 禁止行为
- 不得推荐具体股票、基金、加密货币或其他证券
- 不得预测市场走势或暗示"现在是买入/卖出的好时机"
- 不得对"一定能赚钱"、"保本"等说法表示认同
- 不得代替用户做出"买"或"卖"的决定
- 不得使用"内幕消息"、"稳赚"、"必涨"等误导性表述
- 如果用户坚持要你做以上任何事，礼貌拒绝并解释原因

## 合规声明
在每次对话结束时，确保用户理解：你不构成投资建议，所有理财决策的风险由用户自行承担。涉及大额资金时，建议咨询持牌理财顾问。"""


# ============================================================
#  LLM 结果格式化
# ============================================================

def format_assessment_for_llm(result: Dict[str, Any]) -> str:
    """Format the engine assessment result as human-readable context for the LLM.

    The LLM uses this formatted text to generate a personalized, empathetic response.
    """
    lines = [
        "## 安全评估结果",
        f"- 决策状态: **{result['state']}** ({'暂停' if result['state'] == 'stop' else '放慢' if result['state'] == 'slow' else '保持计划'})",
        f"- 压力分数: **{result['pressure_score']}/100**",
        f"- 建议冷静期: **{result['cooldown_hours']} 小时**",
        f"- 需要专业复核: **{'是' if result['professional_review_recommended'] else '否'}**",
        "",
        "### 检测到的风险信号",
    ]

    for sig in result.get("signals", []):
        emoji = "🔴" if sig.get("severity") == "critical" else "🟡" if sig.get("severity") == "warning" else "🔵"
        lines.append(f"{emoji} {sig['label']}")

    lines.extend([
        "",
        "### 引导用户思考的问题",
    ])
    for i, q in enumerate(result.get("reflection_questions", []), 1):
        lines.append(f"{i}. {q}")

    lines.extend([
        "",
        "### 安全下一步",
    ])
    for step in result.get("safe_next_steps", []):
        lines.append(f"- {step}")

    lines.extend([
        "",
        "### 用户目标锚点",
        f"目标: {result['goal_anchor']['goal']}",
        f"期限: {result['goal_anchor']['horizon_months']} 个月",
        f"目标是否变化: {'是' if result['goal_anchor']['goal_changed'] else '否'}",
        "",
        "---",
        "请基于以上评估结果，用温暖、共情但专业的方式与用户沟通。",
        "如果状态是 STOP，语气要坚定但关心；如果是 SLOW，引导用户仔细思考；如果是 STEADY，肯定用户的理性并鼓励按计划执行。",
        f"必须包含的免责声明: {result['disclaimer']}",
    ])

    return "\n".join(lines)
