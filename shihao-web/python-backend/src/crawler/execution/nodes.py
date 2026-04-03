"""Node types and data structures for tree-based execution."""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Any


class NodeType(str, Enum):
    """Node type classification."""

    SEQUENCE = "sequence"
    LOOP = "loop"
    BRANCH = "branch"
    BRANCH_OPTION = "branch_option"


NODE_TYPE_CODE_MAP = {
    0: "sequence",
    1: "loop",
    2: "branch",
    3: "branch_option",
}


def _get_node_type(type_value) -> NodeType:
    """Get NodeType from int or string."""
    if isinstance(type_value, int):
        return NodeType(NODE_TYPE_CODE_MAP.get(type_value, "sequence"))
    elif isinstance(type_value, str):
        return NodeType(type_value)
    return NodeType.SEQUENCE


class LoopType(str, Enum):
    """Loop iteration types."""

    SINGLE_ELEMENT = "single_element"
    DYNAMIC_LIST = "dynamic_list"
    FIXED_LIST = "fixed_list"
    TEXT_LIST = "text_list"
    URL_LIST = "url_list"
    JS_RETURN = "js_return"
    OS_COMMAND = "os_command"
    PYTHON_EXPR = "python_expr"


class JudgeType(str, Enum):
    """Condition branch types."""

    NO_CONDITION = "no_condition"
    PAGE_CONTAINS_TEXT = "page_contains_text"
    PAGE_CONTAINS_ELEMENT = "page_contains_element"
    LOOP_ITEM_CONTAINS_TEXT = "loop_item_contains_text"
    LOOP_ITEM_CONTAINS_ELEMENT = "loop_item_contains_element"
    JS_RETURN = "js_return"
    OS_COMMAND = "os_command"
    PYTHON_EXPR = "python_expr"
    LOOP_ITEM_JS = "loop_item_js"


class ExtractType(str, Enum):
    """Data extraction types."""

    NORMAL = "normal"
    OCR = "ocr"


class ContentType(str, Enum):
    """Content extraction types."""

    TEXT = "text"
    DIRECT_TEXT = "direct_text"
    INNER_HTML = "inner_html"
    OUTER_HTML = "outer_html"
    BACKGROUND_IMAGE = "background_image"
    PAGE_URL = "page_url"
    PAGE_TITLE = "page_title"
    SELECTED_OPTION_VALUE = "selected_option_value"
    SELECTED_OPTION_TEXT = "selected_option_text"
    ELEMENT_SCREENSHOT = "element_screenshot"


class NodeTypeCode(int, Enum):
    """Node type codes (for compatibility)."""

    ROOT = 0
    OPEN_PAGE = 1
    CLICK = 2
    EXTRACT = 3
    INPUT = 4
    CUSTOM = 5
    SELECT = 6
    MOVE = 7
    LOOP = 8
    JUDGE = 9
    SEQUENCE = 10
    BRANCH_OPTION = 11


@dataclass
class ExtractParameter:
    """Parameter for data extraction."""

    name: str
    node_type: int = 0
    content_type: int = 0
    relative: bool = True
    relative_xpath: str = "//body"
    all_xpaths: list[str] = field(default_factory=list)
    example_values: list[dict] = field(default_factory=list)
    default_value: str = ""
    before_js: str = ""
    before_js_wait_time: int = 0
    after_js: str = ""
    js_code: str = ""
    js_wait_time: int = 0
    after_js_wait_time: int = 0
    iframe: bool = False
    extract_type: int = 0
    download_pic: int = 0
    record_as_field: int = 1
    split_line: int = 0
    unique_index: str = ""


@dataclass
class NodeParameters:
    """Parameters for a node."""

    xpath: str = ""
    all_xpaths: list[str] = field(default_factory=list)
    use_loop: bool = False
    iframe: bool = False
    wait: int = 0
    wait_type: int = 0
    before_js: str = ""
    before_js_wait_time: int = 0
    after_js: str = ""
    after_js_wait_time: int = 0
    wait_element: str = ""
    wait_element_time: int = 10
    wait_element_iframe_index: int = 0
    history: int = 1
    tab_index: int = 0
    cookies: str = ""
    alert_handle_type: int = 0
    params: list[ExtractParameter] = field(default_factory=list)
    record_as_field: int = 1
    clear: int = 0
    new_line: int = 1
    index: int = 0
    code_mode: int = 0
    code: str = ""
    wait_time: int = 0
    loop_type: int = 0
    text_list: str = ""
    path_list: str = ""
    exit_element: str = ""
    exit_count: int = 0
    skip_count: int = 0
    scroll_type: int = 0
    scroll_count: int = 1
    scroll_wait_time: float = 1.0
    judge_class: int = 0
    condition_text: str = ""
    condition_js: str = ""
    select_option_mode: int = 0
    select_option_value: str = ""
    quick_extractable: bool = False
    base_xpath: str = ""
    quick_params: list[dict] = field(default_factory=list)
    optimizable: bool = False


