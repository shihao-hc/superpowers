---
name: churn-prediction
description: 预测客户流失风险，提前采取挽留措施
version: 1.5.0
riskLevel: low
inputs:
  - name: customerBehavior
    type: array
    required: true
    description: 客户行为数据
  - name: subscriptionData
    type: object
    required: true
    description: 订阅数据
outputs:
  - name: churnRisk
    type: array
    description: 流失风险评分
  - name: riskFactors
    type: array
    description: 风险因素
  - name: retentionPlans
    type: array
    description: 挽留方案
compliance:
  - GDPR
  - CCPA
domain: retail
tags:
  - 流失
  - 预测
  - 挽留
  - 客户
---

# Customer Churn Prediction

## 概述
客户流失预测系统，识别高流失风险客户，提供挽留策略。

## 功能特点
- 流失风险评分
- 风险因素分析
- 挽留时机提示
- 个性化挽留方案

## 输入参数
- `customerBehavior`: 客户行为数据（活跃度、互动、投诉）
- `subscriptionData`: 订阅和付费数据

## 输出结果
- `churnRisk`: 流失风险评分（高/中/低）
- `riskFactors`: 主要流失风险因素
- `retentionPlans`: 挽留方案建议
