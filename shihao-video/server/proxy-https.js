/**
 * 拾号-影视 HTTPS服务器版本
 * 支持移动端PWA和需要HTTPS的Web API
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3443;

// SSL证书路径
const SSL_OPTIONS = {
  key: fs.readFileSync(path.join(__dirname, '../ssl/server.key')),
  cert: fs.readFileSync(path.join(__dirname, '../ssl/server.crt'))
};

// 引入主服务器的所有配置
require('./proxy.js');

// 创建HTTPS服务器
const httpsServer = https.createServer(SSL_OPTIONS, app);

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║         拾号-影视 HTTPS服务已启动                ║
║                                                  ║
║  本地访问: https://localhost:${PORT}              ║
║  局域网访问: https://192.168.1.3:${PORT}          ║
║                                                  ║
║  ⚠️ 浏览器会提示证书不安全                       ║
║     点击"高级" → "继续访问"即可                  ║
║                                                  ║
║  🔗 移动端访问需要在同一WiFi网络                 ║
║                                                  ║
╚══════════════════════════════════════════════════╝
  `);
});

// 处理证书不存在的情况
httpsServer.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(`
❌ SSL证书不存在！

请先运行以下命令生成证书：
  cd ssl
  generate-cert.bat

或使用 ngrok：
  ngrok http 3000
    `);
  }
});