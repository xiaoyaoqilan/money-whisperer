// ============================================================
//  冷静一下｜回头是岸 — Background Service Worker
//  预定闹钟式：会话开始时为30s/60s/90s各预定一个闹钟
// ============================================================

const TRADING_SITES = [
  "eastmoney.com","10jqka.com.cn","10jqka.com","xueqiu.com",
  "taoguba.com.cn","jisilu.cn","cnstock.com","stockstar.com",
  "hexun.com","zhitongcaijing.com",
  "guosen.com.cn","htsec.com","citics.com","cs.ecitic.com",
  "gtja.com","csc.com.cn","gf.com.cn","htsc.com.cn","cicc.com",
  "dfcf.com.cn","zszq.com","xyzq.com.cn","sywg.com",
  "binance.com","binancezh.com","okx.com","okex.com",
  "huobi.com","htx.com","bybit.com","gate.io","bitget.com",
  "coinbase.com","kraken.com","kucoin.com","mexc.com",
  "bitfinex.com","deribit.com","bitmart.com","bingx.com",
  "tradingview.com","investing.com","coinmarketcap.com",
  "coingecko.com","aicoin.com","mytoken.com","feixiaohao.com",
  "futunn.com","futu5.com","webull.com","tigerbrokers.com","tigerfintech.com",
  "biquan.com","58coin.com","zb.com",
];

function isTradingSite(url) {
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const clean = hostname.replace(/^(www\.|m\.|wap\.|trade\.|futures\.)/, "");
    return TRADING_SITES.some(d => clean === d || clean.endsWith("." + d));
  } catch { return false; }
}

