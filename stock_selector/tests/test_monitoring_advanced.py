import unittest
from stock_selector.monitoring import MonitoringDashboard, AlertManager, AlertLevel


class TestMonitoringAdvanced(unittest.TestCase):
    def test_threshold_critical(self):
        am = AlertManager()
        dash = MonitoringDashboard(am)
        # Trigger a critical alert by simulating a large loss
        dash.update_metric('daily_pnl', -6000)
        crits = am.get_recent_alerts(AlertLevel.CRITICAL, limit=5) or []
        self.assertTrue(len(crits) > 0)


if __name__ == '__main__':
    unittest.main()
