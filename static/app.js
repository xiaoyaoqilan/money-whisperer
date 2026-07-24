// ============================================================
//  Money Whisperer — Frontend Logic
//  Form assessment + AI Chat modes
// ============================================================

// ---- DOM refs ----
const form = document.querySelector("#assessment-form");
const button = document.querySelector("#submit-button");
const empty = document.querySelector("#empty-state");
const result = document.querySelector("#result");
const error = document.querySelector("#error");

// ---- Mode switching ----
const modeTabs = document.querySelectorAll(".mode-tab");
const formMode = document.querySelector("#form-mode");
const chatMode = document.querySelector("#chat-mode");

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    modeTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const mode = tab.dataset.mode;
    if (mode === "form") {
      formMode.classList.remove("hidden");
      chatMode.classList.add("hidden");
    } else {
      formMode.classList.add("hidden");
      chatMode.classList.remove("hidden");
      scrollChatToBottom();
    }
  });
});

// ============================================================
//  Form Mode
// ============================================================

function fillList(target, items) {
  const node = document.querySelector(target);
  node.replaceChildren(
    ...items.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    })
  );
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
      body.state === "stop"
        ? "暂停决定"
        : body.state === "slow"
        ? "放慢决定"
        : "保持计划";
    document.querySelector("#headline").textContent = body.headline;
    document.querySelector("#disclaimer").textContent = body.disclaimer;

    const signals = document.querySelector("#signals");
    signals.replaceChildren(
      ...body.signals.map((signal) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = signal.label;
        return chip;
      })
    );
    fillList("#questions", body.reflection_questions);
    fillList("#steps", body.safe_next_steps);

    empty.classList.add("hidden");
    result.classList.remove("hidden");
  } catch (reason) {
    error.textContent =
      reason instanceof Error ? reason.message : "暂时无法完成检查";
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.firstChild.textContent = "先帮我冷静一下 ";
  }
});

// ============================================================
//  Chat Mode
// ============================================================

const chatMessages = document.querySelector("#chat-messages");
const chatInput = document.querySelector("#chat-input");
const chatSend = document.querySelector("#chat-send");
const chatReset = document.querySelector("#chat-reset");
const chatProvider = document.querySelector("#chat-provider");

// Conversation history (not persisted — resets on page refresh)
let conversation = [];

// Load provider info
async function loadProviderInfo() {
  try {
    const resp = await fetch("/api/health");
    const data = await resp.json();
    if (data.llm_provider) {
      chatProvider.textContent =
        data.llm_provider.provider === "mock"
          ? "离线 Demo 模式"
          : `🤖 ${data.llm_provider.display_name}`;
    }
  } catch {
    chatProvider.textContent = "离线 Demo 模式";
  }
}

function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  // Simple markdown-like rendering
  bubble.innerHTML = renderChatMarkdown(text);

  div.appendChild(bubble);
  chatMessages.appendChild(div);
  scrollChatToBottom();

  return div;
}

function addTypingIndicator() {
  const div = document.createElement("div");
  div.className = "chat-msg assistant typing-msg";
  div.innerHTML =
    '<div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
  chatMessages.appendChild(div);
  scrollChatToBottom();
  return div;
}

function removeTypingIndicator() {
  const typing = chatMessages.querySelector(".typing-msg");
  if (typing) typing.remove();
}

// Simple markdown renderer (handles bold, italic, headers, lists, hr)
function renderChatMarkdown(text) {
  let html = text;

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  // (reuses the ul wrapper via the same regex — close enough for chat display)

  // Code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Line breaks
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");

  // Emoji shortcodes used in mock responses
  const emojiMap = {
    "🛑": "🛑",
    "🟡": "🟡",
    "🟢": "🟢",
    "🔴": "🔴",
    "🔵": "🔵",
    "⚠️": "⚠️",
    "🤔": "🤔",
    "✅": "✅",
    "💡": "💡",
  };
  // emojis are already literal in the text

  return "<p>" + html + "</p>";
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  // Disable input while processing
  chatInput.disabled = true;
  chatSend.disabled = true;

  // Add user message
  addMessage("user", text);
  conversation.push({ role: "user", content: text });
  chatInput.value = "";
  chatInput.style.height = "auto";

  // Typing indicator
  const typing = addTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation }),
    });

    const data = await response.json();

    removeTypingIndicator();

    if (data.content) {
      addMessage("assistant", data.content);
      conversation.push({ role: "assistant", content: data.content });
    } else {
      addMessage(
        "assistant",
        "抱歉，我遇到了一些问题，请稍后再试。"
      );
    }
  } catch (err) {
    removeTypingIndicator();
    addMessage(
      "assistant",
      "⚠️ 连接失败，请检查网络后重试。如果后端未运行，请先启动服务。"
    );
  } finally {
    chatInput.disabled = false;
    chatSend.disabled = false;
    chatInput.focus();
    scrollChatToBottom();
  }
}

function resetChat() {
  conversation = [];
  chatMessages.innerHTML = `
    <div class="chat-msg assistant">
      <div class="chat-bubble">
        <p>对话已重置。👋 我还是你的理财决策陪伴助手。</p>
        <p>告诉我你现在在想什么吧！</p>
      </div>
    </div>
  `;
  chatInput.focus();
}

// Event listeners
chatSend.addEventListener("click", sendMessage);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

chatReset.addEventListener("click", () => {
  if (conversation.length === 0 || confirm("确定要重新开始对话吗？")) {
    resetChat();
  }
});

// ---- Init ----
loadProviderInfo();
