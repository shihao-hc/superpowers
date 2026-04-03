# StockSelectorEngine MVP - Extended Features

## New Modules Added

### 1. PolicyMonitor (`policy_monitor.py`)
- **功能**: 政策与监管新闻实时监控
- **能力**:
  - 关键词过滤（央行、监管、产业政策、Fed、FOMC等）
  - NLP事件抽取（自动识别事件类型）
  - 影响评分（-1到+1，负面到正面）
  - 行业映射（金融、科技、新能源、医药、消费等）
- **使用**:
```python
from stock_selector.policy_monitor import PolicyMonitor, MockNewsIngester

ingester = MockNewsIngester()
news = ingester.fetch_news()
monitor = PolicyMonitor(min_impact=0.1)
events = monitor.extract_events(news)
events_df = monitor.events_to_dataframe(events)
```

### 2. DailyReview (`daily_review.py`)
- **功能**: 每日收盘后自动生成文本报告并用LLM润色
- **能力**:
  - 市场概况总结
  - Top信号提取
  - 政策事件摘要
  - 组合表现计算（当日收益、累计收益、胜率）
  - 风险指标（波动率、最大回撤、夏普比率）
  - LLM润色（可选）
- **使用**:
```python
from stock_selector.daily_review import DailyReviewGenerator, LLMPolishClient

review_gen = DailyReviewGenerator(llm_client=LLMPolishClient())
report = review_gen.generate_report(
    date="2026-03-26",
    price_df=price_df,
    signals_df=signals_df,
    policy_events_df=events_df,
    portfolio_returns=[0.01, -0.005, 0.02]
)
print(report.raw_summary)
print(report.polished_summary)
```

### 3. QuantKnowledgeBase (`quant_knowledge_base.py`)
- **功能**: 量化知识库，向量存储与问答
- **能力**:
  - 策略代码、因子定义、回测报告存储
  - 语义搜索（基于SentenceTransformer）
  - Q&A问答接口
  - 支持ChromaDB持久化或内存模式
- **使用**:
```python
from stock_selector.quant_knowledge_base import QuantKnowledgeBase, KnowledgeBaseQA

kb = QuantKnowledgeBase()
kb.add_strategy(code="...", name="Momentum")
kb.add_factor(definition="...", name="ROE")
kb.add_backtest_report(report_text="...", strategy_name="Momentum")

# 搜索
results = kb.search("momentum strategy", top_k=3)

# Q&A
qa = KnowledgeBaseQA(kb)
answer = qa.ask("What is the momentum strategy?")
```

## 运行完整MVP

```bash
pip install yfinance xgboost shap pandas numpy sentence-transformers chromadb

python stock_selector/main.py
```

## 配置

见 `configs/mvp_config.yaml`:
- `policy_monitor`: 政策监控配置
- `daily_review`: 每日复盘配置
- `knowledge_base`: 知识库配置

## 后续迭代建议

1. **PolicyMonitor**: 接入真实新闻API（NewsAPI、Bloomberg、Refinitiv），增强事件抽取模型
2. **DailyReview**: 接入真实LLM API（OpenAI、Anthropic）进行润色，生成图表
3. **KnowledgeBase**: 扩展向量数据库到ChromaDB支持多用户并发查询
