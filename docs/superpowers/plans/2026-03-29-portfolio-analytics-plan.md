# Portfolio Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现持仓分析仪表盘，包含核心指标卡片、收益曲线图、持仓分布图、风险仪表盘

**Architecture:** 使用 Vue 3 Composition API + ECharts 5.x + Element Plus，在现有 shihao-web 项目中扩展

**Tech Stack:** Vue 3, ECharts 5.x, Element Plus, Pinia

---

## 文件结构

```
src/
├── views/
│   └── PortfolioAnalyticsView.vue    # 新建：主页面
├── components/
│   ├── MetricCard.vue               # 新建：指标卡片组件
│   ├── EquityCurveChart.vue         # 新建：收益曲线组件
│   ├── PositionPieChart.vue         # 新建：持仓分布组件
│   └── RiskGaugeChart.vue           # 新建：风险仪表盘组件
└── stores/
    └── portfolio.js                  # 修改：添加 analytics 相关 state 和 actions
```

---

## Task 1: 创建 MetricCard 指标卡片组件

**Files:**
- Create: `src/components/MetricCard.vue`

- [ ] **Step 1: 创建 MetricCard.vue 组件**

```vue
<template>
  <div class="metric-card" :class="{ 'is-clickable': clickable }">
    <div class="metric-icon" v-if="icon">
      <el-icon :size="24"><component :is="icon" /></el-icon>
    </div>
    <div class="metric-content">
      <div class="metric-label">{{ label }}</div>
      <div class="metric-value" :class="valueClass">
        {{ formattedValue }}
      </div>
      <div class="metric-change" v-if="change !== undefined" :class="changeClass">
        <span v-if="change >= 0">+</span>{{ change.toFixed(2) }}%
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [Number, String], required: true },
  change: { type: Number, default: undefined },
  format: { type: String, default: 'number' },
  icon: { type: String, default: '' },
  clickable: { type: Boolean, default: false }
})

const formattedValue = computed(() => {
  if (typeof props.value === 'string') return props.value
  switch (props.format) {
    case 'currency':
      return '¥' + props.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'percent':
      return props.value.toFixed(2) + '%'
    case 'number':
    default:
      return props.value.toLocaleString()
  }
})

const valueClass = computed(() => ({
  'is-positive': typeof props.change === 'number' && props.change > 0,
  'is-negative': typeof props.change === 'number' && props.change < 0
}))

const changeClass = computed(() => ({
  'is-positive': props.change > 0,
  'is-negative': props.change < 0
}))
</script>

<style scoped>
.metric-card {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  gap: 16px;
  transition: all 0.3s ease;
}

.metric-card.is-clickable {
  cursor: pointer;
}

.metric-card.is-clickable:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  border-color: rgba(14, 165, 233, 0.3);
}

.metric-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(16, 185, 129, 0.2));
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0ea5e9;
}

.metric-content {
  flex: 1;
}

.metric-label {
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #f1f5f9;
}

.metric-value.is-positive {
  color: #10b981;
}

.metric-value.is-negative {
  color: #ef4444;
}

.metric-change {
  font-size: 12px;
  margin-top: 4px;
}

.metric-change.is-positive {
  color: #10b981;
}

.metric-change.is-negative {
  color: #ef4444;
}
</style>
```

- [ ] **Step 2: 提交代码**

```bash
git add src/components/MetricCard.vue
git commit -m "feat(analytics): add MetricCard component"
```

---

## Task 2: 创建 EquityCurveChart 收益曲线组件

**Files:**
- Create: `src/components/EquityCurveChart.vue`

- [ ] **Step 1: 创建 EquityCurveChart.vue 组件**

