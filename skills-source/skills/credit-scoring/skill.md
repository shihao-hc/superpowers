---
name: credit-scoring
description: 基于机器学习的信用评分和风险定价
version: 1.5.0
riskLevel: medium
inputs:
  - name: applicantData
    type: object
    required: true
    description: 申请人数据
  - name: modelType
    type: string
    required: false
    description: 模型类型
outputs:
  - name: score
    type: number
    description: 信用评分
  - name: riskLevel
    type: string
    description: 风险等级
  - name: recommendation
    type: string
    description: 审批建议
compliance:
  - FCRA
  - ECOA
  - GDPR
domain: finance
tags:
  - 信用
  - 评分
  - 贷款
  - 风控
---

# Credit Scoring Model

## 概述
基于机器学习算法评估信用评分，提供风险定价和审批建议。

## 功能特点
- 多种机器学习模型支持（逻辑回归、随机森林、XGBoost）
- 特征重要性分析
- 自动化模型更新
- 符合FCRA和ECOA合规要求

## 输入参数
- `applicantData`: 申请人数据（收入、负债、信用历史等）
- `modelType`: 模型类型（可选）

## 输出结果
- `score`: 信用评分（300-850）
- `riskLevel`: 风险等级（低/中/高）
- `recommendation`: 审批建议（批准/拒绝/需人工审核）
