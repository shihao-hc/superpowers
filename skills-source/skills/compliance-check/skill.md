---
name: compliance-check
description: 自动检查企业运营是否符合各类法规要求
version: 1.8.0
riskLevel: medium
inputs:
  - name: companyData
    type: object
    required: true
    description: 企业数据
  - name: regulations
    type: array
    required: true
    description: 目标法规
outputs:
  - name: complianceReport
    type: pdf
    description: 合规报告
  - name: violations
    type: array
    description: 违规项
  - name: recommendations
    type: array
    description: 整改建议
compliance:
  - GDPR
  - SOX
  - AML
  - FCPA
  - PCI-DSS
domain: legal
tags:
  - 合规
  - 检查
  - 审计
  - 监管
---

# Automated Compliance Check

## 概述
自动化企业合规检查系统，全面评估运营是否符合各类法规要求。

## 功能特点
- 多法规覆盖（GDPR、SOX、AML等）
- 风险评分量化
- 整改路线图
- 持续监控提醒

## 输入参数
- `companyData`: 企业运营数据
- `regulations`: 目标法规列表

## 输出结果
- `complianceReport`: PDF合规报告
- `violations`: 发现违规项
- `recommendations`: 整改建议