```vue
<template>
  <div class="equity-curve-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  timeRange: {
    type: String,
    default: '1M'
  }
})

const chartRef = ref(null)
let chartInstance = null

const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const dates = props.data.map(d => d.date)
  const values = props.data.map(d => d.value)
  const ma5 = props.data.map(d => d.ma5)
  const ma20 = props.data.map(d => d.ma20)
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        crossStyle: { color: '#64748b' },
        lineStyle: { color: '#475569', type: 'dashed' }
      },
      backgroundColor: 'rgba(30, 41, 59, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      textStyle: { color: '#f1f5f9' },
      formatter: (params) => {
        const date = params[0].axisValue
        let html = `<div style="font-weight: 600; margin-bottom: 8px;">${date}</div>`
        params.forEach(p => {
          if (p.value !== '-' && p.value !== undefined) {
            html += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${p.color};"></span>
              <span>${p.seriesName}: <strong>${typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong></span>
            </div>`
          }
        })
        return html
      }
    },
    legend: {
      data: ['收益曲线', 'MA5', 'MA20'],
      bottom: 0,
      textStyle: { color: '#94a3b8' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b', fontSize: 11 },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.1)', type: 'dashed' } },
      axisLine: { show: false },
      axisLabel: { 
        color: '#64748b',
        formatter: (v) => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v.toFixed(0)
      }
    },
    series: [
      {
        name: '收益曲线',
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 3, color: '#0ea5e9' },
        itemStyle: { color: '#0ea5e9' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(14, 165, 233, 0.5)' },
            { offset: 1, color: 'rgba(14, 165, 233, 0.05)' }
          ])
        }
      },
      {
        name: 'MA5',
        type: 'line',
        data: ma5,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#10b981', type: 'dashed' }
      },
      {
        name: 'MA20',
        type: 'line',
        data: ma20,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' }
      }
    ]
  }
  
  chartInstance.setOption(option)
}

const handleResize = () => {
  chartInstance?.resize()
}

watch(() => props.data, () => {
  initChart()
}, { deep: true })

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<style scoped>
.equity-curve-chart {
  width: 100%;
  height: 100%;
  min-height: 350px;
}
</style>
```

- [ ] **Step 2: 提交代码**

```bash
git add src/components/EquityCurveChart.vue
git commit -m "feat(analytics): add EquityCurveChart component"
```

---

## Task 3: 创建 PositionPieChart 持仓分布组件

**Files:**
- Create: `src/components/PositionPieChart.vue`

- [ ] **Step 1: 创建 PositionPieChart.vue 组件**

```vue
<template>
  <div class="position-pie-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
})

const chartRef = ref(null)
let chartInstance = null

const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(30, 41, 59, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      textStyle: { color: '#f1f5f9' },
      formatter: (params) => {
        return `<div style="font-weight: 600; margin-bottom: 8px;">${params.name}</div>
          <div>市值: <strong>¥${params.value.toLocaleString()}</strong></div>
          <div>占比: <strong>${params.percent.toFixed(1)}%</strong></div>`
      }
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: '#94a3b8' },
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 12
    },
    series: [
      {
        name: '持仓分布',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: 'rgba(15, 23, 42, 0.8)',
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          scale: true,
          scaleSize: 10,
          itemStyle: {
            shadowBlur: 20,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        data: props.data.map((item, index) => ({
          name: item.name,
          value: item.value,
          itemStyle: { color: colors[index % colors.length] }
        }))
      }
    ]
  }
  
  chartInstance.setOption(option)
}

const handleResize = () => {
  chartInstance?.resize()
}

watch(() => props.data, () => {
  initChart()
}, { deep: true })

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<style scoped>
.position-pie-chart {
  width: 100%;
  height: 100%;
  min-height: 280px;
}
</style>
```

- [ ] **Step 2: 提交代码**

```bash
git add src/components/PositionPieChart.vue
git commit -m "feat(analytics): add PositionPieChart component"
```

---

## Task 4: 创建 RiskGaugeChart 风险仪表盘组件

**Files:**
- Create: `src/components/RiskGaugeChart.vue`

- [ ] **Step 1: 创建 RiskGaugeChart.vue 组件**

```vue
<template>
  <div class="risk-gauge-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([GaugeChart, TooltipComponent, CanvasRenderer])

const props = defineProps({
  title: { type: String, required: true },
  value: { type: Number, required: true },
  max: { type: Number, default: 100 },
  unit: { type: String, default: '' },
  type: { type: String, default: 'positive' }
})

const chartRef = ref(null)
let chartInstance = null

const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  const percent = (props.value / props.max) * 100
  const isGood = props.type === 'positive' ? percent > 50 : percent < 50
  
  const option = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: props.max,
        radius: '90%',
        center: ['50%', '60%'],
        pointer: {
          show: true,
          length: '60%',
          width: 6,
          itemStyle: {
            color: isGood ? '#10b981' : '#ef4444'
          }
        },
        progress: {
          show: true,
          width: 12,
          roundCap: true,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: '#10b981' },
                { offset: 0.5, color: '#f59e0b' },
                { offset: 1, color: '#ef4444' }
              ]
            }
          }
        },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [[1, 'rgba(148, 163, 184, 0.15)']]
          },
          roundCap: true
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '20%'],
          color: '#94a3b8',
          fontSize: 12
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '-10%'],
          fontSize: 20,
          fontWeight: 'bold',
          formatter: `{value}${props.unit}`,
          color: isGood ? '#10b981' : '#f1f5f9'
        },
        data: [{ value: props.value, name: props.title }]
      }
    ]
  }
  
  chartInstance.setOption(option)
}

