@echo off
chcp 65001 >nul
title 拾号-影视

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║                                                  ║
echo ║              拾号-影视                           ║
echo ║                                                  ║
echo ║   正在启动服务...                               ║
echo ║                                                  ║
echo ╚══════════════════════════════════════════════════╝
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖是否安装
if not exist "node_modules" (
    echo [提示] 正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [成功] 服务启动中...
echo.
echo 请在浏览器中访问: http://localhost:3000
echo.
echo 按 Ctrl+C 可停止服务
echo.

node server/proxy.js

pause
