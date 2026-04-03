---
name: exam-generator
description: 根据知识点和难度自动生成多样化试题
version: 1.7.0
riskLevel: low
inputs:
  - name: topics
    type: array
    required: true
    description: 知识点
  - name: difficulty
    type: string
    required: true
    description: 难度等级
  - name: questionCount
    type: number
    required: true
    description: 题目数量
outputs:
  - name: exam
    type: document
    description: 试卷文档
  - name: answerKey
    type: document
    description: 答案解析
  - name: rubric
    type: document
    description: 评分细则
compliance:
  - FERPA
  - Academic Integrity Standards
domain: education
tags:
  - 出题
  - 试卷
  - 考试
  - 题库
---

# AI Exam Generator

## 概述
智能出题系统，根据知识点和难度自动生成高质量试题。

## 功能特点
- 知识点覆盖分析
- 难度智能调控
- 多题型支持
- 答案解析自动生成

## 输入参数
- `topics`: 考试涉及的知识点
- `difficulty`: 难度等级（基础/中等/困难/混合）
- `questionCount`: 目标题目数量

## 输出结果
- `exam`: 生成的试卷（Word格式）
- `answerKey`: 答案和解析
- `rubric`: 评分细则
