---
name: legal-research
description: 快速检索法律法规、司法解释和判例
version: 1.5.0
riskLevel: low
inputs:
  - name: query
    type: string
    required: true
    description: 法律问题
  - name: jurisdiction
    type: string
    required: false
    description: 管辖区域
  - name: caseTypes
    type: array
    required: false
    description: 案例类型
outputs:
  - name: laws
    type: array
    description: 相关法律条文
  - name: cases
    type: array
    description: 相关判例
  - name: analysis
    type: document
    description: 法律分析
compliance:
  - GDPR
  - Attorney-Client Privilege
domain: legal
tags:
  - 法律
  - 检索
  - 判例
  - 法规
---

# Legal Research Assistant

## 概述
智能法律研究助手，快速检索相关法律法规和判例，生成法律分析报告。

## 功能特点
- 多法域支持
- 智能语义检索
- 判例引用分析
- 法律论点生成

## 输入参数
- `query`: 法律问题或关键词
- `jurisdiction`: 管辖区域（可选）
- `caseTypes`: 案例类型筛选（可选）

## 输出结果
- `laws`: 相关法律条文
- `cases`: 类似判例
- `analysis`: 法律分析文档