def _create_extract_parameter(data: dict) -> ExtractParameter:
    """Create ExtractParameter from dictionary."""
    return ExtractParameter(
        name=data.get("name", ""),
        node_type=data.get("nodeType", data.get("node_type", 0)),
        content_type=data.get("contentType", data.get("content_type", 0)),
        relative=data.get("relative", True),
        relative_xpath=data.get("relativeXPath", data.get("relative_xpath", "//body")),
        all_xpaths=data.get("allXPaths", data.get("all_xpaths", [])),
        example_values=data.get("exampleValues", data.get("example_values", [])),
        default_value=data.get("default", data.get("default_value", "")),
        before_js=data.get("beforeJS", data.get("before_js", "")),
        after_js=data.get("afterJS", data.get("after_js", "")),
        js_code=data.get("JS", data.get("js_code", "")),
        js_wait_time=data.get("JSWaitTime", data.get("js_wait_time", 0)),
        after_js_wait_time=data.get(
            "afterJSWaitTime", data.get("after_js_wait_time", 0)
        ),
        iframe=data.get("iframe", False),
        extract_type=data.get("extractType", data.get("extract_type", 0)),
        download_pic=data.get("downloadPic", data.get("download_pic", 0)),
        record_as_field=data.get("recordASField", data.get("record_as_field", 1)),
        split_line=data.get("splitLine", data.get("split_line", 0)),
        unique_index=data.get("unique_index", ""),
    )