function extractDomain(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^(www\.|m\.|wap\.|trade\.|futures\.)/, ""); }
  catch { return url; }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function weekKey() {
  const d = new Date(); const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day===0?6:day-1));
  return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}-${String(monday.getDate()).padStart(2,"0")}`;
}

async function getStorage(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
async function setStorage(obj) { return new Promise(r => chrome.storage.local.set(obj, r)); }

const DEFAULT_SETTINGS = {
  warnLevel1Seconds: 30,
  warnLevel2Seconds: 60,
  warnLevel3Seconds: 90,
  cooldownMinutes: 30,
  enabled: true,
  customSites: [],
};

// ============================================================
//  会话管理 + 预定闹钟
// ============================================================

async function scheduleWarningAlarms(tabId, startTime, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const levels = [
    { level: 1, delay: s.warnLevel1Seconds || 30 },
    { level: 2, delay: s.warnLevel2Seconds || 60 },
    { level: 3, delay: s.warnLevel3Seconds || 90 },
  ];
  for (const lvl of levels) {
    const alarmName = `warn_${tabId}_L${lvl.level}`;
    try { await chrome.alarms.clear(alarmName); } catch {}
    await chrome.alarms.create(alarmName, {
      when: startTime + lvl.delay * 1000,
    });
    console.log(`[回头是岸] ⏰ 预定: ${alarmName} 在 ${lvl.delay}秒后`);
  }
}

async function clearWarningAlarms(tabId) {
  for (let lvl = 1; lvl <= 3; lvl++) {
    try { await chrome.alarms.clear(`warn_${tabId}_L${lvl}`); } catch {}
  }
}

async function startSession(tabId, url) {
  const domain = extractDomain(url);
  const now = Date.now();
  const data = await getStorage(["activeSessions", "settings"]);
  const sessions = data.activeSessions || {};
  sessions[tabId] = { domain, startTime: now, url };
  await setStorage({ activeSessions: sessions });

  // 预定三级警告闹钟
  await scheduleWarningAlarms(tabId, now, data.settings || DEFAULT_SETTINGS);

  chrome.action.setBadgeText({ text: "✓" });
  chrome.action.setBadgeBackgroundColor({ color: "#4ade80" });
  console.log(`[回头是岸] 📊 开始监控: ${domain}`);
}

async function endSession(tabId) {
  const data = await getStorage(["activeSessions", "dailyStats", "weeklyStats"]);
  const sessions = data.activeSessions || {};
  const session = sessions[tabId];
  if (!session) return;

  const now = Date.now();
  const elapsedSeconds = Math.round((now - session.startTime) / 1000);

  const today = todayKey();
  let daily = data.dailyStats || {};
  if (daily.date !== today) daily = { date: today, totalSeconds: 0, domains: {}, sessionCount: 0 };
  daily.totalSeconds += Math.max(0, elapsedSeconds);
  daily.domains = daily.domains || {};
  daily.domains[session.domain] = (daily.domains[session.domain] || 0) + Math.max(0, elapsedSeconds);
  daily.sessionCount = (daily.sessionCount || 0) + 1;

  const wk = weekKey();
  let weekly = data.weeklyStats || {};
  if (weekly.week !== wk) weekly = { week: wk, totalSeconds: 0, domains: {}, daysActive: new Set(), warningsTotal: 0 };
  weekly.totalSeconds += Math.max(0, elapsedSeconds);
  weekly.domains = weekly.domains || {};
  weekly.domains[session.domain] = (weekly.domains[session.domain] || 0) + Math.max(0, elapsedSeconds);
  weekly.daysActive.add(today);

  await setStorage({ dailyStats: daily, weeklyStats: weekly });
  delete sessions[tabId];
  await setStorage({ activeSessions: sessions });

  // 取消该 tab 的预定闹钟
  await clearWarningAlarms(tabId);

  if (Object.keys(sessions).length === 0) {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ============================================================
//  警告触发（由预定闹钟触发）
// ============================================================

const SLOGANS = [
  "你连K线图都看不懂，凭什么觉得自己能赚钱？",
  "每一次抄底的背后，都有一群人在逃顶。",
  "巴菲特年化20%就被封神，你觉得自己比他强在哪？",
  "市场永远不缺机会，但你的本金只有一次。",
  "盯着屏幕的时间越长，亏钱的概率越大。",
];
function randSlogan() { return SLOGANS[Math.floor(Math.random()*SLOGANS.length)]; }

async function fireWarning(tabId, level) {
  const data = await getStorage([
    "activeSessions", "settings", "warnLevelsFired", "warningCount",
    "dailyStats", "weeklyStats", "dissuasionStats", "lastWarning",
  ]);
  const settings = data.settings || DEFAULT_SETTINGS;
  const sessions = data.activeSessions || {};
  const session = sessions[tabId];

  // 会话已结束，不触发
  if (!session) { console.log(`[回头是岸] ⚠ 会话已结束，跳过 L${level}`); return; }

  const today = todayKey();
  const fired = data.warnLevelsFired || {};
  if (fired.date !== today) { delete fired[1]; delete fired[2]; delete fired[3]; fired.date = today; }

  // 该等级今天已触发
  if (fired[level]) { console.log(`[回头是岸] ⏭ L${level} 今天已触发`); return; }

  // Level 3 冷却
  if (level === 3) {
    const cooldown = (settings.cooldownMinutes || 30) * 60 * 1000;
    if (Date.now() - (data.lastWarning || 0) < cooldown) { console.log(`[回头是岸] ⏳ L3 冷却中`); return; }
  }

  const now = Date.now();
  const liveSeconds = Math.round((now - session.startTime) / 1000);
  const daily = data.dailyStats || {};
  const totalSeconds = (daily.totalSeconds || 0) + liveSeconds;
  const totalMinutes = Math.round(totalSeconds / 60);
  const warnCount = (data.warningCount || 0) + 1;

  // Mark fired
  fired[level] = true;

  // History
  const history = (data.warningHistory || []);
  history.push({ number: warnCount, level, timestamp: now, totalMinutes, domains: { ...(daily.domains || {}) } });

  // Dissuasion
  let diss = data.dissuasionStats || { warningsShown:0, warningsDismissed:0, tradingResumedAfter:0, successRate:100 };
  diss.warningsShown = (diss.warningsShown||0) + 1;
  diss.successRate = diss.warningsShown>0 ? Math.round((1-diss.tradingResumedAfter/diss.warningsShown)*100) : 100;

  // Weekly
  const wk = weekKey();
  let wstats = data.weeklyStats || {};
  if (wstats.week !== wk) wstats = { week:wk, totalSeconds:0, domains:{}, daysActive:new Set(), warningsTotal:0 };
  wstats.warningsTotal = (wstats.warningsTotal||0) + 1;

  const warningData = {
    warningLevel: level, totalMinutes,
    domains: daily.domains || {}, warningCount: warnCount,
    dissuasionStats: diss,
    weeklyStats: { week: wstats.week, totalMinutes: Math.round(wstats.totalSeconds/60),
      daysActive: wstats.daysActive?[...wstats.daysActive].length:1, warningsTotal: wstats.warningsTotal },
  };

  // 注入覆盖层
  try {
    await injectOverlay(tabId, warningData);
    console.log(`[回头是岸] ✅ L${level} 覆盖层已注入`);
  } catch (err) {
    console.log(`[回头是岸] ❌ 注入失败:`, err.message);
    // 备用：sendMessage
    try { await chrome.tabs.sendMessage(tabId, { action:"show_warning", data:warningData }); }
    catch {}
  }

  await setStorage({
    lastWarning: now, warningCount: warnCount,
    warningHistory: history, dissuasionStats: diss,
    weeklyStats: wstats, warnLevelsFired: fired,
  });
}

// ============================================================
//  SweetAlert2 弹窗注入（最可靠方案）
// ============================================================

// 使用本地文件，CSP 允许 chrome-extension:// URL
const SWAL_CSS = chrome.runtime.getURL("sweetalert2.min.css");
const SWAL_JS = chrome.runtime.getURL("sweetalert2.min.js");

async function injectOverlay(tabId, data) {
  const lvl = data.warningLevel;
  const mins = data.totalMinutes;
  const domains = data.domains || {};
  const topEntry = Object.entries(domains).sort((a,b)=>b[1]-a[1])[0];
  const domainName = topEntry ? topEntry[0] : "交易网站";
  const slogan = randSlogan();
  const warnCount = data.warningCount || 1;
  const nextSecs = (lvl === 1) ? 60 : 90;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (a) => {
      // 1. 加载 SweetAlert2 CSS
      if (!document.querySelector("#swal-css")) {
        const link = document.createElement("link");
        link.id = "swal-css"; link.rel = "stylesheet";
        link.href = a.cssUrl;
        document.head.appendChild(link);
      }

      // 2. 加载 SweetAlert2 JS（如果还没加载）
      if (!window.Swal) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = a.jsUrl;
          s.onload = resolve;
          s.onerror = () => reject(new Error("Swal load failed"));
          document.head.appendChild(s);
        });
      }

      const Swal = window.Swal;
      if (!Swal) { alert("⚠️ 盯盘" + a.mins + "分钟了！请关掉交易页面。" + a.slogan); return; }

      // 3. 根据等级显示不同弹窗
      if (a.lvl === 1) {
        // Level 1: 轻提醒 Toast
        Swal.fire({
          toast: true,
          position: "top",
          icon: "warning",
          title: "⏰ 盯盘 " + a.mins + " 分钟",
          text: "在 " + a.domain + " 上。现在关掉还来得及！",
          showConfirmButton: true,
          confirmButtonText: "知道了，关掉 🙏",
          confirmButtonColor: "#d2644f",
          timer: 8000,
          timerProgressBar: true,
          customClass: { popup: "swal-popup-l1" },
        });
      } else if (a.lvl === 2) {
        // Level 2: 严正警告。10秒倒计时后按钮才可用
        Swal.fire({
          icon: "warning",
          title: "⚠️ 最后通牒！",
          html: '<div style="font-size:16px;line-height:2">' +
            '<strong style="color:#d2644f;font-size:28px">' + a.mins + ' 分钟</strong><br>' +
            '第 ' + a.wc + ' 次提醒<br><br>' +
            '<span style="color:#f09078;font-size:13px">⚠️ 再继续盯盘超过 ' + a.next + ' 秒，<br>摄像头将自动抓拍生成《回头是岸》周报。</span>' +
            '</div>',
          confirmButtonText: "请等待 10 秒...",
          confirmButtonColor: "#999",
          showCancelButton: false,
          allowOutsideClick: false,
          allowEscapeKey: false,
          showCloseButton: false,
          didOpen: () => {
            const btn = Swal.getConfirmButton();
            if (!btn) return;
            btn.disabled = true;
            let sec = 10;
            btn.textContent = "请等待 " + sec + " 秒...";
            const timer = setInterval(() => {
              sec--;
              if (sec <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.textContent = "知道了，关掉这个页面 🙏";
                btn.style.backgroundColor = "#d2644f";
              } else {
                btn.textContent = "请等待 " + sec + " 秒...";
              }
            }, 1000);
          },
        });
      } else if (a.lvl === 3) {
        // Level 3: 周报生成
        Swal.fire({
          icon: "error",
          title: "📅 《回头是岸》周报",
          html: '<div style="text-align:left;font-size:14px;line-height:2">' +
            '<p>📸 <strong>摄像头即将自动抓拍</strong></p>' +
            '<p>📊 本周盯盘: <strong>' + a.mins + ' 分钟</strong></p>' +
            '<p>⚠️ 第 <strong style="color:#d2644f">' + a.wc + '</strong> 次警告</p>' +
            '<p>💀 你准备砸多少钱？想想归零了要加班多久。</p>' +
            '<p style="color:#f09078;font-size:12px;margin-top:12px">"' + a.slogan + '"</p>' +
            '</div>',
          confirmButtonText: "知道了，我关掉 🙏",
          confirmButtonColor: "#d2644f",
          allowOutsideClick: false,
        });
      }
    },
    args: [{
      lvl, mins: mins, domain: domainName, slogan,
      wc: warnCount, next: nextSecs,
      cssUrl: SWAL_CSS, jsUrl: SWAL_JS,
    }],
  });
}

// ============================================================
//  Alarm 处理
// ============================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const name = alarm.name; // e.g. "warn_123_L2"
  const match = name.match(/^warn_(\d+)_L(\d)$/);
  if (match) {
    const tabId = Number(match[1]);
    const level = Number(match[2]);
    console.log(`[回头是岸] 🔔 闹钟触发: ${name}`);
    await fireWarning(tabId, level);
  }

  if (alarm.name === "midnight-reset") {
    await setStorage({
      dailyStats: { date: todayKey(), totalSeconds: 0, domains: {}, sessionCount: 0 },
      warningCount: 0, lastWarning: 0, warningHistory: [],
      warnLevelsFired: {},
    });
    console.log("[回头是岸] 🌅 新的一天");
  }
});

// ============================================================
//  Tab 事件
// ============================================================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) return;
    const data = await getStorage(["activeSessions"]);
    if (isTradingSite(tab.url) && (!data.activeSessions || !data.activeSessions[activeInfo.tabId])) {
      await startSession(activeInfo.tabId, tab.url);
    }
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    const url = tab.url || changeInfo.url;
    if (!url) return;
    const data = await getStorage(["activeSessions"]);
    const sessions = data.activeSessions || {};
    if (isTradingSite(url)) {
      if (!sessions[tabId]) await startSession(tabId, url);
    } else if (sessions[tabId]) {
      await endSession(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await getStorage(["activeSessions"]);
  if (data.activeSessions && data.activeSessions[tabId]) await endSession(tabId);
});

// ============================================================
//  初始化
// ============================================================

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await getStorage(["settings"]);
  if (!existing.settings) await setStorage({ settings: DEFAULT_SETTINGS });
  await chrome.alarms.create("midnight-reset", {
    when: (()=>{const n=new Date();n.setHours(24,0,0,0);return n.getTime();})(),
    periodInMinutes: 24*60,
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create("midnight-reset", {
    when: (()=>{const n=new Date();n.setHours(24,0,0,0);return n.getTime();})(),
    periodInMinutes: 24*60,
  });
});

// ============================================================
//  消息处理
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "get_stats") {
    getStorage(["dailyStats","weeklyStats","settings","warningCount","warningHistory","activeSessions","lastWarning","dissuasionStats"]).then(data => {
      const sessions = data.activeSessions || {};
      const now = Date.now();
      let liveSeconds = 0;
      const liveDomains = {};
      for (const s of Object.values(sessions)) {
        const secs = Math.round((now - s.startTime) / 1000);
        liveSeconds += secs;
        liveDomains[s.domain] = (liveDomains[s.domain]||0) + secs;
      }
      const daily = data.dailyStats || {};
      const merged = { ...daily, totalSeconds: (daily.totalSeconds||0)+liveSeconds, domains:{...(daily.domains||{})} };
      for (const [dom,secs] of Object.entries(liveDomains)) merged.domains[dom]=(merged.domains[dom]||0)+secs;
      sendResponse({...data, dailyStats:merged});
    });
    return true;
  }

  if (message.action === "update_settings") {
    setStorage({ settings: message.settings }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === "reset_today") {
    setStorage({
      dailyStats: { date: todayKey(), totalSeconds: 0, domains: {}, sessionCount: 0 },
      warningCount: 0, lastWarning: 0, warningHistory: [],
      warnLevelsFired: {},
    }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === "dismiss_warning") {
    getStorage(["dissuasionStats"]).then(async (data) => {
      const d = data.dissuasionStats || { warningsShown:0, warningsDismissed:0, tradingResumedAfter:0, successRate:100 };
      d.warningsDismissed = (d.warningsDismissed||0) + 1;
      await setStorage({ dissuasionStats: d });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "save_report_card") {
    getStorage(["reportCards"]).then(async (data) => {
      const cards = data.reportCards || [];
      cards.push({ ...message.report, timestamp: Date.now(), date: todayKey() });
      await setStorage({ reportCards: cards.slice(-10) });
      sendResponse({ success: true });
    });
    return true;
  }
});

console.log("[回头是岸] 🛡 预定闹钟式警告系统已就绪");
