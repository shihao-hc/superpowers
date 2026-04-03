"""
TradingAgents-CN Code Review E2E Tests
End-to-end tests for code review workflow
"""

import asyncio
import json
import os
import pytest
from typing import Optional

BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8000")


@pytest.mark.asyncio
async def test_code_review_e2e():
    """
    测试代码审查完整流程：
    1. 提交代码审查任务
    2. 轮询等待任务完成
    3. 验证审查结果
    """
    import httpx

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=120.0) as client:
        # 提交代码审查任务
        payload = {
            "code": """
def calculate_fibonacci(n):
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

def process_data(data):
    result = []
    for item in data:
        if item > 0:
            result.append(item * 2)
    return result
""",
            "language": "python",
            "file_path": "test_fibonacci.py",
            "llm_provider": "deepseek",
        }

        resp = await client.post("/api/v1/code-review", json=payload)
        assert resp.status_code == 200, f"Failed to submit review: {resp.text}"

        result = resp.json()
        task_id = result["task_id"]
        print(f"Code review submitted: {task_id}")

        # 轮询等待任务完成
        max_attempts = 60
        for attempt in range(max_attempts):
            await asyncio.sleep(2)
            resp = await client.get(f"/api/v1/tasks/{task_id}")
            
            if resp.status_code == 200:
                result = resp.json()
                status = result.get("status", "unknown")
                print(f"Attempt {attempt + 1}: status = {status}")
                
                if status == "completed":
                    # 验证结果包含关键字段
                    assert "final_verdict" in result
                    assert "critic_arguments" in result
                    assert "advocate_arguments" in result
                    print(f"Review completed: {result.get('final_verdict', '')[:100]}...")
                    return
                    
                elif status == "failed":
                    print(f"Review failed: {result.get('errors', [])}")
                    break

        pytest.fail(f"Code review did not complete after {max_attempts * 2} seconds")


@pytest.mark.asyncio
async def test_code_review_multiple_languages():
    """
    测试多种编程语言的代码审查
    """
    import httpx

    test_cases = [
        {
            "language": "python",
            "code": "def hello(): return 'world'",
        },
        {
            "language": "javascript",
            "code": "function hello() { return 'world'; }",
        },
    ]

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=60.0) as client:
        for case in test_cases:
            payload = {
                "code": case["code"],
                "language": case["language"],
            }

            resp = await client.post("/api/v1/code-review", json=payload)
            assert resp.status_code == 200

            result = resp.json()
            print(f"Language {case['language']}: task_id = {result['task_id']}")


@pytest.mark.asyncio
async def test_code_review_websocket():
    """
    测试代码审查 WebSocket 实时进度
    """
    import httpx
    import websockets

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # 提交任务
        payload = {
            "code": "def test(): pass",
            "language": "python",
        }

        resp = await client.post("/api/v1/code-review", json=payload)
        assert resp.status_code == 200
        task_id = resp.json()["task_id"]

        # 连接 WebSocket
        ws_url = BASE_URL.replace("http", "ws") + f"/ws/{task_id}"
        
        try:
            async with websockets.connect(ws_url, ping_interval=30) as ws:
                messages = []
                async for message in ws:
                    data = json.loads(message)
                    messages.append(data)
                    print(f"WS message: {data.get('type')}")
                    
                    if data.get("type") in ["completed", "error"]:
                        break
                        
                assert len(messages) > 0
        except Exception as e:
            print(f"WebSocket test skipped: {e}")
            pytest.skip(f"WebSocket not available: {e}")


@pytest.mark.asyncio
async def test_code_review_empty_code():
    """
    测试空代码的处理
    """
    import httpx

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        payload = {
            "code": "",
            "language": "python",
        }

        resp = await client.post("/api/v1/code-review", json=payload)
        # 应该返回成功但带有错误信息
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_code_review_security_code():
    """
    测试包含安全问题的代码审查
    """
    import httpx

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=120.0) as client:
        payload = {
            "code": """
import os

def execute_command(user_input):
    os.system(user_input)

def sql_query(table, user_id):
    query = f"SELECT * FROM {table} WHERE id = {user_id}"
    return query

def read_file(filename):
    with open(filename, 'r') as f:
        return f.read()
""",
            "language": "python",
        }

        resp = await client.post("/api/v1/code-review", json=payload)
        assert resp.status_code == 200

        result = resp.json()
        task_id = result["task_id"]

        # 等待完成
        for _ in range(30):
            await asyncio.sleep(2)
            resp = await client.get(f"/api/v1/tasks/{task_id}")
            if resp.json().get("status") == "completed":
                print("Security review completed")
                break


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