@dataclass
class Node:
    """Base node for tree execution."""

    index: int
    id: int = 0
    parent_id: int = 0
    node_type: NodeType = NodeType.SEQUENCE
    option: int = 0
    title: str = "root"
    sequence: list[int] = field(default_factory=list)
    parameters: NodeParameters = field(default_factory=NodeParameters)
    is_in_loop: bool = False

    @classmethod
    def from_dict(cls, data: dict) -> "Node":
        """Create Node from dictionary."""
        params_data = data.get("parameters", {})
        params = NodeParameters(
            xpath=params_data.get("xpath", ""),
            all_xpaths=params_data.get("allXPaths", params_data.get("all_xpaths", [])),
            use_loop=params_data.get("useLoop", params_data.get("use_loop", False)),
            iframe=params_data.get("iframe", False),
            wait=params_data.get("wait", 0),
            wait_type=params_data.get("waitType", params_data.get("wait_type", 0)),
            before_js=params_data.get("beforeJS", params_data.get("before_js", "")),
            before_js_wait_time=params_data.get(
                "beforeJSWaitTime", params_data.get("before_js_wait_time", 0)
            ),
            after_js=params_data.get("afterJS", params_data.get("after_js", "")),
            after_js_wait_time=params_data.get(
                "afterJSWaitTime", params_data.get("after_js_wait_time", 0)
            ),
            wait_element=params_data.get(
                "waitElement", params_data.get("wait_element", "")
            ),
            wait_element_time=params_data.get(
                "waitElementTime", params_data.get("wait_element_time", 10)
            ),
            wait_element_iframe_index=params_data.get(
                "waitElementIframeIndex",
                params_data.get("wait_element_iframe_index", 0),
            ),
            history=params_data.get("history", 1),
            tab_index=params_data.get("tabIndex", params_data.get("tab_index", 0)),
            cookies=params_data.get("cookies", ""),
            alert_handle_type=params_data.get(
                "alertHandleType", params_data.get("alert_handle_type", 0)
            ),
            params=[
                _create_extract_parameter(p) if isinstance(p, dict) else p
                for p in params_data.get("params", params_data.get("paras", []))
            ],
            record_as_field=params_data.get(
                "recordASField", params_data.get("record_as_field", 1)
            ),
            clear=params_data.get("clear", 0),
            new_line=params_data.get("newLine", params_data.get("new_line", 1)),
            index=params_data.get("index", 0),
            code_mode=params_data.get("codeMode", params_data.get("code_mode", 0)),
            code=params_data.get("code", ""),
            wait_time=params_data.get("waitTime", params_data.get("wait_time", 0)),
            loop_type=params_data.get("loopType", params_data.get("loop_type", 0)),
            text_list=params_data.get("textList", params_data.get("text_list", "")),
            path_list=params_data.get("pathList", params_data.get("path_list", "")),
            exit_element=params_data.get(
                "exitElement", params_data.get("exit_element", "")
            ),
            exit_count=params_data.get("exitCount", params_data.get("exit_count", 0)),
            skip_count=params_data.get("skipCount", params_data.get("skip_count", 0)),
            scroll_type=params_data.get(
                "scrollType", params_data.get("scroll_type", 0)
            ),
            scroll_count=params_data.get(
                "scrollCount", params_data.get("scroll_count", 1)
            ),
            scroll_wait_time=params_data.get(
                "scrollWaitTime", params_data.get("scroll_wait_time", 1.0)
            ),
            judge_class=params_data.get("class", params_data.get("judge_class", 0)),
            condition_text=params_data.get(
                "conditionText", params_data.get("condition_text", "")
            ),
            condition_js=params_data.get(
                "conditionJS", params_data.get("condition_js", "")
            ),
            select_option_mode=params_data.get(
                "optionMode", params_data.get("select_option_mode", 0)
            ),
            select_option_value=params_data.get(
                "optionValue", params_data.get("select_option_value", "")
            ),
            quick_extractable=params_data.get(
                "quickExtractable", params_data.get("quick_extractable", False)
            ),
            base_xpath=params_data.get("baseXPath", params_data.get("base_xpath", "")),
            quick_params=params_data.get(
                "quickParams", params_data.get("quick_params", [])
            ),
            optimizable=params_data.get("optimizable", False),
        )

        return cls(
            index=data.get("index", 0),
            id=data.get("id", 0),
            parent_id=data.get("parentId", data.get("parent_id", 0)),
            node_type=_get_node_type(data.get("type", 0)),
            option=data.get("option", 0),
            title=data.get("title", ""),
            sequence=data.get("sequence", []),
            parameters=params,
            is_in_loop=data.get("isInLoop", data.get("is_in_loop", False)),
        )

    def to_dict(self) -> dict:
        """Convert Node to dictionary."""
        return {
            "index": self.index,
            "id": self.id,
            "parentId": self.parent_id,
            "type": self.node_type.value,
            "option": self.option,
            "title": self.title,
            "sequence": self.sequence,
            "parameters": {
                "xpath": self.parameters.xpath,
                "allXPaths": self.parameters.all_xpaths,
                "useLoop": self.parameters.use_loop,
                "iframe": self.parameters.iframe,
                "wait": self.parameters.wait,
                "waitType": self.parameters.wait_type,
                "beforeJS": self.parameters.before_js,
                "beforeJSWaitTime": self.parameters.before_js_wait_time,
                "afterJS": self.parameters.after_js,
                "afterJSWaitTime": self.parameters.after_js_wait_time,
                "waitElement": self.parameters.wait_element,
                "waitElementTime": self.parameters.wait_element_time,
                "waitElementIframeIndex": self.parameters.wait_element_iframe_index,
                "history": self.parameters.history,
                "tabIndex": self.parameters.tab_index,
                "cookies": self.parameters.cookies,
                "alertHandleType": self.parameters.alert_handle_type,
                "params": [
                    {
                        "name": p.name,
                        "nodeType": p.node_type,
                        "contentType": p.content_type,
                        "relative": p.relative,
                        "relativeXPath": p.relative_xpath,
                        "allXPaths": p.all_xpaths,
                        "exampleValues": p.example_values,
                        "default": p.default_value,
                        "beforeJS": p.before_js,
                        "beforeJSWaitTime": p.before_js_wait_time,
                        "JS": p.js_code,
                        "JSWaitTime": p.js_wait_time,
                        "afterJS": p.after_js,
                        "afterJSWaitTime": p.after_js_wait_time,
                        "iframe": p.iframe,
                        "extractType": p.extract_type,
                        "downloadPic": p.download_pic,
                        "recordASField": p.record_as_field,
                        "splitLine": p.split_line,
                        "unique_index": p.unique_index,
                    }
                    for p in self.parameters.params
                ],
                "recordASField": self.parameters.record_as_field,
                "clear": self.parameters.clear,
                "newLine": self.parameters.new_line,
                "index": self.parameters.index,
                "codeMode": self.parameters.code_mode,
                "code": self.parameters.code,
                "waitTime": self.parameters.wait_time,
                "loopType": self.parameters.loop_type,
                "textList": self.parameters.text_list,
                "pathList": self.parameters.path_list,
                "exitElement": self.parameters.exit_element,
                "exitCount": self.parameters.exit_count,
                "skipCount": self.parameters.skip_count,
                "scrollType": self.parameters.scroll_type,
                "scrollCount": self.parameters.scroll_count,
                "scrollWaitTime": self.parameters.scroll_wait_time,
                "class": self.parameters.judge_class,
                "conditionText": self.parameters.condition_text,
                "conditionJS": self.parameters.condition_js,
                "optionMode": self.parameters.select_option_mode,
                "optionValue": self.parameters.select_option_value,
                "quickExtractable": self.parameters.quick_extractable,
                "baseXPath": self.parameters.base_xpath,
                "quickParams": self.parameters.quick_params,
                "optimizable": self.parameters.optimizable,
            },
            "isInLoop": self.is_in_loop,
        }


@dataclass
class LoopNode(Node):
    """Loop node for iteration."""

    node_type: NodeType = NodeType.LOOP
    option: int = 8


@dataclass
class BranchNode(Node):
    """Conditional branch node."""

    node_type: NodeType = NodeType.BRANCH
    option: int = 9


@dataclass
class ExtractNode(Node):
    """Data extraction node."""

    option: int = 3


@dataclass
class OperationNode(Node):
    """Custom operation node (JS/Python/OS commands)."""

    option: int = 5
