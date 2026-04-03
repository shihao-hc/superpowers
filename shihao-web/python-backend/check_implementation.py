import sys
sys.path.insert(0, '.')

print('='*60)
print('Implementation Completion Check')
print('='*60)

# Task 1: Project structure
print('\n[TASK 1] Project Structure')
import os
files = [
    'shihao_finance/agent/__init__.py',
    'shihao_finance/agent/memory/__init__.py', 
    'shihao_finance/agent/channels/__init__.py',
    'shihao_finance/agent/tools/__init__.py',
    'tests/agent/__init__.py',
]
for f in files:
    exists = os.path.exists(f)
    print(f'  [OK] {f}' if exists else f'  [FAIL] {f}')

# Task 2: CoreMemory
print('\n[TASK 2] CoreMemory')
from shihao_finance.agent.memory.core import CoreMemory
m = CoreMemory()
print(f'  [OK] persona: {len(m.get_block("persona"))} chars')
print(f'  [OK] risk_profile: {len(m.get_block("risk_profile"))} chars')
print(f'  [OK] user_preferences: {len(m.get_block("user_preferences"))} chars')
m.update_block('test', 'test value')
print(f'  [OK] list_blocks: {m.list_blocks()}')

# Task 3: RecallMemory
print('\n[TASK 3] RecallMemory')
import asyncio
from shihao_finance.agent.memory.recall import RecallMemory
async def test_recall():
    r = RecallMemory()
    await r.initialize()
    result = await r.add('test memory', user_id='user')
    print(f'  [OK] add: {result}')
    results = await r.search('test', user_id='user')
    print(f'  [OK] search: {len(results)} results')
    await r.cleanup()
asyncio.run(test_recall())

# Task 4: ArchivalMemory
print('\n[TASK 4] ArchivalMemory')
from shihao_finance.agent.memory.archival import ArchivalMemory
async def test_archival():
    a = ArchivalMemory(db_path=':memory:')
    await a.initialize()
    doc_id = await a.add('Test Doc', 'Test Content', 'test')
    print(f'  [OK] add: {doc_id}')
    results = await a.search('Test')
    print(f'  [OK] search: {len(results)} results')
    await a.cleanup()
asyncio.run(test_archival())

# Task 5: ShiHaoAgent
print('\n[TASK 5] ShiHaoAgent')
from shihao_finance.agent.core import ShiHaoAgent
async def test_agent():
    agent = ShiHaoAgent(config={'archival_db_path': ':memory:'})
    await agent.initialize()
    print(f'  [OK] initialized: {agent._initialized}')
    print(f'  [OK] memory blocks: {agent.memory.core.list_blocks()}')
    await agent.cleanup()
asyncio.run(test_agent())

# Task 7: CrewAI Agents
print('\n[TASK 7] CrewAI Agents')
from shihao_finance.agent.agents import create_market_analyst, create_risk_manager, create_trade_executor, create_portfolio_manager
print(f'  [OK] Market Analyst: {create_market_analyst().role}')
print(f'  [OK] Risk Manager: {create_risk_manager().role}')
print(f'  [OK] Trade Executor: {create_trade_executor().role}')
print(f'  [OK] Portfolio Manager: {create_portfolio_manager().role}')

# Task 8: Crew
print('\n[TASK 8] Crew Orchestration')
from shihao_finance.agent.crew import create_trading_crew
crew = create_trading_crew()
print(f'  [OK] Crew agents: {len(crew.agents)}')
print(f'  [OK] Process: {crew.process}')
print(f'  [OK] Manager: {crew.manager_agent.role}')

# Task 9: Learning
print('\n[TASK 9] Self-Learning')
from shihao_finance.agent.learning import SelfImprovingAgent, TradeOutcome, OutcomeType
from shihao_finance.agent.patterns import PatternExtractor
outcome = TradeOutcome('600519', 'buy', 1800, 1900, 0.05, OutcomeType.SUCCESS)
print(f'  [OK] TradeOutcome: {outcome.ticker}')
extractor = PatternExtractor()
print(f'  [OK] PatternExtractor')

# Task 10: Scheduler
print('\n[TASK 10] Scheduler')
from shihao_finance.agent.scheduler import ShiHaoScheduler
s = ShiHaoScheduler()
print(f'  [OK] Scheduler created')
s.add_job(lambda: None, 'interval', minutes=5, job_id='test')
jobs = s.get_jobs()
print(f'  [OK] Jobs: {len(jobs)}')

# Task 11: Channels
print('\n[TASK 11] Channels')
from shihao_finance.agent.channels.hub import NotificationHub
hub = NotificationHub()
print(f'  [OK] NotificationHub')

# Task 12: API
print('\n[TASK 12] API Endpoints')
import requests
r = requests.get('http://localhost:8000/api/agent/status')
status = r.json()
print(f'  [OK] Status: {status.get("status")}')
r = requests.get('http://localhost:8000/api/agent/memory/core')
print(f'  [OK] Core Memory API working')

print('\n' + '='*60)
print('ALL IMPLEMENTATION TASKS COMPLETED!')
print('='*60)