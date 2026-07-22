# Phase C: Full Auto — 实现计划

## 目标
AGENTS.md 的静态决策规则 → BrainSystem 运行时动态注入决策上下文。
大脑分析上下文后生成定制化指导，覆盖静态规则，实现工具前风险分析和跨会话进化。

## 核心改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/DecisionContext.js` | 新建 | 运行时决策上下文生成器 |
| `src/core/DecisionTracker.js` | 新建 | 决策追踪 + 跨会话持久化 |
| `src/core/PreToolRiskAnalyzer.js` | 新建 | 工具前风险分析引擎 |
| `src/core/BrainBridge.js` | 修改 | process() 输出增加 decisionContext 字段 |
| `src/core/BrainSystem.js` | 修改 | 添加 PRE_TOOL_USE → riskAnalyzer 钩子 |
| `brain-bridge.js` | 修改 | 添加 --decisions 命令 |
| `AGENTS.md` | 修改 | Section 0 增加动态注入协议 |

## 架构

```
brain-bridge.js process(input)
  └─ DecisionContext.generate(input, taskType, lessons)
       ├─ riskLevel: "low"|"medium"|"high"
       ├─ recommendations: [动态建议]
       ├─ priorityOverrides: { 覆盖哪些教训优先级 }
       └─ toolRestrictions: [禁止/警告的操作]
            ↓
  PRE_TOOL_USE hook
       └─ PreToolRiskAnalyzer.analyze(toolContext)
            ├─ ALLOW: 继续执行
            ├─ WARN: 执行但标记审计
            └─ BLOCK: 阻止执行
                 ↓
  DecisionTracker.record({input, decision, outcome})
       └─ .opencode/evolution/decisions.json
            ↓ (跨会话)
  DecisionContext 使用历史数据优化输出
```

## C1. DecisionContext.js

```javascript
generate(input, taskType, lessons, history)
  → {
      riskLevel,        // "low"|"medium"|"high"
      recommendations,  // [动态决策建议]
      priorityOverrides,// { lessonId: "high"|"low" }
      sessionContext    // { interactionCount, topIntent, recentDecisions }
    }
```

规则：
- riskLevel 根据 taskType 和 lessons 高优先级数量计算
- security/fix 提升风险级别
- 高频未应用教训降低风险容忍度

## C2. DecisionTracker.js

```javascript
record({ input, taskType, decision, outcome })
  → 写入 decisions.json

getHistory(limit=10)
  → 最近 N 条决策

getStats()
  → { total, byType, applicationRate }
```

## C3. PreToolRiskAnalyzer.js

```javascript
analyze(toolName, args, lessons)
  → { action: "ALLOW"|"WARN"|"BLOCK", reason, lessonMatch }

classifyFile(filePath)
  → "safe"|"config"|"critical"

classifyOp(toolName)
  → "read"|"write"|"delete"
```

规则：
- 写 lessons.json / brain.config.json → WARN
- 写 src/core/* → WARN (需要 AUTHORIZED)
- 删除操作 → BLOCK 除非 lessons 中授权
- 匹配到 security 类教训 → 提升警戒

## C4. BrainBridge decisionContext

process() 输出增加：
```json
{
  "intent": {...},
  "taskType": "code",
  "lessons": [...],
  "decisionContext": {
    "riskLevel": "low",
    "recommendations": ["先分析需求再编码", "注意边界条件"],
    "priorityOverrides": {"lesson-04": "high"},
    "sessionContext": {"interactionCount": 15, "topIntent": "代码"}
  }
}
```

## C5. AGENTS.md 更新

Section 0 改为：静态规则 + Phase C 动态注入说明。
决策优先级：动态注入 > 静态规则 > 默认行为。
