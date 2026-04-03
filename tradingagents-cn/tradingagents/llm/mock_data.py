"""
TradingAgents-CN Mock Data
预定义的模拟报告和决策数据，用于 CI/CD 测试
"""

# 股票分析模拟数据
MOCK_MARKET_REPORT = """
技术指标分析：
- MACD 金叉形成，短期看涨信号，DIF=0.12, DEA=0.08
- RSI 处于 55，中性偏强
- KDJ 指标 J 线向上，多头趋势，K=65, D=58, J=78
- 成交量较前日放大 15%，资金流入明显
- MA5: 12.35, MA10: 12.28, MA20: 12.15

趋势判断：短期均线多头排列，MACD 底部金叉，量能温和放大
支撑位：12.00 元
压力位：13.50 元
建议：适度关注
"""

MOCK_FUNDAMENTALS_REPORT = """
财务数据：
- 市盈率（PE）：12.5，低于行业平均 15.2
- 市净率（PB）：1.2，估值合理
- 每股收益（EPS）：0.65 元
- 净资产收益率（ROE）：12.5%
- 营收增长率（YoY）：+18%
- 净利润增长率：+22%
- 资产负债率：45%，健康水平
- 毛利率：25.3%，净利率：8.7%

基本面评价：基本面良好，具备投资价值
"""

MOCK_NEWS_REPORT = """
近期新闻：
1. 公司发布新产品，市场反响积极
2. 行业政策利好，预计提振未来业绩
3. 机构研报上调评级至"买入"
4. 公司与某科技巨头达成战略合作

舆情倾向：正面偏多
影响评估：短期中性，长期利好
"""

MOCK_SENTIMENT_REPORT = """
社交媒体情绪：
- 正面讨论占比：65%
- 负面讨论占比：15%
- 中性讨论占比：20%
- 热度指数：高
- 主力资金净流入：2.3 亿元
- 股吧热度：较活跃，关注度上升
- 机构评级：买入/增持 (6家)

综合情绪指数：68/100 (中性偏多)
"""

# 投资决策模拟数据
MOCK_INVESTMENT_PLAN = """
投资建议：买入
理由：
1. 基本面稳健，业绩持续增长
2. 政策面利好，行业景气度高
3. 技术面显示上升趋势

建议仓位：10%
止损设于：-5%
目标价：12.5 元
"""

MOCK_RISK_ASSESSMENT = """
风险评估：中性

激进观点：市场情绪亢奋，可追加仓位至 80%
保守观点：存在短期回调风险，建议分批建仓 30%
中性观点：维持现有仓位，关注后续成交量变化

最终仓位建议：60%
止损位：-8%
止盈位：+15%

风险提示：仅供参考，不构成投资建议
"""

MOCK_FINAL_DECISION = """
最终交易决策：买入

综合多空辩论和风险评估，建议：
- 买入标的：000001.SZ
- 建议仓位：60%
- 目标价：12.5 元
- 止损价：10.2 元
- 持有期限：2-4 周

置信度：72%
风险等级：中等

备注：市场有风险，投资需谨慎
"""

# 代码审查模拟数据
MOCK_CODE_REVIEW_VERDICT = """
代码质量良好，综合评分：B+

静态分析：
- 圈复杂度：8 (中等，可接受)
- 代码行数：150 行
- 函数数量：5 个
- 存在 1 处深层嵌套

安全审查：
- 未发现 SQL 注入风险
- XSS 风险：低
- 建议添加参数化查询

性能评估：
- 时间复杂度：O(n) 为主
- 内存占用：约 50MB
- 建议添加缓存机制

建议：
1. 添加函数文档字符串
2. 添加类型注解
3. 简化嵌套层级
"""

MOCK_CRITIC_ARGUMENTS = """
批评者观点（看空）：

1. **技术面风险**：
   - MACD 可能形成顶背离
   - 成交量开始萎缩
   - RSI 进入超买区域

2. **基本面隐忧**：
   - 估值处于历史高位
   - 行业竞争加剧
   - 宏观经济不确定性

3. **市场情绪**：
   - 可能过热，需警惕回调
   - 主力资金开始净流出
   - 机构持仓比例过高

建议：谨慎观望，等待更好的买入时机
"""

