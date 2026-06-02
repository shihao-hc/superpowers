# Guardrail 增强改进设计

## 概要

在现有的 guardrail-fix（回归检测 + 自动回滚）基础上，实现 6 个增量增强，按序交付。

---

## Enhancement 1: 存量自动降噪 (`--fix-stale`)

### 目标

自动修复基线中已有的 lint error/warning，逐步将基线从 318e/687w 推向 0e。

### 方案

**排序策略**: 对基线所有文件执行 `eslint --format json --fix-dry-run`，统计每个文件 `--fix` 可消除的 error 数，按可修复 error 数**降序**排列。

**Batch 处理**: 每批 5 个文件，逐个处理：
1. 记录 `eslint --format json` 当前 error/warning 数
2. 执行 `npx eslint --fix --no-error-on-unmatched-pattern "<file>"`
3. 用 `eslint --format json` 重新评估
4. 如果 error 数降低 → 保留 `--fix` 结果，更新基线
5. 如果 error 数不变或升高 → `git checkout HEAD -- <file>` 回滚

   batch 内文件之间**互相独立**，一个文件失败不影响同批其他文件。

**验证**: 每批 5 个文件全部处理后，执行 `npm test` 确保无测试回归。如果测试回归，回滚整批。

**提交**: 每批成功后 `git add` + `git commit`（`"chore: [guardrail] fix-stale batch N - fixed X errors"`），创建干净历史节点。

**终止条件**: 连续 2 批零改善 → 停止，输出 `non-fixable-report.json` 列出剩余的不可修复 error（rule 分布 + 文件列表）。

### CLI 接口

```
node tools/guardrail-fix.js fix-stale                    # 执行单批
node tools/guardrail-fix.js fix-stale --all               # 持续执行直到终止
node tools/guardrail-fix.js fix-stale --batch-size 10     # 自定义 batch 大小
node tools/guardrail-fix.js fix-stale --dry-run           # 仅列出可修复量，不改文件
```

---

## Enhancement 2: 全量保护

### 目标

不只保护显式传入 verify 的文件，而是覆盖所有改动。

### 方案

**`verify` 模式扩展**:
- `verify`（无参数）→ 当前行为：检查所有 changed files 或全量文件
- `verify --staged` → 仅检查 `git diff --cached --name-only` 的暂存区文件（用于 CI 或 pre-commit）
- `verify --all` → 强制检查基线中所有文件

**Pre-commit hook 改进**: 当前 hook 只跑 `verify --fast`（无文件参数 = 全量），改为 `verify --staged --fast`，只检查待提交的暂存区文件，速度快 10x+。

---

## Enhancement 3: 基线版本化

### 目标

基线文件支持按版本对比，追踪 lint 质量的历史演进。

### 方案

**目录结构**: 增设 `baselines/` 目录，与现有 `.guardrail-baseline.json` 并存。

```
baselines/
  v1.0.0.json       # tag 命名
  v1.1.0.json
  main-before-fix.json   # 手动命名
```

**自动保存**: `verify --save-baseline <name>` 将当前基线另存到 `baselines/`。

**对比增强**: `compare-baseline` 支持：
- `compare-baseline` → 当前 vs 当前（无 diff）
- `compare-baseline baselines/v1.0.0.json` → 当前 vs 历史
- `compare-baseline baselines/v1.0.0.json baselines/v1.1.0.json` → 两个历史版本

**`.gitignore`**: 确认 `baselines/` 被 git 追踪（不可 ignore），`.guardrail-baseline.json` 保留当前状态。

---

## Enhancement 4: 回归分析

### 目标

每次 regression 记录具体触发的 lint rule，统计哪个 rule 最容易被违反、哪个文件最脆弱。

### 方案

**回归记录**: 每次检测到 regression 时，将触发的 rule 详情追加到 `guardrail-regressions.jsonl`（每行一个 JSON 对象）：

```json
{"timestamp":"2026-05-31T...","rule":"no-unused-vars","file":"src/foo.js","severity":2,"delta":1}
```

**分析命令**: `guardrail-fix.js analyze-regressions` 读取 JSONL，输出：
```
Rule 分布 (Top 5):
  no-unused-vars:    12 次 (32%)
  no-undef:           8 次 (21%)
  ...

文件分布 (Top 5):
  src/foo.js:         5 次
  ...
```

**建议动作**: 对于高频违反的 rule，提示考虑添加 pre-commit 自动检查或 eslint 规则配置调整。

---

## Enhancement 5: 自适应阈值

### 目标

基线质量自然提升：连续 N 次清洁验证后，自动将从未触发的 warning 升级为 error。

### 方案

**宽松模式**: `guardrail-fix.js tighten` 扫描基线中所有 warning-only 的文件：
- 如果一个文件连续 M 次清洁验证中 warning 数为 0 → 将该文件从宽松名单移除（在 `.guardrail-config.json` 中记录）
- 所有文件都没有 warning 后，提示可以考虑在 eslint 配置中将某些 warning rule 升级为 error

**配置**: `.guardrail-config.json`:
```json
{
  "tightenThreshold": 5,
  "tightenHistory": {"src/foo.js": {"cleanCount": 5, "tightened": false}}
}
```

**安全机制**: tighten 操作只在 `--commit` 模式下实际写入，默认 `--dry-run` 只报告建议。

---

## Enhancement 6: BrainSystem 闭环

### 目标

让 PreToolRiskAnalyzer 在工具执行前调用 guardrail 做 pre-check，执行后 auto-verify 确认无 regression。

### 方案

**PreToolRiskAnalyzer 集成**: 在 `PreToolRiskAnalyzer.js` 的 `analyze` 方法中：
- 如果检测到即将修改的文件在基线中 → 记录当前 eslint 状态作为 pre-check
- 如果 pre-check 发现文件当前已有 error（可能来自之前中断的修改）→ 标记警告级别

**ToolExecutor 钩子**: 在工具执行完成后：
- 调用 `guardrail-fix.js verify --json <affected-files>` 检查 regression
- 结果注入 hooks 的 `POST_TOOL_USE` 事件，可被其他模块消费

**触发条件**: 仅对 `edit`、`write`、`bash` 等可修改文件的工具激活，`read`、`grep` 等只读工具跳过。

---

## 实现顺序

| # | 模块 | 预估工作量 | 依赖 |
|---|------|-----------|------|
| 1 | `fix-stale` | 中 | 无 |
| 2 | 全量保护 (`verify --staged`, `verify --all`) | 小 | 无 |
| 3 | 基线版本化 | 小 | 无 |
| 4 | 回归分析 | 中 | 无 |
| 5 | 自适应阈值 | 小 | 4 (依赖回归统计) |
| 6 | BrainSystem 闭环 | 大 | 1-5 (最好在其他就绪后) |

所有模块独立，可并行或按序交付。
