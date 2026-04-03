---
name: case-analysis
description: 分析案件材料，预测案件走向并生成诉讼策略
version: 2.0.0
riskLevel: medium
inputs:
  - name: caseMaterials
    type: array
    required: true
    description: 案件材料
  - name: caseType
    type: string
    required: true
    description: 案件类型
outputs:
  - name: analysis
    type: document
    description: 案件分析报告
  - name: strategy
    type: array
    description: 诉讼策略
  - name: outcomePrediction
    type: object
    description: 结果预测
compliance:
  - Attorney-Client Privilege
  - Work Product Doctrine
domain: legal
tags:
  - 案件
  - 诉讼
  - 策略
  - 分析
---

# Case Intelligence Analysis

## 概述
智能案件分析系统，预测案件走向并生成诉讼策略建议。

## 功能特点
- 案件材料智能解析
- 法律论点提取
- 案件结果预测
- 策略建议生成

## 输入参数
- `caseMaterials`: 案件相关材料（起诉状、答辩状、证据等）
- `caseType`: 案件类型（民事/刑事/行政）

## 输出结果
- `analysis`: 案件分析报告
- `strategy`: 诉讼策略建议
- `outcomePrediction`: 案件结果预测
