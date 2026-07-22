# Ink 渲染系统深度分析

## 核心架构

Claude Code使用**Ink**作为终端渲染引擎，基于React Reconciler实现自定义渲染：

```
┌─────────────────────────────────────────────────────────────────────────┐
│  React Component Tree (App.tsx)                                         │
│  └── <Box>, <Text>, <ScrollBox>, <TaskList>...                         │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  React Reconciler (reconciler.ts)                                      │
│  └── Fiber Tree → DOM Node Tree                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Yoga Layout Engine (Flexbox)                                           │
│  └── layout/node.ts - 计算每个节点的x/y/width/height                    │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Screen Buffer (screen.ts)                                             │
│  └── Int32Array packed cells: [charId, packed(styleId|hyperlinkId|width)]│
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Terminal Output (output.ts, termio/)                                    │
│  └── ANSI escape sequences → stdout                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. React Reconciler定制 (reconciler.ts - 512行)

```typescript
const reconciler = createReconciler({
  getRootHostContext: () => ({ isInsideText: false }),
  getChildHostContext: (parent, type) => ({ isInsideText: type === 'ink-text' }),
  shouldSetTextContent: () => false,
  createInstance: (type, props) => {
    const node = createNode(type)
    for (const [key, value] of Object.entries(props)) {
      applyProp(node, key, value)
    }
    return node
  },
  // ... 更多方法
})
```

### 1.1 自定义DOM元素类型

```typescript
export type ElementNames =
  | 'ink-root'    // 根节点
  | 'ink-box'      // 容器（相当于div）
  | 'ink-text'     // 文本节点
  | 'ink-link'     // 超链接
  | 'ink-progress' // 进度条
  | 'ink-raw-ansi' // 原始ANSI
```

### 1.2 脏标记机制

```typescript
export const markDirty = (node?: DOMNode): void => {
  let current: DOMNode | undefined = node
  while (current) {
    if (current.nodeName !== '#text') {
      (current as DOMElement).dirty = true
    }
    current = current.parentNode
  }
}
```

## 2. DOM节点结构 (dom.ts - 484行)

```typescript
export type DOMElement = {
  nodeName: ElementNames
  attributes: Record<string, DOMNodeAttribute>
  childNodes: DOMNode[]
  style: Styles
  yogaNode?: LayoutNode
  
  // 滚动状态
  scrollTop?: number
  pendingScrollDelta?: number
  scrollHeight?: number
  scrollViewportHeight?: number
  stickyScroll?: boolean
  
  // 焦点管理
  focusManager?: FocusManager
  _eventHandlers?: Record<string, unknown>
}
```

### 2.1 Yoga节点创建

```typescript
export const createNode = (nodeName: ElementNames): DOMElement => {
  const needsYogaNode = !['ink-virtual-text', 'ink-link', 'ink-progress'].includes(nodeName)
  const node: DOMElement = {
    nodeName,
    style: {},
    attributes: {},
    childNodes: [],
    yogaNode: needsYogaNode ? createLayoutNode() : undefined,
    dirty: false,
  }
  
  // 为文本节点设置测量函数
  if (nodeName === 'ink-text') {
    node.yogaNode?.setMeasureFunc(measureTextNode.bind(null, node))
  }
  return node
}
```

## 3. Yoga Layout引擎

### 3.1 布局计算

```typescript
// 在React commit阶段计算布局
this.rootNode.onComputeLayout = () => {
  if (this.rootNode.yogaNode) {
    this.rootNode.yogaNode.setWidth(this.terminalColumns)
    this.rootNode.yogaNode.calculateLayout(this.terminalColumns)
  }
}
```

### 3.2 布局性能监控

```typescript
// Yoga布局性能计数器
const c = getYogaCounters()
this.lastYogaCounters = {
  ms: layoutMs,
  visited: c.visited,
  measured: c.measured,
  cacheHits: c.cacheHits,
  live: c.live
}
```

## 4. Screen缓冲区 (screen.ts - 1486行)

### 4.1 Packed Cell格式

```typescript
// 每个cell使用2个Int32存储：
// word0: charId (32 bits - CharPool索引)
// word1: styleId[31:17] | hyperlinkId[16:2] | width[1:0]

const STYLE_SHIFT = 17
const HYPERLINK_SHIFT = 2
const WIDTH_MASK = 3

