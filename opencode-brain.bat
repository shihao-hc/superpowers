@echo off
REM ============================================
REM OpenCode BrainSystem 启动器
REM 使用此脚本启动 OpenCode 并自动加载 BrainSystem
REM ============================================

setlocal

REM 设置项目路径
set PROJECT_ROOT=%~dp0
cd /d "%PROJECT_ROOT%"

REM 显示标题
echo ========================================
echo  OpenCode BrainSystem Launcher
echo  版本: v19.0
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

REM 显示选项
echo 请选择模式:
echo  1. 启动 OpenCode (标准模式)
echo  2. 启动 OpenCode + BrainSystem (增强模式)
echo  3. 运行 BrainSystem 测试
echo  4. 查看 BrainSystem 状态
echo  5. 退出
echo.

set /p choice=请输入选项 (1-5):

if "%choice%"=="1" goto normal
if "%choice%"=="2" goto enhanced
if "%choice%"=="3" goto test
if "%choice%"=="4" goto status
if "%choice%"=="5" exit

echo 无效选项，请重新选择
pause
goto :eof

:normal
echo.
echo [启动] 标准模式...
npx opencode
goto :end

:enhanced
echo.
echo [启动] 增强模式 (BrainSystem v19.0)...
echo [配置] 自动强制思考: 启用
echo [配置] 意图分析: 启用
echo [配置] 情感表达: 启用
echo [配置] 持久化: 启用
echo.
echo [提示] 在对话中我会自动调用 BrainSystem
echo.
REM 预热 BrainSystem
call node brain-entry.js --status >nul 2>&1
npx opencode
goto :end

:test
echo.
echo [运行] BrainSystem 测试...
call node brain-entry.js --test
pause
goto :end

:status
echo.
echo [查看] BrainSystem 状态...
call node brain-entry.js --status
pause
goto :end

:end
echo.
echo [退出] 
pause
endlocal