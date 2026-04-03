# AI虚拟人物平台 - 技能索引

> 基于 Neuro-sama 架构的完整AI虚拟人物系统技能文档

## 🚀 核心引擎

| 技能 | 路径 | 描述 |
|------|------|------|
| EnhancedAvatarEngine v2.0 | `.opencode/skills/enhanced-avatar-engine-v2/` | AI虚拟人物增强引擎，整合延迟优化、情感反馈、持续推理 |
| LatencyOptimizer | `.opencode/skills/latency-optimizer/` | 超低延迟响应优化器 (<50ms) |
| ContinuousInferenceSystem | `.opencode/skills/continuous-inference-system/` | 持续推理循环 + 涌现行为 |
| SentimentFeedbackLoop | `.opencode/skills/sentiment-feedback-loop/` | 实时情感反馈循环 |

## 🗄️ 本地AI能力

| 技能 | 路径 | 描述 |
|------|------|------|
| DuckDB WASM | `.opencode/skills/duckdb-wasm-local-db/` | 纯浏览器SQL数据库，OPFS持久化 |
| WebGPU Inference | `.opencode/skills/webgpu-inference-engine/` | Transformers.js + WebLLM 本地AI推理 |

## 🎭 渲染系统

| 技能 | 路径 | 描述 |
|------|------|------|
| VRM Integration | `.opencode/skills/vrm-integration/` | VRM 3D模型支持 |
| Live2D | `.opencode/skills/` | Live2D渲染 |
| Canvas2D | `.opencode/skills/` | Canvas2D虚拟人物 |

## 🔊 语音系统

| 技能 | 路径 | 描述 |
|------|------|------|
| MultiTTSEngine | `.opencode/skills/multi-tts-engine/` | 多引擎TTS (ElevenLabs/Azure/Browser) |
| WebRTC Voice | `.opencode/skills/webrtc-voice-streaming/` | WebRTC低延迟语音流 |
| ElevenLabsLipSync | `.opencode/skills/elevenlabs-lip-sync/` | 唇形同步 |

## 👋 交互系统

| 技能 | 路径 | 描述 |
|------|------|------|
| GestureRecognition | `.opencode/skills/gesture-recognition-system/` | MediaPipe手势识别 |
| GestureMLClassifier | `.opencode/skills/gesture-ml-classifier/` | TensorFlow.js手势分类 |
| MultiModalVision | `.opencode/skills/multimodal-vision/` | 多模态视觉 |

## 🧠 记忆系统

| 技能 | 路径 | 描述 |
|------|------|------|
| LongTermMemory | `.opencode/skills/long-term-memory-system/` | ChromaDB RAG记忆 |
| SemanticMemory | `.opencode/skills/semantic-memory-system/` | 语义记忆系统 |

## ⚡ 性能优化

| 技能 | 路径 | 描述 |
|------|------|------|
| PerformanceMonitor | `.opencode/skills/performance-monitor-dashboard/` | 性能监控仪表板 |
| LRUCache | `.opencode/skills/lru-cache/` | LRU缓存 |
| ResilientWebSocket | `.opencode/skills/resilient-websocket/` | 弹性WebSocket |
| ComputationWorker | `.opencode/skills/computation-worker/` | 计算Worker |

## 🔒 安全

| 技能 | 路径 | 描述 |
|------|------|------|
| SecurityHardening | `.opencode/skills/security-hardening/` | 综合安全防护 |
| ChineseTranslation | `.opencode/skills/chinese-translation-system/` | 中文翻译系统 |

## 🎮 平台集成

| 技能 | 路径 | 描述 |
|------|------|------|
| GameInteraction | `.opencode/skills/game-interaction-system/` | 游戏交互 |
| PlatformBridge | `.opencode/skills/platform-bridge/` | Telegram/Discord集成 |

## 📊 测试

| 技能 | 路径 | 描述 |
|------|------|------|
| Avatar Test Suite | `tests/avatar-engine.test.js` | 完整测试套件 |
| Test Dashboard | `tests/test-dashboard.html` | 可视化测试页面 |
| Self-contained Test | `测试.html` | 自包含测试(直接双击) |

---

## 快速参考

### 创建虚拟人物

```javascript
const avatar = new EnhancedAvatarEngine({
  renderMode: 'canvas2d',
  personality: 'playful',
  enableEmergence: true
});
```

### 性能目标

| 指标 | 目标 |
|------|------|
| 响应延迟 | < 50ms |
| 情感响应 | 实时 |
| 涌现触发 | 1%概率 |

### 参考项目

- [Neuro-sama](https://www.youtube.com/watch?v=bywM1gyAEM4) - AI VTuber 先驱
- [DuckDB-WASM](https://github.com/duckdb/duckdb-wasm) - 浏览器数据库
- [Transformers.js](https://github.com/huggingface/transformers.js) - 浏览器AI
- [WebLLM](https://github.com/mlc-ai/web-llm) - WebGPU大模型
