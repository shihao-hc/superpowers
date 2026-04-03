---
name: ip-protection
description: 分析商标、专利、版权侵权风险并提供保护策略
version: 1.3.0
riskLevel: medium
inputs:
  - name: ipType
    type: string
    required: true
    description: 知识产权类型
  - name: content
    type: file
    required: true
    description: 待分析内容
outputs:
  - name: riskAssessment
    type: object
    description: 风险评估
  - name: protectionPlan
    type: document
    description: 保护方案
  - name: infringementReport
    type: pdf
    description: 侵权分析报告
compliance:
  - DMCA
  - TRIPS
  - Local IP Laws
domain: legal
tags:
  - 知识产权
  - 商标
  - 专利
  - 版权
---

# IP Protection Analysis

## 概述
知识产权保护分析工具，评估侵权风险并制定保护策略。

## 功能特点
- 商标相似度检测
- 专利冲突分析
- 版权侵权扫描
- 保护策略制定

## 输入参数
- `ipType`: 知识产权类型（商标/专利/版权）
- `content`: 待分析的文件或内容

## 输出结果
- `riskAssessment`: 风险评估结果
- `protectionPlan`: 知识产权保护方案
- `infringementReport`: 侵权分析报告
