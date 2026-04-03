---
name: root-cause-analysis
description: 运用5Why、鱼骨图等方法自动分析质量问题根因
version: 1.4.0
riskLevel: low
inputs:
  - name: problemDescription
    type: string
    required: true
    description: 问题描述
  - name: relatedData
    type: array
    required: true
    description: 相关数据
outputs:
  - name: causeAnalysis
    type: document
    description: 原因分析
  - name: fishboneDiagram
    type: image
    description: 鱼骨图
  - name: solutions
    type: array
    description: 解决方案
compliance:
  - ISO 9001
  - Six Sigma
domain: manufacturing
tags:
  - 根因
  - 分析
  - 质量
  - 改进
---

# Root Cause Analysis

## 概述
运用六西格玛方法论自动分析质量问题根因，生成改进方案。

## 功能特点
- 5Why分析法
- 鱼骨图自动生成
- 统计过程控制
- 解决方案优先级排序

## 输入参数
- `problemDescription`: 质量问题描述
- `relatedData`: 相关过程数据（人员、设备、材料、方法、环境）

## 输出结果
- `causeAnalysis`: 根本原因分析报告
- `fishboneDiagram`: 可视化鱼骨图
- `solutions`: 推荐解决方案
