#!/bin/bash
# MCP API 封装函数 - 处理中文路径编码问题
# 用法: source scripts/mcp-api.sh

MCP_API_URL="${MCP_API_URL:-http://localhost:3000/api/mcp}"

# 调用 MCP 工具
# 使用方法: mcp_call <toolFullName> <params_json>
# 示例: mcp_call "filesystem:list_directory" '{"path":"D:/龙虾"}'
mcp_call() {
    local tool="$1"
    local params="$2"
    
    if [[ -z "$tool" || -z "$params" ]]; then
        echo "Usage: mcp_call <toolFullName> <params_json>"
        return 1
    fi
    
    curl -s -X POST "${MCP_API_URL}/call" \
        -H "Content-Type: application/json" \
        -d @- <<EOF
{"toolFullName":"$tool","params":$params}
EOF
}

# 列出目录
# 使用方法: mcp_list_dir <path>
# 示例: mcp_list_dir "D:/龙虾"
mcp_list_dir() {
    local path="$1"
    mcp_call "filesystem:list_directory" "{\"path\":\"$path\"}"
}

# 读取文件
# 使用方法: mcp_read_file <path>
mcp_read_file() {
    local path="$1"
    mcp_call "filesystem:read_text_file" "{\"path\":\"$path\"}"
}

# 写入文件
# 使用方法: mcp_write_file <path> <content>
mcp_write_file() {
    local path="$1"
    local content="$2"
    # 转义内容中的特殊字符
    local escaped_content=$(echo "$content" | jq -Rs .)
    mcp_call "filesystem:write_file" "{\"path\":\"$path\",\"content\":$escaped_content}"
}

# 搜索文件
# 使用方法: mcp_search_files <path> <pattern>
mcp_search_files() {
    local path="$1"
    local pattern="$2"
    mcp_call "filesystem:search_files" "{\"path\":\"$path\",\"pattern\":\"$pattern\"}"
}

# Sequential Thinking
# 使用方法: mcp_think <thought>
mcp_think() {
    local thought="$1"
    mcp_call "sequential-thinking:sequentialthinking" "{\"thought\":\"$thought\",\"nextThoughtNeeded\":false,\"thoughtNumber\":1,\"totalThoughts\":1}"
}

# 获取 MCP 状态
mcp_status() {
    curl -s "${MCP_API_URL}/status"
}

# 获取工具列表
mcp_tools() {
    curl -s "${MCP_API_URL}/tools"
}

# 获取服务器列表
mcp_servers() {
    curl -s "${MCP_API_URL}/servers"
}

# 健康检查
mcp_health() {
    curl -s "${MCP_API_URL}/health"
}

echo "MCP API functions loaded. Use 'mcp_call', 'mcp_list_dir', 'mcp_read_file', etc."
