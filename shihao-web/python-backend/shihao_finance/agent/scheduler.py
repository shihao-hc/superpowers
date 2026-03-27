from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from typing import Callable, Optional


class ShiHaoScheduler:
    """拾号金融主动调度引擎"""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._started = False
    
    def start(self):
        """启动调度器"""
        if not self._started:
            self.scheduler.start()
            self._started = True
    
    def shutdown(self):
        """关闭调度器"""
        if self._started:
            self.scheduler.shutdown()
            self._started = False
    
    def add_job(self, func: Callable, trigger: str, **kwargs):
        """添加任务"""
        job_id = kwargs.pop("job_id", None)
        job_name = kwargs.pop("name", None)
        
        if trigger == "interval":
            trigger_obj = IntervalTrigger(**kwargs)
        elif trigger == "cron":
            trigger_obj = CronTrigger(**kwargs)
        else:
            trigger_obj = IntervalTrigger(**kwargs)
        
        self.scheduler.add_job(
            func, 
            trigger_obj, 
            id=job_id, 
            name=job_name
        )
    
    def get_jobs(self) -> list[dict]:
        """获取任务列表"""
        jobs_list = []
        for job in self.scheduler.get_jobs():
            next_run = None
            if hasattr(job, 'next_run_time') and job.next_run_time:
                next_run = str(job.next_run_time)
            elif hasattr(job, 'trigger') and hasattr(job.trigger, 'next_run_time'):
                next_run = str(job.trigger.next_run_time) if job.trigger.next_run_time else None
            jobs_list.append({"id": job.id, "name": job.name, "next_run": next_run})
        return jobs_list
    
    def setup_default_jobs(self, agent):
        """设置默认任务"""
        
        self.scheduler.add_job(
            self._create_morning_analysis(agent),
            CronTrigger(hour=9, minute=25, day_of_week='mon-fri'),
            id='morning_analysis',
            name='开盘前市场分析'
        )
        
        self.scheduler.add_job(
            self._create_intraday_monitor(agent),
            IntervalTrigger(minutes=5),
            id='intraday_monitor',
            name='盘中实时监控'
        )
        
        self.scheduler.add_job(
            self._create_daily_review(agent),
            CronTrigger(hour=15, minute=30, day_of_week='mon-fri'),
            id='daily_review',
            name='每日收盘复盘'
        )
    
    def _create_morning_analysis(self, agent):
        """创建开盘前分析任务"""
        async def morning_analysis():
            print("[Scheduler] 执行开盘前分析...")
        return morning_analysis
    
    def _create_intraday_monitor(self, agent):
        """创建盘中监控任务"""
        async def intraday_monitor():
            print("[Scheduler] 执行盘中监控...")
        return intraday_monitor
    
    def _create_daily_review(self, agent):
        """创建收盘复盘任务"""
        async def daily_review():
            print("[Scheduler] 执行收盘复盘...")
        return daily_review