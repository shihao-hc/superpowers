---
name: smart-grading
description: 自动批改客观题和主观题，提供详细反馈
version: 1.8.0
riskLevel: low
inputs:
  - name: answers
    type: array
    required: true
    description: 学生答案
  - name: rubric
    type: object
    required: true
    description: 评分标准
  - name: questionTypes
    type: array
    required: false
    description: 题目类型
outputs:
  - name: grades
    type: spreadsheet
    description: 成绩单
  - name: feedback
    type: array
    description: 个性化反馈
  - name: analysis
    type: pdf
    description: 答题分析
compliance:
  - FERPA
  - GDPR
domain: education
tags:
  - 批改
  - 作业
  - 评分
  - 反馈
---

# AI-Powered Assignment Grading

## 概述
AI驱动作业批改系统，自动评分并提供个性化学习反馈。

## 功能特点
- 客观题自动批改
- 主观题智能评分
- 详细错题分析
- 个性化改进建议

## 输入参数
- `answers`: 学生答案（图片或文本）
- `rubric`: 评分标准和参考答案
- `questionTypes`: 题目类型（可选）

## 输出结果
- `grades`: 成绩单（Excel格式）
- `feedback`: 个性化反馈
- `analysis`: 答题分析报告
