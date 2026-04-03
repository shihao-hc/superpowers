---
name: health-record-summary
description: 生成患者健康档案的智能摘要
version: 1.2.0
riskLevel: low
inputs:
  - name: records
    type: array
    required: true
    description: 健康记录
  - name: summaryType
    type: string
    required: false
    description: 摘要类型
outputs:
  - name: summary
    type: document
    description: 摘要文档
  - name: keyFindings
    type: array
    description: 关键发现
  - name: timeline
    type: chart
    description: 健康时间线
compliance:
  - HIPAA
  - GDPR
  - HL7 FHIR
domain: healthcare
tags:
  - 健康档案
  - 摘要
  - EHR
  - FHIR
---

# Health Record Summary

## 概述
智能汇总患者健康档案，提取关键信息，生成结构化摘要。

## 功能特点
- 多源数据整合（EHR、实验室、影像）
- 关键发现提取
- 健康时间线可视化
- FHIR标准支持

## 输入参数
- `records`: 健康记录数据（支持FHIR格式）
- `summaryType`: 摘要类型（简略/详细）

## 输出结果
- `summary`: 结构化摘要文档
- `keyFindings`: 关键健康发现
- `timeline`: 健康时间线图表
