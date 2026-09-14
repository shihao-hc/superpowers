# 自主行动闭环设计 (Autonomous Action Loop)

- 日期: 2026-09-14
- 状态: 已批准
- 范围: `src/core/SelfCodeImprover.js`, `src/core/LessonLibrary.js`, 行动日志

## 背景

BrainSystem 已有大量自动循环（40+ setInterval）但多为机械运维（清理/心跳/健康检查）。自我改进组件 `SelfCodeImprover` 有检测能力和自动修复能力（第100次已从空壳变真实），但：
- 循环是"定时扫描 + 记录"，不是"自主行动闭环"
- 教训库有 `applied`/`_applied` 标记机制，但**从不被真实驱动**（没有"应用教训"的实际动作）

目标：让自我改进从"观察→记录"升级为"**观察→决策→行动→记录**"完整闭环，并把学习（教训库）真正连接到行动（修复）。

## 方案

用户选择方案 B：**自主巡检 + 主动报告（A 基础） + 修复时关联教训并标记（B 扩展）**。

## 架构

```
SelfCodeImprover.runImprovementCycle() [升级]
├─ 1. fullScan() → issues（已有）
├─ 2. 每个 issue：
│     ├─ 可修复 (_canAutoFix) → _applyFix()
│     │     ├─ _findRelatedLesson(issue) → 教训库匹配同 tags/category 教训
│     │     ├─ 修复成功 → lessonLib.markApplied(教训)
│     │     └─ _recordAction(...) → 行动日志
│     └─ 不可修复 → _recordAction(...) → 待人工（高风险报告）
├─ 3. 行动日志：.opencode/evolution/actions.json
│     { timestamp, type, file, action, lessonRef, result }
└─ 4. 更新教训库统计（applied/active）
```

## 组件

### 1. LessonLibrary 增强
- 新增 `searchByType(issueType, tags)`：按问题类型/标签匹配相关**未应用**教训（`!_applied`）
- 复用已有 `markApplied(id)`：标记教训已应用（`_applied = true`）

### 2. SelfCodeImprover 增强
- `_findRelatedLesson(issue)`：从教训库匹配相关教训（issue 的 type/关键词 vs 教训的 tags/category/lesson 文本）
- `_recordAction(action)`：追加行动日志
- `runImprovementCycle()` 升级：修复时关联教训 → markApplied → 记录行动

### 3. 行动日志
- 位置: `.opencode/evolution/actions.json`
- 结构: `[{ timestamp, type, file, action, lessonRef, result }]`
- 追加，限长（最多保留 200 条，防无限增长）

## 数据流

检测问题 → 修复/记录 → 关联教训 → markApplied → 行动日志 → 教训库统计反映真实应用

## 风险边界（保守）

- 只自动修复 `_canAutoFix` 类型（duplicate-require，已有原子安全：`vm.Script` 语法校验 + 失败不写盘）
- 教训只标记 `applied`，不改内容
- 行动日志只记录，不阻塞；单条失败不中断循环
- 无教训匹配时走通用修复（不阻塞）

## 测试

- `LessonLibrary.searchByType` 匹配/无匹配测试
- 修复时关联教训 + markApplied + 行动日志记录测试
- 循环无教训/无修复时的空路径
- 行动日志限长测试

## 验收标准

1. `runImprovementCycle()` 执行后，修复的 issue 关联到教训并 `markApplied`
2. 行动日志 `actions.json` 记录自主行动（时间/类型/文件/教训依据/结果）
3. 教训库 `applied/active` 统计反映真实应用
4. 全量测试无回归，ESLint 0/0