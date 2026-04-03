"""Entrypoint for MVP prototype run of StockSelectorEngine with PolicyMonitor, DailyReview, and KnowledgeBase."""
from __future__ import annotations

import pandas as pd
from datetime import datetime
from stock_selector.data_pipeline import DataIngestor
from stock_selector.news_sentiment import NewsSentimentAnalyzer
from stock_selector.mvp_model import MVPModel
from stock_selector.backtest_engine import Backtester
from stock_selector.policy_monitor import PolicyMonitor, MockNewsIngester
from stock_selector.daily_review import DailyReviewGenerator, LLMPolishClient
from stock_selector.quant_knowledge_base import QuantKnowledgeBase, KnowledgeBaseQA


def run_mvp():
    # 1) Target market: US large-cap stocks (demo set)
    tickers = [
        'AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA','JPM','V','UNH',
        'HD','DIS','BAC','PYPL','ADBE','CMCSA','NFLX','KO','PFE','CRM'
    ]
    end_date = datetime.utcnow().strftime('%Y-%m-%d')
    start_date = (datetime.utcnow() - pd.Timedelta(days=365)).strftime('%Y-%m-%d')

    # 2) Data ingestion
    di = DataIngestor(tickers, start_date=start_date, end_date=end_date)
    price_df = di.fetch_price_data()
    if price_df.empty:
        print("No price data fetched. Exiting MVP run.")
        return

    # 3) News sentiment (simple prototype)
    articles = []  # in real MVP fetch from a live feed; keep empty for now
    sn = NewsSentimentAnalyzer()
    sentiment_df = sn.analyze_news(articles)  # empty DataFrame if no articles

    # 4) Train simple XGBoost-based stock picker
    model = MVPModel()
    model.train(price_df, sentiment_df)
    if model.model is None:
        print("Model training did not produce a model. Abort MVP run.")
        return

    # 5) Predict and show SHAP-based explanations for last date
    preds_df = model.predict(price_df, sentiment_df)
    last_date = preds_df['date'].max() if 'date' in preds_df.columns else price_df['date'].max()
    topk = preds_df.sort_values('score', ascending=False).head(5)
    print("MVP Top signals on last date:")
    print(topk[['date','ticker','score']].to_string(index=False))
    expl = model.explain(price_df, sentiment_df, top_k=5)
    if not expl.empty:
        print("\nSHAP-like explanations (partial):")
        print(expl.head())

    # 6) Backtest sanity with the simple pipeline
    bt = Backtester(price_df, sentiment_df, top_n=5)
    result = bt.run_rollout()
    print('\nBacktest MVP result:')
    print(result)

    # =====================================================
    # NEW: Policy Monitor - News API + Keyword Filter + Event Extraction
    # =====================================================
    print("\n" + "="*60)
    print(">>> Running PolicyMonitor...")
    print("="*60)
    
    ingester = MockNewsIngester()
    news = ingester.fetch_news()
    monitor = PolicyMonitor(min_impact=0.1)
    policy_events = monitor.extract_events(news)
    events_df = monitor.events_to_dataframe(policy_events)
    print(f"Extracted {len(policy_events)} policy events")
    if not events_df.empty:
        print(events_df[['date', 'event_type', 'headline', 'impact_score']].head())

    # =====================================================
    # NEW: Daily Review - EOD Report + LLM Polish
    # =====================================================
    print("\n" + "="*60)
    print(">>> Generating Daily Review Report...")
    print("="*60)

    # Use model predictions as signals
    signals_for_review = preds_df.copy()
    
    # Generate daily report with LLM polishing (mock client for MVP)
    review_gen = DailyReviewGenerator(llm_client=LLMPolishClient())
    daily_report = review_gen.generate_report(
        date=end_date,
        price_df=price_df,
        signals_df=signals_for_review,
        policy_events_df=events_df,
        portfolio_returns=[0.01, -0.005, 0.02, -0.01, 0.015],  # mock returns
    )
    
    print("\n--- Raw Report ---")
    print(daily_report.raw_summary)
    print("\n--- Polished Report ---")
    print(daily_report.polished_summary)

    # =====================================================
    # NEW: Quant Knowledge Base - Vector Storage + Q&A
    # =====================================================
    print("\n" + "="*60)
    print(">>> Quant Knowledge Base Demo...")
    print("="*60)

    kb = QuantKnowledgeBase()

    # Add strategies
    kb.add_strategy(
        code="""def momentum_strategy(prices):
    return prices.pct_change(20).rank()""",
        name="Momentum 20D",
        metadata={"author": "demo", "risk_level": "medium"}
    )
    kb.add_strategy(
        code="""def value_strategy(fundamentals):
    return (fundamentals['pe'] < 15) & (fundamentals['roe'] > 0.15)""",
        name="Value Factor",
        metadata={"author": "demo", "risk_level": "low"}
    )

    # Add factors
    kb.add_factor(
        definition="ROE = Net Income / Shareholders Equity",
        name="ROE",
        metadata={"category": "profitability"}
    )
    kb.add_factor(
        definition="Market Cap = Price * Shares Outstanding",
        name="MarketCap",
        metadata={"category": "size"}
    )

    # Add backtest report
    kb.add_backtest_report(
        report_text="Strategy: Momentum 20D\nSharpe: 1.2\nMaxDrawdown: 15%\nPeriod: 2020-2025",
        strategy_name="Momentum 20D",
        metadata={"sharpe": 1.2}
    )

    # Search examples
    print("\nSearch: 'momentum strategy'")
    results = kb.search("momentum strategy", top_k=2)
    for r in results:
        print(f"  - {r['metadata'].get('type')}: {r['content'][:80]}...")

    print("\nSearch: 'ROE factor'")
    results = kb.search("ROE factor", top_k=2)
    for r in results:
        print(f"  - {r['metadata'].get('type')}: {r['content'][:80]}...")

    # Q&A example
    print("\nQ&A: 'What is the momentum strategy?'")
    qa = KnowledgeBaseQA(kb)
    answer = qa.ask("What is the momentum strategy?")
    print(f"Q: {answer['question']}")
    print(f"A: {answer['answer'][:200]}...")

    print("\n>>> MVP run completed with all three new modules!")


if __name__ == '__main__':
    run_mvp()