const handleResize = () => {
  chartInstance?.resize()
}

watch(() => [props.value, props.title], () => {
  initChart()
})

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<style scoped>
.risk-gauge-chart {
  width: 100%;
  height: 100%;
  min-height: 180px;
}
</style>
```

- [ ] **Step 2: 提交代码**

```bash
git add src/components/RiskGaugeChart.vue
git commit -m "feat(analytics): add RiskGaugeChart component"
```

---

## Task 5: 创建 PortfolioAnalyticsView 主页面

**Files:**
- Create: `src/views/PortfolioAnalyticsView.vue`

- [ ] **Step 1: 创建 PortfolioAnalyticsView.vue 页面**

```vue
<template>
  <div class="portfolio-analytics">
    <div class="analytics-header">
      <h2>持仓分析仪表盘</h2>
      <div class="time-range-selector">
        <el-radio-group v-model="timeRange" size="default">
          <el-radio-button label="1W">1周</el-radio-button>
          <el-radio-button label="1M">1月</el-radio-button>
          <el-radio-button label="3M">3月</el-radio-button>
          <el-radio-button label="6M">6月</el-radio-button>
          <el-radio-button label="1Y">1年</el-radio-button>
          <el-radio-button label="ALL">全部</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 核心指标卡片 -->
    <div class="metrics-row">
      <MetricCard
        label="总资产"
        :value="analyticsData.summary.totalAsset"
        format="currency"
        :icon="Wallet"
      />
      <MetricCard
        label="今日盈亏"
        :value="analyticsData.summary.dailyPnL"
        format="currency"
        :change="analyticsData.summary.dailyPnLPct"
        :icon="TrendCharts"
      />
      <MetricCard
        label="持仓数量"
        :value="analyticsData.summary.positionCount"
        :icon="Collection"
      />
      <MetricCard
        label="胜率"
        :value="analyticsData.summary.winRate"
        format="percent"
        :icon="DataLine"
      />
    </div>

    <!-- 收益曲线图表 -->
    <div class="chart-section main-chart">
      <div class="section-title">收益曲线</div>
      <EquityCurveChart :data="analyticsData.equityCurve" :timeRange="timeRange" />
    </div>

    <!-- 底部双栏图表 -->
    <div class="charts-row">
      <div class="chart-section">
        <div class="section-title">持仓分布</div>
        <PositionPieChart :data="analyticsData.positionDistribution" />
      </div>
      <div class="chart-section risk-section">
        <div class="section-title">风险指标</div>
        <div class="risk-gauges">
          <RiskGaugeChart
            title="夏普比率"
            :value="analyticsData.riskMetrics.sharpeRatio"
            :max="3"
            type="positive"
          />
          <RiskGaugeChart
            title="最大回撤"
            :value="analyticsData.riskMetrics.maxDrawdown"
            :max="50"
            unit="%"
            type="negative"
          />
          <RiskGaugeChart
            title="波动率"
            :value="analyticsData.riskMetrics.volatility"
            :max="50"
            unit="%"
            type="negative"
          />
          <RiskGaugeChart
            title="VaR (95%)"
            :value="analyticsData.riskMetrics.var95"
            :max="10"
            unit="%"
            type="negative"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { Wallet, TrendCharts, Collection, DataLine } from '@element-plus/icons-vue'
import MetricCard from '@/components/MetricCard.vue'
import EquityCurveChart from '@/components/EquityCurveChart.vue'
import PositionPieChart from '@/components/PositionPieChart.vue'
import RiskGaugeChart from '@/components/RiskGaugeChart.vue'

const timeRange = ref('1M')

const analyticsData = reactive({
  summary: {
    totalAsset: 1234567.89,
    dailyPnL: 12345.67,
    dailyPnLPct: 2.34,
    positionCount: 12,
    winRate: 65.2
  },
  equityCurve: [],
  positionDistribution: [],
  riskMetrics: {
    sharpeRatio: 1.82,
    maxDrawdown: 8.5,
    volatility: 15.3,
    var95: 2.1
  }
})

