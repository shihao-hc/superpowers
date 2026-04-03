---
name: portfolio-opt
description: 基于现代投资组合理论优化资产配置
version: 2.0.0
riskLevel: medium
inputs:
  - name: assets
    type: array
    required: true
    description: 资产列表
  - name: constraints
    type: object
    required: false
    description: 约束条件
outputs:
  - name: weights
    type: array
    description: 最优权重
  - name: expectedReturn
    type: number
    description: 预期收益
  - name: risk
    type: number
    description: 风险值
compliance:
  - UCITS
  - SEC
domain: finance
tags:
  - 投资组合
  - 优化
  - MPT
  - 量化
---

# Portfolio Optimization

## 概述
基于现代投资组合理论（MPT）优化资产配置，找到最优风险收益比。

## 功能特点
- 均值-方差优化
- 多种优化目标（最大夏普比率、最小方差、最大收益）
- 约束条件支持（行业权重、流动性、杠杆）
- 再平衡建议

## 输入参数
- `assets`: 资产列表（代码、预期收益、波动率、相关性）
- `constraints`: 约束条件（可选）

## 输出结果
- `weights`: 最优资产权重
- `expectedReturn`: 预期收益率
- `risk`: 组合风险值
