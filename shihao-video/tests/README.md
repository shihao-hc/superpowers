# E2E 测试指南

本项目使用 Playwright 进行端到端测试。

## 安装

```bash
# 安装依赖（包括 Playwright）
npm install

# 安装 Playwright 浏览器
npx playwright install
```

## 运行测试

```bash
# 运行所有测试
npm run test:e2e

# 使用 UI 模式运行测试
npm run test:e2e:ui

# 使用 headed 模式运行测试（可以看到浏览器）
npm run test:e2e:headed
```

## 测试文件

- `home.spec.js` - 首页功能测试
  - 页面标题验证
  - 导航栏功能
  - 视频列表加载
  - 搜索功能
  - 分类切换
  - 移动端适配

- `detail.spec.js` - 详情页功能测试
  - 页面加载
  - 视频信息显示
  - 播放按钮
  - 收藏功能
  - 播放源切换

- `player.spec.js` - 播放器功能测试
  - 播放器加载
  - 控制栏功能
  - 播放/暂停
  - 全屏切换
  - 键盘快捷键

- `settings.spec.js` - 设置页功能测试
  - 数据源管理
  - 添加/切换数据源
  - 背景设置

- `accessibility.spec.js` - 无障碍访问测试
  - 跳转到主要内容链接
  - ARIA 标签
  - 图片 alt 属性
  - 按钮可访问性
  - 键盘导航

## 测试配置

测试配置位于 `playwright.config.js`，包括：
- 多浏览器支持（Chromium, Firefox, Safari）
- 移动端测试（Pixel 5, iPhone 12）
- 截图和追踪功能
- 自动启动服务器

## 注意事项

- 测试需要服务器运行在 http://localhost:3000
- 部分测试依赖外部 API 数据源
- 移动端测试需要合适的视口大小
