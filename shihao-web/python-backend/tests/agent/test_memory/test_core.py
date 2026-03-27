# tests/agent/test_memory/test_core.py

import pytest
from shihao_finance.agent.memory.core import CoreMemory, MemoryBlock

class TestCoreMemory:
    def test_default_initialization(self):
        """测试默认初始化"""
        memory = CoreMemory()
        assert memory.persona is not None
        assert memory.risk_profile is not None
        assert memory.user_preferences is not None
    
    def test_update_block(self):
        """测试更新记忆块"""
        memory = CoreMemory()
        memory.update_block("persona", "新的人格定义")
        assert memory.get_block("persona") == "新的人格定义"
    
    def test_max_tokens_limit(self):
        """测试Token限制"""
        memory = CoreMemory()
        long_text = "x" * 10000
        with pytest.raises(ValueError):
            memory.update_block("persona", long_text)
    
    def test_export_import(self):
        """测试导出导入"""
        memory = CoreMemory()
        memory.update_block("user_preferences", "偏好科技股")
        
        exported = memory.export()
        new_memory = CoreMemory.from_dict(exported)
        
        assert new_memory.get_block("user_preferences") == "偏好科技股"
