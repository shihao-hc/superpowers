# 📱 手机访问网站完整教程

## 第一步：获取ngrok token（一次性操作）

### 1. 注册账号
打开浏览器访问：https://ngrok.com/signup

支持以下方式快速注册：
- Google账号
- GitHub账号  
- 邮箱注册

### 2. 获取Token
注册登录后，访问：
```
https://dashboard.ngrok.com/get-started/your-authtoken
```

页面会显示你的token，格式类似：
```
2AbcdefGHIjklMNOpqrSTUvwxYZ_5xxxxxxxxxxxxxxxxxxxxxxxx
```

点击复制按钮复制token

---

## 第二步：配置Token

### 方法A：使用脚本（推荐）

1. 双击运行 `start-ngrok.bat`
2. 当提示输入token时，粘贴你的token
3. 按回车确认

### 方法B：手动配置

打开CMD，运行：
```bash
ngrok config add-authtoken 你的token
```

---

## 第三步：启动服务

### 方式1：完整脚本（首次使用）
双击运行 `start-ngrok.bat`

### 方式2：快速启动（已配置token）
双击运行 `quick-ngrok.bat`

### 方式3：命令行
```bash
ngrok http 3000
```

---

## 第四步：获取HTTPS地址

启动成功后，你会看到类似这样的界面：

```
Session Status                online
Account                       你的账号
Version                       3.x.x
Region                        United States (us)
Latency                       50ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abcd-1234-efgh.ngrok-free.app -> http://localhost:3000
```

**关键信息**：
```
Forwarding https://xxxx-xxxx.ngrok-free.app -> http://localhost:3000
                            ↑
                    这就是你的HTTPS地址
```

---

## 第五步：手机访问

1. **确保手机和电脑在同一WiFi**
2. **复制HTTPS地址**（如：https://abcd-1234-efgh.ngrok-free.app）
3. **手机浏览器打开该地址**

---

## 📋 完整操作流程图

```
┌─────────────────────────────────────────────────────────────┐
│  1. 注册ngrok账号 → 获取token                               │
│                        ↓                                    │
│  2. 运行 start-ngrok.bat → 输入token → 自动配置            │
│                        ↓                                    │
│  3. 启动后复制HTTPS地址                                     │
│                        ↓                                    │
│  4. 手机浏览器粘贴地址 → 访问成功！                         │
└─────────────────────────────────────────────────────────────┘
```

---

## ❓ 常见问题

### Q: token输入错误怎么办？
重新运行 `start-ngrok.bat`，会重新提示输入token

### Q: 显示"ngrok未安装"？
下载安装：https://ngrok.com/download

### Q: 手机打不开？
- 确保在同一WiFi
- 检查HTTPS地址是否正确复制
- 注意ngrok免费版每4小时会断开，需重新启动

### Q: 如何停止？
在ngrok窗口按 `Ctrl+C`

### Q: 地址会变吗？
免费版每次重启地址都会变，需要重新复制