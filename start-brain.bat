@echo off
chcp 65001 >nul 2>&1
title OpenCode BrainSystem
color 1f

echo ========================================
echo  OpenCode BrainSystem Launcher v19.0
echo ========================================
echo.

cd /d %~dp0

echo [1] 测试 BrainSystem...
node brain-entry.js --test >nul 2>&1

echo.
echo [2] 启动 OpenCode...
echo.
echo 使用说明:
echo   此脚本仅启动 OpenCode
echo   BrainSystem 在对话中自动加载
echo.
echo 按任意键启动 OpenCode 或 Ctrl+C 退出...
pause >nul

npx opencode