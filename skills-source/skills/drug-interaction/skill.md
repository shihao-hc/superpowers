---
name: drug-interaction
description: 检查药物间的相互作用和禁忌
version: 1.3.0
riskLevel: high
inputs:
  - name: medications
    type: array
    required: true
    description: 药物列表
  - name: patientProfile
    type: object
    required: false
    description: 患者信息
outputs:
  - name: interactions
    type: array
    description: 相互作用
  - name: warnings
    type: array
    description: 警告
  - name: safetyScore
    type: number
    description: 安全评分
compliance:
  - FDA
  - EMA
  - HIPAA
domain: healthcare
tags:
  - 药物
  - 相互作用
  - 安全
  - 处方
---

# Drug Interaction Checker

## 概述
检查药物间的相互作用、禁忌和副作用，为临床用药提供参考。

## 功能特点
- 药物相互作用检测
- 禁忌症检查
- 剂量调整建议
- 药物过敏提醒
- 符合FDA和EMA标准

## 输入参数
- `medications`: 药物名称或NDC码列表
- `patientProfile`: 年龄、体重、肾功能等患者信息（可选）

## 输出结果
- `interactions`: 药物相互作用详情
- `warnings`: 安全警告
- `safetyScore`: 用药安全评分（0-100）
