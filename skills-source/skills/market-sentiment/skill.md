---
name: market-sentiment
description: 分析新闻、社交媒体和研报，评估市场情绪
version: 1.1.0
riskLevel: low
inputs:
  - name: symbols
    type: array
    required: true
    description: 股票代码列表
  - name: sources
    type: array
    required: false
    description: 数据来源
outputs:
  - name: sentiment
    type: object
    description: 情绪分析结果
  - name: trends
    type: chart
    description: 情绪趋势图
compliance:
  - SEC
  - MiFID II
domain: finance
tags:
  - 情绪
  - NLP
  - 社交媒体
  - 新闻
---

# Market Sentiment Analysis

## 概述
通过NLP技术分析新闻、社交媒体和研报，评估市场情绪和趋势。

## 功能特点
- 多源数据整合（Twitter、Reddit、新闻、研报）
- 实时情绪追踪
- 情感趋势可视化
- 异常情绪预警

## 输入参数
- `symbols`: 股票代码列表
- `sources`: 数据来源（可选，默认全部）

## 输出结果
- `sentiment`: 情绪分析结果（看涨/中性/看跌）
- `trends`: 情绪趋势图表
