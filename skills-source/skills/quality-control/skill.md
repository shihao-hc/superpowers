---
name: quality-control
description: 基于机器视觉自动检测产品缺陷，提高质检效率
version: 2.2.0
riskLevel: medium
inputs:
  - name: image
    type: file
    required: true
    description: 产品图像
  - name: productType
    type: string
    required: true
    description: 产品类型
  - name: defectTypes
    type: array
    required: false
    description: 缺陷类型
outputs:
  - name: defectReport
    type: pdf
    description: 缺陷检测报告
  - name: annotations
    type: image
    description: 标注图像
  - name: classification
    type: object
    description: 缺陷分类
compliance:
  - ISO 9001
  - IATF 16949
  - FDA
domain: manufacturing
tags:
  - 质检
  - 缺陷
  - 机器视觉
  - AI
---

# Quality Defect Detection

## 概述
基于深度学习的机器视觉缺陷检测系统，自动识别产品质量问题。

## 功能特点
- 实时缺陷检测
- 多缺陷类型分类
- 缺陷位置标注
- 质量趋势分析

## 输入参数
- `image`: 产品图像（JPEG、PNG、工业相机流）
- `productType`: 产品类型
- `defectTypes`: 重点检测的缺陷类型（可选）

## 输出结果
- `defectReport`: PDF缺陷检测报告
- `annotations`: 带标注的图像
- `classification`: 缺陷分类结果
