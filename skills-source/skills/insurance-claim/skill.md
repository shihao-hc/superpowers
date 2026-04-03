---
name: insurance-claim
description: 自动化保险理赔审核和欺诈检测
version: 1.8.0
riskLevel: medium
inputs:
  - name: claim
    type: object
    required: true
    description: 理赔申请
  - name: policy
    type: object
    required: true
    description: 保单信息
outputs:
  - name: decision
    type: string
    description: 审核决定
  - name: fraudScore
    type: number
    description: 欺诈风险评分
  - name: reasoning
    type: array
    description: 审核理由
compliance:
  - HIPAA
  - HI-TECH
  - State Insurance Laws
domain: healthcare
tags:
  - 保险
  - 理赔
  - 欺诈检测
  - 审核
---

# Insurance Claim Analysis

## 概述
自动化保险理赔审核流程，快速识别欺诈行为，提高理赔效率。

## 功能特点
- 理赔规则引擎
- 欺诈风险评分
- 异常检测预警
- 自动化审核决策

## 输入参数
- `claim`: 理赔申请详情
- `policy`: 保单信息和条款

## 输出结果
- `decision`: 审核决定（批准/拒绝/需人工审核）
- `fraudScore`: 欺诈风险评分
- `reasoning`: 审核理由和依据
