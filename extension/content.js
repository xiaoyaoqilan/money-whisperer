// ============================================================
//  冷静一下｜回头是岸 — Content Script
//  三级警告：5分钟提醒 → 10分钟警告 → 15分钟抓拍周报
// ============================================================

const OVERLAY_ID = "money-whisperer-overlay";

const SNARKY_COMMENTS = [
  "瞧这黑眼圈，再炒下去要变熊猫了——不过熊猫有人养，你亏了可没人管。",
  "这张脸写满了'再不收手就晚了'，眼神里全是对K线的执念。",
  "看看你自己——焦虑到刷手机刷到凌晨三点，第二天还要上班。这哪是投资，这是自虐。",
  "脸上写着一个大写的'韭'字。市场的镰刀已经磨好了，你还伸着脖子往前凑。",
  "你这表情我见过——每个'这次不一样'的人最后都一样：一样亏。",
  "用最焦虑的脸盯最绿的盘，这是当代年轻人的新型自残方式吗？",
  "人还在，钱快没了。这照片留着，十年后看会感谢今天劝你收手的人。",
  "嘴角向下是亏钱的标准配置，眉头紧锁是梭哈的经典表情。收手吧。",
  "这眼神，像极了当年48块买中石油的那批人。历史不会重复，但人性会。",
];

const SLOGANS = [
  "你连K线图都看不懂，凭什么觉得自己能赚钱？",
  "每一次'抄底'的背后，都是一群人在'逃顶'。",
  "巴菲特年化20%就被封神，你觉得自己比他强在哪？",
  "市场永远不缺机会，但你的本金只有一次。",
  "盯着屏幕的时间越长，亏钱的概率越大。",
  "交易是反人性的，而你现在的人性正在被市场玩弄。",
  "以你追涨杀跌的手速，财富自由之路是先负后正——可惜负的太多，正不回来了。",
  "90%的散户都在亏钱，你确定自己是那10%？",
  "把盯盘的时间拿来学个新技能，收益率可能是1000%。",
];

const ALTERNATIVES = [
  { emoji: "🎸", text: "报一个吉他班，三个月学会弹唱", cost: 1200 },
  { emoji: "🎨", text: "报一个陶艺/绘画班，找到心流", cost: 1200 },
  { emoji: "🏔", text: "去大理/丽江住一周民宿", cost: 6000 },
  { emoji: "📚", text: "买50本好书，够读一整年", cost: 2500 },
  { emoji: "🍳", text: "报一个蓝带烘焙课", cost: 3000 },
  { emoji: "🏃", text: "请个私教健身三个月", cost: 7200 },
  { emoji: "🧘", text: "办一张年度冥想会籍", cost: 2000 },
  { emoji: "👨‍👩‍👧", text: "带爸妈去三亚住一周", cost: 10000 },
  { emoji: "🌱", text: "把阳台改造成小花园", cost: 1500 },
  { emoji: "✈", text: "去日本玩一周，吃遍东京", cost: 12000 },
  { emoji: "☕", text: "每天一杯精品手冲+好书，一整年", cost: 3000 },
  { emoji: "🎮", text: "买齐今年所有3A大作+新主机", cost: 5000 },
  { emoji: "🐕", text: "领养一只狗，给它最好的生活", cost: 5000 },
  { emoji: "💆", text: "每月一次全身SPA，做一整年", cost: 4800 },
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function formatMoney(n) { return n>=10000?(n/10000).toFixed(1)+"万":n.toLocaleString(); }

// ============================================================
//  消息路由
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "show_warning") {
    const data = message.data;
    console.log("[回头是岸] 📩 收到警告消息 level=" + data.warningLevel + " minutes=" + data.totalMinutes);
    alert("📩 收到警告！Level=" + data.warningLevel + " 盯盘=" + data.totalMinutes + "分钟");
    if (data.warningLevel === 3) {
      autoCaptureAndReport(data);
    } else if (data.warningLevel === 2) {
      showLevel2Warning(data);
    } else {
      showLevel1Warning(data);
    }
    sendResponse({ received: true });
  }
  if (message.action === "ping") sendResponse({ pong: true });
});

// ============================================================
//  Level 1: 5分钟轻提醒
// ============================================================

