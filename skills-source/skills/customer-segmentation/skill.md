---
name: customer-segmentation
description: 基于消费行为对客户进行分群，制定差异化策略
version: 1.6.0
riskLevel: low
inputs:
  - name: customerData
    type: array
    required: true
    description: 客户数据
  - name: segmentCriteria
    type: object
    required: false
    description: 分群标准
outputs:
  - name: segments
    type: array
    description: 客户分群
  - name: profiles
    type: array
    description: 群体画像
  - name: strategies
    type: array
    description: 营销策略
compliance:
  - GDPR
  - CCPA
  - PCI-DSS
domain: retail
tags:
  - 客户
  - 分群
  - 画像
  - 营销
---

# Customer Segmentation Analysis

## 概述
客户分群分析系统，基于消费行为将客户分组，制定精准营销策略。

## 功能特点
- 多维度分群
- 客户画像生成
- 价值分层
- 策略推荐

## 输入参数
- `customerData`: 客户行为和属性数据
- `segmentCriteria`: 分群标准（可选）

## 输出结果
- `segments`: 客户分群结果
- `profiles`: 各群体画像描述
- `strategies`: 差异化营销策略
