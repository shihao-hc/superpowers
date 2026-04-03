---
name: stock-analysis
description: 基于技术指标进行股票走势分析和预测
version: 1.0.0
riskLevel: medium
inputs:
  - name: symbol
    type: string
    required: true
    description: 股票代码
  - name: indicators
    type: array
    required: false
    description: 技术指标列表
outputs:
  - name: analysis
    type: object
    description: 分析结果
  - name: chart
    type: image
    description: K线图
  - name: recommendation
    type: string
    description: 操作建议
compliance:
  - SEC
  - FINRA
domain: finance
tags:
  - 股票
  - 技术分析
  - K线
  - MACD
  - RSI
---

# Stock Technical Analysis

## 概述
基于技术指标进行股票走势分析和预测，帮助投资者做出更明智的投资决策。

## 功能特点
- 支持多种技术指标（MACD、RSI、KDJ、布林带等）
- 自动生成K线图和趋势线
- 提供操作建议（买入、卖出、持有）
- 支持多个时间周期的分析

## 输入参数
- `symbol`: 股票代码（如 AAPL、TSLA）
- `indicators`: 要使用的技术指标列表

## 输出结果
- `analysis`: 技术分析结果对象
- `chart`: K线图可视化
- `recommendation`: 操作建议
