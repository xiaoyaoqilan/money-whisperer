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
