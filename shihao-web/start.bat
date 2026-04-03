@echo off
echo ========================================
echo 拾号金融 (ShiHao Finance) - 启动脚本
echo ========================================
echo.
echo 选择启动模式:
echo 1. Python后端 (推荐)
echo 2. Node.js后端 (旧版)
echo 3. Docker部署
echo 4. 仅启动前端开发服务器
echo.
set /p choice="请选择 (1-4): "

if "%choice%"=="1" goto python_backend
if "%choice%"=="2" goto node_backend
if "%choice%"=="3" goto docker
if "%choice%"=="4" goto frontend_only

:python_backend
echo.
echo 启动Python后端...
echo.
cd python-backend
echo 安装依赖...
pip install -r requirements.txt
echo.
echo 启动服务器 (端口: 8000)...
python run.py
goto end

:node_backend
echo.
echo 启动Node.js后端...
echo.
cd backend
echo 安装依赖...
call npm install
echo.
echo 启动服务器 (端口: 4000)...
call npm run dev
goto end

:docker
echo.
echo 使用Docker部署...
echo.
echo 构建并启动服务...
docker-compose up -d
echo.
echo 服务已启动:
echo - Python后端: http://localhost:8000
echo - 前端: http://localhost:3000
echo - API文档: http://localhost:8000/docs
goto end

:frontend_only
echo.
echo 启动前端开发服务器...
echo.
cd frontend
echo 安装依赖...
call npm install
echo.
echo 启动开发服务器 (端口: 5173)...
call npm run dev
goto end

:end
echo.
pause