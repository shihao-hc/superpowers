---
name: medical-image-analysis
description: X光、CT、MRI等医学影像的AI辅助分析
version: 2.0.0
riskLevel: high
inputs:
  - name: image
    type: file
    required: true
    description: 医学影像文件
  - name: modality
    type: string
    required: true
    description: 成像模态
  - name: bodyPart
    type: string
    required: false
    description: 检查部位
outputs:
  - name: analysis
    type: object
    description: 分析结果
  - name: annotations
    type: image
    description: 标注图像
  - name: report
    type: pdf
    description: 诊断报告
compliance:
  - HIPAA
  - FDA 510(k)
domain: healthcare
tags:
  - 影像
  - AI诊断
  - X光
  - CT
  - MRI
---

# Medical Image Analysis

## 概述
基于深度学习的医学影像AI辅助分析，支持X光、CT、MRI等多种模态。

## 功能特点
- 多模态影像支持（X光、CT、MRI、超声）
- 自动病灶检测和标注
- 生成结构化诊断报告
- 符合HIPAA和FDA 510(k)要求

## 输入参数
- `image`: DICOM或标准格式的医学影像文件
- `modality`: 成像模态（X-RAY、CT、MRI、ULTRASOUND）
- `bodyPart`: 检查部位（可选）

## 输出结果
- `analysis`: AI分析结果
- `annotations`: 带标注的图像
- `report`: PDF格式诊断报告