// 200x120屏幕: 24,000个cell，仅需48,000个Int32
```

### 4.2 CharPool (字符串驻留)

```typescript
export class CharPool {
  private strings: string[] = [' ', ''] // 索引0=空格，索引1=空
  private ascii: Int32Array // charCode → index, -1 = 未驻留
  
  intern(char: string): number {
    // ASCII快速路径：直接数组查找
    if (char.length === 1 && char.charCodeAt(0) < 128) {
      const cached = this.ascii[code]
      if (cached !== -1) return cached
    }
    // Map查找Unicode字符
    const existing = this.stringMap.get(char)
    return existing ?? this.strings.push(char) - 1
  }
}
```

### 4.3 StylePool (样式驻留)

```typescript
export class StylePool {
  // 样式ID的bit 0编码空格可见性
  // 偶数ID = 仅前景色样式（可跳过空格）
  // 奇数ID = 背景色/反色等（空格可见）
  
  intern(styles: AnsiCode[]): number {
    const hasVisibleSpace = styles.some(s => s.endCode in VISIBLE_ON_SPACE)
    return (rawId << 1) | (hasVisibleSpace ? 1 : 0)
  }
}
```

## 5. 渲染流程 (ink.tsx - 1723行)

### 5.1 帧渲染周期

```typescript
// 1. React commit后触发
rootNode.onRender = this.scheduleRender

// 2. 节流渲染（60fps）
this.scheduleRender = throttle(deferredRender, FRAME_INTERVAL_MS)

// 3. onRender执行
private async onRender(): Promise<void> {
  const t0 = performance.now()
  
  // Phase 1: 渲染到backFrame
  const rendererMs = renderNodeToOutput(node, frame)
  
  // Phase 2: diff计算
  const diffMs = performance.now() - t0
  const diff = diffFrames(prevFrame, frame)
  
  // Phase 3: diff优化
  const optimized = optimize(diff)
  
  // Phase 4: 写入终端
  writeDiffToTerminal(terminal, optimized)
}
```

### 5.2 双缓冲Diff

```typescript
private frontFrame: Frame  // 上帧
private backFrame: Frame   // 本帧

// diff计算
const diff = diffFrames(this.frontFrame, this.backFrame)

// diff优化（合并相邻写操作）
const optimized = optimize(diff)

// 交换缓冲区
this.frontFrame = this.backFrame
```

### 5.3 Blit优化

```typescript
// 当仅滚动内容时，使用DECSTBM硬件滚动
if (scrollHint) {
  // CSI p l SET_SCROLL_REGION[top;bottom]
  // CSI [n] S  scroll up
  // CSI [n] T  scroll down
  optimized.unshift({
    type: 'stdout',
    content: DECSTBM(top, bottom) + scroll(delta)
  })
}
```

## 6. 虚拟滚动

### 6.1 ScrollBox组件

```typescript
// 滚动状态
scrollTop: number        // 已滚动行数
scrollHeight: number      // 总内容高度
viewportHeight: number   // 视口高度
pendingScrollDelta: number // 待应用滚动

// 自适应滚动速度
const SCROLL_INSTANT_THRESHOLD = 5  // ≤5行：立即完成
const SCROLL_STEP_MED = 2           // 中等：2行/帧
const SCROLL_STEP_HIGH = 3          // 高速：3行/帧
```

### 6.2 滚动锚定

```typescript
// 跟随滚动：选择跟随文本
if (frame.scrollDrainPending) {
  // 保持用户选择的位置跟随内容
}
```

## 7. 文本渲染

### 7.1 文本测量

```typescript
const measureTextNode = function (
  node: DOMNode,
  width: number,
  widthMode: LayoutMeasureMode
): { width: number; height: number } {
  // 展开tab
  const text = expandTabs(rawText)
  
  // 测量
  const dimensions = measureText(text, width)
  
  // 包装
  if (dimensions.width > width) {
    const wrapped = wrapText(text, width, textWrap)
    return measureText(wrapped, width)
  }
  return dimensions
}
```

### 7.2 样式应用

```typescript
// ANSI转义序列应用
const styled = applyTextStyles(text, segment.styles)

// OSC 8超链接
wrapWithOsc8Link(text, url) // → `\x1b]8;;url\x1b\\text\x1b]8;;\x1b\\`
```

## 8. 选择和搜索高亮

### 8.1 选择状态

```typescript
export type SelectionState = {
  anchor: { x: number; y: number } | null
  focus: { x: number; y: number } | null
  active: boolean
}

