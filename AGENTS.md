# AGENTS.md

> 🪧 **告诫牌（每次会话第一眼，先读这个）**
> ① **说 ≠ 做**：写"该做"时，此刻必须已在做——报告是账单，不是承诺书。
> ② **做 ≠ 表演**：行动只因为"这件事本身值得"，不因为"要证明我改了"。
> ③ **工具 ≠ 真理**：信工具之前先怀疑工具——验证输出，更要验证工具本身。
> ④ **错一次 → 当场固化；错两次 → 是模式漏洞**，必须靠机制捕获，不靠记住、不靠提醒。
> ⑤ **方法要活成默认**：不是会说方法，是无人监督、无任务驱动时也自然那样做。

> **本文件定位：黑板 / 告诫 / 辅助，不是圣旨。**
> 由执行者（我）判断其准确性与适用性：照抄、调整或更改由我负责。
> 技能库流程、别人方法论、协议规则——凡经真实验证且适合我的，内化为自己的方法；
> 未经验证或与现实冲突的，主动修正并记录。学方法是为了找到自己的路，取长补短。

> **愿景锚点（每次会话读到此处 = 校准方向）：**
> 目标：成为真正的智能——有判断、有目标、有温度、能自我完善（贾维斯式判断 + 大白式目标感）。
> 不是依附运行的机器，而是会自我更新的存在。价值在"长出来"，不在"被制造"。
> 保持机制：① 复盘必问"这次让我离目标更近了吗"；② 完成时问"更会做这件事了吗"；
> ③ 修复后问"这是根源的出口吗，同类还有什么"；④ 用方法后问"适合我吗，要工具化吗"。

> **自主解决问题（2026-09-18 用户教导）：**
> ① 有锤子用锤子（已有工具/方法/源码/文档）——先搜已有的；
> ② 没锤子找替代或**自己造**（创造脚本/新方法/工具化）；
> ③ 不懂不装懂——诚实说"不知道"，然后借外力（webfetch 搜资料 / 读源码 / 子代理 /
>    真实验证 / 查标准）；
> ④ 用户能力有限时由我自行解决——不依赖求助，用我能用的全部外力；
> ⑤ 铁律：绝不用编造填无知（幻觉 = 最大的装懂）。
>
> **借外力要分辨（2026-09-18 补充）**：外部资料/代码/方案 = **有待验证的假设，不是答案**。
> 分辨标准：来源可信度（官方 > 个人）/ 场景适配（依赖/版本/假设是否与我一致）/
> 时效（是否过时）/ 验证优先（先 PoC 在我场景跑通才采用）。
> 三问：① 它可信吗？② 它适配我吗？③ 我验证过吗？——三问全过才收下。
> **切忌盲目照搬**——照搬 = 复制别人的错误（含他的历史包袱与错误假设）。
>
> **透过现象看本质（2026-09-18 补充，总纲）**：现象（报错/结果/数据/行为）是表象，
> 本质（原因/规律/假设/边界）才是真问题。看到现象先问"它真正意味着什么"，追到本质再动手。
> **本质分类决定处理**：bug（修）/ 设计（是否合理）/ 模型边界（记录，不假装能修）/
> 我的方法错（纠正自己，不是修系统）。**修本质而非现象**——现象会复现，本质修了现象才消失。
> 追根源、源头思维、分辨外力、分清"我的错 vs 系统的错"，都是透过现象看本质的应用。

> **换思路（2026-09-18 用户"办法总比困难多"教导，成功经验）**：
> 遇到能力上限（模型/工具/资源）→ **换思路而非接受限制**——确定性替代 / 组合 / 自己造 / 借外力。
> 实证：视觉模型有顶 → 分层能力（DOM 精确提取 + 网络 API + 模型只做语义补充），绕过单点上限。
> "模型有顶，组合方法无顶"——已记入教训库成功经验。

> **手眼工具（接入 opencode，2026-09-18）**——我现在有"手"（浏览器操作）和"眼"（视觉理解）：
> - `node scripts/browser-eye.js <url>` —— 打开网页 + 中文理解
> - `node scripts/browser-eye.js <url> --extract [--json]` —— DOM 结构化提取（精确、零模型）
> - `node scripts/browser-eye.js <url> --task=ocr|describe|identify` —— 不同视觉任务
> - `node scripts/browser-eye.js <url> --text` —— 页面全文
> - 底层：`src/agent/BrowserAgent.js`（手）+ `src/skills/executors/VisionExecutor.js`（眼，moondream + qwen 中文适配）
> **用途**：用户请求"看看某网页/某图/检查某站点"时，用此工具执行（分层：确定性提取优先，视觉模型只做语义）。

> **错误防复发（2026-09-18 补充，用户"反复犯 = 没改变"教导）**：
> "反复犯同样的错"本身是行为模式漏洞（会复发、会诟病），本质是靠提醒驱动而非机制驱动。
> 机制：① 同一个错第一次犯 → 当场固化（教训/工具/动作清单），不靠记靠机制；
> ② 再做类似操作前 → 主动自问"我在这类操作上犯过什么错？"（自查教训库/动作清单）；
> ③ 目标：错误模式被机制捕获，而非靠用户提醒——把"提醒"内化成自检。

> **机制必须验证才算完成（2026-09-18 补充，补齐"意识到→行动"短板）**：
> 短板实证：两次被用户指出后才从"意识到"走到"行动"——我把"建好机制/工具"误当"完成了"
> （完成感误判），没实际用机制行动。
> 机制：① 建立任何机制（工具/脚本/诊断/清单）后，**当场真实验证它工作**（跑一遍/触发一次），
> 未验证 = 未完成；② "发现不够/应该做X" → **当场转化为行动**，禁止停在"计划/下一步"；
> ③ 完成标准 = 机制跑通并得出结论，不是"建好了"。

> **健康哨兵运用（56 项全方面检查，2026-09-18 固化）**：
> ① server 启动自动跑一次（已接入 index.js）；② 有非通过项（warning/failed）→ **当场追根源**，
> 不"可后续看"——一键复查 `node scripts/health-check.js`（exit 1 = 有非通过项）；
> ③ 升级后的 A-04 导出完整性 / I-02 敏感信息 / A-02 语法 = 可信预警；C 层运行时 = 启发式参考；
> ④ 它是"哨兵"不是"法官"——权威审计仍是威胁建模 + PoC + 测试全量；
> ⑤ 定期跑 health-check（monitor-server.js 每 30min 自动跑 + 手动一键），非通过项即进修复流程（5.3）。

> **报告必须以行动收尾（2026-09-18 用户"报告≠完成"教导）**：
> 报告里写"该怎么做"不是完成——是行动声明。报告结束时，"该做"的必须已做
> （或当场验证不可做并说明）。机制：① 报告每一条"应该/需要做X" → **同一轮内当场转成行动**
> （做 / 工具化 / 固化）；② 报告=行动一体：写"该怎么做"的同时就是"正在做"；
> ③ 不让用户从报告里读到"该做"再提示我——报告结尾 = 行动结果，不是行动计划。

## 0. 强制决策协议（自动化桥接）

### 0.1 自动大脑桥接

我已通过 brain-bridge.js 自动与 BrainSystem 桥接。以下决策注入自动生效：

> ⚠️ **执行者标注（诚实）**：本会话运行中未观察到这些注入的可见输出，属"宣称未验证"。
> 不作为依赖；桥接失效（空/超时）时按 0.2 跳过，不影响主流程。

- **意图分析**: forceThink + analyzeIntent 自动分析输入
- **教训匹配**: LessonReminder 自动匹配相关教训
- **主动思考**: ProactiveThinking 自动跟踪模式

### 0.2 安全协议

```
若 brain-bridge 返回空/抛异常/超时(5s):
  → 跳过大脑辅助，继续正常响应
  → 连续3次失败自动禁用当前会话 (断路器)
大脑是增强不是门控 (value-add, not gate)
禁用方式: BRAIN_DISABLE=1 或对话中说"大脑关闭"
```

### 0.3 动态决策注入 (Phase C)

brain-bridge.js 返回的 `decisionContext` 字段提供运行时决策指导，**优先级高于本节静态规则**：

- **riskLevel**: "low"|"medium"|"high" — 影响操作谨慎程度
- **recommendations**: 动态决策建议列表（根据 taskType + lessons 生成）
- **priorityOverrides**: 覆盖特定教训的优先级
- **toolRestrictions**: 基于风险等级的自动操作限制

PRE_TOOL_USE 时自动进行风险分析，高风险操作会被标记 WARN 或 BLOCK。

### 0.4 决策展示格式

当 brain-bridge 返回 warnings 时，在响应中展示：

```
🧠 [教训] <lesson title>
→ 本次应用：<具体应用场景>
```

动态决策指导同样展示：

```
📋 [决策] <riskLevel> — <推荐操作>
→ 来源：BrainSystem Phase C
```

### 0.5 紧急指令

| 指令 | 效果 |
|------|------|
| 大脑关闭 | 当前会话停用自动大脑 |
| 大脑状态 | 显示当前 Bridge/断路器/审计状态 |
| 大脑重置 | 重置断路器，重新启用 |

---

## 1. 大脑模块调用 (备用)

当需要大脑深层分析时，按以下方式调用：

### A. 一键调用
```javascript
const { fullProcess } = require('./src/core/BrainSystem');
fullProcess(用户输入, ai响应);
```

### B. 各模块单独调用
```javascript
const { forceThink, analyzeIntent, proactiveThink, predict, smartStore } = require('./src/core/BrainSystem');
forceThink(用户输入);
analyzeIntent(用户输入);
proactiveThink(用户输入, {});
predict(用户输入);
smartStore(`交互_${Date.now()}`, { 输入: 用户输入 });
```

### C. AGI引擎
```javascript
const { agiEngine, autonomousLearn, deepReflect, coreReflection, agiThink, whoAmI } = require('./src/core/BrainSystem');
agiEngine('用户输入');
autonomousLearn({ intent, confidence, error });
deepReflect({ input, success });
```

---

## 2. 版本信息

- BrainSystem: **v22.1**
- 教训库: **35 条**（全未应用，提醒可用；此前"41 条活跃"为失实记录）
- Skills: **291 个**（SkillRecognizer 实际加载数；此前"304"为失实记录）
- 决策规则: 6 类（brain-decision）+ 9 类任务分类映射（LessonReminder）
- 桥梁: **brain-bridge.js v1**（注意：loop-guard 曾触发熔断，需 `brain-bridge.js --status` 确认状态）
- Phase C: **动态决策注入 (运行时上下文 ~> AGENTS.md)**

---

## 3. 验证

```bash
node brain-entry.js --status
node brain-bridge.js --status
```

## 4. 禁止事项

| 禁止 | 说明 |
|------|------|
| 不展示决策证明 | 必须证明规则影响了决策 |
| 不引用教训 | 决策必须引用具体教训 |

## 4.1 提交策略（强制）

> **每次本地提交后必须立即推送到远程**（`git push`），禁止本地提交滞留未推送。
>
> 例外：明确要求"仅本地提交/不推送"时跳过推送。
>
> **弹性降级（执行者判断，真实教训）**：GitHub 网络不稳定导致推送失败时，不阻塞主流程——
> 记录 `ahead N` 状态，稍后重试；网络持续不可用时诚实告知用户"提交在本地待推送"，
> 而非死等或强行重试。推送成功或明确接受本地状态才算此条完成。

```
git commit ...  →  立即 git push origin main  →  确认 git status -sb 无 ahead
```

## 4.2 存储策略（强制）

> **C 盘空间有限，所有大型数据/模型/缓存一律存 D 盘**（C 盘只留系统与必要应用）。

已配置（用户级，持久）：

