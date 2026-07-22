const fs = require('fs');
const files = [
  'src/middleware/auth.js',
  'src/middleware/rateLimiter.js',
  'src/daemon/securityMonitor.js',
  'src/auto-update/AutoUpdater.js',
  'src/integration/AutoScaler.js',
  'src/integration/PlatformBridge.js',
  'src/integrations/openclaw/ModelServiceAdapter.js',
  'src/integrations/openclaw/ResponseCache.js',
  'src/localInferencing/OllamaBridge.js',
  'src/localInferencing/InferBridge.js',
  'src/logging/StructuredLogger.js',
  'src/monitoring/AlertNotificationSystem.js',
  'src/monitoring/HealthMonitor.js',
  'src/monitoring/PrometheusMetrics.js',
  'src/performance/Optimizer.js',
  'src/plugin-governance/GovernanceCore.js',
  'src/plugins/SandboxRunner.js',
  'src/skills/monitoring/AlertNotificationSystem.js',
  'src/game/GameManager.js',
  'src/industry/customer_service/templates.js',
  'src/industry/ecommerce/templates.js',
  'src/industry/finance/templates.js',
];
for (const f of files) {
  const full = 'D:/龙虾/' + f;
  const c = fs.readFileSync(full, 'utf-8');
  const lines = c.split('\n').length;
  const io = [];
  if (/require\(['\u0060'']fs['\u0060'']\)/.test(c)) io.push('fs');
  if (/require\(['\u0060'']http['\u0060'']\)/.test(c)) io.push('http');
  if (/require\(['\u0060'']https['\u0060'']\)/.test(c)) io.push('https');
  if (/require\(['\u0060'']net['\u0060'']\)/.test(c)) io.push('net');
  if (/require\(['\u0060'']child_process['\u0060'']\)/.test(c)) io.push('child_process');
  if (/require\(['\u0060'']express['\u0060'']\)/.test(c)) io.push('express');
  if (/require\(['\u0060'']ws['\u0060'']\)/.test(c)) io.push('ws');
  if (/WebSocket/.test(c)) io.push('WebSocket');
  if (/discord/i.test(c)) io.push('discord');
  if (/redis/i.test(c)) io.push('redis');
  if (/\.listen\(/.test(c)) io.push('.listen()');
  if (/router\.[gsputd]/.test(c)) io.push('router');
  if (/app\.[gsputd]/.test(c)) io.push('app');
  const cls = c.match(/class\s+(\w+)/);
  const cn = cls ? cls[1] : 'N/A';
  const is = io.length > 0 ? io.join(',') : 'NONE';
  console.log(f + ' (' + lines + ' lines, ' + cn + ') -> IO: ' + is);
}

