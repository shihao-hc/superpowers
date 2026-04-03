# 拾号-影视 HTTPS配置指南

## 📱 为什么需要HTTPS？

移动端浏览器对HTTP限制更严格：

| 功能 | HTTP | HTTPS |
|------|------|-------|
| PWA安装 | ❌ | ✅ |
| 地理定位API | ❌ | ✅ |
| 摄像头/麦克风 | ❌ | ✅ |
| Service Worker | 仅localhost | ✅ |
| 全屏API | 有限制 | ✅ |
| localStorage | ✅ | ✅ |

---

## 🚀 方案一：ngrok（推荐，最简单）

### 步骤

1. **注册ngrok账号**
   ```
   https://ngrok.com
   ```

2. **获取免费token**
   ```
   https://dashboard.ngrok.com/get-started/your-authtoken
   ```

3. **配置token**
   ```bash
   ngrok config add-authtoken 你的token
   ```

4. **启动服务器**
   ```bash
   cd D:\龙虾\shihao-video
   npm start
   ```

5. **启动ngrok**
   ```bash
   ngrok http 3000
   ```

6. **获取HTTPS地址**
   ```
   https://xxxx.ngrok-free.app  ← 分享给手机
   ```

### 或使用启动脚本
```
双击 start-ngrok.bat
```

---

## 🔐 方案二：自签名证书（本地开发）

### 步骤

1. **安装OpenSSL**
   - 下载: https://slproweb.com/products/Win32OpenSSL.html
   - 或使用Git Bash（已自带）

2. **生成证书**
   ```bash
   cd D:\龙虾\shihao-video\ssl
   generate-cert.bat
   ```

3. **启动HTTPS服务器**
   ```bash
   cd D:\龙虾\shihao-video
   node server\proxy-https.js
   ```

4. **访问HTTPS**
   ```
   https://localhost:3443
   ```

5. **手机访问**
   ```
   https://192.168.1.3:3443
   ```

6. **浏览器提示不安全**
   - 点击"高级"
   - 点击"继续访问"

---

## ☁️ 方案三：云服务器部署（生产环境）

### 使用Nginx + Let's Encrypt免费证书

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 获取免费证书
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 📋 快速对照表

| 场景 | 推荐方案 | HTTPS地址 |
|------|----------|-----------|
| 本地测试 | ngrok | https://xxx.ngrok-free.app |
| 局域网分享 | 自签名 | https://192.168.x.x:3443 |
| 正式上线 | Nginx+Let's Encrypt | https://your-domain.com |

---

## ⚠️ 注意事项

### ngrok免费版限制
- 每4小时重启
- 每月1GB流量限制
- 随机域名

### 自签名证书
- 浏览器会提示不安全
- 需要手动点击"继续访问"
- 仅适合开发测试

### 手机访问前提
- 手机和电脑在同一WiFi
- 防火墙允许端口访问
- 使用HTTPS地址

---

## 🔧 故障排除

### 手机无法访问
1. 检查WiFi连接
2. 确认IP地址正确
3. 检查防火墙设置
4. 尝试关闭防火墙测试

### ngrok连接失败
1. 检查token配置
2. 确认服务器在运行
3. 检查网络连接

### HTTPS证书错误
1. 自签名证书需要手动信任
2. 检查证书是否过期
3. 确认证书路径正确