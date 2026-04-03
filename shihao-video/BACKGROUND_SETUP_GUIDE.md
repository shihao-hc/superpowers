# 拾号-影视 背景图片设置完整指南

## 🎯 目标
将您提供的海边火车白玫瑰图片设置为"拾号-影视"网站的默认背景。

## 📋 设置方法

### 方法一：在线工具设置（推荐）

1. **访问背景设置工具**
   ```
   http://localhost:3000/bg-setup.html
   ```

2. **上传您的图片**
   - 点击上传区域或拖拽图片文件
   - 支持 JPG、PNG、WebP 格式
   - 文件大小限制：5MB
   - 推荐尺寸：1920x1080 或更高

3. **应用背景**
   - 点击"✨ 应用此背景"按钮
   - 刷新网站首页即可看到效果

### 方法二：通过设置页面

1. **访问设置页面**
   ```
   http://localhost:3000/setting.html
   ```

2. **找到"外观设置"部分**
   - 上传背景图片
   - 点击"应用背景"按钮

3. **管理背景**
   - 🔄 恢复默认：恢复默认背景图片
   - 🗑️ 清除背景：使用纯色背景

### 方法三：手动设置

1. **保存图片文件**
   - 将您的图片保存为 `default-bg.jpg`
   - 放置到目录：`D:\龙虾\shihao-video\public\images\default-bg.jpg`

2. **运行设置脚本**
   ```bash
   # Windows
   D:\龙虾\shihao-video\setup-background.bat
   ```

3. **重启服务器**
   ```bash
   cd /d "D:\龙虾\shihao-video"
   npm start
   ```

## 🎨 背景效果说明

### 当前配置
- **主背景图片**：`/images/default-bg.jpg`（您的海边火车白玫瑰图片）
- **备用渐变背景**：深蓝紫色渐变（当图片不存在时使用）
- **遮罩效果**：70%透明度深色遮罩，确保文字清晰可读

### 视觉效果
- 背景固定，滚动时保持不动
- 图片自动缩放适配屏幕
- 遮罩效果确保内容可读性
- 响应式设计，适配各种设备

## 🔧 技术细节

### CSS配置
```css
body {
  background-image: url('/images/default-bg.jpg'), 
                    linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(20, 20, 20, 0.6);
  z-index: -1;
}
```

### JavaScript功能
```javascript
// 保存自定义背景
localStorage.setItem('customBackground', imageData);

// 应用背景
document.body.style.backgroundImage = `url(${customBg})`;

// 检查并加载背景
const customBg = localStorage.getItem('customBackground');
if (customBg) {
  document.body.style.backgroundImage = `url(${customBg})`;
}
```

## 📁 文件结构

```
D:\龙虾\shihao-video\public\
├── images\
│   ├── default-bg.jpg          # 默认背景图片
│   └── README.txt              # 图片说明文件
├── css\
│   └── style.css               # 背景样式配置
├── setting.html                # 设置页面（包含外观设置）
├── bg-setup.html               # 背景设置工具
└── index.html                  # 首页（自动加载背景）
```

## 🚀 快速开始

### 第一步：准备图片
1. 将您的海边火车白玫瑰图片重命名为 `default-bg.jpg`
2. 确保图片质量清晰，尺寸建议 1920x1080 或更高

### 第二步：保存图片
1. 将图片放置到：`D:\龙虾\shihao-video\public\images\default-bg.jpg`
2. 或者通过在线工具上传

### 第三步：访问网站
1. 启动服务器：`npm start`
2. 访问：http://localhost:3000
3. 您的背景图片应该已经显示

### 第四步：管理背景
1. 访问背景设置工具：http://localhost:3000/bg-setup.html
2. 或访问设置页面：http://localhost:3000/setting.html

## ⚠️ 注意事项

1. **图片格式**：支持 JPG、PNG、WebP 格式
2. **文件大小**：建议小于 2MB，最大 5MB
3. **推荐尺寸**：1920x1080 或更高
4. **浏览器兼容**：所有现代浏览器都支持
5. **移动端适配**：背景会自动适配移动设备

## 🐛 故障排除

### 背景不显示
1. 检查图片文件是否存在：`D:\龙虾\shihao-video\public\images\default-bg.jpg`
2. 检查文件名是否正确：必须为 `default-bg.jpg`
3. 清除浏览器缓存：Ctrl+F5
4. 检查控制台错误：F12 打开开发者工具

### 图片加载缓慢
1. 压缩图片文件大小
2. 使用适当的图片格式
3. 考虑使用CDN加速

### 背景重复
1. 确保CSS中的 `background-size: cover;` 已设置
2. 检查图片是否为横版图片

## 📞 获取帮助

如果遇到问题，请：
1. 检查控制台错误信息
2. 确认服务器正常运行
3. 验证图片文件路径和权限
4. 参考项目文档：`D:\龙虾\shihao-video\public\images\README.txt`

## ✅ 完成检查清单

- [ ] 图片已保存到正确目录
- [ ] 文件名正确：`default-bg.jpg`
- [ ] 服务器已重启
- [ ] 浏览器缓存已清除
- [ ] 背景正常显示
- [ ] 所有页面背景一致

## 🎉 享受您的个性化网站！

设置完成后，您的"拾号-影视"网站将拥有独特的海边火车白玫瑰背景，为用户带来沉浸式的观影体验！