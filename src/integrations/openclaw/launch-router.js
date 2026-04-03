#!/usr/bin/env node
/**
 * 启动 OpenClaw 路由服务
 * 
 * 用法:
 *   node launch-router.js                    # 使用默认配置
 *   node launch-router.js --port 3003        # 指定端口
 *   node launch-router.js --gateway http://localhost:3002  # 指定 OpenClaw Gateway
 */

const { createOpenClawRouter } = require('./OpenClawRouter');
const { createModelService } = require('./ModelServiceAdapter');

const args = process.argv.slice(2);
const options = {
  port: 3003,
  gatewayUrl: 'http://127.0.0.1:3002',
  apiKey: 'ultrawork-local-key'
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' || arg === '-p') {
    options.port = parseInt(args[++i], 10);
  } else if (arg === '--gateway' || arg === '-g') {
    options.gatewayUrl = args[++i];
  } else if (arg === '--key' || arg === '-k') {
    options.apiKey = args[++i];
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
OpenClaw 路由服务启动器

用法:
  node launch-router.js [选项]

选项:
  --port, -p <端口>     设置路由服务端口 (默认: 3003)
  --gateway, -g <URL>   OpenClaw Gateway 地址 (默认: http://127.0.0.1:3002)
  --key, -k <key>       API Key (默认: ultrawork-local-key)
  --help, -h            显示帮助

示例:
  node launch-router.js
  node launch-router.js --port 4000
  node launch-router.js --gateway http://localhost:3002

API 端点:
  GET  /health                    健康检查
  GET  /stats                     统计信息
  GET  /v1/models                 模型列表 (OpenAI 兼容)
  POST /v1/chat/completions       聊天补全 (OpenAI 兼容)
  GET  /api/openclaw/providers     提供商列表
  GET  /api/openclaw/models       模型列表
  POST /api/openclaw/ask          简单问答
  POST /api/openclaw/ask-once     一问多答
  POST /api/openclaw/switch-model 切换模型
`);
    process.exit(0);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('  OpenClaw 路由服务');
  console.log('='.repeat(60));
  console.log();
  
  const router = createOpenClawRouter(options);
  
  // 初始化模型服务
  const modelService = createModelService({
    gatewayUrl: options.gatewayUrl,
    apiKey: options.apiKey
  });
  
  console.log('配置:');
  console.log(`  路由端口: ${options.port}`);
  console.log(`  Gateway:   ${options.gatewayUrl}`);
  console.log(`  API Key:   ${options.apiKey}`);
  console.log();
  
  try {
    console.log('正在连接 OpenClaw Gateway...');
    await modelService.initialize();
    console.log('✅ Gateway 连接成功');
    console.log(`   可用模型: ${modelService.models.length}`);
    console.log();
    
    console.log('启动路由服务...');
    await router.start();
    console.log();
    console.log('='.repeat(60));
    console.log('  服务已启动!');
    console.log('='.repeat(60));
    console.log();
    console.log('端点:');
    console.log(`  健康检查: http://localhost:${options.port}/health`);
    console.log(`  模型列表: http://localhost:${options.port}/v1/models`);
    console.log(`  聊天:     http://localhost:${options.port}/v1/chat/completions`);
    console.log();
    console.log('停止服务: Ctrl+C');
    console.log();
    
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    console.error();
    console.error('请确保:');
    console.error('  1. OpenClaw Gateway 已启动 (./server.sh start)');
    console.error('  2. 平台已认证 (./onboard.sh webauth)');
    console.error();
    console.error('详细错误:', error.stack);
    process.exit(1);
  }
  
  // 处理关闭信号
  process.on('SIGINT', () => {
    console.log();
    console.log('正在停止服务...');
    router.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log();
    console.log('正在停止服务...');
    router.stop();
    process.exit(0);
  });
}

main();
