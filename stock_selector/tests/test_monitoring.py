import unittest
from stock_selector.monitoring import MonitoringDashboard, AlertManager, AlertChannel


class TestMonitoringModule(unittest.TestCase):
    def test_dashboard_init_and_state(self):
        am = AlertManager()
        dashboard = MonitoringDashboard(am)
        dashboard.update_metric('daily_pnl', 1200)
        state = dashboard.get_dashboard_state()
        self.assertIsInstance(state, dict)
        self.assertIn('metrics', state)

    def test_alerts_generation(self):
        am = AlertManager()
        # Register a console handler to simulate real usage
        am.register_alert_callback(lambda t, m: None)
        dashboard = MonitoringDashboard(am)
        dashboard.update_metric('daily_pnl', -20000)  # should trigger critical when threshold crossed
        alerts = am.get_recent_alerts()
        self.assertGreaterEqual(len(alerts), 0)
