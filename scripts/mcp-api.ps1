# MCP API PowerShell wrapper
# Usage: . .\scripts\mcp-api.ps1

$MCP_API_URL = "http://localhost:3000/api/mcp"

function Invoke-McpTool {
    param($ToolFullName, $Params)
    $body = @{ toolFullName = $ToolFullName; params = $Params } | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Uri "$MCP_API_URL/call" -Method Post -Body $body -ContentType "application/json"
}

function Get-McpDirectory { param($Path) Invoke-McpTool "filesystem:list_directory" @{ path = $Path } }
function Get-McpFile { param($Path) Invoke-McpTool "filesystem:read_text_file" @{ path = $Path } }
function Set-McpFile { param($Path, $Content) Invoke-McpTool "filesystem:write_file" @{ path = $Path; content = $Content } }
function Search-McpFiles { param($Path, $Pattern) Invoke-McpTool "filesystem:search_files" @{ path = $Path; pattern = $Pattern } }
function Invoke-McpThink { param($Thought) Invoke-McpTool "sequential-thinking:sequentialthinking" @{ thought = $Thought; nextThoughtNeeded = $false; thoughtNumber = 1; totalThoughts = 1 } }
function Get-McpStatus { Invoke-RestMethod -Uri "$MCP_API_URL/status" -Method Get }
function Get-McpTools { Invoke-RestMethod -Uri "$MCP_API_URL/tools" -Method Get }
function Test-McpHealth { Invoke-RestMethod -Uri "$MCP_API_URL/health" -Method Get }

Write-Host "MCP API functions loaded" -ForegroundColor Green
