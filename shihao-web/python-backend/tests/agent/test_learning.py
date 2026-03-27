import pytest
from shihao_finance.agent.learning import SelfImprovingAgent, TradeOutcome, OutcomeType
from shihao_finance.agent.patterns import PatternExtractor


class TestLearning:
    def test_trade_outcome_creation(self):
        """测试交易结果创建"""
        outcome = TradeOutcome(
            ticker="600519",
            action="buy",
            entry_price=1800.0,
            exit_price=1900.0,
            pnl_pct=0.056,
            outcome_type=OutcomeType.SUCCESS
        )
        assert outcome.ticker == "600519"
        assert outcome.outcome_type == OutcomeType.SUCCESS
    
    def test_pattern_extraction(self):
        """测试模式提取"""
        extractor = PatternExtractor()
        
        outcomes = [
            TradeOutcome("600519", "buy", 1800, 1900, 0.056, OutcomeType.SUCCESS),
            TradeOutcome("300750", "buy", 180, 200, 0.11, OutcomeType.SUCCESS),
            TradeOutcome("000858", "buy", 145, 135, -0.069, OutcomeType.FAILURE),
        ]
        
        patterns = extractor.extract(outcomes)
        assert patterns.success_factors is not None
        assert patterns.failure_factors is not None
        assert patterns.confidence > 0