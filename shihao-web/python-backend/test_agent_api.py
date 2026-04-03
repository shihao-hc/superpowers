import requests
import json

base_url = "http://localhost:8000"

print("=== 1. Agent Status ===")
r = requests.get(f"{base_url}/api/agent/status")
print(r.text)

print("\n=== 2. Add Memory ===")
data = {"text": "用户关注科技板块和新能源", "user_id": "user", "categories": ["preference"]}
r = requests.post(f"{base_url}/api/agent/memory/add", json=data)
print(r.text)

print("\n=== 3. Search Memory ===")
data = {"query": "科技", "user_id": "user"}
r = requests.post(f"{base_url}/api/agent/memory/search", json=data)
print(r.text)

print("\n=== 4. Update Core Memory ===")
data = {"block": "user_preferences", "value": "偏好科技股和新能源，关注600519贵州茅台"}
r = requests.put(f"{base_url}/api/agent/memory/core", json=data)
print(r.text)

print("\n=== 5. Get Core Memory ===")
r = requests.get(f"{base_url}/api/agent/memory/core")
print(r.text[:500])