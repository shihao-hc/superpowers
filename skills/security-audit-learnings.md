# 安全审计新技能记录

## 项目: 拾号-影视安全加固

### 技能1: Express.js 安全头部配置
- X-Content-Type-Options: nosniff 防止MIME类型混淆攻击
- X-Frame-Options: DENY 防止点击劫持
- X-XSS-Protection 启用浏览器XSS过滤
- Referrer-Policy 控制Referer头泄露
- CSP frame-ancestors 限制iframe嵌入

### 技能2: Node.js 应用安全加固
- 禁用 app.disable('x-powered-by') 隐藏框架信息
- 正确配置CSP白名单（CDN域名、图片源）
- 速率限制防止API滥用

### 技能3: SSRF防护最佳实践
- URL白名单验证（允许的域名后缀）
- IP地址黑名单（私有网络、本地回环）
- 协议限制（仅HTTP/HTTPS）

### 技能4: Git安全配置
- .gitignore 必须包含敏感文件（ngrok.yml, *.pem, .env）
- 依赖目录（node_modules/）不应提交
- 日志文件不应提交

## 使用的命令模式
```bash
# 检查敏感信息泄露
grep -r "(api_key|secret|password|token)" ./project

# 检查Git状态
git status

# 运行安全审计
/security-audit --scan ./server
```
