---
name: financial-report-gen
description: 根据财务数据自动生成各类财务报表和分析报告
version: 2.1.0
riskLevel: low
inputs:
  - name: financials
    type: object
    required: true
    description: 财务数据
  - name: reportType
    type: string
    required: true
    description: 报告类型
outputs:
  - name: report
    type: pdf
    description: 财务报告
  - name: charts
    type: array
    description: 图表
compliance:
  - SOX
  - IFRS
  - GAAP
domain: finance
tags:
  - 财务
  - 报告
  - PDF
  - 分析
---

# Financial Report Generator

## 概述
根据财务数据自动生成各类财务报表和分析报告，支持多种格式输出。

## 功能特点
- 自动生成资产负债表、利润表、现金流量表
- 支持IFRS和GAAP会计准则
- 内置多种财务分析指标
- 生成可视化图表

## 输入参数
- `financials`: 财务数据（收入、成本、资产等）
- `reportType`: 报告类型（月报、季报、年报）

## 输出结果
- `report`: PDF格式财务报告
- `charts`: 财务分析图表
