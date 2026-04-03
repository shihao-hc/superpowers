import requests

base_url = "http://localhost:8000"

print("="*60)
print("拾号金融 AI Agent API 测试")
print("="*60)

print("\n【1】获取 Agent 状态")
r = requests.get(f"{base_url}/api/agent/status")
print(f"状态: {r.json()['status']}")
print(f"记忆块: {r.json()['memory_blocks']}")
print(f"LLM: {r.json()['llm_provider']}/{r.json()['llm_model']}")

print("\n【2】获取核心记忆")
r = requests.get(f"{base_url}/api/agent/memory/core")
core = r.json()['blocks']
print(f"人格: {core['persona']['value'][:60]}...")
print(f"风险: {core['risk_profile']['value'][:60]}...")
print(f"偏好: {core['user_preferences']['value'][:60]}...")

print("\n【3】更新用户偏好")
data = {"block": "user_preferences", "value": "偏好科技股和新能源龙头，关注宁德时代、比亚迪"}
r = requests.put(f"{base_url}/api/agent/memory/core", json=data)
print(f"结果: {r.json()['status']}")

print("\n【4】验证更新")
r = requests.get(f"{base_url}/api/agent/memory/core")
print(f"新偏好: {r.json()['blocks']['user_preferences']['value']}")

print("\n【5】搜索记忆 (Recall Memory)")
data = {"query": "新能源", "user_id": "user", "limit": 5}
r = requests.post(f"{base_url}/api/agent/memory/search", json=data)
print(f"搜索结果: {r.json()['count']} 条")

print("\n【6】触发分析")
data = {"tickers": ["600519", "300750"], "context": "分析两只股票"}
r = requests.post(f"{base_url}/api/agent/analyze", json=data)
print(f"分析状态: {r.json()['status']}")
print(f"信息: {r.json()['message']}")

print("\n【7】发送通知")
data = {"title": "测试通知", "content": "这是一条测试消息", "priority": "normal"}
r = requests.post(f"{base_url}/api/agent/notifications/send", json=data)
print(f"发送状态: {r.json()['status']}")

print("\n" + "="*60)
print("测试完成!")
print("="*60)

print("\n可用API端点:")
print("  GET  /api/agent/status              - Agent状态")
print("  GET  /api/agent/memory/core         - 获取核心记忆")
print("  PUT  /api/agent/memory/core          - 更新核心记忆")
print("  POST /api/agent/memory/search        - 搜索记忆")
print("  POST /api/agent/analyze              - 触发分析")
print("  POST /api/agent/notifications/send   - 发送通知")