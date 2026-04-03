"""
TradingAgents-CN Ollama Adapter Integration Tests
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock


class TestOllamaAdapter:
    """Ollama 适配器集成测试"""

    @pytest.fixture
    def mock_httpx_response(self):
        """模拟 httpx 响应"""
        def create_response(json_data, status_code=200):
            response = MagicMock()
            response.status_code = status_code
            response.json.return_value = json_data
            response.raise_for_status = MagicMock()
            return response
        return create_response

    @pytest.mark.asyncio
    async def test_ollama_health_check_success(self):
        """测试 Ollama 健康检查成功"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"models": [{"name": "llama3"}]}
            mock_instance.get.return_value = mock_response
            mock_client.return_value = mock_instance
            
            result = await OllamaAdapter.check_health("http://localhost:11434")
            assert result is True

    @pytest.mark.asyncio
    async def test_ollama_health_check_failure(self):
        """测试 Ollama 健康检查失败"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get.side_effect = Exception("Connection refused")
            mock_client.return_value = mock_instance
            
            result = await OllamaAdapter.check_health("http://localhost:11434")
            assert result is False

    @pytest.mark.asyncio
    async def test_ollama_invoke_success(self, mock_httpx_response):
        """测试 Ollama 异步调用成功"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(model="llama3")
        
        mock_data = {
            "message": {"content": "Test response"},
            "prompt_eval_count": 10,
            "eval_count": 20
        }
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_data
            mock_response.raise_for_status = MagicMock()
            mock_instance.post.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance
            
            result = await adapter.ainvoke("Hello")
            
            assert result.content == "Test response"
            assert result.model == "llama3"
            assert result.usage["prompt_tokens"] == 10
            assert result.usage["completion_tokens"] == 20

    @pytest.mark.asyncio
    async def test_ollama_invoke_with_system_prompt(self, mock_httpx_response):
        """测试带系统提示的调用"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(model="llama3")
        
        mock_data = {
            "message": {"content": "Response with context"},
            "prompt_eval_count": 50,
            "eval_count": 30
        }
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_data
            mock_response.raise_for_status = MagicMock()
            mock_instance.post.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance
            
            result = await adapter.ainvoke("User query", system="You are a helpful assistant")
            
            assert "Response with context" in result.content

    @pytest.mark.asyncio
    async def test_ollama_url_validation(self):
        """测试 URL 验证"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        with pytest.raises(ValueError, match="Invalid URL scheme"):
            adapter = OllamaAdapter(base_url="ftp://localhost:11434")

    @pytest.mark.asyncio
    async def test_ollama_streaming(self, mock_httpx_response):
        """测试流式输出"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(model="llama3")
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            
            mock_stream_ctx = MagicMock()
            mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_stream_ctx)
            mock_stream_ctx.__aexit__ = AsyncMock(return_value=None)
            
            async def mock_aiter():
                yield b'{"message": {"content": "chunk1"}}\n'
                yield b'{"message": {"content": "chunk2"}}\n'
            
            mock_stream_ctx.aiter_lines.return_value = mock_aiter()
            mock_stream_ctx.raise_for_status = MagicMock()
            mock_instance.stream.return_value = mock_stream_ctx
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance
            
            chunks = []
            async for chunk in adapter.astream("Hello"):
                chunks.append(chunk)
            
            assert "chunk1" in chunks
            assert "chunk2" in chunks

    @pytest.mark.asyncio
    async def test_ollama_error_handling(self):
        """测试错误处理"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        import httpx
        
        adapter = OllamaAdapter(model="llama3")
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.side_effect = httpx.HTTPError("Network error")
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance
            
            with pytest.raises(RuntimeError, match="Ollama API request failed"):
                await adapter.ainvoke("Hello")

    def test_ollama_supports_streaming(self):
        """测试流式支持"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(model="llama3")
        assert adapter.supports_streaming() is True

    def test_ollama_no_function_calling(self):
        """测试不支持函数调用"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(model="llama3")
        assert adapter.supports_function_calling() is False

    def test_ollama_provider_name(self):
        """测试提供商名称"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(model="llama3")
        assert adapter.get_provider_name() == "ollama"

    @pytest.mark.asyncio
    async def test_ollama_list_models(self):
        """测试列出模型"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "models": [
                    {"name": "llama3"},
                    {"name": "mistral"},
                    {"name": "codellama"}
                ]
            }
            mock_instance.get.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance
            
            models = await OllamaAdapter.list_models()
            
            assert "llama3" in models
            assert "mistral" in models
            assert "codellama" in models
