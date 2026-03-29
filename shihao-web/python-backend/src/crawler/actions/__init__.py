"""Actions module for page interaction automation."""

from typing import Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import asyncio


class ActionType(str, Enum):
    """Supported action types."""

    CLICK = "click"
    TYPE = "write"
    PRESS = "press"
    WAIT = "wait"
    SCROLL = "scroll"
    HOVER = "hover"
    SELECT = "select"
    CHECK = "check"
    SCREENSHOT = "screenshot"
    NAVIGATE = "navigate"
    WAIT_FOR_SELECTOR = "wait_for_selector"
    WAIT_FOR_NAVIGATION = "wait_for_navigation"


@dataclass
class Action:
    """Single action step for page interaction."""

    action_type: str
    value: Optional[str] = None
    selector: Optional[str] = None
    key: Optional[str] = None
    milliseconds: Optional[int] = None
    x: Optional[int] = None
    y: Optional[int] = None
    direction: Optional[str] = None


@dataclass
class ActionResult:
    """Result of action execution."""

    success: bool
    action_type: str
    output: Optional[str] = None
    error: Optional[str] = None
    screenshot: Optional[str] = None


class ActionExecutor:
    """Execute actions on a page using Playwright."""

    def __init__(self, page: Any = None):
        self._page = page
        self._action_history: list[ActionResult] = []

    def set_page(self, page: Any) -> None:
        """Set the page object for actions."""
        self._page = page

    async def execute(self, action: Action) -> ActionResult:
        """Execute a single action."""
        if not self._page:
            return ActionResult(
                success=False,
                action_type=action.action_type,
                error="No page object set",
            )

        try:
            result = await self._execute_action(action)
            self._action_history.append(result)
            return result
        except Exception as e:
            result = ActionResult(
                success=False, action_type=action.action_type, error=str(e)
            )
            self._action_history.append(result)
            return result

    async def _execute_action(self, action: Action) -> ActionResult:
        """Internal action execution."""
        action_type = action.action_type.lower()

        if action_type == ActionType.CLICK.value or action_type == "click":
            return await self._click(action)
        elif action_type in (ActionType.TYPE.value, "type", "write", "input"):
            return await self._type(action)
        elif action_type == ActionType.PRESS.value or action_type == "press":
            return await self._press(action)
        elif action_type == ActionType.WAIT.value or action_type == "wait":
            return await self._wait(action)
        elif action_type in (ActionType.SCROLL.value, "scroll"):
            return await self._scroll(action)
        elif action_type == ActionType.HOVER.value or action_type == "hover":
            return await self._hover(action)
        elif action_type == ActionType.SCREENSHOT.value or action_type == "screenshot":
            return await self._screenshot(action)
        elif (
            action_type == ActionType.WAIT_FOR_SELECTOR.value
            or action_type == "wait_for_selector"
        ):
            return await self._wait_for_selector(action)
        else:
            return ActionResult(
                success=False,
                action_type=action.action_type,
                error=f"Unknown action type: {action.action_type}",
            )

    async def _click(self, action: Action) -> ActionResult:
        """Click on element."""
        selector = action.selector or action.value
        if action.x is not None and action.y is not None:
            await self._page.mouse.click(action.x, action.y)
        elif selector:
            await self._page.click(selector)
        else:
            return ActionResult(
                success=False,
                action_type=action.action_type,
                error="No selector or coordinates provided",
            )

        return ActionResult(
            success=True,
            action_type=action.action_type,
            output=f"Clicked on {selector or f'({action.x}, {action.y})'}",
        )

    async def _type(self, action: Action) -> ActionResult:
        """Type text into element."""
        selector = action.selector or action.value
        text = action.value

        if not text:
            return ActionResult(
                success=False, action_type=action.action_type, error="No text provided"
            )

        if selector:
            await self._page.fill(selector, text)
        else:
            await self._page.keyboard.type(text)

        return ActionResult(
            success=True,
            action_type=action.action_type,
            output=f"Typed '{text[:50]}...' into {selector}"
            if len(text) > 50
            else f"Typed '{text}' into {selector}",
        )

    async def _press(self, action: Action) -> ActionResult:
        """Press a key."""
        key = action.key or action.value
        if not key:
            return ActionResult(
                success=False, action_type=action.action_type, error="No key provided"
            )

        await self._page.keyboard.press(key)

        return ActionResult(
            success=True, action_type=action.action_type, output=f"Pressed key: {key}"
        )

    async def _wait(self, action: Action) -> ActionResult:
        """Wait for specified milliseconds."""
        ms = action.milliseconds or int(action.value or "1000")
        await asyncio.sleep(ms / 1000)

        return ActionResult(
            success=True, action_type=action.action_type, output=f"Waited {ms}ms"
        )

    async def _scroll(self, action: Action) -> ActionResult:
        """Scroll the page."""
        direction = action.direction or "down"

        try:
            amount = min(abs(int(action.value or "300")), 10000)
        except (ValueError, TypeError):
            amount = 300

        if direction == "down":
            await self._page.evaluate(f"window.scrollBy(0, {amount})")
        elif direction == "up":
            await self._page.evaluate(f"window.scrollBy(0, -{amount})")
        elif direction == "top":
            await self._page.evaluate("window.scrollTo(0, 0)")
        elif direction == "bottom":
            await self._page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        return ActionResult(
            success=True,
            action_type=action.action_type,
            output=f"Scrolled {direction} by {amount}px",
        )

    async def _hover(self, action: Action) -> ActionResult:
        """Hover over element."""
        selector = action.selector or action.value
        if not selector:
            return ActionResult(
                success=False,
                action_type=action.action_type,
                error="No selector provided",
            )

        await self._page.hover(selector)

        return ActionResult(
            success=True,
            action_type=action.action_type,
            output=f"Hovered over {selector}",
        )

    async def _screenshot(self, action: Action) -> ActionResult:
        """Take a screenshot."""
        screenshot_bytes = await self._page.screenshot()
        screenshot_base64 = (
            screenshot_bytes.decode("base64")
            if isinstance(screenshot_bytes, bytes)
            else ""
        )

        return ActionResult(
            success=True,
            action_type=action.action_type,
            screenshot=screenshot_base64,
            output="Screenshot captured",
        )

    async def _wait_for_selector(self, action: Action) -> ActionResult:
        """Wait for selector to appear."""
        selector = action.selector or action.value
        timeout = action.milliseconds or 10000

        if not selector:
            return ActionResult(
                success=False,
                action_type=action.action_type,
                error="No selector provided",
            )

        await self._page.wait_for_selector(selector, timeout=timeout)

        return ActionResult(
            success=True,
            action_type=action.action_type,
            output=f"Selector {selector} appeared",
        )

    @property
    def history(self) -> list[ActionResult]:
        """Get action execution history."""
        return self._action_history.copy()


def parse_actions(actions_data: list[dict]) -> list[Action]:
    """Parse actions from list of dicts to Action objects."""
    actions = []
    for data in actions_data:
        action = Action(
            action_type=data.get("type", ""),
            value=data.get("text", data.get("value")),
            selector=data.get("selector"),
            key=data.get("key"),
            milliseconds=data.get("milliseconds"),
            x=data.get("x"),
            y=data.get("y"),
            direction=data.get("direction"),
        )
        actions.append(action)
    return actions


async def execute_action_sequence(
    page: Any,
    actions: list[Action],
    on_progress: Optional[Callable[[int, int, str], None]] = None,
) -> list[ActionResult]:
    """Execute a sequence of actions on a page."""
    executor = ActionExecutor(page)
    results = []

    for i, action in enumerate(actions):
        if on_progress:
            on_progress(i + 1, len(actions), action.action_type)

        result = await executor.execute(action)
        results.append(result)

        if not result.success:
            break

    return results
