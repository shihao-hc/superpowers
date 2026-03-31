"""Tree-based execution engine inspired by EasySpider."""

import asyncio
import os
import random
import time
from dataclasses import dataclass, field
from typing import Optional, Any, Callable
from enum import Enum

from .nodes import (
    Node,
    NodeType,
    NodeTypeCode,
    LoopType,
    JudgeType,
    ExtractParameter,
    NodeParameters,
)


class ExecutionState(Enum):
    """Execution state."""

    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ExecutionContext:
    """Context passed through tree execution."""

    page: Any = None
    browser: Any = None
    loop_value: str = ""
    loop_path: str = ""
    loop_index: int = 0
    output_parameters: dict = field(default_factory=dict)
    data: list = field(default_factory=list)
    variables: dict = field(default_factory=dict)


@dataclass
class ExecutionResult:
    """Result of execution."""

    success: bool
    state: ExecutionState
    data: list = field(default_factory=list)
    error: Optional[str] = None
    steps_executed: int = 0
    metadata: dict = field(default_factory=dict)


class ExecutionEngine:
    """Tree-based execution engine for crawler tasks."""

    def __init__(
        self,
        on_progress: Optional[Callable[[int, int, str], None]] = None,
        on_data: Optional[Callable[[dict], None]] = None,
    ):
        self._on_progress = on_progress
        self._on_data = on_data
        self._state = ExecutionState.IDLE
        self._steps_executed = 0
        self._pause_event = asyncio.Event()
        self._pause_event.set()
        self._shutdown_event = asyncio.Event()

    @property
    def state(self) -> ExecutionState:
        return self._state

    async def execute(
        self,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> ExecutionResult:
        """Execute the task tree."""
        self._state = ExecutionState.RUNNING
        self._steps_executed = 0
        self._shutdown_event.clear()
        self._pause_event.set()

        try:
            root = nodes[0] if nodes else None
            if not root:
                return ExecutionResult(
                    success=False,
                    state=ExecutionState.FAILED,
                    error="No root node found",
                )

            await self._execute_node(root, nodes, context)

            self._state = ExecutionState.COMPLETED
            return ExecutionResult(
                success=True,
                state=ExecutionState.COMPLETED,
                data=context.data,
                steps_executed=self._steps_executed,
            )
        except Exception as e:
            self._state = ExecutionState.FAILED
            return ExecutionResult(
                success=False,
                state=ExecutionState.FAILED,
                error=str(e),
                steps_executed=self._steps_executed,
            )

    async def pause(self) -> None:
        """Pause execution."""
        self._pause_event.clear()
        self._state = ExecutionState.PAUSED

    async def resume(self) -> None:
        """Resume execution."""
        self._pause_event.set()
        self._state = ExecutionState.RUNNING

    async def stop(self) -> None:
        """Stop execution."""
        self._shutdown_event.set()
        self._pause_event.set()

    async def _execute_node(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Execute a single node."""
        if self._shutdown_event.is_set():
            return

        await self._pause_event.wait()
        self._steps_executed += 1

        if self._on_progress:
            self._on_progress(self._steps_executed, len(nodes), node.title)

        node_type = node.node_type
        option = node.option

        if (
            node_type == NodeType.SEQUENCE
            or option == NodeTypeCode.ROOT.value
            or option == NodeTypeCode.SEQUENCE.value
        ):
            await self._execute_sequence(node, nodes, context)
        elif option == NodeTypeCode.OPEN_PAGE.value:
            await self._open_page(node, context)
        elif option == NodeTypeCode.CLICK.value:
            await self._click_element(node, context)
        elif option == NodeTypeCode.EXTRACT.value:
            await self._extract_data(node, context)
        elif option == NodeTypeCode.INPUT.value:
            await self._input_text(node, context)
        elif option == NodeTypeCode.CUSTOM.value:
            await self._custom_operation(node, context)
        elif option == NodeTypeCode.SELECT.value:
            await self._select_option(node, context)
        elif option == NodeTypeCode.MOVE.value:
            await self._move_to_element(node, context)
        elif option == NodeTypeCode.LOOP.value:
            await self._loop_execute(node, nodes, context)
        elif option == NodeTypeCode.JUDGE.value:
            await self._judge_execute(node, nodes, context)

    async def _execute_sequence(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Execute sequence of child nodes."""
        for child_index in node.sequence:
            if child_index < len(nodes):
                child = nodes[child_index]
                await self._execute_node(child, nodes, context)

    async def _open_page(self, node: Node, context: ExecutionContext) -> None:
        """Open a webpage."""
        params = node.parameters

        url = context.variables.get("url", "")
        if not url and params.xpath:
            url = params.xpath

        if not url:
            return

        if context.browser:
            context.browser.get(url)
        elif context.page:
            await context.page.goto(url)

        await self._wait_after_operation(node, context)

    async def _click_element(
        self,
        node: Node,
        context: ExecutionContext,
    ) -> None:
        """Click an element."""
        params = node.parameters

        xpath = self._get_final_xpath(params, context)
        if not xpath:
            return

        try:
            element = await self._find_element_with_fallback(
                context.page, xpath, params.all_xpaths
            )
            if element:
                await element.click()
        except Exception as e:
            pass

        await self._wait_after_operation(node, context)

    async def _extract_data(
        self,
        node: Node,
        context: ExecutionContext,
    ) -> None:
        """Extract data from page."""
        params = node.parameters

        if params.clear:
            context.output_parameters.clear()

        row = {}
        for param in params.params:
            value = await self._extract_field(param, context)
            row[param.name] = value
            context.output_parameters[param.name] = value

        if row:
            context.data.append(row)
            if self._on_data:
                self._on_data(row)

    async def _extract_field(
        self,
        param: ExtractParameter,
        context: ExecutionContext,
    ) -> str:
        """Extract a single field."""
        xpath = param.relative_xpath
        content_type = param.content_type

        try:
            if context.page:
                if content_type == 0:
                    element = await context.page.wait_for_selector(
                        f"xpath={xpath}", timeout=5000
                    )
                    return await element.inner_text()
                elif content_type == 1:
                    element = await context.page.wait_for_selector(
                        f"xpath={xpath}", timeout=5000
                    )
                    return await element.inner_text()
                elif content_type == 2:
                    element = await context.page.wait_for_selector(
                        f"xpath={xpath}", timeout=5000
                    )
                    return await element.inner_html()
                elif content_type == 3:
                    element = await context.page.wait_for_selector(
                        f"xpath={xpath}", timeout=5000
                    )
                    return await element.inner_html()
        except Exception:
            pass

        return param.default_value

    async def _input_text(
        self,
        node: Node,
        context: ExecutionContext,
    ) -> None:
        """Input text into element."""
        params = node.parameters

        xpath = self._get_final_xpath(params, context)
        if not xpath:
            return

        value = params.code or params.xpath

        try:
            element = await context.page.wait_for_selector(
                f"xpath={xpath}", timeout=5000
            )
            await element.fill(value)
        except Exception:
            pass

        await self._wait_after_operation(node, context)

    async def _custom_operation(
        self,
        node: Node,
        context: ExecutionContext,
    ) -> None:
        """Execute custom operation (JS only - OS commands disabled for security)."""
        params = node.parameters
        code_mode = params.code_mode
        code = params.code

        if code_mode == 0:
            if context.page:
                try:
                    result = await context.page.evaluate(code)
                    context.output_parameters[node.title] = (
                        str(result) if result else ""
                    )
                except Exception as e:
                    context.output_parameters[node.title] = f"Error: {e}"
        elif code_mode == 1:
            context.output_parameters[node.title] = (
                "Error: OS command execution disabled for security"
            )

        await self._wait_after_operation(node, context)

    async def _select_option(
        self,
        node: Node,
        context: ExecutionContext,
    ) -> None:
        """Select dropdown option."""
        params = node.parameters

        xpath = self._get_final_xpath(params, context)
        if not xpath:
            return

        option_mode = params.select_option_mode
        option_value = params.select_option_value

        try:
            element = await context.page.wait_for_selector(
                f"xpath={xpath}", timeout=5000
            )
            if option_mode == 1:
                await element.select_option(index=int(option_value))
            elif option_mode == 3:
                await element.select_option(option_value)
        except Exception:
            pass

    async def _move_to_element(
        self,
        node: Node,
        context: ExecutionContext,
    ) -> None:
        """Move mouse to element (hover)."""
        params = node.parameters

        xpath = self._get_final_xpath(params, context)
        if not xpath:
            return

        try:
            element = await context.page.wait_for_selector(
                f"xpath={xpath}", timeout=5000
            )
            await element.hover()
        except Exception:
            pass

    async def _loop_execute(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Execute loop iteration."""
        params = node.parameters
        loop_type = params.loop_type

        if loop_type == LoopType.DYNAMIC_LIST.value:
            await self._loop_dynamic_list(node, nodes, context)
        elif loop_type == LoopType.TEXT_LIST.value:
            await self._loop_text_list(node, nodes, context)
        elif loop_type == LoopType.URL_LIST.value:
            await self._loop_url_list(node, nodes, context)
        elif loop_type == LoopType.JS_RETURN.value:
            await self._loop_js_return(node, nodes, context)
        elif loop_type == LoopType.SINGLE_ELEMENT.value:
            await self._loop_single_element(node, nodes, context)
        else:
            await self._loop_dynamic_list(node, nodes, context)

    async def _loop_dynamic_list(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Loop over dynamic element list."""
        params = node.parameters
        xpath = params.xpath or params.base_xpath

        if not xpath:
            return

        try:
            if context.page:
                elements = await context.page.query_selector_all(f"xpath={xpath}")
                for i, element in enumerate(elements):
                    if i < params.skip_count:
                        continue
                    context.loop_index = i
                    context.loop_path = xpath

                    for child_index in node.sequence:
                        if child_index < len(nodes):
                            child = nodes[child_index]
                            await self._execute_node(child, nodes, context)

                    if self._shutdown_event.is_set():
                        break
        except Exception:
            pass

    async def _loop_text_list(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Loop over text list."""
        params = node.parameters
        text_list = params.text_list.split("\n")

        for i, text in enumerate(text_list):
            if not text.strip():
                continue

            context.loop_index = i
            context.loop_value = text

            for child_index in node.sequence:
                if child_index < len(nodes):
                    child = nodes[child_index]
                    await self._execute_node(child, nodes, context)

            if self._shutdown_event.is_set():
                break

    async def _loop_url_list(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Loop over URL list."""
        params = node.parameters
        url_list = params.text_list.split("\n")

        for i, url in enumerate(url_list):
            if not url.strip():
                continue

            context.loop_index = i
            context.variables["url"] = url.strip()

            if context.browser:
                context.browser.get(url.strip())
            elif context.page:
                await context.page.goto(url.strip())

            for child_index in node.sequence:
                if child_index < len(nodes):
                    child = nodes[child_index]
                    await self._execute_node(child, nodes, context)

            if self._shutdown_event.is_set():
                break

    async def _loop_js_return(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Loop over JS command return values."""
        params = node.parameters

        try:
            if context.page:
                result = await context.page.evaluate(params.code)
                if isinstance(result, list):
                    for i, item in enumerate(result):
                        context.loop_index = i
                        context.loop_value = str(item)

                        for child_index in node.sequence:
                            if child_index < len(nodes):
                                child = nodes[child_index]
                                await self._execute_node(child, nodes, context)
        except Exception:
            pass

    async def _loop_single_element(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Loop over single element."""
        params = node.parameters
        exit_count = params.exit_count

        for i in range(exit_count):
            context.loop_index = i

            for child_index in node.sequence:
                if child_index < len(nodes):
                    child = nodes[child_index]
                    await self._execute_node(child, nodes, context)

            if self._shutdown_event.is_set():
                break

    async def _judge_execute(
        self,
        node: Node,
        nodes: list[Node],
        context: ExecutionContext,
    ) -> None:
        """Execute conditional branch."""
        params = node.parameters
        judge_class = params.judge_class

        branch_index = 0
        if judge_class == JudgeType.PAGE_CONTAINS_TEXT.value:
            if params.condition_text in context.output_parameters.get(
                "page_content", ""
            ):
                branch_index = 0
            else:
                branch_index = 1
        elif judge_class == JudgeType.JS_RETURN.value:
            try:
                if context.page:
                    result = await context.page.evaluate(params.condition_js)
                    branch_index = 0 if result else 1
            except Exception:
                branch_index = 1
        elif judge_class == JudgeType.NO_CONDITION.value:
            branch_index = 0

        if branch_index < len(node.sequence):
            child_index = node.sequence[branch_index]
            if child_index < len(nodes):
                child = nodes[child_index]
                await self._execute_node(child, nodes, context)

    async def _find_element_with_fallback(
        self,
        page: Any,
        xpath: str,
        fallback_xpaths: list[str],
    ) -> Optional[Any]:
        """Find element with XPath fallback."""
        all_xpaths = [xpath] + fallback_xpaths

        for xp in all_xpaths:
            if not xp:
                continue
            try:
                element = await page.wait_for_selector(f"xpath={xp}", timeout=3000)
                return element
            except Exception:
                continue

        return None

    def _get_final_xpath(
        self, params: NodeParameters, context: ExecutionContext
    ) -> str:
        """Get final XPath considering loop context."""
        xpath = params.xpath

        if params.use_loop and context.loop_path:
            return f"({context.loop_path})[{context.loop_index + 1}]{xpath}"

        return xpath

    async def _wait_after_operation(
        self, node: Node, context: ExecutionContext
    ) -> None:
        """Wait after operation based on node parameters."""
        params = node.parameters

        if params.wait > 0:
            wait_time = params.wait / 1000.0
            await asyncio.sleep(wait_time)

        if params.wait_type == 1:
            random_wait = random.uniform(0.5, 2.0)
            await asyncio.sleep(random_wait)

        if params.wait_element:
            try:
                await context.page.wait_for_selector(
                    f"xpath={params.wait_element}",
                    timeout=params.wait_element_time * 1000,
                )
            except Exception:
                pass

        if params.after_js:
            try:
                if context.page:
                    await context.page.evaluate(params.after_js)
            except Exception:
                pass

        if params.after_js_wait_time > 0:
            await asyncio.sleep(params.after_js_wait_time / 1000.0)
