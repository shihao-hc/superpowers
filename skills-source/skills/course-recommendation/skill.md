---
name: course-recommendation
description: 基于学生画像和学习历史推荐最适合的课程
version: 1.6.0
riskLevel: low
inputs:
  - name: studentProfile
    type: object
    required: true
    description: 学生画像
  - name: availableCourses
    type: array
    required: true
    description: 可选课程
outputs:
  - name: recommendations
    type: array
    description: 课程推荐
  - name: reasoning
    type: array
    description: 推荐理由
  - name: pathway
    type: document
    description: 学习路径
compliance:
  - FERPA
  - GDPR
domain: education
tags:
  - 推荐
  - 课程
  - 个性化
  - 学习路径
---

# Course Recommendation Engine

## 概述
智能课程推荐系统，为学生推荐最适合的学习路径和课程。

## 功能特点
- 多维度学生画像
- 课程匹配算法
- 学习路径规划
- 推荐可解释性

## 输入参数
- `studentProfile`: 学生画像（兴趣、能力、学习目标）
- `availableCourses`: 可选课程列表

## 输出结果
- `recommendations`: 推荐课程列表
- `reasoning`: 推荐理由
- `pathway`: 个性化学习路径
