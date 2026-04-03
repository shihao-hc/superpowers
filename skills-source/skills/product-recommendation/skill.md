---
name: product-recommendation
description: 基于用户行为和偏好提供个性化商品推荐
version: 2.2.0
riskLevel: low
inputs:
  - name: userId
    type: string
    required: true
    description: 用户ID
  - name: context
    type: object
    required: false
    description: 上下文信息
outputs:
  - name: recommendations
    type: array
    description: 商品推荐列表
  - name: scores
    type: array
    description: 推荐分数
  - name: explainability
    type: array
    description: 推荐理由
compliance:
  - PCI-DSS
  - GDPR
  - CCPA
domain: retail
tags:
  - 推荐
  - 商品
  - 个性化
  - 用户
---

# Smart Product Recommendation

## 概述
个性化商品推荐引擎，提升用户购物体验和转化率。

## 功能特点
- 协同过滤算法
- 实时推荐
- 跨品类推荐
- 推荐可解释

## 输入参数
- `userId`: 用户标识
- `context`: 当前上下文（浏览历史、加购、搜索）

## 输出结果
- `recommendations`: 推荐商品列表
- `scores`: 推荐置信度分数
- `explainability`: 推荐理由
