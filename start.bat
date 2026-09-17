@echo off
cd /d D:\龙虾
if not exist logs mkdir logs

echo ========================================
echo   BrainSystem Web Server 智能启动器
echo ========================================
echo.

REM 检查 Ollama（本地 LLM 服务）
netstat -ano | findstr ":11434" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo [!] 警告: Ollama 未运行，AI 对话将不可用
  echo     请先打开 Ollama 应用再重试
  echo.
) else (
  echo [OK] Ollama 已运行
)

REM 检查 Web server 是否已在运行（幂等：已跑则不重复启动）
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [OK] Web server 已在运行: http://localhost:3000
  echo.
  if /i not "%1"=="-silent" start "" http://localhost:3000
  exit /b 0
)

echo [启动] 正在启动 Web server，请稍候...
echo        (首次对话需 1-2 分钟加载 AI 模型)
echo.
REM 用相对路径（继承 cwd=D:\龙虾），避免 cmd->PowerShell 中文路径编码错乱
powershell -NoProfile -Command "Start-Process 'E:\DS\node.exe' -ArgumentList 'server/index.js' -WindowStyle Hidden -RedirectStandardOutput 'logs\server.log' -RedirectStandardError 'logs\server-err.log'"

REM 等待端口就绪（最多 30 秒）
set /a waited=0
:WAIT
ping -n 2 127.0.0.1 >nul
set /a waited+=2
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 goto UP
if %waited% geq 30 goto FAIL
goto WAIT

:UP
echo [OK] Web server 启动成功: http://localhost:3000
echo.
if /i not "%1"=="-silent" start "" http://localhost:3000
exit /b 0

:FAIL
echo [错误] 30 秒内未检测到端口 3000
echo        请检查 logs\server.log 或手动执行 npm start
exit /b 1