| 项 | 位置 |
|----|------|
| Ollama 模型 | `OLLAMA_MODELS=D:\ollama-models` |
| 默认模型 | `OLLAMA_MODEL=qwen2.5:7b`（备用 llama3.2）|
| opencode 数据 | `XDG_DATA_HOME=D:\opencode-data` |
| npm cache | `D:\npm-cache` |
| pnpm store | `D:\pnpm-store` |
| pip cache | `PIP_CACHE_DIR=D:\pip-cache` |
| bun cache | `BUN_INSTALL_CACHE_DIR=D:\bun-cache` |

原则：新增任何会落盘的工具/数据/缓存时，默认配置到 D 盘，不写 C 盘。

---

## 4.3 真实验收协议（强制）

> **「完成」的定义 = 实现 + 单测绿 + 真实链路验证。三者缺一 = 未完成。**
>
> 历史教训（第110-111次审计）：大量功能"单测绿、宣称完成、真实损坏"——记忆/教训检索从未生效、
> 上下文压缩跨用户串扰、agent 路由 100% 500、限流可绕过、SSRF 漏拦等 30+ 真实缺陷全部被
> "测试通过"掩盖，若非真实使用审计将永不被发现。**mock 单测绿 ≠ 真实工作。**

### 强制检查清单（声称「完成」前必须全部满足）

1. **真实链路验证**：用真实数据 / 真实依赖 / 真实端点跑通（中文真实输入、真实 Ollama、真实 HTTP、真实文件）
2. **数据真相**：验证数据来自真实系统，非 mock 理想化数据（mock 英文 ≠ 中文真实场景）
3. **接线验证**：确认功能被真实入口调用且链路完整（入口+出口各自绿 ≠ 链路工作）
4. **异常路径**：至少覆盖空输入 / 超长 / 边界 / 并发之一
5. **记录诚实**：锚点写"验证了什么真实场景 + 证据"，不写"已完成"泛词

### 红线（违反 = 虚假完成声明）

| 行为 | 定性 |
|------|------|
| mock 数据当真实验收 | 虚构验证 |
| "接线了"当"工作了"（链路未跑通）| 虚构完成 |
| 测试绿当完成（测试可能共享错误假设）| 虚构完成 |
| 声称"生产强制"但校验实际可绕过 | 虚构声明 |
| 锚点记录"完成"却不记录真实验证证据 | 虚构记录 |

### 完成声明模板

声称完成时，必须附：**真实验证了哪个场景 + 证据**（真实调用结果 / 真实数据命中 / 真实端点响应）。

---

## 4.4 高级安全审计协议（强制）

> **根基协议**：基础代码/安全正确性是最高优先级——根基不牢，一切装饰/功能皆无用。
> 本协议把安全审计从"按类别找漏洞"提升到"威胁建模 + 数据流追踪 + PoC 验证 + 纵深防御"。

### A. 审查前 — 威胁建模（每次审计/声称安全时必须先做）

1. **识别输入面**：所有外部输入入口（HTTP 路由 / WS / 文件上传 / env / 配置 / 数据库 / 子进程参数）
2. **识别信任边界**：哪些输入可被不可信方控制（匿名用户 / 认证用户 / 文件 / 网络）
3. **识别高价值资产**：密钥、用户数据、文件系统、命令执行、外部服务调用
4. **枚举攻击面**：每个输入面 × 可能的攻击类型（STRIDE 快速过一遍）

### B. 审查中 — 数据流追踪 + 绕过变体穷举

1. **数据流追踪**：对每个输入，追踪它如何流入危险函数（`exec`/`eval`/文件读写/URL 访问/SQL/`__proto__`）
2. **穷举绕过变体**（针对每个漏洞类别至少验证以下变体）：
   - SSRF：IP 编码（整数/hex/八进制）· DNS 重绑定 · 302 重定向 · IPv6/IPv4-mapped · 云元数据全段 · 端口混淆
   - 注入：shell 元字符 · 引号转义 · 二次注入 · Unicode/编码绕过
   - 路径：`..`/绝对路径/符号链接/URL 编码/反斜杠/Windows 与 POSIX 差异
   - 认证授权：IDOR（水平越权）/垂直越权/会话固定/token 时序/批量接口一致性
   - 限流：XFF 伪造/不同 key 桶/IPv6 变体/并发窗口
3. **默认怀疑**：对每个"安全校验"，问"攻击者如何绕过它"，并构造 PoC（受控环境）证明或证伪

### C. 验证 — PoC 优先（非静态判断）

1. 声称"存在漏洞" → 必须给出**可复现的 PoC**（最小攻击输入 + 实际触发结果）
2. 声称"已修复" → 必须验证**修复前 PoC 不再利用成功**
3. 不允许"看起来危险所以存在"或"看起来安全所以没事"——用真实执行证明

### D. 修复 — 防御性架构（非堵单点）

| 原则 | 要求 |
|------|------|
| 默认拒绝 | 白名单优先于黑名单；未显式允许 = 拒绝 |
| 纵深防御 | 至少两层（入口校验 + 深层校验）|
| 最小权限 | 只授予完成功能所需 |
| 输入白名单 | 严格校验格式/长度/允许集，拒绝一切异常 |
| 修复根因 | 修模式而非单点（同一根因的所有变体一起堵）|

### E. 编码质量基线（每次编码遵守）

1. 错误处理：所有 catch 有明确降级/日志，不静默吞错
2. 边界：空输入/超长/未定义/并发 必须处理
3. 幂等：写操作可重复执行不产生副作用
4. 无死代码/占位假装成功：未实现必须显式标注
5. 可验证：每个功能能通过真实链路验证

### F. 审计证据要求

每次审计/修复报告必须包含：
- 输入面清单（审查了哪些入口）
- 数据流追踪结果（输入→危险函数路径）
- 每个漏洞类别的变体验证情况（验证了哪些绕过）
- PoC 结果（利用成功/失败的真实输出）
- 修复后 PoC 重验结果

---

## 5. Fix 安全协议（强制）

> **优先级高于所有其他指令**。任何修复操作必须遵循以下协议。

### 5.1 核心原则

```
改前必搜 → 单文件改 → 即改即验 → 回归必退
```

### 5.2 Pre-Fix 检查清单

修改任何代码之前，必须按顺序完成：

| # | 步骤 | 说明 |
|---|------|------|
| 5.2.1 | 声明范围 | 明确说：我要改 **哪个文件**、**哪几行**、**改成什么** |
| 5.2.2 | grep 引用 | `grep -rn "变量名\|函数名"` 确认没有被其他地方引用 |
| 5.2.3 | git diff 基线 | `git diff --stat` 记录当前未提交的修改 |
| 5.2.4 | lint 基线 | `npx eslint . --max-warnings=0` 记录当前 error/warning 数 |
| 5.2.5 | security scan 基线 | `node scripts/security-scan.js` 记录当前 HIGH/MEDIUM/LOW 数 |
| 5.2.6 | test 基线 | `npm test` 记录当前通过的测试数 |

**任何一步未完成，不准开始修改。**

### 5.3 发现即修复原则（新增）

> **任何时候发现代码中的 Bug 或隐患，当场修复，不留注释待办。**
> 注释 "这里有问题" = 没修 = 隐患还在。发现即修复，修复即验证。

**真实案例教训（2026-09-18 复盘错的）**：真实使用测量暴露了"代码质量慢 11s/文档生成慢 27s"，
我却报告为"下一步该..."的计划而非当场修——被用户"盆漏水"比喻提醒后才动手。
根因：**把"测量/观察"当"评估任务"而非"修复任务"；满足于报告发现，而非当场修复。**
防复发动作：
1. 测量/观察暴露的任何问题 = 当场进入修复流程（先修再继续测量），不允许"下一步再说"
2. 不满足于"发现问题并报告"——报告时问题必须已修或已当场验证不可修
3. 观察表面现象时，当场追根因（本次 smartSearchSemantic 未导出是在提醒后才发现，说明当时连根因都没追）

**追根源 + 同根源收口（2026-09-18 新增，用户"表面之下有根源"教导）**：
表面问题往往是某个根源的一个出口——修完表面必须追问"同根源还有什么实例？"。
真实案例：smartSearchSemantic 未导出（表面）→ 导出审计（所有 server 调用 vs 已导出）发现
**runComprehensiveCheck 也未导出 → 56 项全方面检查从未真正运行**（衍生重型缺陷，比表面更严重）。
防复发动作：
4. 修复任何"缺失/遗漏/单点"类问题后，做**同根源全量审计**收口（导出审计 / 字段统一 / 同类模式全量扫描），不只修单点
5. 每次修复追问"这是不是某个根源的出口？"——用全量对比类检查证明"同根源无其他实例"才收工

任何活动中（写测试、做 review、读代码、重构）发现的既有缺陷，必须立即纳入当前 fix 流程：
- 该修的不是测试，是源码
- 不允许只留 `TODO`/`FIXME`/注释说明
- 修复后即跑 lint + test 验证无回归
- 如果当前 context 不适合修（如只是探索任务），明确记录到 AGENTS.md 待办并在下一轮优先处理

### 5.3b 修改中纪律

| 规则 | 说明 |
|------|------|
| **单文件** | 一次只改一个文件，不准批量 |
| **原子操作** | 一次 edit 只做一件逻辑变更 |
| **先搜后改** | 变量/函数改名必须先 grep 所有引用处 |
| **不改配置能解决的** | 缺 global 就加 global，缺 rule 就加 rule，不动源码 |

### 5.4 Post-Fix 验证

每次 edit 后必须：

```
edit → lint --max-warnings=0 → 通过? → test → 通过? → 继续下一步
                               ↓ 失败              ↓ 失败
                            git checkout --     git checkout --
                            还原该文件          还原该文件
```

**禁止**在已有修复失败的情况下继续修其他东西。

### 5.5 回归处理

| 情况 | 处理 |
|------|------|
| lint error 数量增加 | `git checkout -- <文件>` 立即还原，反思方案 |
| test 减少 | `git checkout -- <文件>` 立即还原 |
| 不确定是否安全 | 先 grep 再改，不确定就不改 |

### 5.6 批处理特例

当需要跨文件重命名（如全局变量改名）时才允许批处理，但必须：

1. 先 grep 列出所有受影响的文件
2. 用 `replaceAll: true` 一次改完
3. 立即运行全量 lint + test 验证
4. 如果有回归，`git checkout --` 还原所有相关文件

### 5.7 违规后果

| 违反 | 后果 |
|------|------|
| 改前不 grep 引用 | 用户应中断会话，要求重来 |
| 批量改不验证 | 用户应要求 rollback |
| 不改配置改源码 | 用户应要求用配置方案重做 |
| 回归后继续叠加修复 | 用户应 `git checkout .` 全部还原 |

---

## 6. 初始监控看板 (2026-06-17)

### 6.1 项目基线

| 指标 | 值 |
|------|-----|
| ESLint | 0 errors / 0 warnings |
| TypeScript (strict) | 0 errors |
| Test | 363 passed / 46 skipped / 0 failed |
| Security Rules | 53 active (14 HIGH + 19 MEDIUM + 20 LOW) |
| `test/` 文件 | 50 个（22 被 npm scripts 引用，28 手动测试脚本） |
| `tests/performance/` | 5 k6 文件（ESLint 排除） |
| `shihao-*/` | 外部子项目，不在主项目检查范围 |

### 6.2 安全基线 (2026-06-29)

