---
name: learning-analytics
description: 全面分析学生学习行为，提供个性化学习建议
version: 2.1.0
riskLevel: low
inputs:
  - name: studentData
    type: object
    required: true
    description: 学生学习数据
  - name: metrics
    type: array
    required: false
    description: 分析指标
outputs:
  - name: dashboard
    type: pdf
    description: 分析仪表盘
  - name: insights
    type: array
    description: 学习洞察
  - name: interventions
    type: array
    description: 干预建议
compliance:
  - FERPA
  - GDPR
  - COPPA
domain: education
tags:
  - 学习
  - 分析
  - 数据
  - 洞察
---

# Learning Analytics Dashboard

## 概述
全面的学习分析系统，追踪学生学习行为，提供数据驱动的教学建议。

## 功能特点
- 学习行为追踪
- 学习效果评估
- 预测性分析
- 干预建议

## 输入参数
- `studentData`: 学生的学习数据（登录时长、作业完成、测验成绩）
- `metrics`: 关注的分析指标（可选）

## 输出结果
- `dashboard`: 可视化分析仪表盘
- `insights`: 学习洞察
- `interventions`: 教师干预建议
