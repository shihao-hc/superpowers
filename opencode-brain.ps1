# OpenCode BrainSystem Launcher (PowerShell版)
# 版本: v19.0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " OpenCode BrainSystem Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "[错误] 未找到 Node.js，请先安装" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
}

Write-Host "[OK] Node.js 已安装" -ForegroundColor Green

# 显示菜单
Write-Host "请选择模式:" -ForegroundColor Yellow
Write-Host "  1. 启动 OpenCode (标准模式)"
Write-Host "  2. 启动 OpenCode + BrainSystem (增强模式)"
Write-Host "  3. 运行 BrainSystem 测试"
Write-Host "  4. 查看 BrainSystem 状态"
Write-Host "  5. 退出"
Write-Host ""

$choice = Read-Host "请输入选项 (1-5)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "[启动] 标准模式..." -ForegroundColor Green
        npx opencode
    }
    "2" {
        Write-Host ""
        Write-Host "[启动] 增强模式 (BrainSystem v19.0)..." -ForegroundColor Green
        Write-Host "[配置] 自动强制思考: 启用" -ForegroundColor Cyan
        Write-Host "[配置] 意图分析: 启用" -ForegroundColor Cyan
        Write-Host "[配置] 情感表达: 启用" -ForegroundColor Cyan
        Write-Host "[配置] 持久化: 启用" -ForegroundColor Cyan
        Write-Host ""
        
        # 预热 BrainSystem
        node brain-entry.js --status | Out-Null
        
        Write-Host "[提示] 在对话中我会自动调用 BrainSystem" -ForegroundColor Yellow
        Write-Host ""
        
        npx opencode
    }
    "3" {
        Write-Host ""
        Write-Host "[运行] BrainSystem 测试..." -ForegroundColor Green
        node brain-entry.js --test
        Read-Host "按 Enter 继续"
    }
    "4" {
        Write-Host ""
        Write-Host "[查看] BrainSystem 状态..." -ForegroundColor Green
        node brain-entry.js --status
        Read-Host "按 Enter 继续"
    }
    "5" {
        Write-Host ""
        Write-Host "[退出]" -ForegroundColor Gray
        exit 0
    }
    default {
        Write-Host ""
        Write-Host "[错误] 无效选项" -ForegroundColor Red
        Read-Host "按 Enter 继续"
    }
}