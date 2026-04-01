# 项目规则

## 技能自动加载配置
系统已配置自动加载核心技能：
- `using-superpowers` - 每次对话开始时自动加载
- 配置文件: `.opencode/skill-auto-load.json`

## 技能调用
开始任何编码任务前，必须先识别任务类型并加载对应技能，再开始执行。

## 自动触发规则
1. 系统启动时自动加载 `using-superpowers` 技能
2. 遇到bug时自动加载 `systematic-debugging` 技能
3. 创意工作时自动加载 `brainstorming` 技能
