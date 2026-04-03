---
name: smart-lesson-planning
description: 根据教学大纲和学情分析自动生成教案
version: 2.0.0
riskLevel: low
inputs:
  - name: topic
    type: string
    required: true
    description: 教学主题
  - name: gradeLevel
    type: string
    required: true
    description: 年级
  - name: learningObjectives
    type: array
    required: false
    description: 学习目标
outputs:
  - name: lessonPlan
    type: document
    description: 教案文档
  - name: slides
    type: presentation
    description: 教学PPT
  - name: resources
    type: array
    description: 教学资源
compliance:
  - FERPA
  - COPPA
  - GDPR
domain: education
tags:
  - 备课
  - 教案
  - 教学
  - 课件
---

# Smart Lesson Planning Assistant

## 概述
智能备课助手，根据教学大纲自动生成完整的教案和教学资源。

## 功能特点
- 符合新课标要求
- 多学科覆盖
- 个性化学习路径
- 自动生成PPT

## 输入参数
- `topic`: 教学主题
- `gradeLevel`: 年级（小学/初中/高中/大学）
- `learningObjectives`: 学习目标（可选）

## 输出结果
- `lessonPlan`: 完整教案文档
- `slides`: 教学PPT
- `resources`: 配套教学资源
