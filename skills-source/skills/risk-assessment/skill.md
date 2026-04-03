---
name: risk-assessment
description: 综合评估投资组合风险，提供VaR和CVaR分析
version: 1.2.0
riskLevel: medium
inputs:
  - name: portfolio
    type: object
    required: true
    description: 投资组合数据
  - name: confidence
    type: number
    required: false
    description: 置信水平
outputs:
  - name: var
    type: number
    description: VaR值
  - name: cvar
    type: number
    description: CVaR值
  - name: report
    type: pdf
    description: 风险报告
compliance:
  - Basel III
  - SOLVENCY II
domain: finance
tags:
  - 风险
  - VaR
  - CVaR
  - 投资组合
---

# Risk Assessment Model

## 概述
综合评估投资组合风险，提供VaR（风险价值）和CVaR（条件风险价值）分析。

## 功能特点
- 计算投资组合的VaR和CVaR
- 支持多种置信水平（95%、99%、99.5%）
- 历史模拟法和蒙特卡洛模拟
- 生成详细的风险报告

## 输入参数
- `portfolio`: 投资组合数据（资产、权重、收益率）
- `confidence`: 置信水平（默认99%）

## 输出结果
- `var`: VaR值
- `cvar`: CVaR值
- `report`: PDF格式风险报告
