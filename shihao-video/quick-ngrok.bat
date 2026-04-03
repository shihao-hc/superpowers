@echo off
chcp 65001 >nul
title 拾号-影视 快速启动ngrok

echo.
echo 🚀 拾号-影视 快速启动
echo.

:: 检查服务器
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo ⚠️ 启动服务器...
    start /b node server\proxy.js
    timeout /t 2 /nobreak >nul
)

echo.
echo 📱 正在启动ngrok隧道...
echo    HTTPS地址将显示在下方
echo    复制地址到手机浏览器即可访问
echo.
ngrok http 3000