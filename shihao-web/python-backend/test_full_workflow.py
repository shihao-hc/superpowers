import requests

base = 'http://localhost:8000'

print('=== 1. Update user preferences in Core Memory ===')
r = requests.put(f'{base}/api/agent/memory/core', json={
    'block': 'user_preferences',
    'value': '我关注科技股、新能源龙头，如宁德时代、比亚迪、贵州茅台'
})
print(f'Result: {r.json()}')

print('\n=== 2. Get Core Memory to verify ===')
r = requests.get(f'{base}/api/agent/memory/core')
prefs = r.json()['blocks']['user_preferences']['value']
print(f'用户偏好: {prefs}')

print('\n=== 3. Test fallback search ===')
import sys
sys.path.insert(0, '.')
import asyncio
from shihao_finance.agent.memory.recall import RecallMemory

async def add_test_memories():
    mem = RecallMemory(collection_name='test')
    await mem.initialize()
    
    await mem.add('用户喜欢科技股板块', user_id='user', categories=['preference'])
    await mem.add('关注新能源车产业链', user_id='user', categories=['preference']) 
    await mem.add('持有贵州茅台100股', user_id='user', categories=['position'])
    await mem.add('上周盈利5%', user_id='user', categories=['trade'])
    
    results = await mem.search('科技', user_id='user', limit=5)
    print(f'搜索科技结果: {len(results)}条')
    for r in results:
        print(f'  - {r.get("text", "")}')
    
    await mem.cleanup()

asyncio.run(add_test_memories())

print('\n=== Summary ===')
print('Core Memory: 可读可写，持久化')
print('Fallback Search: 使用内存存储，可添加和搜索')
print('Mem0 Semantic: 需要有效的 OPENAI_API_KEY 才能使用向量嵌入')