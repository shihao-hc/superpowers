@echo off
REM UltraWork AI 并行验证脚本
REM 同时运行测试、Lint和安全扫描

echo ========================================
echo   UltraWork AI 并行验证
echo ========================================
echo.

set LOG_DIR=.opencode\logs
if not exist %LOG_DIR% mkdir %LOG_DIR%

echo [1/3] 运行单元测试...
start /b npm test > %LOG_DIR%\test.log 2>&1
set JOB_TEST=%ERRORLEVEL%

echo [2/3] 运行集成测试...
start /b npm run uw:test > %LOG_DIR%\integration.log 2>&1
set JOB_INTEG=%ERRORLEVEL%

echo [3/3] 运行安全检查...
start /b node scripts/security-check.js > %LOG_DIR%\security.log 2>&1
set JOB_SEC=%ERRORLEVEL%

echo.
echo 等待所有任务完成...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   验证结果汇总
echo ========================================

echo.
echo [单元测试]
type %LOG_DIR%\test.log | findstr /C:"PASSED" /C:"FAILED" /C:"tests"

echo.
echo [集成测试]
type %LOG_DIR%\integration.log | findstr /C:"passed" /C:"failed" /C:"successRate"

echo.
echo [安全检查]
type %LOG_DIR%\security.log 2>nul || echo 安全检查脚本未找到

echo.
echo ========================================
echo   验证完成
echo ========================================