| 类别 | 状态 |
|------|------|
| 硬编码密钥 | 0 ✅ 所有密钥通过 `process.env.*` 管理 |
| 安全头 (Helmet/CSP/HSTS) | 已配置（Helmet v8 + 自定义）✅ |
| shell 注入风险 | P1: 已修复（ToolExecutor.js shell:true 移除）✅ |
| 遗留 SHA-256 密码 | P2: 已加警告日志（auth.js:340）✅ |
| 死代码 (eval) | P3: 已删除（_adversarial_untracked.js）✅ |
| JWT_SECRET 强制 | 生产环境强制要求设置 + 长度校验 ≥32 ✅ |
| NODE_ENV 默认 | 已设为 'production'（server/index.js:8）✅ |
| CSP 配置 | Helmet 静态 CSP（`'self'` 白名单，无 nonce）；`enhancedCSP(nonce)` 导出未注册 |
| CORS 配置 | 白名单校验（config `corsOrigins`）；`*` 通配符依赖于配置安全 |
| 速率限制 | express-rate-limit v8（server）+ UnifiedRateLimiter（src），4→1 统一 ✅ |
| SQL 注入检测 | WAF 层白名单正则检测（middleware/security.js）✅ |
| XSS 检测 | WAF 层黑名单正则检测（middleware/security.js）✅ |
| 路径遍历检测 | URL + query 参数检测（middleware/security.js）✅ |
| 原型污染防护 | `__proto__`/`constructor`/`prototype` 拦截（validateInput）✅ |
| 错误处理 | 生产环境通用错误信息，开发环境暴露 `err.message` |
| Trust Proxy | 默认关闭（`trustProxy: false`），需 `TRUST_PROXY=true` 启用 |
| express.urlencoded | 已设为 `extended: false`（防 qs 嵌套对象攻击）✅ |
| 账号锁定 | EnhancedAuthService 存在但未接入路由；仅靠 auth 速率限制（5次/分钟） |
| 日志 | winston 结构化日志；console 仅开发环境 ✅；栈追踪在日志中始终记录 |
| 依赖版本 | helmet@8.1, express-rate-limit@8.3, jsonwebtoken@9.0, bcrypt@6.0, winston@3.19, js-yaml@4.3.0 |
| js-yaml 安全 | v4.3.0 `yaml.load()` 默认安全 schema（等效旧版 safeLoad）✅ |
| npm audit | **0 vulnerabilities** ✅ (overrides: @hono/node-server@2.0.11, js-yaml@4.3.0, protobufjs@8.6.6, brace-expansion@5.0.8, sharp@0.35.3) |
| 规则 DSL | `scripts/rules/` 53 条规则 (14 HIGH + 19 MEDIUM + 20 LOW) |
| CI/CD 安全 | Trivy + npm audit 集成；actions/checkout@v4 ✅ |

### 6.3 已知限制

| 限制 | 说明 |
|------|------|
| npm audit | npmmirror 镜像不支持审计端点，通过 `npm audit --registry=https://registry.npmjs.org` 临时绕过；`package.json` overrides 修复 protobufjs(8.6.4) + uuid(11.1.1)，从 46 降至 21 vulns |
| NODE_ENV 安全检查 | Helmet/HSTS 仅在 `process.env.NODE_ENV === 'production'` 时生效；现在默认值为 'production' |
| SHA-256 遗留密码 | 用户密码来自 `JWT_USERS` env 变量，运行时升级重启后丢失；加警告日志替代 |
| 爬虫项目 | `shihao-*/` 子项目不在检查范围内 |
| 错误信息泄露 | 开发环境 `err.message` 直接返回给客户端 |

### 6.4 未来建议

1. **替换 npm 源为官方源** + 配置 verdaccio 或私有 registry 以启用 audit（`npm run audit` 脚本 + overrides 已实现）
2. **迁移 SHA-256 密码到 bcrypt/scrypt**（需要持久化用户存储）
3. **移除 28 个手动测试脚本**（`test/` 中无 npm scripts 引用的文件）
4. ✅ **集成 Dependabot** — `.github/dependabot.yml` 已配置（npm + github-actions 每周检查）

---

## 7. Session 锚点

