---
name: inventory-optimization
description: 优化库存水平，减少积压和缺货
version: 1.8.0
riskLevel: medium
inputs:
  - name: inventoryData
    type: object
    required: true
    description: 库存数据
  - name: salesForecast
    type: array
    required: true
    description: 销售预测
outputs:
  - name: optimization
    type: spreadsheet
    description: 优化方案
  - name: reorderPlan
    type: array
    description: 补货计划
  - name: costSaving
    type: object
    description: 成本节约
compliance:
  - SOX
  - Inventory Accounting Standards
domain: retail
tags:
  - 库存
  - 优化
  - 补货
  - 成本
---

# Smart Inventory Optimization

## 概述
智能库存优化系统，在缺货和积压之间找到最佳平衡点。

## 功能特点
- 安全库存计算
- 补货时机优化
- ABC分类管理
- 滞销预警

## 输入参数
- `inventoryData`: 当前库存详情
- `salesForecast`: 销售预测数据

## 输出结果
- `optimization`: 库存优化方案
- `reorderPlan`: 补货计划
- `costSaving`: 预期成本节约
