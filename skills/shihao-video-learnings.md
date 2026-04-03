# 拾号-影视 项目技能总结

## 项目概述
纯前端影视聚合网站，支持多数据源、HLS视频播放、PWA功能

## 技能提取

### 1. HLS.js 视频播放
- 浏览器自动播放策略限制（需要用户交互）
- 移动端兼容性属性：playsinline, webkit-playsinline, x5-video-player-type
- 画质选择和自适应码率

### 2. CMSV10 API
- 苹果CMS V10 标准接口格式
- 列表/详情/搜索接口
- 海报图片需要单独请求详情接口获取

### 3. CORS 代理安全
- URL白名单验证防SSRF
- 速率限制防滥用
- HTTPS重定向需判断本地vs生产环境

### 4. 移动端调试技巧
- 简化页面隔离问题
- 自动播放失败时显示点击提示
- console.log 逐步排查

### 5. 黑暗主题UI
- CSS变量管理主题色
- 响应式布局
- 渐变遮罩和毛玻璃效果

## 项目文件结构
```
shihao-video/
├── server/proxy.js      # CORS代理服务器
├── public/
│   ├── index.html       # 首页
│   ├── detail.html      # 详情页
│   ├── player.html      # 播放器
│   ├── test.html        # 测试页面
│   └── css/style.css    # 样式
└── package.json
```
