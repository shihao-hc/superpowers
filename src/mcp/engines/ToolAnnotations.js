/**
 * MCP Tool Annotations - MCP官方规范工具注解
 * readOnlyHint: 只读操作
 * idempotentHint: 幂等操作(重复执行结果相同)
 * destructiveHint: 破坏性操作
 */

const ANNOTATIONS = {
  // ==================== 文件系统 ====================
  'read_text_file': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'read_media_file': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'read_multiple_files': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'list_directory': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'list_directory_with_sizes': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'directory_tree': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'search_files': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_file_info': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'list_allowed_directories': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },

  // 文件写操作
  'create_directory': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'write_file': { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
  'edit_file': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  'move_file': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  'delete_file': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  'delete_directory': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },

  // ==================== 思维链 ====================
  'sequential_thinking': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'reflect_on_step': { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  'create_branch': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'get_thinking_history': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },

  // ==================== GitHub ====================
  'list_repositories': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_repository': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'list_issues': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_issue': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'search_repositories': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },

  'create_issue': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'update_issue': { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  'close_issue': { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
  'comment_on_issue': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },

  'list_prs': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_pr': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'create_pr': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'merge_pr': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  'close_pr': { readOnlyHint: false, idempotentHint: true, destructiveHint: true },
  'request_review': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },

  // ==================== 浏览器 DevTools ====================
  'navigate': { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  'get_page_info': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_console_logs': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'screenshot': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_dom_snapshot': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_network_requests': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },

  'evaluate': { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  'click_element': { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  'type_text': { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  'inject_script': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },

  // 性能分析
  'take_heap_snapshot': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'start_performance_trace': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'get_performance_metrics': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },

  // ==================== Context7 文档 ====================
  'resolve_library_id': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'query_docs': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'refresh_docs': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'list_cached_libraries': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },

  // ==================== Memos 笔记 ====================
  'list_memos': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_memo': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'search_memos': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'list_tags': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },

  'create_memo': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'update_memo': { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
  'delete_memo': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  'pin_memo': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },

  'connect_instance': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'switch_instance': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },
  'upload_attachment': { readOnlyHint: false, idempotentHint: true, destructiveHint: false },

  // ==================== 通用 ====================
  'exec_cmd': { readOnlyHint: false, idempotentHint: false, destructiveHint: true },
  'read_url': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  'get_current_time': { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
};

/**
 * 获取工具注解
 */
function getAnnotation(toolName) {
  return ANNOTATIONS[toolName] || { readOnlyHint: true, idempotentHint: true, destructiveHint: false };
}

/**
 * 检查是否为只读操作
 */
function isReadOnly(toolName) {
  return getAnnotation(toolName).readOnlyHint;
}

/**
 * 检查是否为幂等操作
 */
function isIdempotent(toolName) {
  return getAnnotation(toolName).idempotentHint;
}

/**
 * 检查是否为破坏性操作
 */
function isDestructive(toolName) {
  return getAnnotation(toolName).destructiveHint;
}

/**
 * 获取操作风险等级
 */
function getRiskLevel(toolName) {
  const annotation = getAnnotation(toolName);
  
  if (annotation.readOnlyHint) return 'safe';
  if (annotation.destructiveHint) return 'critical';
  if (!annotation.idempotentHint) return 'medium';
  return 'low';
}

/**
 * 为工具定义添加注解
 */
function annotateTool(toolDef, toolName) {
  const annotation = getAnnotation(toolName);
  return {
    ...toolDef,
    annotations: annotation
  };
}

/**
 * 为工具列表批量添加注解
 */
function annotateTools(tools) {
  return tools.map(tool => annotateTool(tool, tool.name));
}

module.exports = {
  ANNOTATIONS,
  getAnnotation,
  isReadOnly,
  isIdempotent,
  isDestructive,
  getRiskLevel,
  annotateTool,
  annotateTools
};
