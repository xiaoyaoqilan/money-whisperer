# 冷静一下｜Money Whisperer

一个从零实现、与 AgentOS 完全独立的理财决策安全陪伴产品。

它不预测涨跌、不推荐证券、不连接券商。它在市场剧烈波动时，把用户的生活目标、期限、应急资金、资产暴露和情绪放在同一张决策卡上。

## 产品流程

```text
填写生活目标和当前动作
  -> 识别流动性、集中度、市场冲击与情绪信号
  -> 生成决策压力分数
  -> 进入暂停 / 放慢 / 保持计划状态
  -> 用户回答三个问题并自行确认
```

## 度小满赛道对应模块

`app/suitability.py` 是建议生成前的「用户适当性与合规门控」：

1. 汇总收入、必要支出、负债、流动储备、目标期限和风险承受力。
2. 识别负现金流、偿债压力、应急金不足和风险错配。
3. 决定 AI 允许输出的建议层级：
   - `education_only`：只做风险教育和信息补全。
   - `planning_discussion`：可以讨论规划原则，但必须再次确认。
   - `general_allocation`：可以讨论一般配置原则。
4. 无论哪一层，都禁止具体证券指令、收益承诺和自动交易。

该模块对应赛道要求中的建议边界、合规机制、异常处理和人工介入机制。

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
  "goal_changed": false,
  "monthly_income": 10000,
  "monthly_expenses": 5000,
  "monthly_debt_payment": 1000,
  "liquid_savings": 10000,
  "risk_tolerance": "medium"
}
```

只运行适当性门控：

```http
POST /api/suitability
```

## 与 AgentOS 的关系

无代码依赖、无接口依赖、无运行时依赖。AgentOS 只承载另一个产品「Agent 骨架迁移器」。
