---
name: symptom-checker
description: 基于症状提供初步健康建议和科室推荐
version: 1.5.0
riskLevel: low
inputs:
  - name: symptoms
    type: array
    required: true
    description: 症状列表
  - name: demographics
    type: object
    required: false
    description: 人口统计信息
outputs:
  - name: possibleConditions
    type: array
    description: 可能疾病
  - name: recommendations
    type: array
    description: 建议
  - name: urgency
    type: string
    description: 紧急程度
compliance:
  - HIPAA
  - GDPR
domain: healthcare
tags:
  - 症状
  - 自查
  - 分诊
  - 健康
---

# Symptom Checker

## 概述
基于症状提供初步健康建议和科室推荐，帮助用户了解可能的健康问题。

## 功能特点
- 症状智能匹配
- 可能疾病排序
- 紧急程度评估
- 科室推荐
- 符合HIPAA隐私要求

## 输入参数
- `symptoms`: 症状描述列表
- `demographics`: 年龄、性别等人口统计信息（可选）

## 输出结果
- `possibleConditions`: 可能疾病列表（按概率排序）
- `recommendations`: 健康建议
- `urgency`: 紧急程度（紧急/一般/可观察）
