@echo off
chcp 65001 >nul
echo ========================================
echo 拾号-影视 SSL证书生成工具
echo ========================================
echo.

echo [1/3] 检查OpenSSL...
openssl version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：未找到OpenSSL
    echo.
    echo 请安装OpenSSL或使用以下方法：
    echo 1. 下载安装 OpenSSL: https://slproweb.com/products/Win32OpenSSL.html
    echo 2. 或使用 Git Bash (已自带OpenSSL)
    echo 3. 或使用在线证书生成工具
    echo.
    echo 或者直接使用 ngrok (推荐)：
    echo   ngrok http 3000
    echo.
    pause
    exit /b 1
)

echo [2/3] 生成私钥...
openssl genrsa -out server.key 2048

echo [3/3] 生成证书...
openssl req -new -x509 -key server.key -out server.crt -days 365 -subj "/C=CN/ST=Beijing/L=Beijing/O=Shihao/OU=IT/CN=localhost"

echo.
echo ✅ SSL证书生成完成！
echo.
echo 文件位置：
echo   - server.key (私钥)
echo   - server.crt (证书)
echo.
echo 启动HTTPS服务器：
echo   node server\proxy-https.js
echo.
echo 访问地址：
echo   https://localhost:3443
echo.
pause