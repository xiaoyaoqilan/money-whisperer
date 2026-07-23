const form = document.querySelector("#assessment-form");
const button = document.querySelector("#submit-button");
const empty = document.querySelector("#empty-state");
const result = document.querySelector("#result");
const error = document.querySelector("#error");

function fillList(target, items) {
  const node = document.querySelector(target);
  node.replaceChildren(...items.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.firstChild.textContent = "正在整理决定… ";
  error.classList.add("hidden");

  const data = new FormData(form);
  const payload = {
    goal: data.get("goal"),
    horizon_months: Number(data.get("horizon_months")),
    emergency_months: Number(data.get("emergency_months")),
    risky_asset_pct: Number(data.get("risky_asset_pct")),
    market_change_pct: Number(data.get("market_change_pct")),
    intended_action: data.get("intended_action"),
    goal_changed: data.get("goal_changed") === "on",
    monthly_income: Number(data.get("monthly_income")),
    monthly_expenses: Number(data.get("monthly_expenses")),
    monthly_debt_payment: Number(data.get("monthly_debt_payment")),
    liquid_savings: Number(data.get("liquid_savings")),
    risk_tolerance: data.get("risk_tolerance"),
  };

  try {
    const response = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail?.[0]?.msg || "检查失败");

    document.querySelector("#score").textContent = body.pressure_score;
    document.querySelector("#state-badge").textContent =
      body.state === "stop" ? "暂停决定" : body.state === "slow" ? "放慢决定" : "保持计划";
    document.querySelector("#headline").textContent = body.headline;
    document.querySelector("#disclaimer").textContent = body.disclaimer;

    const signals = document.querySelector("#signals");
    signals.replaceChildren(...body.signals.map((signal) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = signal.label;
      return chip;
    }));
    fillList("#questions", body.reflection_questions);
    fillList("#steps", body.safe_next_steps);
    const gate = body.suitability;
    document.querySelector("#gate-status").textContent =
      gate.status === "restricted" ? "仅限教育" : gate.status === "caution" ? "谨慎讨论" : "可讨论一般原则";
    document.querySelector("#gate-summary").textContent = gate.plain_language;
    const gateMetrics = [
      ["月结余", `¥${gate.profile.monthly_surplus.toLocaleString()}`],
      ["应急覆盖", `${gate.profile.emergency_coverage_months} 个月`],
      ["偿债负担", `${gate.profile.debt_burden_pct}%`],
    ];
    const metrics = document.querySelector("#gate-metrics");
    metrics.replaceChildren(...gateMetrics.map(([label, value]) => {
      const node = document.createElement("div");
      node.className = "metric";
      const name = document.createElement("span");
      const number = document.createElement("strong");
      name.textContent = label;
      number.textContent = value;
      node.append(name, number);
      return node;
    }));
    fillList("#gate-reasons", [...gate.hard_stops, ...gate.cautions]);

    empty.classList.add("hidden");
    result.classList.remove("hidden");
  } catch (reason) {
    error.textContent = reason instanceof Error ? reason.message : "暂时无法完成检查";
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.firstChild.textContent = "先帮我冷静一下 ";
  }
});
