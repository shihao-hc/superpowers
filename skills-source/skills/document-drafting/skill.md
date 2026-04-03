---
name: document-drafting
description: 自动生成各类法律文书，包括起诉状、答辩状、合同等
version: 1.6.0
riskLevel: medium
inputs:
  - name: documentType
    type: string
    required: true
    description: 文书类型
  - name: caseFacts
    type: object
    required: true
    description: 案件事实
  - name: template
    type: string
    required: false
    description: 模板选择
outputs:
  - name: document
    type: document
    description: 法律文书
  - name: citations
    type: array
    description: 引用法条
  - name: formatCheck
    type: object
    description: 格式检查
compliance:
  - Court Filing Standards
  - Local Rules
domain: legal
tags:
  - 文书
  - 起草
  - 合同
  - 起诉状
---

# Legal Document Drafting

## 概述
智能法律文书生成工具，自动创建各类法律文书和合同。

## 功能特点
- 多文书类型支持
- 自动引用法条
- 格式合规检查
- 模板自定义

## 输入参数
- `documentType`: 文书类型（起诉状/答辩状/合同等）
- `caseFacts`: 案件事实和要点
- `template`: 模板选择（可选）

## 输出结果
- `document`: 生成的文书（Word格式）
- `citations`: 引用法条列表
- `formatCheck`: 格式检查结果