function showLevel1Warning(data) {
  const wrapper = createWrapper();
  const { totalMinutes, domains } = data;
  const topDomain = Object.entries(domains || {}).sort((a,b)=>b[1]-a[1])[0];
  const domainName = topDomain ? topDomain[0] : "交易网站";

  wrapper.innerHTML = `
    <div class="mw-backdrop mw-backdrop-light"></div>
    <div class="mw-dialog mw-dialog-l1">
      <div class="mw-l1-content">
        <span class="mw-l1-icon">⏰</span>
        <h3>你已经盯盘 <strong>${totalMinutes}</strong> 分钟了</h3>
        <p>在 <span class="mw-l1-domain">${domainName}</span> 上花了 ${totalMinutes} 分钟。<br>现在关掉，还来得及。</p>
        <p class="mw-l1-hint">${rand(SLOGANS)}</p>
      </div>
      <button class="mw-l1-dismiss" id="mw-l1-dismiss">知道了，关掉 🙏</button>
    </div>`;

  wrapper.querySelector("#mw-l1-dismiss").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "dismiss_warning" });
    fadeOut(wrapper);
  });

  const escHandler = (e) => {
    if (e.key === "Escape") {
      chrome.runtime.sendMessage({ action: "dismiss_warning" });
      fadeOut(wrapper);
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ============================================================
//  Level 2: 10分钟严正警告
// ============================================================

function showLevel2Warning(data) {
  const wrapper = createWrapper();
  const { totalMinutes, domains, warningCount } = data;
  const topDomains = Object.entries(domains || {}).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([d,s]) => ({ domain: d, minutes: Math.round(s/60) }));

  const hourlyWage = 50;
  const earnedMoney = Math.round(totalMinutes/60*hourlyWage);

  wrapper.innerHTML = `
    <div class="mw-backdrop"></div>
    <div class="mw-dialog mw-dialog-l2">
      <div class="mw-header">
        <div class="mw-skull">⚠️</div>
        <h2>最后通牒！你已经盯盘 ${totalMinutes} 分钟</h2>
        <p class="mw-subtitle">第 ${warningCount} 次提醒 · 再继续就要启动摄像头了</p>
      </div>
      <div class="mw-body">
        <div class="mw-stat-row">
          <div class="mw-stat"><span class="mw-stat-num">${totalMinutes}</span><span class="mw-stat-label">盯盘分钟</span></div>
          <div class="mw-stat-divider"></div>
          <div class="mw-stat"><span class="mw-stat-num">¥${earnedMoney}</span><span class="mw-stat-label">时间价值(时薪¥${hourlyWage})</span></div>
        </div>
        ${topDomains.length ? `
        <div class="mw-domains"><span class="mw-domains-label">时间去向：</span>
          <div class="mw-domain-chips">${topDomains.map(d=>`<span class="mw-domain-chip">${d.domain} · ${d.minutes}分钟</span>`).join("")}</div>
        </div>` : ''}
        <div class="mw-warning-banner">
          ⚠️ <strong>这是最后通牒。</strong>如果你继续盯盘超过 15 分钟，摄像头将自动抓拍你的照片，并生成《回头是岸》Diss 周报。你的脸将成为本周最佳劝退素材。
        </div>
      </div>
      <div class="mw-footer">
        <button class="mw-dismiss-btn" disabled>我先冷静一下 (<span class="mw-countdown">10</span>秒)</button>
      </div>
    </div>`;

  startCountdown(wrapper, 10, () => {
    chrome.runtime.sendMessage({ action: "dismiss_warning" });
    fadeOut(wrapper);
  });
}

// ============================================================
//  Level 3: 15分钟 → 自动抓拍 → 周报
// ============================================================

async function autoCaptureAndReport(data) {
  const wrapper = createWrapper();
  const photoDataUrl = await doAutoCapture(wrapper);
  renderWeeklyReport(wrapper, data, photoDataUrl);
}

// ---- 自动抓拍 ----
function doAutoCapture(wrapper) {
  return new Promise((resolve) => {
    wrapper.innerHTML = `
      <div class="mw-backdrop"></div>
      <div class="mw-dialog mw-dialog-capture">
        <div class="mw-capture-header">
          <div class="mw-capture-badge">📅 本周《回头是岸》周报</div>
          <h2>⏱ 盯盘超15分钟，正在生成周报…</h2>
          <p class="mw-capture-sub">摄像头将自动抓拍一张照片作为周报素材</p>
          <p class="mw-capture-privacy">📷 照片仅存储在本地浏览器，不上传任何服务器</p>
        </div>
        <div class="mw-capture-area">
          <video id="mw-cap-video" class="mw-cap-video" autoplay playsinline muted></video>
          <canvas id="mw-cap-canvas" class="hidden"></canvas>
          <div class="mw-cap-overlay" id="mw-cap-overlay">
            <span class="mw-cap-countdown-icon">📸</span>
            <span class="mw-cap-countdown-num" id="mw-cap-countdown">3</span>
            <span class="mw-cap-countdown-label">秒后自动抓拍</span>
          </div>
          <div class="mw-cap-flash hidden" id="mw-cap-flash"></div>
        </div>
        <p class="mw-cap-status" id="mw-cap-status">正在启动摄像头…</p>
      </div>`;

    const video = wrapper.querySelector("#mw-cap-video");
    const canvas = wrapper.querySelector("#mw-cap-canvas");
    const flash = wrapper.querySelector("#mw-cap-flash");
    const countdownEl = wrapper.querySelector("#mw-cap-countdown");
    const statusEl = wrapper.querySelector("#mw-cap-status");
    const overlay = wrapper.querySelector("#mw-cap-overlay");
    let stream = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        });
        video.srcObject = stream;
        statusEl.textContent = "📸 摄像头已就绪，请不要移动…";
        startCountdown();
      } catch (err) {
        statusEl.textContent = "⚠️ 无法访问摄像头，将使用占位图。";
        overlay.innerHTML = `<span class="mw-cap-placeholder-icon">🚫</span><p>摄像头不可用</p>`;
        setTimeout(() => { cleanup(); resolve(null); }, 1200);
      }
    }

    function startCountdown() {
      let count = 3;
      countdownEl.textContent = count;
      const timer = setInterval(() => {
        count--;
        if (count <= 0) { clearInterval(timer); capturePhoto(); }
        else {
          countdownEl.textContent = count;
          countdownEl.style.transform = "scale(1.4)";
          setTimeout(() => { countdownEl.style.transform = "scale(1)"; }, 200);
        }
      }, 1000);
    }

    function capturePhoto() {
      flash.classList.remove("hidden"); flash.classList.add("mw-cap-flash-anim");
      setTimeout(() => flash.classList.add("hidden"), 400);
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      overlay.innerHTML = `<span class="mw-cap-done-icon">✅</span><p>抓拍完成！</p>`;
      statusEl.textContent = "正在生成周报…";
      setTimeout(() => { cleanup(); resolve(dataUrl); }, 500);
    }

    function cleanup() { if (stream) { stream.getTracks().forEach(t=>t.stop()); stream=null; } }
    startCamera();
  });
}