const fetchAnalyticsData = async () => {
  // TODO: 调用后端 API 获取数据
  // 暂时使用模拟数据
  const mockEquityCurve = []
  const baseValue = 1000000
  for (let i = 0; i < 30; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    const value = baseValue + Math.random() * 100000 - 50000 + i * 5000
    mockEquityCurve.push({
      date: date.toISOString().split('T')[0],
      value: value,
      ma5: value,
      ma20: value
    })
  }
  
  for (let i = 5; i < mockEquityCurve.length; i++) {
    mockEquityCurve[i].ma5 = mockEquityCurve.slice(i-4, i+1).reduce((a, b) => a + b.value, 0) / 5
  }
  for (let i = 20; i < mockEquityCurve.length; i++) {
    mockEquityCurve[i].ma20 = mockEquityCurve.slice(i-19, i+1).reduce((a, b) => a + b.value, 0) / 20
  }
  
  analyticsData.equityCurve = mockEquityCurve
  analyticsData.positionDistribution = [
    { name: '科技', value: 350000 },
    { name: '金融', value: 280000 },
    { name: '消费', value: 220000 },
    { name: '医药', value: 180000 },
    { name: '能源', value: 120000 },
    { name: '其他', value: 84567 }
  ]
}

watch(timeRange, () => {
  fetchAnalyticsData()
})

onMounted(() => {
  fetchAnalyticsData()
})
</script>

<style scoped>
.portfolio-analytics {
  padding: 0;
}

.analytics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.analytics-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

@media (max-width: 1200px) {
  .metrics-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-row {
    grid-template-columns: 1fr;
  }
}

.chart-section {
  background: rgba(30, 41, 59, 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
}

.main-chart {
  height: 400px;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 1024px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}

.risk-section {
  display: flex;
  flex-direction: column;
}

.risk-gauges {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  flex: 1;
}
</style>
```

- [ ] **Step 2: 提交代码**

```bash
git add src/views/PortfolioAnalyticsView.vue
git commit -m "feat(analytics): add PortfolioAnalyticsView page"
```

---

## Task 6: 配置路由

**Files:**
- Modify: `src/router/index.js`

- [ ] **Step 1: 添加路由配置**

在 router/index.js 中添加持仓分析页面的路由：

```javascript
{
  path: '/portfolio/analytics',
  name: 'PortfolioAnalytics',
  component: () => import('@/views/PortfolioAnalyticsView.vue'),
  meta: { title: '持仓分析' }
}
```

- [ ] **Step 2: 提交代码**

```bash
git add src/router/index.js
git commit -m "feat(analytics): add portfolio analytics route"
```

---

## Task 7: 添加到侧边栏菜单

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: 添加菜单项**

在 `sidebarMenus` 的 `trade` 系统中添加持仓分析菜单：

```javascript
trade: [
  { path: '/portfolio/analytics', label: '持仓分析', icon: 'DataBoard' },
  { path: '/trade/portfolio', label: '持仓视图', icon: 'Wallet' },
  { path: '/trade/orders', label: '订单管理', icon: 'List' },
  { path: '/trade/chat', label: '交易助手', icon: 'ChatDotRound' },
]
```

- [ ] **Step 2: 提交代码**

```bash
git add src/App.vue
git commit -m "feat(analytics): add analytics to sidebar menu"
```

---

## Task 8: 集成后端 API（可选）

**Files:**
- Modify: `src/api/index.js`
- Modify: `src/views/PortfolioAnalyticsView.vue`

- [ ] **Step 1: 添加 API 接口**

在 `src/api/index.js` 中添加：

```javascript
export const portfolioAPI = {
  getAnalytics: (timeRange) => request.get('/portfolio/analytics', { params: { timeRange } })
}
```

- [ ] **Step 2: 在页面中使用真实 API**

修改 `PortfolioAnalyticsView.vue` 的 `fetchAnalyticsData` 函数：

```javascript
const fetchAnalyticsData = async () => {
  try {
    const { data } = await portfolioAPI.getAnalytics(timeRange.value)
    analyticsData.summary = data.summary
    analyticsData.equityCurve = data.equityCurve
    analyticsData.positionDistribution = data.positionDistribution
    analyticsData.riskMetrics = data.riskMetrics
  } catch (error) {
    console.error('Failed to fetch analytics data:', error)
  }
}
```

- [ ] **Step 3: 提交代码**

```bash
git add src/api/index.js src/views/PortfolioAnalyticsView.vue
git commit -m "feat(analytics): integrate backend API"
```

---

## 实施检查清单

- [ ] Task 1: MetricCard 组件
- [ ] Task 2: EquityCurveChart 组件
- [ ] Task 3: PositionPieChart 组件
- [ ] Task 4: RiskGaugeChart 组件
- [ ] Task 5: PortfolioAnalyticsView 页面
- [ ] Task 6: 路由配置
- [ ] Task 7: 侧边栏菜单
- [ ] Task 8: 后端 API 集成（可选）

---

## 预览地址

完成部署后访问：`/portfolio/analytics`
