# 冷静一下｜Money Whisperer

一个从零实现、与 AgentOS 完全独立的理财决策安全陪伴产品。

它不预测涨跌、不推荐证券、不连接券商。它在市场剧烈波动时，把用户的生活目标、期限、应急资金、资产暴露和情绪放在同一张决策卡上。

## 🛡 回头是岸｜浏览器扩展

**后台监控炒股/炒币网站，逗留时间过长自动弹出劝退提醒。**

当你在东方财富、雪球、同花顺、币安、OKX 等平台停留超过阈值时间后，扩展会：
- 🚨 全屏覆盖弹窗，展示今日盯盘时长
- 💀 显示毒舌劝退金句
- 🎸 推荐用这些时间做更有趣的事（附预算）
- ⏳ 强制冷静倒计时，必须等待才能关闭

### 安装扩展

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目的 `extension/` 目录
5. 点击扩展图标 → 设置警告阈值（默认 15 分钟）

扩展会出现在浏览器工具栏，角标显示今日盯盘分钟数。点击图标可以查看统计和调整设置。

## 产品流程

```text
填写生活目标和当前动作
  -> 识别流动性、集中度、市场冲击与情绪信号
  -> 生成决策压力分数
  -> 进入暂停 / 放慢 / 保持计划状态
  -> 用户回答三个问题并自行确认
```

## 本地运行

```powershell
cd E:\Antigravity\biance\money_whisperer
python -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8100
```

打开 `http://localhost:8100`。

## API

```http
POST /api/assess
Content-Type: application/json

{
  "goal": "三年后买车",
  "horizon_months": 36,
  "emergency_months": 2,
  "risky_asset_pct": 75,
  "market_change_pct": -10,
  "intended_action": "我很害怕继续下跌，想马上清仓",
  "goal_changed": false
}
```

### 扩展数据上报（可选）

```http
POST /api/extension/report
Content-Type: application/json

{
  "date": "2026-07-23",
  "total_seconds": 1800,
  "domains": {"eastmoney.com": 1200, "binance.com": 600},
  "warnings_shown": 2
}
```

## 与 AgentOS 的关系

无代码依赖、无接口依赖、无运行时依赖。AgentOS 只承载另一个产品「Agent 骨架迁移器」。
