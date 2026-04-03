---
name: student-assessment
description: 多维度评估学生能力，生成综合素质报告
version: 1.5.0
riskLevel: low
inputs:
  - name: assessmentData
    type: object
    required: true
    description: 评估数据
  - name: assessmentType
    type: string
    required: true
    description: 评估类型
outputs:
  - name: assessmentReport
    type: pdf
    description: 评估报告
  - name: strengths
    type: array
    description: 优势领域
  - name: developmentPlan
    type: document
    description: 发展计划
compliance:
  - FERPA
  - GDPR
  - State Education Standards
domain: education
tags:
  - 评估
  - 学生
  - 报告
  - 综合素质
---

# Comprehensive Student Assessment

## 概述
多维度学生综合评估系统，全面评估学业和能力水平。

## 功能特点
- 多维度评估指标
- 能力雷达图
- 发展建议
- 成长追踪

## 输入参数
- `assessmentData`: 评估相关数据（成绩、作品、表现）
- `assessmentType`: 评估类型（学业/综合素质/能力）

## 输出结果
- `assessmentReport`: PDF评估报告
- `strengths`: 优势领域
- `developmentPlan`: 个性化发展计划
