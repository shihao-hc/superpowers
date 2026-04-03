@echo off
chcp 65001 >nul
title 拾号-影视 ngrok内网穿透工具
color 0A

echo.
echo ╔═══════════════════════════════════════════════════════╗
echo ║                                                       ║
echo ║           拾号-影视 ngrok内网穿透工具                 ║
echo ║                                                       ║
echo ╚═══════════════════════════════════════════════════════╝
echo.

:: 步骤1: 检查ngrok
echo [1/5] 检查ngrok安装...
where ngrok >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ 未找到ngrok，请先安装：
    echo.
    echo   方式1: 下载安装包
    echo          https://ngrok.com/download
    echo.
    echo   方式2: 使用 Chocolatey
    echo          choco install ngrok
    echo.
    echo   方式3: 使用 Scoop
    echo          scoop install ngrok
    echo.
    echo   方式4: 使用 npm
    echo          npm install -g ngrok
    echo.
    pause
    exit /b 1
)
echo ✅ ngrok已安装

:: 步骤2: 检查服务器
echo.
echo [2/5] 检查服务器状态...
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo ⚠️ 服务器未启动，正在启动...
    start /b node server\proxy.js
    timeout /t 3 /nobreak >nul
    echo ✅ 服务器已启动
) else (
    echo ✅ 服务器正在运行
)

:: 步骤3: 检查token配置
echo.
echo [3/5] 检查ngrok token配置...
ngrok config check >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ ngrok已配置token
    goto :start_tunnel
)

:: 步骤4: 配置token
echo.
echo [4/5] 配置ngrok token...
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 📝 获取免费token的步骤：
echo.
echo   1. 打开浏览器访问: https://ngrok.com/signup
echo   2. 注册账号（支持Google/GitHub登录）
echo   3. 登录后访问: https://dashboard.ngrok.com/get-started/your-authtoken
echo   4. 复制页面上的 authtoken（格式：2xxxxxxx_xxxxxxxxxxxxx）
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
set /p authtoken="请粘贴你的ngrok token: "

if "%authtoken%"=="" (
    echo ❌ token不能为空！
    pause
    exit /b 1
)

:: 配置token
ngrok config add-authtoken %authtoken%
if %errorlevel% equ 0 (
    echo ✅ token配置成功！
) else (
    echo ❌ token配置失败，请检查token是否正确
    pause
    exit /b 1
)

:start_tunnel
:: 步骤5: 启动隧道
echo.
echo [5/5] 启动ngrok隧道...
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🚀 正在启动ngrok...
echo.
echo 📱 启动后会显示类似以下的地址：
echo    https://xxxx-xxxx-xxxx-xxxx.ngrok-free.app
echo.
echo ⚠️  复制HTTPS地址到手机浏览器即可访问
echo ⚠️  按 Ctrl+C 可停止ngrok
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

:: 检查是否有配置文件
if exist "ngrok.yml" (
    ngrok start shihao-video --config ngrok.yml
) else (
    ngrok http 3000
)