"""LLM client abstraction supporting multiple providers + demo mock mode.

Supports:
  - Anthropic Claude API
  - OpenAI-compatible APIs (OpenAI, DeepSeek, etc.)
  - Mock mode (uses rules engine without any API calls)
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from app.engine import (
    ASSESS_TOOL_ANTHROPIC,
    ASSESS_TOOL_OPENAI,
    GUARDRAIL_SYSTEM_PROMPT,
    assess_decision,
    format_assessment_for_llm,
    parse_free_text,
)


# ============================================================
#  Provider detection
# ============================================================

def _get_provider() -> str:
    """Determine which LLM provider to use from environment variables.

    Priority: ANTHROPIC_API_KEY > OPENAI_API_KEY > mock
    """
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "mock"


def _get_model() -> str:
    """Get the configured model name."""
    provider = _get_provider()
    if provider == "anthropic":
        return os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    if provider == "openai":
        return os.getenv("OPENAI_MODEL", "gpt-4o")
    return "mock"


# ============================================================
#  Chat message types
# ============================================================

Message = Dict[str, Any]  # {"role": "user"|"assistant"|"system", "content": str}


# ============================================================
#  Anthropic provider
# ============================================================

async def _chat_anthropic(messages: List[Message]) -> str:
    """Chat with Anthropic Claude API using tool use."""
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")

    client = anthropic.AsyncAnthropic(api_key=api_key)
    model = _get_model()

    system_prompt = GUARDRAIL_SYSTEM_PROMPT

    # Build the request
    response = await client.messages.create(
        model=model,
        max_tokens=2048,
        system=system_prompt,
        messages=messages,
        tools=[ASSESS_TOOL_ANTHROPIC],
        temperature=0.7,
    )

    # Process response — handle tool use
    final_text = ""

    for block in response.content:
        if block.type == "text":
            final_text += block.text
        elif block.type == "tool_use":
            # The engine was called — get the result
            tool_input = block.input
            assessment = assess_decision(tool_input)
            assessment_text = format_assessment_for_llm(assessment)

            # Continue the conversation with the tool result
            follow_up = await client.messages.create(
                model=model,
                max_tokens=2048,
                system=system_prompt,
                messages=[
                    *messages,
                    {"role": "assistant", "content": [block]},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": assessment_text,
                            }
                        ],
                    },
                ],
                temperature=0.7,
            )

            for fb in follow_up.content:
                if fb.type == "text":
                    final_text += fb.text

    return final_text.strip() or "抱歉，我暂时无法处理你的请求。请稍后再试。"


# ============================================================
#  OpenAI provider
# ============================================================

async def _chat_openai(messages: List[Message]) -> str:
    """Chat with OpenAI-compatible API using function calling."""
    from openai import AsyncOpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    model = _get_model()

    system_messages = [{"role": "system", "content": GUARDRAIL_SYSTEM_PROMPT}]
    all_messages = system_messages + list(messages)

    # First call — may trigger function calling
    response = await client.chat.completions.create(
        model=model,
        messages=all_messages,
        tools=[ASSESS_TOOL_OPENAI],
        temperature=0.7,
        max_tokens=2048,
    )

    choice = response.choices[0]
    final_text = ""

    if choice.message.tool_calls:
        # Engine was called — gather results
        tool_results = []
        for tc in choice.message.tool_calls:
            if tc.function.name == "assess_financial_decision":
                tool_input = json.loads(tc.function.arguments)
                assessment = assess_decision(tool_input)
                assessment_text = format_assessment_for_llm(assessment)
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": assessment_text,
                })

        # Continue with tool results
        follow_up = await client.chat.completions.create(
            model=model,
            messages=[
                *all_messages,
                choice.message.model_dump(),
                *tool_results,
            ],
            temperature=0.7,
            max_tokens=2048,
        )

        final_text = follow_up.choices[0].message.content or ""

    else:
        final_text = choice.message.content or ""

    return final_text.strip() or "抱歉，我暂时无法处理你的请求。请稍后再试。"


# ============================================================
#  Mock provider (no API key required)
# ============================================================

def _chat_mock(messages: List[Message]) -> str:
    """Mock chat mode — uses the rules engine directly without any API call.

    Parses the user's last message to extract structured fields,
    runs the assessment, and returns a formatted response.
    """
    # Get the last user message
    user_text = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_text = msg.get("content", "")
            break

    if not user_text:
        return "你好！我是冷静一下｜Money Whisperer 的 Demo 模式。请告诉我你目前的理财状况和想法，我来帮你分析。"

    # Parse free text
    parsed = parse_free_text(user_text)
    assessment = assess_decision(parsed)

    # Build a response in the style of an AI advisor
    state = assessment["state"]
    score = assessment["pressure_score"]
    headline = assessment["headline"]

    # State-specific intro
    if state == "stop":
        intro = "🛑 **暂停一下！** 我检测到你的决策中存在多个需要警惕的信号。"
        tone = "现在不是做决定的好时机。我们先一起冷静下来，把事情理清楚。"
    elif state == "slow":
        intro = "🟡 **放慢一点。** 我注意到一些值得你仔细思考的地方。"
        tone = "我建议你在做任何操作之前，先把下面这些问题想清楚。"
    else:
        intro = "🟢 **情况可控。** 当前的压力水平在合理范围内。"
        tone = "不过，保持警惕总是好的。按计划执行，做好记录。"

    lines = [
        intro,
        "",
        f"### {headline}",
        "",
        tone,
        "",
        f"**决策压力分数：{score}/100**",
        "",
        "---",
        "",
        "### ⚠️ 检测到的信号",
    ]

    for sig in assessment["signals"]:
        emoji = "🔴" if sig.get("severity") == "critical" else "🟡" if sig.get("severity") == "warning" else "🔵"
        lines.append(f"{emoji} {sig['label']}")

    lines.extend([
        "",
        "---",
        "",
        "### 🤔 在行动之前，请回答这三个问题",
    ])
    for i, q in enumerate(assessment["reflection_questions"], 1):
        lines.append(f"{i}. {q}")

    lines.extend([
        "",
        "### ✅ 现在可以做的安全动作",
    ])
    for step in assessment["safe_next_steps"]:
        lines.append(f"- {step}")

    lines.extend([
        "",
        f"**建议冷静期：{assessment['cooldown_hours']} 小时**",
        "",
        "---",
        "",
        "💡 *提示：当前为 Demo 模式（未配置 LLM API Key）。*",
        "*设置 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` 环境变量可启用 AI 对话模式。*",
        "",
        f"*{assessment['disclaimer']}*",
    ])

    return "\n".join(lines)


# ============================================================
#  Main chat interface
# ============================================================

async def chat(messages: List[Message]) -> str:
    """Main chat entry point. Routes to the appropriate provider.

    Args:
        messages: List of {"role": "user"|"assistant", "content": "..."}

    Returns:
        AI response text (with markdown formatting)
    """
    provider = _get_provider()

    try:
        if provider == "anthropic":
            return await _chat_anthropic(messages)
        elif provider == "openai":
            return await _chat_openai(messages)
        else:
            return _chat_mock(messages)
    except Exception as e:
        # Fallback: if the real API fails, use mock mode
        if provider != "mock":
            fallback = _chat_mock(messages)
            return (
                f"⚠️ AI 服务暂时不可用（{str(e)[:100]}），已切换到离线分析模式：\n\n"
                + fallback
            )
        raise


def get_provider_info() -> Dict[str, str]:
    """Return info about the current provider configuration."""
    provider = _get_provider()
    model = _get_model()
    names = {
        "anthropic": f"Anthropic Claude ({model})",
        "openai": f"OpenAI Compatible ({model})",
        "mock": "离线 Demo 模式（规则引擎）",
    }
    return {
        "provider": provider,
        "model": model,
        "display_name": names.get(provider, provider),
    }
