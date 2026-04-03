# 虚拟形象集成研究报告

## 一、现有 SVG 头像系统 ✅ 已完成

### 创建的头像
| 人格 | 头像文件 | 特点 |
|------|----------|------|
| 狐九 | `fox-nine.svg` | 橙毛狐狸，可爱 |
| 艾利 | `elie.svg` | 狮子戴眼镜，沉稳 |
| 博士 | `professor.svg` | 教授形象，戴眼镜领结 |
| 小埋 | `kawaii.svg` | 粉发萌娘，大眼睛 |
| 零 | `zero.svg` | 赛博朋克，霓虹眼睛 |
| 小暖 | `warm-heart.svg` | 温柔暖色，心形装饰 |
| 段子手 | `joker.svg` | 派对帽，笑脸 |
| 墨兰 | `ink-orchid.svg` | 古风发簪，优雅 |
| 钢铁星 | `steel-star.svg` | 机械头，LED眼睛 |
| 甜甜 | `sweetie.svg` | 金发双马尾，闪亮 |

### CSS 动画系统
已创建 `frontend/styles/avatar.css`：
- **心情动画**: happy(弹跳)、excited(颤抖)、sad(灰暗)、curious(歪头)
- **说话动画**: 脉冲缩放效果
- **光晕效果**: 不同心情对应不同颜色光晕

---

## 二、GitHub 开源项目调研

### 🏆 推荐项目

#### 1. **oh-my-live2d** (⭐ 537)
```
https://github.com/oh-my-live2d/oh-my-live2d
```
**特点**:
- 开箱即用的 Live2D 组件
- 支持 Cubism 2/4/5 所有版本
- TypeScript + CDN/ES6 双导入方式
- 默认集成 Live2D SDK
- 文档: https://oml2d.hacxy.cn

**快速使用**:
```html
<script src="https://unpkg.com/oh-my-live2d@latest"></script>
<script>
  OML2D.loadOml2d({
    models: [{
      path: 'https://model.url/HK416-1-normal/model.json',
      position: [0, 60],
      scale: 0.08
    }]
  });
</script>
```

#### 2. **easy-live2d** (⭐ 75)
```
https://github.com/Panzer-Jack/easy-live2d
```
**特点**:
- 基于 Pixi.js v8 + Cubism 5
- 极轻量级，API 简单
- 支持 Vue/React
- 文档: https://panzer-jack.github.io/easy-live2d

**安装**:
```bash
npm install easy-live2d
```

#### 3. **Open-LLM-VTuber** (⭐ 6248)
```
https://github.com/Open-LLM-VTuber/Open-LLM-VTuber
```
**特点**:
- 完整的 VTuber 解决方案
- 本地 LLM (Ollama) + Live2D
- 语音识别 + TTS
- 跨平台支持
- 声音中断 + 免手操作

#### 4. **handcrafted-persona-engine** (⭐ 1015)
```
https://github.com/fagenorn/handcrafted-persona-engine
```
**特点**:
- C# 核心，Python/Rust 辅助
- 集成 LLM + ASR + TTS + RVC
- 适合 VTuber/直播/虚拟助手
- v2.0 刚发布

#### 5. **realtime-ai/live2d-agent** (⭐ 新项目)
```
https://github.com/realtime-ai/live2d-agent
```
**特点**:
- 语音驱动唇形同步
- 5 个预设角色 (Shizuku, Haru 等)
- 眼睛跟随鼠标
- 点击交互

---

## 三、集成路线图

### 阶段 1: SVG 头像 + CSS 动画 (已完成 ✅)
```
当前状态
├── SVG 头像: 10 个人格
├── CSS 动画: 心情变化 + 说话动画
├── 情绪映射: happy/excited/sad/curious/shy/proud
└── 前端组件: avatar.css
```

### 阶段 2: 简单 Live2D 集成 (推荐)
**目标**: 为 1-2 个人格添加 Live2D 模型

**选择方案**: `oh-my-live2d`

**步骤**:
1. 安装依赖
```bash
npm install oh-my-live2d
```

2. 创建 Live2D 组件
```javascript
// frontend/components/Live2DCharacter.js
class Live2DCharacter {
  constructor(container, options) {
    this.container = container;
    this.oml2d = null;
    this.currentMood = 'neutral';
    this.moodExpressions = {
      happy: 'happy',
      sad: 'sad',
      excited: 'excited',
      curious: 'thinking',
      neutral: 'normal'
    };
  }

  async init(modelPath) {
    this.oml2d = await OML2D.loadOml2d({
      models: [{ path: modelPath }]
    });
  }

  setMood(mood) {
    if (this.oml2d && this.moodExpressions[mood]) {
      this.oml2d.setExpression(this.moodExpressions[mood]);
    }
    this.currentMood = mood;
  }

  speak() {
    if (this.oml2d) {
      this.oml2d.startMotion('Idle');
    }
  }
}
```

3. 情绪触发
```javascript
// 情绪变化时
avatar.setMood('happy');
avatar.speak();

// 说话时
avatar.speak();
```