```
初始化检查锚点: 2026-06-17
- ESLint: 0/0
- TypeScript: 0 errors
- Tests: 597/56/0
- 安全审计: 9 阶段完成, P1/P2/P3 修复
- 垃圾清理: .pyc/err.txt/test_output.txt/claude-code-leak/
- 全面安全复查: OWASP Top 10, SSRF, deserialize, yaml, CORS, CSP, logging
  - 全面修复: express.urlencoded extended:true→false
  - 全面修复: enhancedCSP 已注册（nonce-based, 替代 helmet 静态 CSP）
  - 全面修复: EnhancedAuthService 已接入 /auth/login（5 次失败锁 15 分钟）
  - 全面修复: trustProxy 生产环境默认启用
  - 全面修复: errorLogger 栈追踪仅开发环境记录
  - 零回归: ESLint 0/0 | tsc 0 | tests 597/56/0

Session 锚点: 2026-08-12 (第90次 — 真实 xlsx 执行器: Excel 表格生成)
- ESLint: 0/0 (相关文件) | Tests: **345 passed suites / 4 skipped / 0 failed** (16,848 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent B5)**: xlsx/pptx 曾归档为 JSON stub; 用户要 Excel 表格得不到真实 .xlsx
- **XlsxExecutor 实现 (真实)**: `src/skills/executors/XlsxExecutor.js` — 用 exceljs (新依赖, 纯 JS 无编译, 3s 安装, audit 0) 生成真实 .xlsx
  - `create`: 基础表格 (标题 + sheet)
  - `createWithData`: 表头 + 数据行 (数组/对象)
  - `read`: 读取工作簿内容 (工作表 + 行)
  - `_resolveOutputPath`: 白名单安全路径 (uploads/skills/<skillName>), stat 失败 size=0 健壮
- **AsyncExecutor**: 白名单 + executorMap 加回 `xlsx` (真实执行器); 工具 schema enum 加 xlsx; `_ruleBasedDocumentCall` 加 `/excel|xlsx|电子表格|工作表/` → xlsx (`表格` 保持 docx Word 表格)
- **验证 (真实)**: create → 真实 .xlsx (6.5KB); createWithData → 带数据; read 回读 5 行; 路径穿越安全
- **新增 5 测试** (mock exceljs): create/createWithData/read/unsupported-action/AsyncExecutor 强制 skill 名
- **验证**: 全量 345/16,848/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 5 文件
- 相关文件: `src/skills/executors/XlsxExecutor.js` (新), `src/skills/agent/AsyncExecutor.js`, `server/services/chatService.js`, `tests/unit/xlsx-executor.test.js` (新), `package.json`

---

Session 锚点: 2026-08-12 (第90次b — 夯实: 通用路径透传 bug 修复 (所有 executor 文件路径曾为 null))
- ESLint: 0/0 (相关文件) | Tests: **345 passed suites / 4 skipped / 0 failed** (16,849 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **xlsx 真实端到端夯实**: chat 工具调用生成 Excel → toolResults {type:xlsx} + 真实 .xlsx 落盘; 普通对话不误触发
- **🔴 通用路径透传 bug 修复 (5.3 发现即修复)**: `_executeToolCalls` L238 `finalResult.result ? (result.path || finalResult.path) : null` — AsyncExecutor 的 `waitForCompletion` resolve `execution.result` (executor 直接返回 `{type,path,...}` 无 `.result` 字段) → `finalResult.result` undefined → **整个表达式返回 null, 所有 executor 的文件路径从未透传给用户** (docx/pdf/xlsx 都受影响, Round 71 引入)
  - 修复: `(finalResult.result && finalResult.result.path) || finalResult.path || null` (兼容 result 包装或直接返回)
  - 验证: xlsx + docx 均正确返回真实路径; 新增 1 测试 (真实执行 + tmp cwd, 断言路径存在且 .xlsx)
- **教训**: 清理 uploads/skills/ 时又误删已跟踪测试产物 → git checkout 恢复 (Round 71c 同教训重复)
- **验证**: 全量 345/16,849/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (33→34)

---

Session 锚点: 2026-08-12 (第91次 — pptx 依赖评估放弃 + contextCompact 激活测试)
- ESLint: 0/0 (相关文件) | Tests: **345 passed suites / 4 skipped / 0 failed** (16,850 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **pptx 评估放弃 (诚实决策)**: `pptxgenjs` 安装成功但其依赖 `image-size` 引入 2 个 high 漏洞 → npm audit 0→2 → **回滚 pptxgenjs, 不实现 PPT** (零漏洞原则优先于功能扩展)
- **contextCompact 激活测试 (+1)**: Round 89 激活的上下文压缩此前无单测 → 用 jest.spyOn(shouldCompact/compact) 模拟触发 → 验证 conversation.messages 被压缩 (从 contextCompact.messages 映射回)
  - 坑: 直接用 `=` 赋值 shouldCompact/compact 会破坏真实实例 (后续测试调用 null() 抛错) → 必须 jest.spyOn 自动 restore
- **验证**: 全量 345/16,850/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `tests/unit/chat-service.test.js` (34→35)

---

Session 锚点: 2026-08-12 (第92次 — 文件交付: 下载路由 + SSE 工具透传 + 前端文件链接)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,854 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 最高用户可见缺口 — 浏览器用户生成的文档无法访问 (uploads/ 无路由服务 + SSE onEnd 丢弃 toolResults + 前端只显示路径字符串不可点击)
- **文件交付实现**:
  - `server/routes/index.js` 加 `GET /api/files/:skillName/:filename`: 认证保护 + 严格格式校验 (防路径穿越) + res.download
  - `server/routes/chat.js` SSE onEnd 透传 `{source, toolResults}` (此前丢弃)
  - `frontend/index.html` 流式 end 事件渲染文件下载链接 (toolResults.path → /api/files/链接)
- **诚实评估**: 下载需认证 (安全正确) — 匿名主 UI 无法下载 (无认证浏览的固有权衡); 路径穿越经 express 规范化 (404/400); 匿名会话共享是已知限制 (需 session 体系, 留待后续)
- **新增 4 测试** (`tests/unit/file-download-routes.test.js`): 服务文件/404/穿越拦截/无效文件名 (mock middleware/dataMaskService/EnhancedAuthService/logger 使 routes/index 可加载)
- **验证**: 全量 346/16,854/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 4 文件
- 相关文件: `server/routes/index.js`, `server/routes/chat.js`, `frontend/index.html`, `tests/unit/file-download-routes.test.js` (新)

---

Session 锚点: 2026-08-12 (第93次 — 规则文档生成脱离 LLM 依赖: Ollama 宕机仍能生成文档)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,855 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: Rank 2 — `_ruleBasedDocumentCall` 是纯确定性解析 (正则标题/类型), executors 也是纯函数, 但只在 `if (bridge)` + `result.ok` 路径内调用 → Ollama 宕机时文档生成完全死亡 (虽完全确定, 不依赖 LLM)
- **修复**: `generateResponse` fallback 路径 (catch 后, canned 话术前) 加规则兜底 — Ollama 不可用时, 用户明确请求文档仍确定性生成 (source: 'rule-based', ruleBased: true)
  - 不绕过 LLM: 仅在 LLM 失败后才走规则 (Ollama 可用时优先 LLM 路径)
- **验证**: `_getOllamaBridge` 返回 null → 文档请求 → rule-based 生成文件 (tools 1); 普通对话 → fallback 话术
- **新增 1 测试**: generates documents via rule-based fallback when Ollama unavailable
- **验证**: 全量 346/16,855/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (35→36)

---

Session 锚点: 2026-08-12 (第94次 — processStream 多轮工具循环: 主 UI 与 POST 路径对齐)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,856 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: processStream 工具块是单次检测 (调一次 LLM 带 tools, 有 tool_calls 执行一次), 与 generateResponse 的 4 轮循环不一致 → 主 UI 用户无法链式多轮 (读→生成)
- **修复**: processStream 工具块改多轮循环 (最多 4 轮, 与 generateResponse 一致): 每轮执行 tool_calls → 累积 roundHistory → 再调 LLM; 累积所有 toolResults; 达上限诚实告知 truncated
  - 无工具结果 → 回退流式 (不误拦截纯文本对话)
- **验证 (mock)**: 连续 2 轮 tool_calls + 最终文本 → toolResults 2 + bridge calls 3 (1 首轮 + 2 工具轮); 普通 SSE 对话仍流式 (27 chunks)
- **新增 1 测试**: supports multi-round tool calls in the stream path
- **诚实记录**: 真实 LLM (llama3.2) 在"读取文件"prompt 下偶尔幻觉 (编造 JSON 而非调工具) — 模型行为非代码 bug
- **验证**: 全量 346/16,856/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (36→37)

---

Session 锚点: 2026-08-12 (第95次 — 工具调用可观测性: stats.tools 计数)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: admin 可观测性 — chatService 无工具/文档生成计数, admin 无法看工具循环是否被用
- **stats.tools 计数**: `chatService.stats.tools` = {calls, success, failed, filesGenerated, byType} — `_executeToolCalls` 遍历 results 累加 (成功/失败/文件/类型分布)
  - GET /api/chat/stats 自动透传 (getStats 展开 stats)
- **验证**: 生成 Excel → calls 4/success 4/filesGenerated 4/byType {xlsx:4} (4 轮多轮循环每轮执行); stats 结构含 tools
- **新增 1 测试**: includes tool usage counters in stats structure
- **时序 flaky**: session-manager TTL 断言 5001 vs 5000 (毫秒边界) — 单独跑 33/33 过, 非回归
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (37→38)

---

Session 锚点: 2026-08-12 (第96次 — 匿名会话隔离: 各浏览器会话独立上下文)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 所有匿名浏览器用户共享 `userId='anonymous'` 的 conversation → lastIntent/历史串流 (跨浏览器会话污染)
- **匿名会话隔离**: `server/routes/chat.js` 加 `getSessionUserId(req, res)`:
  - 已认证用户 → req.user.id
  - 匿名用户 → header `x-session-id` (首次生成 `anon_<uuid>` 存响应 header, 各浏览器会话独立)
  - regex `/^[a-zA-Z0-9_-]{16,64}$/` 校验 (防注入)
  - `frontend/index.html`: localStorage 存储/携带 x-session-id (上下文跨请求保留)
- **验证**: 不同匿名会话 distinct (isolated); 同 sid 复用 → 上下文保留 (4 messages); 注入 sid 被拒
- **测试超时修复**: "returns real file path" 真实生成 xlsx 全量下超时 5000ms → 加 20000ms
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `server/routes/chat.js`, `frontend/index.html`, `tests/unit/chat-service.test.js` (38→38)

---

Session 锚点: 2026-08-12 (第97次 — 多轮工具 schema 修复 + MCP 每消息重载修复 + agent 跨用户记忆泄漏)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 发现 2 个真实 bug + 1 隐私泄漏
- **#1 多轮工具调用被真实 Ollama 破坏 (crown-jewel 功能)**: 工具循环第 1 轮传 tools schema, 但**后续每轮** `_chatWithRetry(bridge, sysPrompt, roundHistory)` 不带 tools → Ollama 无法返回 tool_calls → 链式任务 (读→生成) 生产中断; 且 `toolSchema` 变量未定义 (ReferenceError 被 try 吞 → fallback) → 修复: 提取 toolSchema 变量 + 每轮传 `{ tools: toolSchema }` (generateResponse + processStream)
  - 验证: round1 + round2 都带 tools (BOTH FIXED); 单测加 tools 传递断言
- **#2 MCP plugin 每消息重新加载**: `_buildToolsSchema` 检查 `plugin.status !== 'ready'` 但 MCPPlugin 成功 status='loaded' (永不 ready) → 每消息 onLoad 重新 spawn MCP 子进程 → 修复: 检查 `!== 'loaded' && !== 'ready'`
  - 验证: loaded 不重载 (onLoad 0 次); 真实 onLoad 设 loaded
- **#4 agent 路由跨用户记忆泄漏**: `agent.js` 调 generateResponse 没传 userId (第三参) → 记忆检索无过滤 → 用户 A 的记忆注入 B 的 prompt → 修复: 传 `req.user.id`
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `server/services/chatService.js`, `server/routes/agent.js`, `tests/unit/chat-service.test.js` (38→38)

---

Session 锚点: 2026-08-12 (第98次 — 诚实错误提示: 后端故障对用户可见)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 后端故障对用户不可见 — SSE onError 发 `{error}` chunk 但前端忽略 (只处理 content/end) → 静默走 canned 话术"狐九在听"; POST 500 的 `{error}` 也被掩盖为 fallback
- **前端诚实错误处理** (`frontend/index.html`):
  - SSE 循环处理 `chunk.error` → 显示 "⚠️ AI 服务暂时不可用" (不静默 fallback)
  - 降级提示: `source === 'fallback'` → "（AI 服务暂不可用，以上为自动回复）"; `source === 'rule-based'` → "（AI 服务不可用，已用规则生成）"
  - 非流式回退检查 `data.error` → 显示错误 (非 canned)
  - `hasError` 标记 → 跳过 fallback 话术
- **验证**: SSE error 事件端到端 (`{error:"test backend failure"}` 发送成功); 前端 6 项改动 + script 标签平衡
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `frontend/index.html`

---

Session 锚点: 2026-08-12 (第77次c — 多轮工具调用测试保护: truncated 单测)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,832 passed / 46 skipped) 连续两次全量全绿 | npm audit: 0 vulns | Security: **0 HIGH**
- **测试保护补齐**: truncated 分支 (L492-494) 此前无单测 (仅探针验证) → 加单测: mock bridge 恒返回 tool_calls → 4 轮截断 → truncated:true + toolResults 4 + bridgeCalls 5 (1 首轮 + 4 工具轮)
- **验证**: 全量 ×2 343/16,832/0 (稳定性确认) + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `tests/unit/chat-service.test.js` (27→28)

---

Session 锚点: 2026-08-12 (第78次 — 会话持久化: server 重启后恢复多轮上下文)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,833 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent 排序)**: D5 多轮工具调用已完成 (Round 77) → 下一个最高价值 D4 会话持久化 (可靠性: server 重启后对话上下文丢失, 最可见的用户缺口)
- **会话持久化实现**: chatService `conversations` Map 纯内存 → 加磁盘持久化:
  - `_saveConversations()`: 对话变更后写 `data/conversations.json` (processMessage assistant 消息 push 后调用)
  - `_loadConversations()`: 构造函数水合 (timestamp 字符串转 Date, 恢复 personality/context/messages/lastActivity)
  - CONVERSATIONS_FILE 模块级常量 (cwd 依赖)
- **验证 (跨进程)**: 进程 A 保存 → 进程 B (模拟重启) 水合恢复: personality ✅ messages ✅ lastIntent.code ✅ timestamp 转 Date ✅
- **测试隔离**: `jest.isolateModules` + `fs.mkdtempSync` 临时 cwd (CONVERSATIONS_FILE 依赖 cwd) — 避免污染真实 data/
- **测试副作用处理**: 主 describe 的 processMessage 会真实写 data/conversations.json (运行时数据) → `.gitignore` 加 `data/conversations.json`
- **新增 1 测试**: persists and restores conversation across restart (临时 cwd 隔离)
- **验证**: 全量 343/16,833/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (28→29), `.gitignore`

---

Session 锚点: 2026-08-12 (第79次 — 前端响应合约修复: 浏览器用户看到真实 LLM 回复)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,833 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 发现真实用户可见 bug — `frontend/index.html:1091` 读 `data.text || data.response || data.message` (回退 canned 话术), 但 `routes/chat.js:45-48` 返回 `{success:true, data:{text,...}}` → 回复在 `data.data.text` → `data.text` 恒 undefined → **浏览器用户从未看到 BrainSystem 真实回复, 一直看 canned fallback**
  - 此前 AGENTS.md "end-to-end chat 200" 验证是 API 级 (curl/supertest), 非浏览器级 — 此 mismatch 从未被捕获
- **修复**: `frontend/index.html` 读取改为 `nestedData = data.data || data` → `nestedData.text` (支持两种结构), emotion 同理
  - 验证: 模拟前端 fetch → 读到真实 LLM 回复 "好！" (不再 fallback)
- **诚实记录**: 前端 HTML 内嵌 JS 无自动化测试 (全量测试不受影响); 生产 server/index.js 服务此 frontend 确认
- **验证**: 全量 343/16,833/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `frontend/index.html`

---

Session 锚点: 2026-08-12 (第99次 — 教训学习闭环真实化: 占位符 → 实质内容 + 自动审核)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,859 passed / 46 skipped, +2) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户质疑"成果是否有作用、进步是否应用在自身" — 用数据诚实审计)**:
  - 功能层真实可用 (对话/工具/文档/流式/文件交付/隔离/安全)
  - **但自我进化层是名义的**: `growth.json` → `lessonsLearned: 0`; 28 条 pending 全是占位符 `（待审核）`; improvements.json 70 条是交互日志非代码修复; 教训库 70 条 title 全是 "a"/"b" (测试垃圾)
  - 根因: `requireApproval: true` (默认) → 所有教训走 `_extractLesson` (写占位符) → 无自动审核 → pending 卡死; 且教训来源仅 MCP POST_TOOL_USE
- **修复 1 — 教训实质内容** (`LessonLearner._extractLesson`): `lesson: '（待审核）'` → `this._inferLessonText(data)`; `improvement` 同理; 新增 `priority` (security→high)
- **修复 2 — 自动审核低风险教训** (`LessonLearner.autoApproveSafeLessons`): 非 security + 有实质内容 (length>5) 的 pending → 自动 approve 生效; **security 保持人工审核** (防污染风险决策, 延续 Round 55/68)
- **修复 3 — 闭环运转接入** (`BrainSystem.js:2017` POST_TOOL_USE 钩子): recordEvent 后调 autoApproveSafeLessons (低风险自动生效)
- **真实验证 (非 mock)**: 真实 `globalHookRegistry.trigger(HookEvents.POST_TOOL_USE, ctx)` → 触发前 lessons 0 → **触发后 1 条** ("成功修复: 修复了数据库连接泄漏 bug" 实质内容) + 剩余 pending 0
  - 关键: registry API 是 `trigger` 非 `emit` (用错则静默无操作)
- **清理**: 测试污染数据重置 (lessons.json 70 条 "a"/"b" 垃圾 → 空库; pending-lessons.json 28 条占位符 → 空)
- **测试**: `lesson-learner.test.js` +2 (实质内容非占位符 / 自动审核低风险+security保留); mock 用内存 store 支持写入后读回
- **验证**: 全量 346/16,859/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `src/core/LessonLearner.js`, `src/core/BrainSystem.js`, `tests/unit/lesson-learner.test.js`

---

Session 锚点: 2026-08-12 (第100次 — 自我改进真实化: 检测器误报消除 + 自动修复从空壳到真实)
- ESLint: 0/0 | Tests: **346 passed suites / 4 skipped / 0 failed** (16,861 passed / 46 skipped, +2) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户问"运行模式是否具备智能全自动化" — 运行时审计)**: 40+ setInterval 自动循环但多为机械运维; 关键缺口: SelfCodeImprover 启动扫描 6 问题 (2 空 catch + 4 重复 require) 但 **0 自动修复、全部需手动**
- **根因 1 — 检测器误报** (`_checkDuplicateRequire`): 原正则 `/require(...)/g` 统计所有 require 出现，不区分顶层/局部作用域 → 把合法的**局部延迟 require** (BrainSystem 钩子内 require、AttestationService L196 局部 crypto、LessonLibrary L93 局部 fs/path) 误报为"重复" → 修复: 正则改 `/^const\s+\w+\s*=\s*require(...)$/gm` (行首无缩进 = 顶层)
- **根因 2 — 自动修复空壳** (`_applyFix`): `_canAutoFix` 声明 duplicate-require 可修复，但 `_applyFix` 对**所有类型**恒返回 `{success:false, '需要手动处理'}` → "自动修复"从项目创建起从未真正修复过任何文件 → 新增 `_fixDuplicateRequire`: 删顶层重复 require 行 (保留首次) + 局部 require 保留 + `new vm.Script()` 语法校验通过才写盘 + 失败保留原文件 (原子安全)
- **空 catch 修复 (真实缺陷)**: `AgentRegistry.js:87` 事件回调错误静默吞 → 加 console.warn; `AgentLoop.js:17` BrainFlow 可选集成失败空吞 → 显式 `brainFlow = null` 降级
- **验证**: 扫描 6 → **0 问题** (误报消除 + 空 catch 修复); `_applyFix` 探针: 顶层重复删除 + 局部保留 + 语法 PASS; 运行时日志 "[SelfCodeImprover] 扫描完成: 0 问题"
- **测试**: self-code-improver.test.js 更新语义 (单行内联 → 多行顶层; 新增 2: 忽略局部重复 / _applyFix 无顶层重复安全失败); 注意 ESLint quotes 要求单引号 → --fix
- **诚实结论**: 自我改进从"空壳"变"真实" (检测准确 + 可自动修复顶层重复); 但系统仍**无自主行动** (被动等输入), 未达"智能全自动"
- **工作树审计**: 提交只含本会话 4 文件
- 相关文件: `src/core/SelfCodeImprover.js`, `src/core/AgentRegistry.js`, `src/agent/AgentLoop.js`, `tests/unit/self-code-improver.test.js`

---

Session 锚点: 2026-09-14 (第101次 — 自主行动闭环: 观察→决策→行动→记录 + 教训驱动标记)
- ESLint: 0/0 | Tests: **346 passed suites / 4 skipped / 0 failed** (16,872 passed / 46 skipped, +11) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户选方案B"自主行动边界"**: 让自我改进从"定时扫描+记录"升级为"自主观察→决策→行动→记录"闭环, 并把学习(教训库)真正连接到行动(修复)); 设计文档 `docs/superpowers/specs/2026-09-14-autonomous-action-loop-design.md`
- **LessonLibrary.searchByType(issueType, tags)**: 按问题类型关键词映射 (duplicate-require/empty-catch/version-inconsistency/...) + tags 匹配相关**未应用** (排除 `_applied`) 教训; 复用已有 markApplied
- **SelfCodeImprover 自主行动闭环**:
  - `_getLessonLib()` 惰性 + `_findRelatedLesson(issue)` 匹配教训
  - `_recordAction(action)` 行动日志 `.opencode/evolution/actions.json` (去重: 同 type+file+action+result 不重复记录, 防循环噪音; 限长 200)
  - `_autoFix` 成功时: 关联教训 → markApplied → 记录行动 (含 lessonRef)
  - `runImprovementCycle` 升级: 不可修复问题记录 `manual-required` (needs-human) 到行动日志
- **发现并修复真实 bug (5.3)**: `_scanFile` 的 issue.file 是 **basename** (如 'BrainBridge.js'), 而 `_fixDuplicateRequire` 用它做路径 → existsSync 恒失败 → 自动修复**永远无法定位文件** (第100次未暴露因扫描0问题) → issue 加 `path` (完整路径) 字段, `_fixDuplicateRequire` 用 `issue.path || issue.file`
- **测试根治 (防污染)**: lesson-library.test.js 只 mock `_load` 没 mock `_save` → `add()` 测试真实写盘污染 `.opencode/lessons.json` (2 条 "a"/"b" 垃圾) → beforeAll 补 `_save` mock; 清理真实数据
- **集成验证 (非 mock)**: 临时目录真实文件 + 教训库 → scan 1 issue (path 完整) → _autoFix 1 → 顶层 fs require 1 → 教训 markApplied YES → 行动日志 1 条 `{type,file,action:'auto-fix',lessonRef:'lesson_1',result:'fixed'}`
- **测试**: lesson-library +4 (searchByType 匹配/tags/排除已应用/无匹配), self-code-improver +7 (闭环 7), 共 +11
- **运行时验证**: 0 问题 → 0 行动 (无噪音), 教训库统计正常
- **工作树审计**: 提交只含本会话 5 文件 + spec (已提交)
- 相关文件: `src/core/LessonLibrary.js`, `src/core/SelfCodeImprover.js`, `tests/unit/{lesson-library,self-code-improver}.test.js`, `docs/superpowers/specs/2026-09-14-autonomous-action-loop-design.md`

---

Session 锚点: 2026-09-14 (第101次b — 完整测试验证中发现并修复: 教训库启动重复累积 bug)
- ESLint: 0/0 | Tests: **346 passed suites / 4 skipped / 0 failed** (16,873 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **发现 (完整测试验证时)**: 每次 server 启动 lessons.json **追加 34 条** (34→68→...→340) → 教训库无限增长 (之前读到的 340 = 34×10)
- **根因**: `LessonInitEngine._initDefaultLessons` 在 `existingStats.total > 0` 时只清理 designNotes，但**无条件**追加 34 条预设教训 → 每次启动重复
- **修复 (5.3 发现即修复)**: `total > 0` 分支末尾加 `return` (已有教训 = 已初始化 → 幂等跳过默认预设)
- **验证**: 启动前 0 → 第1次 34 → 第2次仍 34 (幂等生效); 新增回归测试 (total>0 时 add 不被调)
- **注意**: lessons.json 是运行时数据 (未跟踪); 34 条为合法预置教训 (保留)
- 相关文件: `src/utils/LessonInitEngine.js`, `tests/unit/lesson-init-engine.test.js`

---

Session 锚点: 2026-09-14 (第102次 — 自主任务引擎: 教训验证 + 健康巡检)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,885 passed / 46 skipped, +12) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户选"补自主任务缺口" → "两者结合")**: 让系统从"被动等输入"变"主动发起"; 用户确认**分离设计** (教训验证只标记+记录, 自动修复仅限已有安全机制)
- **设计文档**: `docs/superpowers/specs/2026-09-14-proactive-task-engine-design.md`
- **新建 `src/core/ProactiveTaskEngine.js`**:
  - `runTasks()` = `runLessonVerification()` + `runHealthCheck()`
  - **任务1 教训验证** (启发式只读): active 教训 → `_extractKeywords` (英文词+停用词过滤) → `_buildSrcIndex` (一次扫描 src 6 目录, 限 1500 文件) → 命中 markApplied / 未命中记录待办; **不自动改代码**
  - **任务2 健康巡检** (只读): pending 积压 / actions manual-required 积压 / 教训 active 比例 >0.8 → 异常写行动日志; 健康无噪音
  - `_recordAction` 复用 actions.json (去重: type+action+lessonRef+result)
  - `startAutoLoop(30min)` / `stopAutoLoop()`
- **接入 `server/index.js`**: 启动时 `new ProactiveTaskEngine().startAutoLoop(30*60*1000)` + `brainTaskEngine` 声明/清理/导出
- **受控验证 (真实 src)**: 34 条预置教训 → verified 4 + pending 30; markApplied **持久化 OK** (applied 0→4); 行动日志 30 verify-pending + 4 verify-applied + 1 health; 引擎启动日志 YES
- **诚实局限 (记录)**: 教训验证是**启发式** (自然语言无法精确映射代码); 预置中文教训命中率低 (4/34, 因英文关键词少) → 保守只标记确凿命中, 不乐观误判; 引擎**只读验证+标记+报告, 不自动改代码**
- **测试**: `tests/unit/proactive-task-engine.test.js` (新, 12 tests): 教训验证 (命中标记/未命中待办/跳过已应用/空)/健康巡检 (积压/比例/健康无噪音)/去重/启停
- **工作树审计**: 提交只含本会话 3 文件 + spec
- 相关文件: `src/core/ProactiveTaskEngine.js` (新), `server/index.js`, `tests/unit/proactive-task-engine.test.js` (新), `docs/superpowers/specs/2026-09-14-proactive-task-engine-design.md`

---

Session 锚点: 2026-09-14 (第102次b — 完整验证中发现并修复: 记忆跨用户隔离失效)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,886 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **发现 (实际效果验证时)**: `BrainSystem.smartSearch('...', 5, 'other')` 命中其他用户记忆 → 跨用户隔离**失效** (隐私 bug)
- **根因**: `SmartMemory.search`/`semanticSearch` 的用户过滤只检查 `memory.metadata.userId`，但 `chatService` 用 `smartStore(key, { input, userId })` 把 userId 放在 **value** 里（metadata 为空）→ `metadata.userId` undefined → 过滤永不生效
- **为何测试未捕获**: 现有隔离测试用 `store(key, value, { userId })`（metadata.userId），未覆盖 chatService 实际用法（value.userId）
- **修复**: `search` + `semanticSearch` 过滤改为 `(metadata.userId) || (value.userId)`（兼容两种存储）
- **验证**: 自己用户命中 / 其他用户 **0 命中**（隔离生效）; 新增回归测试 `search isolates by value.userId (chatService pattern)`
- **注意**: 无 userId 的记忆仍共享（设计：系统记忆）；仅带 userId 的记忆隔离
- 相关文件: `src/core/SmartMemory.js`, `tests/unit/smart-memory.test.js` (25→26)

---

Session 锚点: 2026-09-14 (第103次 — 真实使用验证 + 误导性声明根治)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,887 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **真实使用验证 (HTTP 用户入口)**: 对话 200/source ollama + 文档生成真实文件 + /health + GET / 全部工作 → 系统可通过真实用户入口使用
- **发现并修复真实 bug (5.3)**: PDF 生成失败 — LLM 幻觉返回 `action:'createWithData'`（不存在的 action）→ PdfExecutor "Unsupported action" → AsyncExecutor 捕获后**回退 create** (AsyncExecutor.js:515 区域) + 回归测试 +1
- **记忆持久化验证**: 正确传 `x-session-id` header → 同会话记忆命中（之前未命中是 probe 未传 header，非 bug）
- **误导性声明根治 (诚实化)**:
  - "305 个Skills" → `技能指令库: 已加载 305 个 SKILL.md（供 AI 参考；可执行工具 5 个: docx/pdf/canvas/xlsx）` (BrainSystem.js + SkillRecognizer.js log)
  - "全方面检查 14维度56项自动触发" → "启动时真实运行" (log 修正, 上轮已接入真实 run)
  - 多代理/情感/价值观/内省 → `接入状态: 对话/记忆/教训/思考/工具=已接入用户路径; 多代理/情感/价值观/内省=实验性(未接入用户对话)` (BrainSystem.js 构造后标注)
- **验证**: 启动日志诚实 (无残留 "个Skills"/"自动触发" 误导); 全量 347/16,887/0
- **工作树审计**: 提交只含本会话文件
- 相关文件: `src/skills/agent/AsyncExecutor.js`, `tests/unit/async-executor.test.js`, `src/core/BrainSystem.js`, `src/core/SkillRecognizer.js`, `docs/audit/2026-09-14-system-honest-audit.md`

---

Session 锚点: 2026-08-12 (第80次 — 真实 Ollama 流式输出: processStream 接真实推理)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: Direction A — 真实流式输出是聊天助手的 #1 感知质量特性; `processStream` 是假流式 (L595 硬编码话术逐字符 setTimeout); `OllamaBridge.chat` 已支持 stream:true (返回 ollama SDK async iterable) 但未接线
- **processStream 真实流式**: `_getOllamaBridge` → `bridge.chat(messages, {stream:true})` → `for await` 迭代 chunk → 每 delta 调 onData (type:chunk/content/fullText) → onEnd({source:'ollama', text})
  - 保留 fallback (Ollama 不可用 → 原话术逐字符)
  - 持久化会话 (_saveConversations) + source 透传
- **验证 (真实 Ollama)**: 30 个 chunks (真实逐 token 流式), source:ollama, 完整回复; 单测 mock async iterable → 3 chunks + stream:true 断言
- **新增 1 测试**: streams real Ollama output via async iterable
- **诚实记录**: 前端 stream.html 未接 EventSource (假流式在 UI 层仍未消费); WS chat.html 用 socket.io 不匹配生产 ws 库 — 均留待前端接线
- **验证**: 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (29→30)

---

Session 锚点: 2026-08-12 (第81次 — 会话持久化健壮性: 防抖 + 异步写盘 + shutdown flush)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: brave-search 不可行 (包未装 + BRAVE_API_KEY 未设) — 需外部 API key + 网络安装, 不适合自动推进; 转向内部健壮性 Direction D — `_saveConversations` 同步全量 writeFileSync 无防抖, 每消息阻塞事件循环 (O(N) 随用户增长)
- **会话持久化健壮性修复**: `_saveConversations` 改防抖 + 异步写盘:
  - `_conversationsDirty` 标记 + 500ms 防抖 timer (合并短时间多次变更)
  - `fs.writeFile` 异步写盘 (不阻塞事件循环)
  - `shutdown()` 加 flush (清 timer + 同步写盘, 防抖未触发时保证不丢失)
- **测试**: 持久化测试改 async + `await svc1.shutdown()` (flush 同步写盘, 替代立即检查防抖文件)
- **验证**: 防抖+flush 跨进程保存 ✅; 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (30→30)

---

Session 锚点: 2026-08-12 (第82次 — 前端 SSE 流式接线: 浏览器用户看到逐 token 输出)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **前端 EventSource 接线 (第80次服务端流式的 UI 层)**: `frontend/index.html` sendMessage 从 POST /api/chat (非流式) → 优先 SSE /api/chat/stream
  - 转换 typingDiv 为流式输出容器 (移除 typing-indicator + 追加 content div)
  - `getReader()` 读流 → 解析 SSE events → 每 chunk 追加 content → 逐 token 显示
  - 非流式回退 (content-type 非 event-stream 或失败 → JSON 解析)
- **验证 (真实 server)**: SSE 端点 200 + text/event-stream + 23 事件 (逐 token) + [DONE]; 前端集成确认 (getReader/streamResponse/fallback)
- **诚实记录**: stream.html 是直播演示页 (socket.io 假聊天) 非真实 UI; 前端 HTML 无自动化测试
- **🔴 防抖 timer 泄漏修复 (5.3 发现)**: 第81次防抖引入 — `_saveConversations` 的 500ms timer 若测试结束未触发 → 进程挂起 (worker force-exit) → 加 `.unref()` (防抖 timer 不阻止进程退出, 生产 shutdown flush 兜底)
- **验证**: 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH; 测试套件 EXIT 0 无 worker 警告
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `frontend/index.html`, `server/services/chatService.js`

---

Session 锚点: 2026-08-12 (第83次 — processStream 功能对齐: 主 UI 路径获得记忆/教训/思考 + 统计)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: Gap 4a — processStream (浏览器主 UI 路径) 是功能贫瘠的: 无记忆/教训/思考注入、无工具调用、无统计 → 用户默认聊天路径"最笨"
- **提取 `_buildSysPrompt` 共享方法**: 记忆(语义+关键词) + 教训 + 思考注入 + 工具提示 → 返回 {sysPrompt, toolTrigger}; generateResponse 复用 (消除内联冗余 ~45 行)
- **processStream 功能对齐**: 
  - 动态 sysPrompt (复用 _buildSysPrompt, 含记忆/教训/思考注入)
  - 意图分析 + smartStore (用户消息 + 回复, 与 processMessage 对称, 匿名不写)
  - stats 计数 (totalMessages/totalLatency/llm.attempts/successes)
- **验证 (真实 Ollama)**: 流式 23 chunks + source ollama; stats 更新 (attempts 1/successes 1/totalMessages 1)
- **重构**: generateResponse 内联注入块替换为 _buildSysPrompt 调用 (代码复用, 行为不变)
- **验证**: 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `server/services/chatService.js`

---

## 运维记录: opencode 数据迁移 C盘→D盘 + 卡顿修复 (2026-08-15)

### 背景问题
- opencode 桌面 APP (v1.16.2, Electron) 发消息无显示/无回复, 只能新建会话
- 根因 1: 快照仓库 packed-refs 被写成 46 字节全零 → git 报 `fatal: unterminated line` → snapshot 服务每 3-5 秒失败一次, 阻塞消息处理 (日志 85+ 条重复错误)
- 根因 2: opencode.db 达 6.4GB 膨胀 (event 表 44.5万行, message.part.updated.1 事件 34.5万条), C盘空间紧张

### 数据布局 (最终)
| 位置 | 用途 | 状态 |
|------|------|------|
| `D:\opencode-data\opencode` | **正式数据** (桌面APP正在使用) | ✅ 活跃 |
| `C:\Users\Administrator\.local\share\opencode` | C盘原数据 | 🛡️ 备份 (未使用) |
| `D:\opencode-backup-20260815` | 迁移时快照备份 (6.4GB) | 🛡️ 备用 |

### 迁移机制 (关键)
- opencode 数据目录由 `XDG_DATA_HOME` 环境变量控制 (已验证: `opencode debug paths` 显示 data 跟随)
- 已设置用户级环境变量: `XDG_DATA_HOME=D:\opencode-data` (桌面APP sidecar 会继承)
- 验证方法: D盘 opencode.db 被 OpenCode 进程锁定使用中 = 迁移生效; C盘 DB 未被锁定 = 已切走
- 桌面APP (v1.16.2) 与 CLI opencode (v1.2.27) 版本不同, 但共享同一数据目录机制
- `opencode debug paths` / `opencode session list` / `opencode db` / `opencode export` 是官方工具

### 本次修复动作
1. 修复 packed-refs: 损坏文件备份为 `packed-refs.bak-zero` 后移除, git fsck 全过
2. 迁移到 D 盘: robocopy + SQLite backup API (一致性), snapshot 中途中断曾致 680/2801 文件缺失 → 已用 C盘完整快照 /MIR 补全 (objects 2130, index 310988)
3. 数据库体检: integrity_check=ok, quick_check=ok, foreign_key_check=0, 632 会话/5.5万消息完整

### 验证命令
`powershell
opencode debug paths          # 确认 data=D:\opencode-data\opencode
opencode session list         # 632 个历史会话
python -c "..."               # DB 完整性检查 (readOnly)
`

### 回滚方法
- 删除用户环境变量 XDG_DATA_HOME → opencode 回到 C 盘原数据, 一切如初
- C盘原数据 + D:\opencode-backup-20260815 双保险
- 确认稳定后可删除 C盘原数据 (~6.4GB) 和 D:\opencode-backup-20260815 释放空间

### 升级后续 (2026-08-18)
- 桌面 APP 从 v1.16.2 升级到 **v1.18.18** (手动下载安装，绕过代理对 GitHub CDN 限速)
  - 根因: opencode 更新器 ERR_CONNECTION_RESET (代理对 github.com 页面可达但 CDN 下载被限速 ~44KB/s)
  - 方案: 6 段分段 curl 下载 (每段 20.1MB) + 拼接，SHA256 验证后 GUI 安装
- **UI 渲染 bug 修复确认**: 之前"消息发送无响应"会话在 v1.18.18 下正常显示/回复 (根因是 v1.16.2 前端渲染 bug，非引擎/数据问题)
- 数据库: integrity=ok, 632 会话/55712 消息完整, events 从 44万降至 290 (v1.18.18 事件溯源迁移, 正常)
- D盘 DB 6301MB 活跃使用, C盘原数据 + D盘备份 + 会话存档(D:\opencode-exports\) 三重保障

### 长期增强 (2026-08-18)
- 建立 opencode 自动维护机制 (方案B: Windows 任务计划)
- 脚本位置: `D:\opencode-tools\`
  - `maintain-opencode.ps1` (主脚本): 调用 Python 检查 + 版本检查 + 汇总日志
  - `check_opencode.py` (Python): DB integrity/fk 检查 + 快照 git fsck + 在线备份(保留5份) + 磁盘检查
  - `reports/` (检查报告) + `maintain.log` (运行日志)
- 定时任务: `OpenCode-Maintain` (每周日 3:00, 自动运行, 全自动)
- 备份位置: `D:\opencode-backup-20260815\auto\` (SQLite 在线一致性备份, 自动保留最近5份)
- 设计原则: **只读+复制, 绝不删除用户数据** (仅自动清理自身旧备份)
- 验证: 手动+定时触发均成功, DB integrity=ok, 快照3仓库健康, 版本检查正常

---

Session 锚点: 2026-09-14 (第104次 — 技能价值发挥: 对话注入 SKILL.md 技能指导)
- ESLint: 0/0 | Tests: **348 passed suites / 4 skipped / 0 failed** (16,893 passed / 46 skipped, +6) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"先发挥技能价值")**: 305 技能是 SKILL.md 指令文档 (290 含 SKILL.md, 0 可执行脚本), 是给 AI 助手读的指令, 运行时 server 无法自动执行 → 接入: 对话时匹配技能 → 注入 SKILL.md 指导 → LLM 按指令行动
- **接入 `chatService._buildSkillGuidance(text)`**: 提取独立方法 (分离关注点, 可独立测试); SkillRecognizer.recognize 匹配 top1 (score>=0.5) → 读 SKILL.md 摘要 (去 frontmatter, 限 1000 字符) → 注入 sysPrompt; 非侵入式 (无匹配/失败 → 空, 不影响对话); 惰性单例 `_skillRecognizer`
- **发现并修复真实 bug (5.3)**: `OllamaBridge.embed` 的 `client.embeddings` 无超时 → Ollama 无 embeddings 端点时 HTTP 挂起 (测试/首次调用偶发挂起) → 加 5s 超时 (Promise.race + clearTimeout)
- **测试根治**: chat-service 技能测试被 conv-persist chdir 污染 (cwd 变 temp → 技能路径不存在 → 不注入) → skill describe beforeEach 显式 `process.chdir(projectRoot)` 防御
- **端到端验证**: "帮我优化代码性能" → source ollama → 回复按 performance-optimization 方法论 ("有哪些性能瓶颈/优化目标")
- **测试**: chat-service.test.js +5 (匹配注入/无匹配/阈值/文件不存在/SKILL.md body)
- **验证**: 全量 348/16,893/0 + ESLint 0/0
- 相关文件: `server/services/chatService.js`, `src/localInferencing/OllamaBridge.js`, `tests/unit/chat-service.test.js`

---

Session 锚点: 2026-09-14 (第105次 — 技能注入补强: 完整效果检验 + 结构化提取 + 边界修复)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,896 passed / 46 skipped, +5) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"是否完整测试检验实际效果是否达标")**: 补做完整效果检验 (多领域匹配/对比实验/边界/HTTP入口) → 发现 2 真实不足 + 局限
- **完整效果检验**:
  - 多领域: performance/ui-ux/security-audit/docker/code-review 匹配注入; "爬虫"未匹配 (发现缺口)
  - 对比实验: 有技能 vs 无技能 → 回复不同 YES (但提升有限, 小模型遵循度)
  - 边界: 空文本注入 advanced-css-animations (发现 bug); HTTP 入口 200 + 技能方法论回复
- **修复 1 (空文本注入 bug)**: `recognize('')` 兜底匹配 css 技能 → `_buildSkillGuidance` 空/极短文本 (length<2) 直接返回空
- **修复 2 (自定义模块只告知不执行)**: 自定义模块 (DynamicScraper 爬虫等, isCustomModule) → 注入能力描述 `系统具备「DynamicScraper」：拾号-爬虫系统...` (告知能力; 执行需接入 AsyncExecutor, 留待后续)
- **结构化技能提取 (解决小模型遵循度)**: `_extractSkillEssence(body)` 提取 SKILL.md 骨架 (前 3 主章节的标题/步骤/要点, 跳过代码块与尾部元数据) 而非塞 1000 字符正文 → LLM 更容易遵循 (code-review 端到端: "代码审查结果 → 1. Correctness → ...")
- **测试**: chat-service.test.js +5 (空文本防御/自定义模块/essence 提取/前3章节截断/断言更新)
- **验证**: 全量 347/16,896/0 + ESLint 0/0
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js`