// ---- 周报渲染 ----
function renderWeeklyReport(wrapper, data, photoDataUrl) {
  const { totalMinutes, domains, warningCount, weeklyStats, dissuasionStats } = data;
  const weeklyMins = weeklyStats?.totalMinutes ? Math.round(weeklyStats.totalSeconds/60) : totalMinutes;
  const weeklyWarns = weeklyStats?.warningsTotal || warningCount;
  let weeklyDays = 1;
  if (weeklyStats?.daysActive) {
    weeklyDays = Array.isArray(weeklyStats.daysActive) ? weeklyStats.daysActive.length : (weeklyStats.daysActive.size||1);
  }
  const successRate = dissuasionStats?.successRate ?? 100;
  const topDomains = Object.entries(domains||{}).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([d,s])=>({domain:d,minutes:Math.round(s/60)}));
  const snarky = rand(SNARKY_COMMENTS);
  const slogan = rand(SLOGANS);
  const alts = shuffle(ALTERNATIVES).slice(0,5);
  const defaultAmount = 50000;
  const hourlyWage = 50;
  const todayStr = new Date().toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"long"});

  wrapper.innerHTML = `
    <div class="mw-backdrop"></div>
    <div class="mw-dialog mw-dialog-report mw-dialog-report-full">
      <div class="mw-report-header-bar">
        <span>📅</span><span>本周《回头是岸》周报 · ${todayStr}</span>
        <span class="mw-report-header-badge">第 ${warningCount} 次警告</span>
      </div>
      <div class="mw-body mw-body-report">
        <!-- 照片 -->
        <div class="mw-report-section mw-photo-section">
          <h3>📸 【你的状态】</h3>
          <div class="mw-photo-container">
            ${photoDataUrl ? `<img src="${photoDataUrl}" alt="照片" class="mw-photo-img"/>` : `<div class="mw-photo-placeholder"><span>🚫</span><p>摄像头不可用<br>（但数据不会说谎）</p></div>`}
            <div class="mw-photo-comment">"${snarky}"</div>
          </div>
        </div>
        <!-- 本周数据 -->
        <div class="mw-report-section">
          <h3>📊 【本周盯盘数据】</h3>
          <div class="mw-report-stats-grid">
            <div class="mw-report-stat"><span class="mw-rs-num">${weeklyMins}</span><span class="mw-rs-label">本周分钟</span></div>
            <div class="mw-report-stat"><span class="mw-rs-num">${weeklyDays}</span><span class="mw-rs-label">活跃天数</span></div>
            <div class="mw-report-stat warn"><span class="mw-rs-num">${weeklyWarns}</span><span class="mw-rs-label">被警告</span></div>
            <div class="mw-report-stat"><span class="mw-rs-num">${topDomains.length}</span><span class="mw-rs-label">监控站</span></div>
          </div>
          ${topDomains.length?`<div class="mw-report-domain-list"><span class="mw-report-label">时间去向：</span>${topDomains.map(d=>`<span class="mw-report-domain-tag">${d.domain} ${d.minutes}分钟</span>`).join(" ")}</div>`:''}
        </div>
        <!-- 资金模拟 -->
        <div class="mw-report-section mw-money-section">
          <h3>💰 【你准备砸的钱】</h3>
          <p class="mw-money-intro">输入金额，看看归零意味着什么：</p>
          <div class="mw-money-input-row">
            <span class="mw-money-yuan">¥</span>
            <input type="number" class="mw-money-input" id="mw-money-amount" value="${defaultAmount}" min="100" max="100000000"/>
            <button class="mw-money-calc-btn" id="mw-money-calc">计算 💀</button>
          </div>
          <div class="mw-money-results hidden" id="mw-money-results">
            <div class="mw-money-card death">
              <span class="mw-money-emoji">💀</span>
              <div><strong>血本无归模拟</strong><p>如果 <span id="mw-amount-display">${formatMoney(defaultAmount)}</span> 元归零，你需要加班 <strong id="mw-overtime-hours">${Math.round(defaultAmount/hourlyWage)}</strong> 小时才能赚回来。</p></div>
            </div>
          </div>
        </div>
        <!-- 替代花费 -->
        <div class="mw-report-section">
          <h3>🎨 【这笔钱可以做什么】</h3>
          <div class="mw-alt-list" id="mw-alt-list">
            ${alts.map(a=>`<div class="mw-alt-row"><span class="mw-alt-emoji">${a.emoji}</span><span class="mw-alt-desc">${a.text}</span><span class="mw-alt-price">≈ ¥${a.cost.toLocaleString()}</span><span class="mw-alt-remain">（还剩 ¥<span class="mw-remain-num">${Math.max(0,defaultAmount-a.cost).toLocaleString()}</span>）</span></div>`).join("")}
          </div>
        </div>
        <!-- 劝退率 -->
        <div class="mw-report-section mw-dissuasion-section">
          <h3>📊 【本周劝退成功率】</h3>
          <div class="mw-dissuasion-meter">
            <div class="mw-dm-bar"><div class="mw-dm-fill" style="width:${successRate}%"></div></div>
            <span class="mw-dm-pct">${successRate}%</span>
          </div>
          <p class="mw-dm-desc">${successRate>=80?'还不错——但你还在这里。':successRate>=50?'你听听劝吧……数据不会说谎。':'你已经完全不听劝了。比你的持仓还难看。'}</p>
        </div>
        <!-- Agent 锐评 -->
        <div class="mw-report-section mw-agent-section">
          <h3>🗣 【Agent 锐评】</h3>
          <div class="mw-agent-comment">
            <div class="mw-agent-avatar">🤖</div>
            <div class="mw-agent-bubble"><p>"${slogan}"</p><p class="mw-agent-sub">— 冷静一下｜回头是岸 Agent · 操碎了心版</p></div>
          </div>
        </div>
        <!-- 免责 -->
        <div class="mw-report-disclaimer">
          <p>⚠️ 本Agent为娱乐教育目的，不构成投资建议。涉及大额资金请咨询持牌理财顾问。</p>
          <p>📷 照片仅存储在本地浏览器，不会上传至任何服务器。</p>
        </div>
      </div>
      <div class="mw-footer">
        <button class="mw-dismiss-btn mw-dismiss-ready" id="mw-btn-close">知道了，我关掉 🙏</button>
      </div>
    </div>`;

  // 资金模拟
  const amtInput = wrapper.querySelector("#mw-money-amount");
  const calcBtn = wrapper.querySelector("#mw-money-calc");
  const resDiv = wrapper.querySelector("#mw-money-results");
  function updateSim(amount) {
    amount=Math.max(100,Math.min(1e8,Number(amount)||defaultAmount));
    resDiv.classList.remove("hidden");
    wrapper.querySelector("#mw-amount-display").textContent=formatMoney(amount);
    wrapper.querySelector("#mw-overtime-hours").textContent=Math.round(amount/hourlyWage);
    const shf=shuffle(ALTERNATIVES);
    wrapper.querySelectorAll(".mw-alt-row").forEach((r,i)=>{const a=shf[i]||ALTERNATIVES[i];const rem=Math.max(0,amount-a.cost);r.querySelector(".mw-alt-emoji").textContent=a.emoji;r.querySelector(".mw-alt-desc").textContent=a.text;r.querySelector(".mw-alt-price").textContent=`≈ ¥${a.cost.toLocaleString()}`;r.querySelector(".mw-remain-num").textContent=rem.toLocaleString();});
  }
  calcBtn.addEventListener("click",()=>updateSim(Number(amtInput.value)));
  amtInput.addEventListener("keydown",e=>{if(e.key==="Enter")updateSim(Number(amtInput.value));});
  setTimeout(()=>updateSim(defaultAmount),100);

  // 关闭
  function close() {
    chrome.runtime.sendMessage({action:"dismiss_warning"});
    fadeOut(wrapper);
  }
  wrapper.querySelector("#mw-btn-close").addEventListener("click",close);
  const escH=(e)=>{if(e.key==="Escape"){close();document.removeEventListener("keydown",escH);}};
  document.addEventListener("keydown",escH);

  chrome.runtime.sendMessage({action:"save_report_card",report:{totalMinutes,warningCount,weeklyMins,successRate}});
}

// ============================================================
//  工具
// ============================================================

function createWrapper() {
  const w=document.createElement("div");w.id=OVERLAY_ID;
  document.body.appendChild(w);document.body.style.overflow="hidden";return w;
}
function fadeOut(w) {
  w.classList.add("mw-fade-out");
  setTimeout(()=>{w.remove();document.body.style.overflow="";},300);
}
function startCountdown(wrapper, seconds, onComplete) {
  const el=wrapper.querySelector(".mw-countdown");
  const btn=wrapper.querySelector(".mw-dismiss-btn");
  if(!el||!btn)return;
  let r=seconds;el.textContent=r;
  const t=setInterval(()=>{r--;el.textContent=r;if(r<=0){clearInterval(t);btn.disabled=false;btn.textContent="知道了，关掉这个页面 🙏";btn.classList.add("mw-dismiss-ready");}},1000);
  btn.addEventListener("click",()=>{clearInterval(t);onComplete();});
  const escH=(e)=>{if(e.key==="Escape"&&r<=0){clearInterval(t);onComplete();document.removeEventListener("keydown",escH);}};
  document.addEventListener("keydown",escH);
}

console.log("[回头是岸] 📸 三级警告系统就绪：5min提醒 → 10min警告 → 15min周报");
