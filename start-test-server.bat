@echo off
echo ====================================
echo   AI虚拟人物平台 - 测试服务器
echo ====================================
echo.
echo 启动本地服务器...
echo.

REM 检查是否有Python
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo 使用Python HTTP服务器
    echo 访问地址: http://localhost:8080/tests/test-dashboard.html
    echo.
    start http://localhost:8080/tests/test-dashboard.html
    python -m http.server 8080
    goto :eof
)

REM 检查是否有Node.js
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo 使用Node.js serve
    echo.
    npx -y serve -p 8080 .
    goto :eof
)

echo 错误: 未找到Python或Node.js
echo 请安装Python或Node.js后重试
echo.
echo 或者直接双击 tests\test-dashboard.html 文件
pause