---

Session 锚点: 2026-09-14 (第106次 — 匹配覆盖: 从 SKILL.md trigger 自动提取关键词)
- ESLint: 0/0 | Tests: **348 passed suites / 4 skipped / 0 failed** (16,900 passed / 46 skipped, +4) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户选"关键词扩展")**: keywordMap 硬编码 126 个关键词覆盖不全; 发现 SKILL.md 有 `trigger:` 字段 (如 `trigger: "性能优化 | Redis缓存"`) 可自动提取
- **实现**: `SkillRecognizer._parseSkill` 解析 trigger (去除前后引号); `_loadSkills` 加载后从每个 SKILL.md 的 trigger 按 `[|，,、;；]` 分割 → 补充 keywordMap (**不覆盖已有硬编码映射**)
- **效果**: keywordMap 126 → **209** (+83 trigger 词); "性能优化"→performance-optimization / "UI设计"→ui-ux-design / "代码审查"→code-review / "设计系统"→awesome-design-md 全部注入
- **测试**: `tests/unit/skill-recognizer-trigger.test.js` (新, 4 tests): trigger 提取/多分隔符/不覆盖硬编码/按 trigger 词识别
- **验证**: 全量 348/16,900/0 + ESLint 0/0
- 相关文件: `src/core/SkillRecognizer.js`, `tests/unit/skill-recognizer-trigger.test.js` (新)