// 选择覆盖：替换背景色而非反色
id = stylePool.withSelectionBg(baseId)
```

### 8.2 搜索高亮

```typescript
// 当前匹配：黄色背景（通过fg交换）+ 粗体 + 下划线
id = stylePool.withCurrentMatch(baseId)

// 其他匹配：纯反色
id = stylePool.withInverse(baseId)
```

## 9. 终端协议

### 9.1 鼠标追踪

```typescript
// 启用鼠标追踪（mode 1002 - 按钮追踪）
ENABLE_MOUSE_TRACKING // CSI ? 1002 h

// 禁用
DISABLE_MOUSE_TRACKING // CSI ? 1002 l
```

### 9.2 光标定位

```typescript
// 移动光标
cursorMove(dx, dy)    // CSI [dx] [dy] D/C

// 绝对位置
cursorPosition(row, col) // CSI [row];[col] H
```

### 9.3 替代屏幕

```typescript
// 进入替代屏幕
ENTER_ALT_SCREEN // ESC[?1049h

// 退出
EXIT_ALT_SCREEN // ESC[?1049l
```

## 10. 性能优化

### 10.1 Yoga布局缓存

```typescript
// Yoga节点复用
this.rootNode.yogaNode.setWidth(this.terminalColumns)
this.rootNode.yogaNode.calculateLayout(this.terminalColumns)

// 布局计数器
const c = getYogaCounters()
// visited: 访问节点数
// measured: 实际测量节点数
// cacheHits: 缓存命中数
```

### 10.2 脏标记优化

```typescript
// 样式相等性检查
if (stylesEqual(node.style, style)) return

// React对象相等性检查
if (a === b) return true
```

### 10.3 Diff优化

```typescript
// 合并相邻写操作
const optimized = optimize(diff)

// 仅写变化的区域
const damage = frame.screen.damage
```

## 11. 深度理解

### 11.1 为什么使用Packed Int32Array？

```typescript
// 问题：200x120屏幕 = 24,000个对象
// 解决：使用typed array，每个cell仅2个Int32
// 内存：48,000 × 4 = 192KB vs 24,000 × ~100B = 2.4MB
```

### 11.2 样式ID的bit 0编码

```typescript
// 偶数ID：仅前景色，空格不可见 → diff时可跳过
// 奇数ID：有背景/反色等，空格可见 → 必须渲染

// 渲染优化
if (styleId % 2 === 0 && char === ' ') {
  continue // 跳过不可见空格
}
```

### 11.3 Yoga布局在commit阶段

```typescript
// 问题：useLayoutEffect在layout phase执行，但onRender在commit后
// 解决：onComputeLayout在commit phase调用

resetAfterCommit(rootNode) {
  rootNode.onComputeLayout() // React layout后
  rootNode.onRender()        // 然后渲染
}
```

### 11.4 滚动优化

```typescript
// 问题：快速滚动需要大量diff
// 解决：DECSTBM硬件滚动

// Native终端：drainProportional（3/4比例）
// xterm.js：drainAdaptive（平滑加速）
```

## 12. 文件清单

```
src/ink/
├── ink.tsx                    # 1723行 - Ink主类
├── reconciler.ts              # 512行 - React Reconciler定制
├── dom.ts                     # 484行 - DOM节点结构
├── screen.ts                  # 1486行 - Screen缓冲区
├── render-node-to-output.ts   # 1462行 - 渲染到输出
├── output.ts                  # 约500行 - 输出处理
├── styles.ts                  # 约400行 - 样式定义
├── focus.ts                   # 约200行 - 焦点管理
├── selection.ts               # 35KB - 选择管理
├── Ansi.tsx                  # 33KB - ANSI解析
├── parse-keypress.ts          # 24KB - 按键解析
├── renderer.ts                # 8KB - 渲染器
├── colorize.ts               # 8KB - 颜色化
├── terminal.ts               # 8KB - 终端能力检测
└── layout/
    ├── node.ts               # Yoga节点
    ├── engine.ts             # 布局引擎
    └── geometry.ts          # 几何计算
```

## 13. 理解深度评估

**预估理解度：** ~90%

**核心掌握：**
- ✅ React Reconciler定制原理
- ✅ DOM节点和Yoga布局
- ✅ Screen缓冲区和Packed Cell格式
- ✅ 双缓冲Diff渲染
- ✅ 虚拟滚动实现
- ✅ 文本测量和包装

**需要深入：**
- 🔶 具体的组件实现细节
- 🔶 完整的diff算法实现
- 🔶 终端协议CSI序列细节
