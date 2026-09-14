# 自主任务引擎设计 (ProactiveTaskEngine)

- 日期: 2026-09-14
- 状态: 已批准
- 范围: `src/core/ProactiveTaskEngine.js`（新）, `server/index.js`（接入）, 复用 LessonLibrary/actions.json

## 背景

系统从"被动等输入"变"主动发起"的最后一步。已有：
- 自主行动闭环（修复时关联教训并标记）
- 教训学习闭环（产生→审核→生效）
- SelfCodeImprover 每小时扫描（问题驱动自动修复）

缺口：系统不会**主动发起**有价值的智能动作（教训验证、健康巡检），所有行为都等待触发。

## 方案

用户确认**分离设计**：
- **教训验证**：启发式只读，标记 + 记录，**不自动改代码**
- **自动修复**：仅限已有安全机制（`_canAutoFix` 覆盖的 duplicate-require 等，问题驱动非教训驱动）

## 架构

```
ProactiveTaskEngine（定时，如每 30min，接入 server 启动）
├─ runTasks() = runLessonVerification() + runHealthCheck()
├─ 任务1: runLessonVerification()（教训验证应用）
│     - 查教训库 active（未应用）教训
│     - 每个教训: 扫描相关代码验证是否已体现（category/tags 定位 + 关键词启发式）
│     - 已体现 → markApplied（视为已应用到代码）
│     - 未体现 → 记录待办到行动日志（不盲目改代码）
├─ 任务2: runHealthCheck()（健康巡检）
│     - 检查: 待审教训积压、行动日志 manual-required 积压、记忆增长、教训 active/applied 比例
│     - 异常 → 主动写入行动日志
└─ _recordAction() 复用 actions.json（去重防噪音）
```

## 组件

### 1. `src/core/ProactiveTaskEngine.js`（新）
- `constructor({ lessonLib, actionLog })` 依赖注入（可测）
- `runTasks()` → 执行任务1+任务2，返回 `{ lessonVerification, healthCheck }`
- `runLessonVerification()`：
  - `lessonLib.searchByType` 或直接取 active 教训（`!_applied`）
  - 对每个教训：`_verifyLesson(lesson)` → 扫描 src 代码（category/tags 关键词）→ 命中 markApplied / 未命中记录待办
- `runHealthCheck()`：
  - pending 积压 > 阈值 → 报告
  - actions 中 manual-required 积压 → 报告
  - 记忆/教训统计 → 报告异常
- `_recordAction(action)`：追加 actions.json（去重）
- `startAutoLoop(intervalMs)` / `stopAutoLoop()`：定时
- `_scanSrcFor(pattern)`：递归扫描 src 找关键词（限核心目录，限制文件数）

### 2. `server/index.js` 接入
- 启动时 `new ProactiveTaskEngine().startAutoLoop(30 * 60 * 1000)` + 首次 runTasks
- shutdown 时 stopAutoLoop

### 3. 复用
- LessonLibrary: `markApplied`（已标记）
- actions.json: 行动日志（已有 _recordAction 逻辑，复制/共享）

## 风险边界（保守）

- **教训验证只读**：扫描验证 + 标记，不自动改代码
- **自动修复不属引擎范围**：由 SelfCodeImprover 扫描驱动（问题驱动），引擎不触教训自动改代码
- **去重**：同类型+文件+结果的行动不重复记录（防循环噪音）
- **限流**：扫描限核心目录 + 文件数上限（防性能问题）
- 单任务失败不中断其他任务

## 数据流

定时触发 → 查 active 教训 / 健康指标 → 验证/检查 → markApplied + 行动日志 → 可审计

## 诚实局限

- 教训验证是**启发式**（自然语言文本无法精确映射代码），"已体现"判断基于关键词扫描，可能误判；标记来源标注为 `heuristic`
- 引擎只做**只读验证 + 标记 + 报告**，不自动改代码

## 测试

- 教训验证：已体现→markApplied / 未体现→待办
- 健康巡检：积压→报告 / 健康→无噪音
- 去重、空路径、startAutoLoop/stopAutoLoop
- 单任务失败隔离

## 验收标准

1. `runTasks()` 后：已体现教训 markApplied，未体现记录待办
2. 健康异常主动写入行动日志，健康时无噪音
3. 引擎不自动改代码（验证只读）
4. 全量测试无回归，ESLint 0/0