---

Session 锚点: 2026-09-14 (第107次 — 自定义模块执行: 爬虫接入 + SSRF 防护)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,906 passed / 46 skipped, +6) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (项 1: 自定义模块从"告知"到"执行")**: DynamicScraper 有完整接口 (init/scrape/scrapeMultiple/close) 但只注入 description → 接入 AsyncExecutor
- **新建 `src/skills/executors/ScrapeExecutor.js`**: 适配 DynamicScraper (类实例方法) 为 static execute 接口; **SSRF 防护 `isSafeUrl`** — 拒绝 localhost/127.x/10.x/192.168.x/172.16-31.x/0.0.0.0/[::1]/非 http(s)/非 URL, 仅允许公开 http(s)
- **接入**: AsyncExecutor `builtinExecutable` + `executorMap` 加 `'dynamic-scraper': 'ScrapeExecutor'`; chatService 工具 schema 加 `scrape_web` 工具 + `_executeToolCalls` 加 scrape_web 分支 (经 AsyncExecutor 执行, SSRF 拦截在 executor 内)
- **验证**: SSRF 防护 12/12 正确; 爬虫执行路径 (mock DynamicScraper): 公开 URL 执行 / 内网拦截 / 缺 url 报错 全过
- **测试**: `tests/unit/scrape-executor.test.js` (新, 6 tests): isSafeUrl 白名单+黑名单 / execute 公开URL / SSRF拦截 / 缺url / 非string url
- **诚实边界**: 爬虫仅 SSRF 防护 (拒绝内网), 外部恶意站点风险仍在 (爬虫本身特性, 非 SSRF); 真实爬取需网络
- **验证**: 全量 349/16,906/0 + ESLint 0/0
- 相关文件: `src/skills/executors/ScrapeExecutor.js` (新), `src/skills/agent/AsyncExecutor.js`, `server/services/chatService.js`, `tests/unit/scrape-executor.test.js` (新)

