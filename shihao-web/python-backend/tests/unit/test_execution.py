"""Unit tests for execution module - Tree-based execution engine."""

import pytest
import asyncio
from crawler.execution import (
    Node,
    NodeType,
    LoopType,
    JudgeType,
    ExecutionEngine,
    CheckpointManager,
    ExecutionContext,
    ExecutionResult,
)


class TestNodeTypes:
    """Test node type definitions."""

    def test_node_type_values(self):
        assert NodeType.SEQUENCE.value == "sequence"
        assert NodeType.LOOP.value == "loop"
        assert NodeType.BRANCH.value == "branch"
        assert NodeType.BRANCH_OPTION.value == "branch_option"

    def test_loop_type_values(self):
        assert LoopType.SINGLE_ELEMENT.value == "single_element"
        assert LoopType.DYNAMIC_LIST.value == "dynamic_list"
        assert LoopType.TEXT_LIST.value == "text_list"
        assert LoopType.URL_LIST.value == "url_list"
        assert LoopType.JS_RETURN.value == "js_return"

    def test_judge_type_values(self):
        assert JudgeType.NO_CONDITION.value == "no_condition"
        assert JudgeType.PAGE_CONTAINS_TEXT.value == "page_contains_text"
        assert JudgeType.JS_RETURN.value == "js_return"


class TestNodeCreation:
    """Test node creation from dict."""

    def test_node_from_dict_basic(self):
        data = {
            "index": 0,
            "id": 0,
            "parentId": 0,
            "type": 0,
            "option": 0,
            "title": "root",
            "sequence": [],
            "isInLoop": False,
        }

        node = Node.from_dict(data)
        assert node.index == 0
        assert node.title == "root"
        assert node.node_type == NodeType.SEQUENCE

    def test_node_from_dict_with_parameters(self):
        data = {
            "index": 1,
            "id": 1,
            "option": 8,
            "title": "Loop",
            "type": 1,
            "sequence": [2, 3],
            "parameters": {
                "xpath": "//div[@class='item']",
                "loopType": 1,
                "wait": 1000,
                "useLoop": True,
            },
        }

        node = Node.from_dict(data)
        assert node.option == 8
        assert node.parameters.xpath == "//div[@class='item']"
        assert node.parameters.loop_type == 1
        assert node.parameters.wait == 1000

    def test_node_to_dict_roundtrip(self):
        data = {
            "index": 0,
            "id": 1,
            "type": 0,
            "option": 3,
            "title": "Extract",
            "sequence": [],
            "parameters": {
                "xpath": "//h1",
                "params": [
                    {
                        "name": "title",
                        "nodeType": 0,
                        "contentType": 0,
                        "relative": True,
                        "relativeXPath": "//text()",
                    }
                ],
            },
        }

        node = Node.from_dict(data)
        result = node.to_dict()

        assert result["title"] == "Extract"
        assert result["parameters"]["xpath"] == "//h1"
        assert len(result["parameters"]["params"]) == 1


class TestCheckpointManager:
    """Test checkpoint manager."""

    def test_checkpoint_save_and_load(self, tmp_path):
        manager = CheckpointManager("test_task", str(tmp_path))

        manager.save_checkpoint(
            step=10,
            url_index=5,
            data_count=100,
            metadata={"key": "value"},
        )

        checkpoint = manager.load_checkpoint()
        assert checkpoint is not None
        assert checkpoint.step == 10
        assert checkpoint.url_index == 5
        assert checkpoint.data_count == 100
        assert checkpoint.metadata["key"] == "value"

    def test_checkpoint_info(self, tmp_path):
        manager = CheckpointManager("test_task", str(tmp_path))

        manager.save_checkpoint(step=5, url_index=2, data_count=50)

        info = manager.get_checkpoint_info()
        assert info["exists"] is True
        assert info["step"] == 5

    def test_get_start_step(self, tmp_path):
        manager = CheckpointManager("test_task", str(tmp_path))

        manager.save_checkpoint(step=15, url_index=0, data_count=0)

        start_step = manager.get_start_step()
        assert start_step == 15

    def test_clear_checkpoint(self, tmp_path):
        manager = CheckpointManager("test_task", str(tmp_path))

        manager.save_checkpoint(step=10, url_index=0, data_count=0)
        assert manager.checkpoint_file.exists()

        manager.clear_checkpoint()
        assert not manager.checkpoint_file.exists()

    def test_download_folders_created(self, tmp_path):
        manager = CheckpointManager("test_task", str(tmp_path))

        assert manager.download_folder.exists()
        assert manager.images_folder.exists()
        assert manager.screenshots_folder.exists()


class TestExecutionEngine:
    """Test execution engine."""

    def test_engine_initialization(self):
        engine = ExecutionEngine()
        assert engine.state.value == "idle"

    @pytest.mark.asyncio
    async def test_execute_empty_nodes(self):
        engine = ExecutionEngine()
        context = ExecutionContext()

        result = await engine.execute([], context)

        assert result.success is False
        assert result.error == "No root node found"

    @pytest.mark.asyncio
    async def test_execute_single_sequence(self):
        engine = ExecutionEngine()

        root_data = {
            "index": 0,
            "type": 0,
            "option": 0,
            "title": "root",
            "sequence": [],
        }
        nodes = [Node.from_dict(root_data)]
        context = ExecutionContext()

        result = await engine.execute(nodes, context)

        assert result.success is True
        assert result.state.value == "completed"


class TestExecutionContext:
    """Test execution context."""

    def test_context_defaults(self):
        context = ExecutionContext()

        assert context.loop_value == ""
        assert context.loop_path == ""
        assert context.loop_index == 0
        assert context.output_parameters == {}
        assert context.data == []
        assert context.variables == {}

    def test_context_with_values(self):
        context = ExecutionContext(
            loop_value="test_item",
            loop_index=5,
            variables={"url": "https://example.com"},
        )

        assert context.loop_value == "test_item"
        assert context.loop_index == 5
        assert context.variables["url"] == "https://example.com"
