@echo off
chcp 65001 >nul
echo ========================================
echo 拾号-影视 安全加固版启动脚本
echo ========================================
echo.

echo [1/3] 检查端口占用...
netstat -ano | findstr :3000 >nul
if %errorlevel% == 0 (
    echo 警告：端口3000已被占用，正在尝试关闭...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

echo [2/3] 检查Node.js环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

echo [3/3] 启动服务器...
echo.
echo 正在启动拾号-影视服务器（安全加固版）...
echo 本地访问: http://localhost:3000
echo 健康检查: http://localhost:3000/health
echo.
echo 按 Ctrl+C 停止服务
echo.

cd /d "%~dp0"
node server\proxy.js

pause