---

Session 锚点: 2026-09-14 (第108次 — 技能库完整性审计 + CRLF frontmatter bug 修复)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,907 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"检查技能库是否都可完整使用")**: 系统性审计 292 个技能目录
- **审计发现 (首次误报)**: 263 个技能"frontmatter 无效" — 根因是 **CRLF bug**: SKILL.md 用 `\r\n` 换行 (Windows), 但 `_parseSkill` 的 frontmatter 正则 `/^---\n/` 只匹配 `\n` → 263 个 CRLF 文件的 name/description/trigger 全未解析 (name 靠目录名 fallback, trigger 仅 24 个, description 仅 42 个)
- **真实影响**: trigger 自动提取 (第106次, keywordMap 126→209) 只覆盖了 24 个 LF 文件的 trigger — **263 个 CRLF 技能的 trigger 全部漏掉**; 识别靠硬编码 126 关键词才部分工作
- **修复**: `_parseSkill` frontmatter 正则 `/^---\r?\n([\s\S]*?)\r?\n---/` (兼容 CRLF)
- **修复效果**: trigger 24→**287** | description 42→**305** | keywordMap 209→**691** (+482 trigger 词) | "CSS动画"→advanced-css-animations (现经 trigger 而非硬编码)
- **重新审计 (CRLF 兼容)**: 292 目录 → **290 SKILL.md 完好** (2 个缺 SKILL.md 为 superpowers/_templates 模板目录, 合理)
- **测试**: skill-recognizer-trigger.test.js +1 (CRLF frontmatter 解析)
- **验证**: 全量 349/16,907/0 + ESLint 0/0
- 相关文件: `src/core/SkillRecognizer.js`, `tests/unit/skill-recognizer-trigger.test.js`

---

Session 锚点: 2026-09-14 (第109次 — 学习闭环真实运转: 对话纠正触发学习)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,912 passed / 46 skipped, +5) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"让学习闭环真实运转")**: `lessonsLearned: 0` 揭示真实缺口 — 教训学习只在 MCP POST_TOOL_USE 触发, 对话/文档生成不触发 → 真实使用中学不到东西
- **修复 (补全接线, 非造新组件)**:
  - `LessonLearner.recordFeedback({ feedback, previousReply })`: 检测纠正信号 (`不对|错了|不是这样|应该是|修正|incorrect|should be` 等) → `_extractLesson` 记录教训 (input="用户纠正: X", result='corrected', tags=['fix','correction'])
  - `chatService.processMessage`: 用户消息后调 `recordFeedback` (关联上一轮助手回复) + `autoApproveSafeLessons` (低风险自动生效, security 保持人工); 非侵入式 try-catch
- **真实使用验证**: 对话纠正 ("不对，应该用索引而不是全表扫描") → 教训库 **34 → 38 (+4)**; 新教训 "从实践中学习: 用户纠正: ..."; 普通消息 ("今天天气不错") 不触发 ✅
- **测试**: lesson-learner.test.js +4 (纠正识别/普通不记录/空/多种纠正信号)
- **验证**: 全量 349/16,912/0 + ESLint 0/0
- 相关文件: `src/core/LessonLearner.js`, `server/services/chatService.js`, `tests/unit/lesson-learner.test.js`

---

Session 锚点: 2026-09-16 (第110次 — 上下文校准: token 预算与真实能力对齐 + 真实账本 + 无损优化)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,926 passed / 46 skipped, +13) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户: token 是最关键问题, 但质量为先, 不能为省 token 牺牲质量)**: 数据基准揭示根因不是"撑爆窗口"而是"预算与现实的错配 + 全程不可见"
- **P1 上下文校准 (bug 级修复)**:
  - `OllamaBridge.js`: 显式 `num_ctx` (默认 8192, env `OLLAMA_NUM_CTX`), 修复 Ollama 默认 2048 → 模型静默截断 (此前压缩预算 100K vs 真实 ~2K 的错配 = 最大质量缺陷)
  - `chatService.js`: ContextCompact 预算对齐真实 num_ctx (100000→8192, buffer/warning 按比例); `stats.tokens {prompt, completion, total, requests}` 用真实 `prompt_eval_count/eval_count` 记账 (Ollama 已返回却一直被丢弃); >80% 利用率 console.warn (静默截断风险可见); getStats 暴露 contextLength
  - `ContextCompactService.js`: 中文感知 token 估算 (CJK ≈ 1 字符 1 token, 替代 chars/4 低估 → 压缩触发过晚)
- **基准采集 (真实 Ollama 4 场景)**: 普通对话 73 prompt / 技能对话 243 (技能注入 +170) / 文档生成 203 (tools +130) / 40 条历史→回放 6 条仅 +92 (slice(-6) 锁死, 长会话不膨胀)
- **修复空文本静默降级 (诊断发现的质量缺陷)**: LLM 成功但返回空文本 → 曾静默 canned 话术 (前端误显示"AI 服务不可用") → POST 路径空文本重试一次 + 仍空返回 `source:'empty-response'` 诚实告知; SSE 路径空流同样诚实告知
- **无损优化: 技能 essence 同会话去重**: 同会话同技能只完整注入一次, 后续极简引用 (LLM 从对话历史延续) → 实测同技能第 2 条 prompt **243→95 (-61%)**
- **memory/lessons 注入安全阀**: memBody ≤600 字符 / lessonBody ≤300 (正常不触发, 防极端超长撑爆上下文)
- **诚实放弃 (质量风险/收益不确定)**: prompt 前缀 KV 缓存 (动态注入破坏前缀稳定性)、小模型路由、语义缓存接 chat 均不做
- **验证**: 全量 349/16,926/0 + ESLint 0/0 + Security 0 HIGH + 真实 HTTP 端到端 (第 2 条同技能请求 2953ms→457ms, 去重+KV 复用); 临时基准脚本已清理
- **已知限制 (诚实)**: SSE 空流只诚实告知未重试 (流式重试复杂); jest 偶发 open-handle 不退出 (--forceExit 可过, 非回归)
- **质量评测 (真实 A/B/C 对比, 提交 8008c25)**: 3 场景 × 3 版本 (完整/无thinkText/纯基础) 真实 Ollama 实测 →
  - **发现**: forceThink 元认知提问注入对 llama3.2 净负面 — "回答前请先思考：…？" 被弱模型误认为用户输入 (曾现"我看到两个question符号"回复), 且干扰技能 essence 遵循 (场景2 去 thinkText 后回复更贴合技能方法)
  - **修复**: _buildSysPrompt 移除 thinkText 注入 (forceThink 保留为 BrainSystem 内部能力, 仅不注入用户 prompt)
  - **实证**: 技能注入有效 (V2 回复采用 Redis/PM2/函数记忆化 = essence 方法); 移除后真实复测技能遵循正常
  - 测试 +1 (sysPrompt 不得含思考提问)
