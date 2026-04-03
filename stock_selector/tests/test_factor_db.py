import unittest
import tempfile
import os
from stock_selector.factor_db import FactorDatabase, Factor


class TestFactorDBModule(unittest.TestCase):
    def test_factor_db_basic_operations(self):
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tf:
            db_path = tf.name
        try:
            db = FactorDatabase(db_path=db_path)
            # add a factor
            f = Factor(
                id='fact_01',
                name='ROE',
                category='profitability',
                formula='NetIncome / Equity',
                description='Return on Equity',
                created_at='2025-01-01T00:00:00',
                updated_at='2025-01-01T00:00:00'
            )
            db.add_factor(f)
            # get factor
            f2 = db.get_factor('ROE')
            self.assertIsNotNone(f2)
            # list factors
            lst = db.list_factors()
            self.assertTrue(len(lst) >= 1)
            # record performance and fetch history
            db.record_performance('fact_01', '2025-01-01', '2025-03-01', 0.1, 0.2, 0.5, 0.8)
            hist = db.get_performance_history('fact_01')
            self.assertIsInstance(hist, list)
        finally:
            if os.path.exists(db_path):
                os.remove(db_path)
