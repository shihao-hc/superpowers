---
name: contract-review
description: 基于AI自动审查合同条款，识别风险点并提供修改建议
version: 2.1.0
riskLevel: medium
inputs:
  - name: contract
    type: file
    required: true
    description: 合同文件(PDF/Word)
  - name: contractType
    type: string
    required: true
    description: 合同类型
  - name: riskLevel
    type: string
    required: false
    description: 风险偏好
outputs:
  - name: riskReport
    type: pdf
    description: 风险评估报告
  - name: clauseAnalysis
    type: array
    description: 条款分析结果
  - name: suggestions
    type: array
    description: 修改建议
compliance:
  - GDPR
  - CCPA
  - SOX
domain: legal
tags:
  - 合同
  - 审查
  - 风险
  - 法务
---

# Contract Intelligence Review

## 概述
基于AI技术自动审查合同条款，智能识别风险点并提供修改建议。

## 功能特点
- 多格式支持（PDF、Word、图片）
- 条款智能解析
- 风险分级标注
- 批量合同比对

## 输入参数
- `contract`: 合同文件
- `contractType`: 合同类型（劳动合同、采购合同、服务合同等）
- `riskLevel`: 风险偏好（严格/标准/宽松）

## 输出结果
- `riskReport`: PDF风险评估报告
- `clauseAnalysis`: 条款分析结果
- `suggestions`: 风险条款修改建议