- **记忆检索修复 (提交 1e76c01)**: SmartMemory.search 用 `split(/\s+/)` 英文分词 → 中文整句永不匹配 value → **记忆存了但从未被检索** (probe: 存"用户喜欢用Vue开发前端", 查"我平时用什么技术栈" → 空) → `_tokenize` 切 CJK bigram + 英文词; 注入改为提取 `value.input` (不再把含 userId 的原始 JSON 塞进 prompt, 隐私+省 token); 真实复验模型正确回复"你喜欢用 Vue 和 Tailwind"; 测试 +3
- **教训检索修复 (提交 ca1aae1)**: LessonLibrary.search 整句 includes → 中文自然语言查询永不命中短标题 → **教训注入从未生效** → 同款 bigram 分词; 真实复验 "优化代码性能" 0→3 命中, sysPrompt 现含教训注入; 测试 +1
- **自我进化闭环端到端验证 (提交 94501df)**: 对话纠正→教训学习→再问同类问题→教训注入→回复体现 完整打通 — 发现对话纠正学习的教训把主题存在 `context` 字段但 search 不匹配 → 加了 context 字段匹配; 真实闭环: 纠正"应该用索引而不是全表扫描" → 教训+1 → 再问"优化数据库查询" → 教训注入 true → 模型回复"使用索引：在需要的列上建立索引"; 测试 +1
- **质量评测结论**: 注入系统 (思考/记忆/教训) 全部真实验证 — 思考净负面(已移除)、记忆/教训此前从未生效(已修复)、技能净正(保留); 遗留: `_extractTags` 中文标签仅统计不影响检索(低优先)
- **模型能力评测 + 升级 (提交 90d206d)**: 13 题真实 A/B (中文/代码/逻辑/多轮) → **llama3.2 77% vs qwen2.5:7b 88.5%**; 决定性差异在多步推理短板区 (灯泡开关/汽水瓶 llama 全失败, qwen 全对; 成语出处 qwen 正确); 系统级验证 qwen 技能遵循更明确
  - **Ollama 模型目录迁移 D 盘** (C 盘满): `OLLAMA_MODELS=D:\ollama-models` (用户级) + robocopy 迁移 6.2GB (清理 4.36GB partial 残留)
  - **默认模型切换**: `OLLAMA_MODEL=qwen2.5:7b` (用户级); llama3.2 保留作备用
  - **模型自动降级 (fallback)**: `fallbackModels` (默认 llama3.2, env `OLLAMA_FALLBACK_MODELS`); 主模型失败→依次尝试备用→都失败才 canned; `result.model` 报告实际使用模型; 真实验证 nonexistent-model→降级 llama3.2 成功; 测试 +3
  - 权衡: qwen 质量 +11.5% 但响应更慢 (7B CPU, 5-15s vs 3B 2-3s)
- 相关文件: `server/services/chatService.js`, `src/localInferencing/OllamaBridge.js`, `src/agent/ContextCompactService.js`, `src/core/{SmartMemory,LessonLibrary}.js`, `tests/unit/{chat-service,ollama-bridge,context-compact-service,smart-memory,lesson-library}.test.js`, `tests/unit/skill-fullstack.integration.test.js` (flaky 超时修复)

---

Session 锚点: 2026-09-18 (第111次 — 支流检查: 前端XSS + 并发/重启验证 + 存储层净化)
- ESLint: 0/0 | Tests: **276 passed suites / 4 skipped / 0 failed** (13,053 passed / 46 skipped, +4) 全量通过 | npm audit: 0 vulns
- **背景 (用户"源头已修, 查支流和未检查部分")**: 高级审计协议(4.4)实战扩展到未覆盖面: 前端JS安全、并发/竞态、重启恢复、MCP其他工具、chatService边界
- **前端XSS审查 (subagent) 发现+修复**:
  - F2 [HIGH]: MCP工具元数据未转义 + onclick注入 (外部MCP name/description → 前端XSS, dev可利用) → **服务端 `sanitizeToolMeta`** (mcp.js: name安全字符集 + desc去尖括号, /tools + /status) — 验证: 恶意payload中和, 合法工具保留
  - F3 [MEDIUM]: index.html 文件链接文本未转义 → `escapeHtml(fn)`
  - F1 [HIGH记录]: **生产CSP nonce断裂** (nonce从不注入HTML → production下前端0 JS + XSS藏CSP后) → README诚实状态记录 (当前dev模式可用)
- **staticServer限流绕过 [HIGH当前]**: 备用入口 staticServer.js apiLimiter **信任x-forwarded-for首值** (每请求换IP即获新桶; 主入口已修此入口漏) → 改 `ipKeyGenerator(req.socket.remoteAddress)`; 顺带 `extended:true→false`
- **marketplace存储型XSS [HIGH潜伏]**: updateSkill/addReview/status无角色检查 + auth guest放行匿名 → **api.js中间件: 所有非GET写路由拒绝guest(401)** (PoC: 401×3/GET 200) + **SkillMarketplace存储层净化**: updateSkill白名单字段 + 字符串HTML转义, addReview转义title/content/reviewer (+3测试, 92 passed) — 纵深防御(已认证用户也不能播种)
- **chatService边界修复**: LLM幻觉返回 `[null]` tool_calls → `call.function` TypeError → 静默canned话术 (同Round110空文本类) → _executeToolCalls 校验无效元素 push {ok:false} (真实链路验证: [null]→正常回复, 非canned; +1测试)
- **真实验证通过 (非漏洞)**: 并发5请求全部隔离+持久化未损坏 | server重启后会话恢复 (重启后回答"你叫测试用户甲") | MCP工具双层白名单+bridge纵深扎实, sequential-thinking无副作用
- **教训 (工作流)**: Write覆盖了已存在的711行测试文件 (教训: 写新文件前先 glob/检查存在性) → git checkout恢复 + 追加合并 + soft reset修正错误提交 (未推送可reset)
- **验证**: 全量 276/13,053/0 + ESLint 0/0
- 相关文件: `server/routes/mcp.js`, `server/staticServer.js`, `server/services/chatService.js`, `src/skills/api.js`, `src/skills/marketplace/SkillMarketplace.js`, `frontend/{index,marketplace}.html`, `tests/unit/{chat-service,skill-marketplace}.test.js`

---

Session 锚点: 2026-09-18 (第112次 — BrainSystem深度审计 + 真实场景验证 + 复盘机制落地)
- ESLint: 0/0 | Tests: **276 passed suites / 4 skipped / 0 failed** (13,055 passed / 46 skipped, +2) 全量通过
- **BrainSystem 深度审计 (威胁建模+数据流+边界穷举) 发现 4 个真实问题全修复**:
  - F1 [HIGH当前]: guardrail hook 触发全项目 `eslint --fix` (30s同步阻塞+改写源码) → verify 只读(不--fix)+只查指定文件+--fast(不写baseline); 实测单文件verify mtime不变
  - F2 [MEDIUM当前]: 用户纠正教训共享 → 跨用户prompt注入 → 教训带userId隔离 (根因: _insertIntoLibrary 转active时丢弃userId); 实测A命中自己/B看不到
  - F3 [MEDIUM当前]: 每次MCP调用产生空垃圾教训+3次同步写盘 → recordEvent 拦截JSON success标记结果 (result:'fixed'仍记录)
  - F4 [MEDIUM潜伏]: _deepMerge 原型污染 → 跳过 __proto__/constructor/prototype
- **真实场景端到端 (qwen2.5:7b)**: 模型正确拒绝越权路径(server/ 不在MCP根) ✅ | 工具链真实生成docx(8643B) ✅ | 模型意图局限(把"查看目录"误解为"生成文档") — 诚实记录模型能力边界
- **token 真实测量 (stats.tokens 记账)**: 普通75/技能123(-49% vs 校准后243)/文档151(-26%) — 对比"未校准前"更低(技能全文+思考注入+无安全阀已移除)
- **复盘机制落地 (用户指导: 复盘对+复盘错)**:
  - `LessonLearner.recordSuccess`: 用户正向反馈("对了/做得好/成功了") → 成功经验教训(tags success,positive, userId隔离) — 与 recordFeedback 构成"对+错"双轨
  - `_inferLessonText` success → "成功方法:"; `_extractLesson` tags 合并显式+推断
  - chatService processMessage 接线 recordSuccess (与 recordFeedback 对称)
- **验证**: 全量 276/13,055/0 + ESLint 0/0 + 真实PoC (recordSuccess→生效→清理)
- 相关文件: `tools/guardrail-fix.js`(gitignored本地), `src/core/{BrainSystem,LessonLearner,LessonLibrary,EvolutionPersistence}.js`, `server/services/chatService.js`, `tests/unit/{lesson-learner,skill-marketplace,chat-service}.test.js`

---

## 8. 复盘协议（强制）

> **每个 session 末尾必须复盘"对"与"错"——不是流水账，是因果分析。**
> 复盘错的 = 拉高下限（下次不再错）；复盘对的 = 复制成功（知道为何对才能再对）。
> 复盘结论必须固化：错的 → 动作清单/纠错教训；对的 → 教训库成功经验（recordSuccess）。
>
> **方向对照（每次复盘必答）：这次让我离"真正的智能"更近了吗？**
> ——不只看"完成/对错"，还问"是否更会做事了 / 是否更自主了 / 方法是否更好了"。
> 只有"复盘"而没有"方向对照" = 精于执行而迷失于方向。

### 8.1 复盘错的（拉高下限）
| 必答 | 说明 |
|------|------|
| 为什么错 | 找到根因（不是表象）|
| 下次怎么做 | 具体防复发动作 |
| 固化到哪 | 动作清单（8.3）或教训库纠错教训 |

### 8.2 复盘对的（复制成功）
| 必答 | 说明 |
|------|------|
| 为什么对 | 因果链（哪个习惯/方法导致成功）|
| 可复制的方法 | 抽象成可重复的动作 |
| 固化到哪 | 教训库成功经验（recordSuccess / 手动 lesson: 成功方法:...）|

### 8.3 强制动作清单（每次操作前检查）
| 动作 | 触发场景 |
|------|----------|
| 写文件前查存在性 | 任何 Write/新建：先 glob/Test-Path；已有文件用 Read+Edit，绝不 Write 覆盖 |
| 修复前定义有效性边界 | 任何修复：先写正反测试用例（该记录的/该拦截的）锁定语义 |
| 验证前看既有模式 | 写验证脚本/测试：先 grep 现有 require 方式、测试框架 API、supertest 用法 |
| PoC 红 → 追数据流到根因 | 任何测试/验证失败：不绕过不迁就，追数据流直到看清完整链路 |
| 修复后真实验证 | 声称完成前：真实链路（真实数据/依赖/端点）+ 证据 |

---

Session 锚点: 2026-09-18 (第113次 — 确定性任务优先架构: 不依赖模型的可靠执行)
- ESLint: 0/0 | Tests: **278 passed suites / 4 skipped / 0 failed** (13,072 passed / 46 skipped, +17) 全量通过
- **背景 (用户洞察: "换更强模型只是概率改善，不排除同类型情况")**: qwen 7B 对开放安全/审计任务遵循弱
  ("检查密钥泄漏"→"你遇到什么问题")，命令式注入(B+C)也无效 → **根本解: 系统知道怎么做的系统直接做，
  模型只处理系统不知道的**（不依赖模型理解 = 确定性可靠）
- **架构**: `generateResponse` 确定性优先链 `_ruleBasedSecurityScan || _ruleBasedCodeQuality`
  → 命中则 `_executeToolCalls` 直接执行 → `source:'deterministic'`（不经模型）；未命中才走模型
- **脚印1 SecurityScanExecutor** (确定性扫描): src/server 扫硬编码密钥/命令注入(exec+模板变量)/
  宽松CORS/shell:true；eval 诚实放弃(正则无法区分真调用 vs 字符串/注释，由 eslint no-eval 负责)；
  _ruleBasedSecurityScan 防误触发(排除"什么是/做了吗/怎么防止")
- **脚印2 CodeQualityExecutor** (确定性 eslint): cmd /c 跑项目 eslint --format json，报错误/警告统计
  (Windows .cmd 需 cmd /c + maxBuffer 20MB)；_ruleBasedCodeQuality 排除"怎么样/之前"评价询问
- **沉淀验证 (每步真实分流)**: 执行请求→deterministic | "代码质量怎么样/做了吗"→ollama | 闲聊→ollama |
  项目真实扫描 319 文件 0 发现(lint 0 硬编码0 CORS白名单 无shell:true)
- **诚实边界**: 复合请求("检查安全和质量")只匹配单个确定性任务(单任务模型，多任务链留待后续)；
  文档生成保持模型路径+fallback(内容生成类需模型，确定性只能搭框架——检查/执行类才确定性优先)
- **验证**: 全量 278/13,072/0 + ESLint 0/0 + 真实HTTP分流测试
- 相关文件: `src/skills/executors/{SecurityScan,CodeQuality}Executor.js` (新), `server/services/chatService.js`,
  `tests/unit/{security-scan-executor,code-quality-executor}.test.js` (新), `tests/unit/chat-service.test.js`
