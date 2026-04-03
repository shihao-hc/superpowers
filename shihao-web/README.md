# 拾号金融 (ShiHao Finance) - AI驱动的股票分析和交易系统

## 项目概述

拾号金融是一个基于Python的AI驱动股票选择和交易系统，包含：
- **多源数据集成**：AKShare（A股）、YFinance（国际市场）
- **动态特征工程**：50+技术指标
- **机器学习模型**：趋势、反转、价值模型，AI决策者
- **自动交易引擎**：信号处理、仓位管理、订单执行
- **回测框架**：生存偏差校正、交易成本建模
- **风险管理**：仓位限制、行业集中度、日损限制
- **可解释AI**：SHAP/LIME解释

## 快速开始

### 方式一：Python后端（推荐）

```bash
# 安装依赖
cd python-backend
pip install -r requirements.txt

# 运行服务器
python run.py
# API运行在 http://localhost:8000
# API文档: http://localhost:8000/docs
```

### 方式二：Node.js后端（兼容模式）

#### 前端
```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:5173
```

#### 后端
```bash
cd backend
npm install
npm run dev
# API运行在 http://localhost:4000
```

### 方式三：Docker部署

```bash
# 构建并运行
docker-compose up -d
```

## 项目结构

```
shihao-web/
├── python-backend/           # Python后端（新架构）
│   ├── shihao_finance/       # 核心模块
│   │   ├── core/             # 核心功能
│   │   │   ├── data/         # 数据层
│   │   │   ├── features/     # 特征工程
│   │   │   ├── models/       # ML模型
│   │   │   ├── trading/      # 交易引擎
│   │   │   ├── risk/         # 风险管理
│   │   │   ├── backtest/     # 回测
│   │   │   └── xai/          # 可解释AI
│   │   └── api/              # FastAPI应用
│   ├── requirements.txt      # Python依赖
│   └── run.py               # 启动脚本
├── backend/                  # Node.js后端（旧架构）
├── frontend/                 # Vue3前端
├── docker-compose.yml        # Docker配置
└── README.md
```

## API端点

| 端点 | 描述 |
|------|------|
| GET `/health` | 健康检查 |
| GET `/api/market/list` | 获取股票列表 |
| GET `/api/market/ohlcv/{symbol}` | 获取OHLCV数据 |
| GET `/api/predict/{symbol}` | 获取股票预测 |
| POST `/api/select` | AI选股 |
| GET `/api/portfolio` | 获取组合状态 |
| POST `/api/trade` | 执行交易 |
| GET `/api/risk/metrics` | 获取风险指标 |

## 功能说明

| 模块 | 功能 |
|------|------|
| 数据层 | AKShare/YFinance多源数据，自动回退 |
| 特征工程 | 50+技术指标，动态特征计算 |
| ML模型 | 趋势/反转/价值模型，集成学习 |
| 交易引擎 | 信号处理、仓位管理、订单执行 |
| 风险管理 | 仓位限制、止损、日损限制 |
| 回测 | 事件驱动回测，生存偏差校正 |
| XAI | SHAP/LIME解释，特征贡献分析 |

## 开发状态

- ✅ Python后端架构
- ✅ 数据层（AKShare/YFinance）
- ✅ 特征工程（技术指标）
- ✅ ML模型（趋势/集成）
- ✅ 交易引擎
- ✅ 风险管理
- ✅ XAI模块
- 🔄 回测框架（部分完成）
- 🔄 前端重构（待开始）
- 🔄 Docker部署（待优化）