### 阶段 3: 完整 VTuber 集成 (进阶)

**基于 Open-LLM-VTuber**:
```yaml
架构:
  前端: index.html + Live2D 组件
  后端: Express + Socket.IO
  AI: Ollama (已有)
  语音: Web Speech API / RVC
  游戏: Mineflayer (已有)
```

---

## 四、获取 Live2D 模型

### 免费模型来源
1. **Live2D Cubism 官方**
   - https://www.live2d.com/download/cubism.html
   - 提供示例模型

2. **VRoid Hub**
   - https://vroid.pixiv.net/
   - 大量用户创作模型

3. **Live2D Sample Models**
   - https://www.live2d.com/sample/
   - 官方示例

4. **模型格式转换**
   - VRM → Live2D (需工具)
   - Unity 角色 → Live2D

### 模型文件结构
```
model/
├── model.json          # 主配置文件
├── model.moc3         # 模型数据
├── textures/          # 纹理图片
│   └── texture_00.png
├── motions/           # 动作动画
│   ├── idle.motion3.json
│   └── happy.motion3.json
└── expressions/       # 表情
    ├── happy.exp3.json
    └── sad.exp3.json
```

---

## 五、自定义 Live2D 模型制作

### 推荐工具
| 工具 | 用途 | 难度 |
|------|------|------|
| Live2D Cubism Editor | 官方编辑器 | 中等 |
| Piapro Studio | 简化版 | 简单 |
| Clip Studio Paint | 绘制 | 需绘画技能 |
| Character Creator 3 | 3D转2D | 简单 |

### 工作流程
```
1. 绘制各部件图层 (Photoshop/Clip Studio)
   └── 头发、前景、背景等分图层

2. 导入 Cubism Editor
   └── 设置锚点和变形

3. 添加动画
   └── 眨眼、呼吸、idle动作

4. 导出模型
   └── .moc3 + .model3.json
```

---

## 六、情绪驱动实现

### 情绪状态机
```
mood: 'happy'
  └── expression: 'happy.exp3.json'
  └── motion: 'happy.motion3.json'
  └── tts_rate: 1.2
  └── avatar_filter: brightness(1.1)

mood: 'sad'
  └── expression: 'sad.exp3.json'
  └── motion: 'idle.motion3.json'
  └── tts_rate: 0.8
  └── avatar_filter: saturate(0.7)
```

### 前端集成
```javascript
// 情绪变化时更新
socket.on('mood', (data) => {
  const mood = data.mood;
  updateAvatar(mood);
  updateTTS(mood);
  playMotion(mood);
});
```

---

## 七、推荐的集成顺序

| 阶段 | 内容 | 资源需求 |
|------|------|----------|
| 1️⃣ | SVG头像+CSS动画 | ✅ 已有 |
| 2️⃣ | oh-my-live2d 集成 | 需要1个Live2D模型 |
| 3️⃣ | 语音唇形同步 | 需要TTS配置 |
| 4️⃣ | Open-LLM-VTuber | 需要完整VTuber项目 |

---

## 八、下一步行动

### 已完成 (Phase 2 ✅)
1. [x] 从 oh-my-live2d 模型仓库获取免费 Live2D 模型
2. [x] 使用 CDN 方式加载 oh-my-live2d
3. [x] 创建 Live2DComponent.js 组件
4. [x] 映射情绪到模型表情
5. [x] 更新 personalities.json 添加模型映射

### 已完成 (Phase 3 ✅)
1. [x] 创建 VoiceAvatar.js 组件
2. [x] 实现 TTSSystem 类 (Web Speech API)
3. [x] 实现 LipSyncAnimator 类 (唇形同步)
4. [x] 情绪驱动的 TTS 参数
5. [x] Live2D 说话动画同步

### 模型映射表

| 人格 | Live2D 模型 | 特点 |
|------|-------------|------|
| 狐九 | Senko_Normals | 狐狸形象 |
| 艾利 | chino | 咖啡店女孩 |
| 博士 | hibiki | 专业女性 |
| 小埋 | koharu | 可爱女孩 |
| 零 | rem | 蓝发女孩 |
| 小暖 | shizuku | 戴眼镜温柔 |
| 段子手 | umaru | 搞笑角色 |
| 墨兰 | histoire | 优雅女性 |
| 钢铁星 | haruto | 男性角色 |
| 甜甜 | tia | 元气女孩 |

### 技术架构

```
VoiceAvatar
├── TTSSystem (Web Speech API)
│   ├── 语音合成
│   ├── 多语音支持
│   └── 情绪参数调整
└── LipSyncAnimator
    ├── 音素序列分析
    ├── 口型值计算
    └── Live2D 同步
```

### 获取帮助
- **oh-my-live2d 文档**: https://oml2d.hacxy.cn
- **Live2D 官方论坛**: https://community.live2d.com/
- **中文社区**: QQ群 474032914 (oh-my-live2d)

---

*最后更新: 2026-03-20*
