# Portfolio Analytics Dashboard 设计文档

**日期**: 2026-03-29  
**模块**: Portfolio Analytics Dashboard  
**状态**: 已批准

---

## 1. 概述

为拾号金融项目添加 Portfolio Analytics Dashboard（持仓分析仪表盘），提供全面的投资组合绩效可视化。

### 1.1 目标

- 展示投资组合的核心财务指标
- 提供时间序列收益分析
- 可视化持仓分布
- 监控风险指标

### 1.2 设计风格

**金融终端风格** - 专业、高数据密度、经典金融终端外观

---

## 2. 页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│  持仓分析仪表盘                              [时间范围选择器]   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 总资产    │ │ 今日盈亏 │ │ 持仓数量 │ │ 胜率      │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   收益曲线 (时间序列)                       ││
│  │                   渐变填充 + MA5/MA20 移动平均线            ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌───────────────────────┐  ┌─────────────────────────────────┐│
│  │    持仓分布环形图      │  │      风险指标仪表盘             ││
│  │                       │  │   夏普比率 | 最大回撤 | VaR    ││
│  └───────────────────────┘  └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 功能模块

### 3.1 核心指标卡片

| 指标 | 显示内容 | 计算方式 |
|------|----------|----------|
| **总资产** | ¥1,234,567.89 | 持仓市值 + 现金余额 |
| **今日盈亏** | +¥12,345 (+2.34%) | (当前值 - 昨日值) / 昨日值 |
| **持仓数量** | 12只 | 当前持仓股票数量 |
| **胜率** | 65.2% | 盈利次数 / 总交易次数 |

**设计细节**:
- 卡片背景：`rgba(30, 41, 59, 0.8)` + 毛玻璃效果
- 数字样式：大字体、粗体、主色调
- 盈亏颜色：正数绿色 (#10b981)、负数红色 (#ef4444)
- 悬浮效果：轻微上浮 + 阴影加深

### 3.2 收益曲线图表

**图表类型**: 平滑面积图 + 多周期均线

**配置**:
```javascript
{
  areaStyle: {
    color: {
      type: 'linear',
      x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: 'rgba(14, 165, 233, 0.6)' },
        { offset: 1, color: 'rgba(14, 165, 233, 0.05)' }
      ]
    }
  },
  series: [
    { name: '收益曲线', type: 'line', smooth: true },
    { name: 'MA5', type: 'line' },
    { name: 'MA20', type: 'line' }
  ],
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } }
}
```

**交互功能**:
- 时间范围：1周 / 1月 / 3月 / 6月 / 1年 / 全部
- 悬浮十字线显示详情
- 可缩放拖拽

### 3.3 持仓分布环形图

**展示内容**:
- 各行业/板块占比
- 单只股票仓位占比
- 点击扇区可下钻

**配色方案**:
```javascript
color: ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
```

### 3.4 风险指标仪表盘

| 指标 | 类型 | 说明 |
|------|------|------|
| **夏普比率** | 数值 | (收益率 - 无风险利率) / 波动率 |
| **最大回撤** | 仪表盘 | 历史最大跌幅 |
| **波动率** | 仪表盘 | 收益率标准差 |
| **VaR (95%)** | 数值 | 95%置信度下最大日损失 |

**仪表盘设计**:
- 指针式仪表盘
- 颜色分区：绿色(安全)/黄色(警戒)/红色(危险)
- 中心显示当前值

---

## 4. 数据接口

### 4.1 API 接口

```typescript
GET /api/portfolio/analytics

Response: {
  summary: {
    totalAsset: number,
    dailyPnL: number,
    dailyPnLPct: number,
    positionCount: number,
    winRate: number
  },
  equityCurve: [{
    date: string,
    value: number,
    ma5: number,
    ma20: number
  }],
  positionDistribution: [{
    name: string,
    value: number,
    percentage: number
  }],
  riskMetrics: {
    sharpeRatio: number,
    maxDrawdown: number,
    volatility: number,
    var95: number
  }
}
```

### 4.2 数据更新

- 实时推送：WebSocket
- 轮询备选：60秒间隔

---

## 5. 技术实现

### 5.1 技术栈

- Vue 3 + Composition API
- ECharts 5.x
- Element Plus (现有)
- Pinia Store (现有)

### 5.2 组件结构

```
src/
├── views/
│   └── PortfolioAnalyticsView.vue    # 主页面
├── components/
│   ├── MetricCard.vue                # 指标卡片
│   ├── EquityCurveChart.vue          # 收益曲线
│   ├── PositionPieChart.vue           # 持仓分布
│   └── RiskGaugeChart.vue             # 风险仪表盘
└── stores/
    └── portfolio.js                   # 扩展现有 store
```

---

## 6. 实施计划

详见 `docs/superpowers/plans/YYYY-MM-DD-portfolio-analytics-plan.md`

---

**审批状态**: 已批准  
**下一步**: 创建实施计划
