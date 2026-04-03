---
name: appointment-scheduler
description: 优化医疗预约时间和资源分配
version: 1.0.0
riskLevel: low
inputs:
  - name: availability
    type: array
    required: true
    description: 可用时间
  - name: preferences
    type: object
    required: false
    description: 偏好设置
outputs:
  - name: schedule
    type: array
    description: 预约安排
  - name: conflicts
    type: array
    description: 冲突提醒
  - name: optimization
    type: object
    description: 优化建议
compliance:
  - HIPAA
  - GDPR
domain: healthcare
tags:
  - 预约
  - 排班
  - 调度
  - 优化
---

# Smart Appointment Scheduler

## 概述
智能优化医疗预约时间安排，提高医疗资源利用率和患者满意度。

## 功能特点
- 多条件智能排程
- 资源冲突检测
- 患者偏好匹配
- 候诊时间优化

## 输入参数
- `availability`: 医生/设备可用时间
- `preferences`: 患者偏好（时间、地点、医生）

## 输出结果
- `schedule`: 最优预约安排
- `conflicts`: 潜在冲突提醒
- `optimization`: 资源优化建议