MOCK_ADVOCATE_ARGUMENTS = """
辩护者观点（看多）：

1. **技术面支撑**：
   - 均线多头排列，中期趋势向上
   - MACD 金叉形成，看涨信号
   - 成交量配合良好

2. **基本面利好**：
   - 业绩持续增长，EPS 同比+22%
   - PE 低于行业平均，估值有优势
   - 新产品发布带来增长预期

3. **政策支持**：
   - 行业政策持续利好
   - 产业升级受益标的
   - 国资背景提供背书

建议：积极关注，可考虑建仓
"""

# 多轮辩论数据
DEBATE_ROUND_1 = {
    "bull": "基本面稳健，财务数据显示公司盈利能力持续提升。",
    "bear": "但估值已经偏高，PE 处于历史 80% 分位。",
    "verdict": "双方各执一词，建议收集更多信息。"
}

DEBATE_ROUND_2 = {
    "bull": "技术面出现买入信号，MACD 金叉形成。",
    "bear": "但成交量未能有效放大，上涨动能存疑。",
    "verdict": "技术面支撑不足看多观点，需谨慎。"
}

# 风险管理辩论数据
RISK_BULL_POSITION = """
激进观点：
- 市场情绪亢奋，可追加仓位至 80%
- 趋势交易，突破前高后可追涨
- 融资杠杆放大收益
"""

RISK_BEAR_POSITION = """
保守观点：
- 存在短期回调风险，建议分批建仓 30%
- 设置严格止损，控制单笔亏损在 3% 以内
- 配置对冲，降低组合波动
"""

RISK_JUDGE_DECISION = """
综合评估：
- 建议仓位：60%
- 激进配置：可承受更高波动
- 保守配置：降低仓位至 40%
- 风险提示：务必设置止损
"""

# API 响应模拟数据
MOCK_API_RESPONSE = {
    "task_id": "mock-task-123",
    "status": "completed",
    "result": {
        "decision": "买入",
        "confidence": 0.72,
        "target_price": 12.5,
        "stop_loss": 10.2,
        "position_size": "60%"
    }
}

# WebSocket 进度模拟
WS_PROGRESS_MESSAGES = [
    {"type": "status", "data": {"phase": "init", "progress": 0}},
    {"type": "status", "data": {"phase": "market_analysis", "progress": 20}},
    {"type": "status", "data": {"phase": "fundamentals", "progress": 40}},
    {"type": "status", "data": {"phase": "news", "progress": 60}},
    {"type": "status", "data": {"phase": "sentiment", "progress": 80}},
    {"type": "status", "data": {"phase": "debate", "progress": 90}},
    {"type": "completed", "data": {"result": MOCK_FINAL_DECISION}},
]

# 错误场景模拟
MOCK_ERROR_SCENARIOS = {
    "no_api_key": "No API key configured. Set DEEPSEEK_API_KEY or use USE_MOCK_LLM=true",
    "rate_limit": "Rate limit exceeded. Please try again later.",
    "invalid_task_id": "Invalid task_id format. Must match pattern: ^[a-zA-Z0-9\\-_]{8,64}$",
    "timeout": "Request timeout. The analysis took too long to complete.",
}

# 情感分析变体
SENTIMENT_VARIANTS = [
    {
        "name": "乐观",
        "positive": 65,
        "negative": 15,
        "neutral": 20,
        "index": "68/100",
        "flow": "主力资金净流入 2.3 亿元"
    },
    {
        "name": "悲观",
        "positive": 25,
        "negative": 55,
        "neutral": 20,
        "index": "32/100",
        "flow": "主力资金净流出 1.8 亿元"
    },
    {
        "name": "中性",
        "positive": 40,
        "negative": 30,
        "neutral": 30,
        "index": "50/100",
        "flow": "主力资金净流入 0.2 亿元"
    }
]

# 代码审查变体
CODE_REVIEW_VARIANTS = [
    {
        "name": "良好",
        "complexity": 6,
        "score": "A",
        "issues": [],
        "security": "未发现明显风险"
    },
    {
        "name": "中等",
        "complexity": 8,
        "score": "B+",
        "issues": ["1处深层嵌套", "缺少文档注释"],
        "security": "建议添加参数化查询"
    },
    {
        "name": "需改进",
        "complexity": 15,
        "score": "C",
        "issues": ["多处深层嵌套", "缺少异常处理", "命名不规范"],
        "security": "发现潜在 SQL 注入风险"
    }
]
