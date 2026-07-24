// ============================================================
//  冷静一下｜回头是岸 — Extension Popup
//  今日统计 + 本周数据 + 劝退率 + 设置
// ============================================================

const SLOGANS = [
  "你连K线图都看不懂，凭什么觉得自己能赚钱？",
  "每一次'抄底'的背后，都是一群人在'逃顶'。",
  "巴菲特年化20%就被封神，你觉得自己比他强在哪？",
  "市场永远不缺机会，但你的本金只有一次。",
  "盯着屏幕的时间越长，亏钱的概率越大。",
  "真正的自由，是不需要靠盯盘来获得安全感。",
  "你的时间比这几根K线值钱多了。",
  "想一夜暴富的人，最后都一夜暴负了。",
  "交易是反人性的，而你现在的人性正在被市场玩弄。",
  "关了这页面，出门走走，世界比K线宽广。",
];

document.addEventListener("DOMContentLoaded", async () => {
  await loadStats();
  await loadSettings();
  setRandomQuote();

  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document.getElementById("resetBtn").addEventListener("click", resetToday);
  document.getElementById("enabledToggle").addEventListener("change", toggleEnabled);

  // 实时刷新统计（每秒）
  setInterval(loadStats, 1000);
});

async function loadStats() {
  try {
    const bg = await chrome.runtime.sendMessage({ action: "get_stats" });
    if (!bg) return;

    const { dailyStats, weeklyStats, warningCount, activeSessions, settings, dissuasionStats } = bg;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Today
    const currentDaily = dailyStats || {};
    const isToday = currentDaily.date === todayStr;
    const totalSeconds = isToday ? (currentDaily.totalSeconds || 0) : 0;
    const totalMinutes = Math.round(totalSeconds / 60);
    const domains = isToday ? (currentDaily.domains || {}) : {};
    const activeSessionCount = Object.keys(activeSessions || {}).length;
    const warnCount = warningCount || 0;

    document.getElementById("todayMinutes").textContent = totalMinutes;
    document.getElementById("warningCount").textContent = warnCount;
    document.getElementById("activeTabs").textContent = activeSessionCount;

    // Weekly
    const weekData = weeklyStats || {};
    const weeklyMins = Math.round((weekData.totalSeconds || 0) / 60);
    const weeklyDays = weekData.daysActive ? (Array.isArray(weekData.daysActive) ? weekData.daysActive.length : weekData.daysActive.size || 0) : 0;
    const weeklyWarnings = weekData.warningsTotal || 0;
    document.getElementById("weeklyMinutes").textContent = weeklyMins;
    document.getElementById("weeklyDays").textContent = weeklyDays;
    document.getElementById("weeklyWarnings").textContent = weeklyWarnings;

    // Dissuasion
    const diss = dissuasionStats || {};
    const successRate = diss.successRate ?? 100;
    const shown = diss.warningsShown || 0;
    const resumed = diss.tradingResumedAfter || 0;
    document.getElementById("dissRate").textContent = successRate + "%";
    document.getElementById("dissDetail").textContent = `${shown}次警告 · ${resumed}次继续`;

    updateDomainList(domains);

    // Status dot
    const dot = document.getElementById("statusDot");
    const enabled = (settings || {}).enabled !== false;
    if (!enabled) {
      dot.classList.add("off"); dot.title = "监控已暂停";
    } else if (activeSessionCount > 0) {
      dot.classList.add("active"); dot.title = "正在监控中……";
    } else {
      dot.title = "监控就绪";
    }
  } catch (err) {
    console.error("加载统计数据失败:", err);
  }
}

function updateDomainList(domains) {
  const entries = Object.entries(domains).sort((a, b) => b[1] - a[1]);
  const list = document.getElementById("domainList");
  const items = document.getElementById("domainItems");
  if (entries.length === 0) { list.classList.add("hidden"); return; }
  list.classList.remove("hidden");
  items.innerHTML = entries.slice(0, 5).map(([domain, seconds], i) => {
    const minutes = Math.round(seconds / 60);
    const barWidth = entries.length > 0 ? Math.round((seconds / entries[0][1]) * 100) : 0;
    return `<div class="domain-item">
      <span class="domain-rank">${i + 1}</span>
      <span class="domain-name">${domain}</span>
      <span class="domain-time">${minutes}分钟</span>
      <span class="domain-bar" style="width:${barWidth}%"></span>
    </div>`;
  }).join("");
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {};
    document.getElementById("enabledToggle").checked = settings.enabled !== false;
    document.getElementById("warnLevel1").value = settings.warnLevel1Seconds || 30;
    document.getElementById("warnLevel2").value = settings.warnLevel2Seconds || 60;
    document.getElementById("warnLevel3").value = settings.warnLevel3Seconds || 90;
    document.getElementById("cooldownInput").value = settings.cooldownMinutes || 30;
  } catch (err) {
    console.error("加载设置失败:", err);
  }
}

async function saveSettings() {
  const settings = {
    enabled: document.getElementById("enabledToggle").checked,
    warnLevel1Seconds: Math.max(10, Math.min(300, Number(document.getElementById("warnLevel1").value) || 30)),
    warnLevel2Seconds: Math.max(10, Math.min(300, Number(document.getElementById("warnLevel2").value) || 60)),
    warnLevel3Seconds: Math.max(10, Math.min(600, Number(document.getElementById("warnLevel3").value) || 90)),
    cooldownMinutes: Math.max(5, Math.min(180, Number(document.getElementById("cooldownInput").value) || 30)),
  };
  try {
    await chrome.runtime.sendMessage({ action: "update_settings", settings });
    showToast("✅ 设置已保存");
  } catch (err) {
    showToast("❌ 保存失败");
  }
}

async function resetToday() {
  if (confirm("确定要重置今天的统计数据吗？")) {
    try {
      await chrome.runtime.sendMessage({ action: "reset_today" });
      await loadStats();
      showToast("🔄 今日数据已重置");
    } catch (err) {
      showToast("❌ 重置失败");
    }
  }
}

async function toggleEnabled() {
  const enabled = document.getElementById("enabledToggle").checked;
  const dot = document.getElementById("statusDot");
  if (!enabled) { dot.classList.add("off"); dot.classList.remove("active"); dot.title = "监控已暂停"; }
  else { dot.classList.remove("off"); dot.title = "监控就绪"; }
  const result = await chrome.storage.local.get(["settings"]);
  const settings = result.settings || {};
  settings.enabled = enabled;
  await chrome.storage.local.set({ settings });
  await chrome.runtime.sendMessage({ action: "update_settings", settings });
}

function setRandomQuote() {
  document.getElementById("quoteText").textContent = `"${SLOGANS[Math.floor(Math.random() * SLOGANS.length)]}"`;
}

function showToast(message) {
  const existing = document.querySelector(".popup-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "popup-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 2000);
}
