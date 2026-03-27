import pytest


def test_scheduler_creation():
    """测试调度器创建"""
    try:
        from shihao_finance.agent.scheduler import ShiHaoScheduler
        scheduler = ShiHaoScheduler()
        assert scheduler is not None
    except ImportError:
        pytest.skip("apscheduler not installed")


def test_job_registration():
    """测试任务注册"""
    try:
        from shihao_finance.agent.scheduler import ShiHaoScheduler
        scheduler = ShiHaoScheduler()
        
        def dummy_job():
            pass
        
        scheduler.add_job(
            func=dummy_job,
            trigger="interval",
            minutes=5,
            job_id="test_job"
        )
        
        jobs = scheduler.get_jobs()
        assert "test_job" in [j["id"] for j in jobs]
    except ImportError:
        pytest.skip("apscheduler not installed")