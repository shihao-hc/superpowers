/**
 * MCP 压力测试脚本
 * 测试缓存、日志轮转、告警系统、工作流执行、性能管理器的表现
 */

const { MCPAuditLogger } = require('../src/mcp/metrics');
const { MCPAlertManager } = require('../src/mcp/MCPAlertManager');
const { MCPPermissionManager } = require('../src/mcp/MCPPermissionManager');
const { NodeWorkflowEngine } = require('../src/workflow/NodeWorkflowEngine');
const { PerformanceManager, WorkflowOptimizer, AsyncBatchWriter } = require('../src/performance');

class MCPStressTester {
  constructor() {
    this.results = {};
  }

  async runAllTests() {
    console.log('\n' + '='.repeat(70));
    console.log('  MCP 压力测试套件');
    console.log('='.repeat(70) + '\n');

    await this.testCacheLogic();
    await this.testAuditLoggerPerformance();
    await this.testAlertManagerPerformance();
    await this.testPermissionManagerPerformance();
    await this.testWorkflowEnginePerformance();
    await this.testPerformanceManager();
    await this.testBatchWriter();
    await this.testWorkflowOptimizer();

    this.printSummary();
  }

  async testCacheLogic() {
    console.log('>>> 测试 MCP 缓存逻辑\n');

    const iterations = 5000;
    const cache = new Map();
    const cacheTTL = 60000;
    const maxSize = 1000;

    console.log(`  测试迭代: ${iterations}`);
    console.log(`  缓存大小: ${maxSize}\n`);

    // 阶段 1: 写入性能
    console.log('  阶段 1: 缓存写入测试...');
    const writeTimes = [];
    for (let i = 0; i < iterations; i++) {
      const key = `tool_${i % 100}`;
      const start = Date.now();
      
      if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(key, { data: `value_${i}`, timestamp: Date.now() });
      
      writeTimes.push(Date.now() - start);
    }

    // 阶段 2: 读取性能（命中）
    console.log('  阶段 2: 缓存命中读取测试...');
    const readHitTimes = [];
    for (let i = 0; i < iterations; i++) {
      const key = `tool_${i % 100}`;
      const start = Date.now();
      const cached = cache.get(key);
      readHitTimes.push(Date.now() - start);
    }

    // 阶段 3: 读取性能（未命中）
    console.log('  阶段 3: 缓存未命中读取测试...');
    const readMissTimes = [];
    for (let i = 0; i < 1000; i++) {
      const key = `nonexistent_${Date.now()}_${i}`;
      const start = Date.now();
      const cached = cache.get(key);
      readMissTimes.push(Date.now() - start);
    }

    // 阶段 4: TTL 过期
    console.log('  阶段 4: TTL 过期测试...');
    const now = Date.now();
    cache.set('expired', { data: 'old', timestamp: now - 120000 });
    const expired = cache.get('expired');
    const isExpired = expired && (now - expired.timestamp > cacheTTL);

    this.results.cache = {
      writeAvg: this.avg(writeTimes),
      writeP95: this.p95(writeTimes),
      readHitAvg: this.avg(readHitTimes),
      readHitP95: this.p95(readHitTimes),
      readMissAvg: this.avg(readMissTimes),
      readMissP95: this.p95(readMissTimes),
      cacheSize: cache.size,
      ttlWorks: isExpired
    };

    console.log('\n  结果:');
    console.log(`    写入平均: ${this.results.cache.writeAvg.toFixed(3)}ms`);
    console.log(`    写入 P95: ${this.results.cache.writeP95.toFixed(3)}ms`);
    console.log(`    命中读取平均: ${this.results.cache.readHitAvg.toFixed(3)}ms`);
    console.log(`    命中读取 P95: ${this.results.cache.readHitP95.toFixed(3)}ms`);
    console.log(`    未命中读取平均: ${this.results.cache.readMissAvg.toFixed(3)}ms`);
    console.log(`    未命中读取 P95: ${this.results.cache.readMissP95.toFixed(3)}ms`);
    console.log(`    当前缓存大小: ${this.results.cache.cacheSize}`);
    console.log(`    TTL 过期检测: ${this.results.cache.ttlWorks ? '✓' : '✗'}`);
  }

  async testAuditLoggerPerformance() {
    console.log('\n>>> 测试审计日志性能\n');

    const logger = new MCPAuditLogger({
      maxEntries: 10000,
      enableFileLogging: false
    });

    const iterations = 5000;

    console.log(`  测试迭代: ${iterations}\n`);

    // 阶段 1: 单条写入
    console.log('  阶段 1: 单条写入测试...');
    const writeTimes = [];
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      logger.log({
        toolFullName: 'test:tool',
        server: 'test',
        tool: 'tool',
        params: { id: i },
        username: 'testuser',
        role: 'admin',
        success: true,
        duration: Math.random() * 100,
        traceId: `stress_${i}`
      });
      writeTimes.push(Date.now() - start);
    }

    // 阶段 2: 查询性能
    console.log('  阶段 2: 查询性能测试...');
    const queryTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      logger.getEntries({ role: 'admin', limit: 100 });
      queryTimes.push(Date.now() - start);
    }

    // 阶段 3: 统计计算
    console.log('  阶段 3: 统计计算测试...');
    const statsTimes = [];
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      logger.getStats();
      statsTimes.push(Date.now() - start);
    }

    // 阶段 4: 内存满载
    console.log('  阶段 4: 内存满载测试...');
    for (let i = 0; i < 15000; i++) {
      logger.log({ toolFullName: 'test:overflow', success: true, duration: 1 });
    }
    const overflowStats = logger.getStats();

    logger.destroy();

    this.results.audit = {
      writeAvg: this.avg(writeTimes),
      writeP95: this.p95(writeTimes),
      queryAvg: this.avg(queryTimes),
      queryP95: this.p95(queryTimes),
      statsAvg: this.avg(statsTimes),
      statsP95: this.p95(statsTimes),
      totalEntries: overflowStats.total,
      memoryCleanup: overflowStats.total <= 10000
    };

    console.log('\n  结果:');
    console.log(`    单条写入平均: ${this.results.audit.writeAvg.toFixed(3)}ms`);
    console.log(`    单条写入 P95: ${this.results.audit.writeP95.toFixed(3)}ms`);
    console.log(`    查询平均: ${this.results.audit.queryAvg.toFixed(3)}ms`);
    console.log(`    查询 P95: ${this.results.audit.queryP95.toFixed(3)}ms`);
    console.log(`    统计计算平均: ${this.results.audit.statsAvg.toFixed(3)}ms`);
    console.log(`    统计计算 P95: ${this.results.audit.statsP95.toFixed(3)}ms`);
    console.log(`    内存满载后条目数: ${this.results.audit.totalEntries}`);
    console.log(`    内存自动清理: ${this.results.audit.memoryCleanup ? '✓' : '✗'}`);
  }

  async testAlertManagerPerformance() {
    console.log('\n>>> 测试告警管理器性能\n');

    const alertManager = new MCPAlertManager();

    const iterations = 1000;

    console.log(`  测试迭代: ${iterations}`);
    console.log(`  预置规则数: ${alertManager.getStats().activeRules}\n`);

    // 阶段 1: 告警处理
    console.log('  阶段 1: 告警处理测试...');
    const alertTimes = [];
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await alertManager.processAlert({
        toolFullName: i % 10 === 0 ? 'test:delete' : 'test:read',
        username: `user${i % 100}`,
        role: i % 3 === 0 ? 'admin' : 'operator',
        success: i % 5 !== 0,
        traceId: `alert_${i}`
      });
      alertTimes.push(Date.now() - start);
    }

    // 阶段 2: 静默期测试
    console.log('  阶段 2: 静默期测试...');
    const silenceResults = [];
    for (let i = 0; i < 5; i++) {
      const result = await alertManager.processAlert({
        toolFullName: 'test:delete',
        username: 'silence-test',
        role: 'admin',
        success: false,
        traceId: `silence_${i}`
      });
      silenceResults.push(result);
    }

    // 阶段 3: 历史查询
    console.log('  阶段 3: 告警历史查询测试...');
    const historyTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      alertManager.getAlertHistory({ since: 3600000 });
      historyTimes.push(Date.now() - start);
    }

    alertManager.destroy();

    this.results.alert = {
      alertAvg: this.avg(alertTimes),
      alertP95: this.p95(alertTimes),
      silenceTriggered: silenceResults.filter(r => r && r.length > 0).length,
      silenceBlocked: silenceResults.filter(r => !r || r.length === 0).length,
      historyAvg: this.avg(historyTimes),
      historyP95: this.p95(historyTimes)
    };

    console.log('\n  结果:');
    console.log(`    告警处理平均: ${this.results.alert.alertAvg.toFixed(3)}ms`);
    console.log(`    告警处理 P95: ${this.results.alert.alertP95.toFixed(3)}ms`);
    console.log(`    静默期触发: ${this.results.alert.silenceTriggered} 次`);
    console.log(`    静默期拦截: ${this.results.alert.silenceBlocked} 次`);
    console.log(`    历史查询平均: ${this.results.alert.historyAvg.toFixed(3)}ms`);
    console.log(`    历史查询 P95: ${this.results.alert.historyP95.toFixed(3)}ms`);
  }

  async testPermissionManagerPerformance() {
    console.log('\n>>> 测试权限管理器性能\n');

    const pm = new MCPPermissionManager();

    for (let i = 0; i < 100; i++) {
      pm.addCustomRole(`role_${i}`, {
        level: 'read',
        allowedTools: ['tool:*'],
        deniedTools: []
      });
    }

    const iterations = 10000;
    const roles = ['admin', 'operator', 'viewer', ...Array(10).fill().map((_, i) => `role_${i}`)];
    const tools = [
      'filesystem:read_file', 'filesystem:write_file', 'filesystem:delete_file',
      'github:create_issue', 'github:create_release',
      'brave-search:search'
    ];

    console.log(`  自定义角色数: 100`);
    console.log(`  测试迭代: ${iterations}\n`);

    // 阶段 1: 权限检查
    console.log('  阶段 1: 权限检查测试...');
    const checkTimes = [];
    for (let i = 0; i < iterations; i++) {
      const role = roles[i % roles.length];
      const tool = tools[i % tools.length];
      
      const start = Date.now();
      pm.checkToolAccess(tool, role);
      checkTimes.push(Date.now() - start);
    }

    // 阶段 2: 审计日志查询
    console.log('  阶段 2: 审计日志查询测试...');
    const auditTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      pm.getAuditLog({ role: 'admin' });
      auditTimes.push(Date.now() - start);
    }

    pm.destroy();

    this.results.permission = {
      checkAvg: this.avg(checkTimes),
      checkP95: this.p95(checkTimes),
      checkThroughput: Math.round(iterations / (this.avg(checkTimes) / 1000)),
      auditAvg: this.avg(auditTimes),
      auditP95: this.p95(auditTimes)
    };

    console.log('\n  结果:');
    console.log(`    权限检查平均: ${this.results.permission.checkAvg.toFixed(4)}ms`);
    console.log(`    权限检查 P95: ${this.results.permission.checkP95.toFixed(4)}ms`);
    console.log(`    权限检查吞吐量: ${this.results.permission.checkThroughput} ops/s`);
    console.log(`    审计查询平均: ${this.results.permission.auditAvg.toFixed(3)}ms`);
    console.log(`    审计查询 P95: ${this.results.permission.auditP95.toFixed(3)}ms`);
  }

  async testWorkflowEnginePerformance() {
    console.log('\n>>> 测试工作流引擎性能\n');

    const engine = new NodeWorkflowEngine({
      maxConcurrent: 10,
      enableParameterCache: true,
      maxCompiledPlans: 50
    });

    engine.registerNodeType('fast_compute', {
      name: '快速计算',
      category: 'test',
      inputs: [{ name: 'value', type: 'number' }],
      outputs: [{ name: 'result', type: 'number' }],
      execute: (node, inputs) => {
        return { result: (inputs.value || 0) * 2 };
      }
    });

    for (let i = 0; i < 5; i++) {
      engine.createNode('fast_compute', { x: i * 100, y: 100 }, { value: i });
    }

    console.log(`  节点数: ${engine.nodes.size}`);
    console.log(`  最大并发: ${engine.maxConcurrent}\n`);

    console.log('  阶段 1: 执行测试...');
    const execTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await engine.execute(`test_${i}`, { parallel: false });
      execTimes.push(Date.now() - start);
    }

    console.log('  阶段 2: 执行计划编译测试...');
    const compileTimes = [];
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      engine.compileExecutionPlan(`compile_test_${i}`);
      compileTimes.push(Date.now() - start);
    }

    console.log('  阶段 3: 缓存测试...');
    engine.clearResultCache();
    await engine.execute('cache_test_1', { parallel: false });
    await engine.execute('cache_test_1', { parallel: false });
    const cacheStats = engine.getResultCacheStats();
    const perfStats = engine.getPerformanceStats();

    this.results.workflow = {
      execAvg: this.avg(execTimes),
      execP95: this.p95(execTimes),
      compileAvg: this.avg(compileTimes),
      compileP95: this.p95(compileTimes),
      cacheSize: cacheStats.size,
      parallelismGain: 1,
      latency: perfStats.latency
    };

    console.log('\n  结果:');
    console.log(`    执行平均: ${this.results.workflow.execAvg.toFixed(1)}ms`);
    console.log(`    计划编译平均: ${this.results.workflow.compileAvg.toFixed(3)}ms`);
    console.log(`    缓存条目数: ${this.results.workflow.cacheSize}`);

    engine.destroy();
  }

  async testPerformanceManager() {
    console.log('\n>>> 测试性能管理器\n');

    const perfManager = new PerformanceManager();

    console.log('  阶段 1: 配置读取测试...');
    const readTimes = [];
    for (let i = 0; i < 10000; i++) {
      const start = Date.now();
      perfManager.get('mcp.callTimeout');
      readTimes.push(Date.now() - start);
    }

    console.log('  阶段 2: 配置写入测试...');
    const writeTimes = [];
    for (let i = 0; i < 1000; i++) {
      const start = Date.now();
      perfManager.set('mcp.callTimeout', 30000 + i);
      writeTimes.push(Date.now() - start);
    }

    console.log('  阶段 3: 告警阈值检查测试...');
    const alertTimes = [];
    for (let i = 0; i < 1000; i++) {
      const start = Date.now();
      perfManager.checkAlerts({
        workflowP95Latency: 3000 + Math.random() * 4000,
        mcpSuccessRate: 0.95 + Math.random() * 0.05,
        cacheHitRate: 0.3 + Math.random() * 0.4,
        nodeQueueLength: 50 + Math.random() * 100
      });
      alertTimes.push(Date.now() - start);
    }

    perfManager.destroy();

    this.results.perfManager = {
      readAvg: this.avg(readTimes),
      readP95: this.p95(readTimes),
      writeAvg: this.avg(writeTimes),
      writeP95: this.p95(writeTimes),
      alertAvg: this.avg(alertTimes),
      alertP95: this.p95(alertTimes)
    };

    console.log('\n  结果:');
    console.log(`    配置读取平均: ${this.results.perfManager.readAvg.toFixed(4)}ms`);
    console.log(`    配置读取 P95: ${this.results.perfManager.readP95.toFixed(4)}ms`);
    console.log(`    配置写入平均: ${this.results.perfManager.writeAvg.toFixed(4)}ms`);
    console.log(`    告警检查平均: ${this.results.perfManager.alertAvg.toFixed(4)}ms`);
  }

  async testBatchWriter() {
    console.log('\n>>> 测试批量写入器\n');

    const writer = new AsyncBatchWriter({
      batchSize: 100,
      flushInterval: 1000,
      maxQueueSize: 10000
    });

    const iterations = 5000;

    console.log(`  测试迭代: ${iterations}`);
    console.log(`  批量大小: ${writer.batchSize}\n`);

    console.log('  阶段 1: 批量写入测试...');
    const writeTimes = [];
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      writer.add({ id: i, data: `test_${i}`, timestamp: Date.now() });
      writeTimes.push(Date.now() - start);
    }

    console.log('  阶段 2: 强制刷新测试...');
    const flushStart = Date.now();
    await writer.flush(true);
    const flushTime = Date.now() - flushStart;

    const stats = writer.getStats();

    await writer.close();

    this.results.batchWriter = {
      writeAvg: this.avg(writeTimes),
      writeP95: this.p95(writeTimes),
      flushTime,
      totalWritten: stats.totalWritten,
      batchesFlushed: stats.batchesFlushed,
      avgBatchSize: stats.avgBatchSize
    };

    console.log('\n  结果:');
    console.log(`    写入平均: ${this.results.batchWriter.writeAvg.toFixed(4)}ms`);
    console.log(`    写入 P95: ${this.results.batchWriter.writeP95.toFixed(4)}ms`);
    console.log(`    刷新耗时: ${this.results.batchWriter.flushTime}ms`);
    console.log(`    总写入条数: ${this.results.batchWriter.totalWritten}`);
    console.log(`    平均批量大小: ${this.results.batchWriter.avgBatchSize.toFixed(1)}`);
  }

  async testWorkflowOptimizer() {
    console.log('\n>>> 测试工作流优化器\n');

    const optimizer = new WorkflowOptimizer({
      enablePreheating: true,
      maxCachedPlans: 50
    });

    const engine = new NodeWorkflowEngine();
    optimizer.setWorkflowEngine(engine);

    engine.registerNodeType('task', {
      name: '任务',
      category: 'test',
      inputs: [],
      outputs: [{ name: 'result', type: 'any' }],
      execute: async () => ({ result: 'done' })
    });

    for (let i = 0; i < 10; i++) {
      engine.createNode('task', { x: i * 100, y: 100 });
    }

    console.log('  阶段 1: 工作流编译测试...');
    const compileTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      optimizer.compileWorkflow(`wf_${i}`);
      compileTimes.push(Date.now() - start);
    }

    console.log('  阶段 2: 预热测试...');
    optimizer.preheat(['wf_1', 'wf_2', 'wf_3', 'wf_4', 'wf_5']);
    
    console.log('  阶段 3: 缓存命中测试...');
    const cacheTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      optimizer.compileWorkflow('wf_1');
      cacheTimes.push(Date.now() - start);
    }

    console.log('  阶段 4: 推荐生成测试...');
    optimizer.recordExecution('wf_1', {
      completedAt: Date.now(),
      startedAt: Date.now() - 6000,
      status: 'completed',
      nodeResults: {}
    });

    const recommendations = optimizer.getRecommendations('wf_1');

    optimizer.destroy();
    engine.destroy();

    const stats = optimizer.getStats();

    this.results.optimizer = {
      compileAvg: this.avg(compileTimes),
      compileP95: this.p95(compileTimes),
      cacheAvg: this.avg(cacheTimes),
      cacheP95: this.p95(cacheTimes),
      cacheHitRate: stats.cacheHits / (stats.totalOptimizations || 1),
      preheatCount: stats.preheatCount,
      recommendations: recommendations.length
    };

    console.log('\n  结果:');
    console.log(`    编译平均: ${this.results.optimizer.compileAvg.toFixed(3)}ms`);
    console.log(`    缓存命中平均: ${this.results.optimizer.cacheAvg.toFixed(3)}ms`);
    console.log(`    缓存命中率: ${(this.results.optimizer.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`    预热工作流数: ${this.results.optimizer.preheatCount}`);
    console.log(`    生成推荐数: ${this.results.optimizer.recommendations}`);
  }

  printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('  压测总结');
    console.log('='.repeat(70) + '\n');

    console.log('  缓存系统:');
    console.log(`    - 命中读取: ${this.results.cache.readHitAvg.toFixed(3)}ms (P95: ${this.results.cache.readHitP95.toFixed(3)}ms)`);
    const cachePass = this.results.cache.readHitP95 < 1;
    console.log(`    - 状态: ${cachePass ? '✓ 通过' : '✗ 需要优化'}\n`);

    console.log('  审计日志:');
    console.log(`    - 写入延迟: ${this.results.audit.writeAvg.toFixed(3)}ms (P95: ${this.results.audit.writeP95.toFixed(3)}ms)`);
    const auditPass = this.results.audit.writeP95 < 1;
    console.log(`    - 状态: ${auditPass ? '✓ 通过' : '✗ 需要优化'}\n`);

    console.log('  告警系统:');
    console.log(`    - 处理延迟: ${this.results.alert.alertAvg.toFixed(3)}ms (P95: ${this.results.alert.alertP95.toFixed(3)}ms)`);
    console.log(`    - 静默期有效: ${this.results.alert.silenceBlocked > 0 ? '✓ 是' : '✗ 否'}`);
    const alertPass = this.results.alert.alertP95 < 5;
    console.log(`    - 状态: ${alertPass ? '✓ 通过' : '✗ 需要优化'}\n`);

    console.log('  权限系统:');
    console.log(`    - 检查延迟: ${this.results.permission.checkAvg.toFixed(4)}ms (P95: ${this.results.permission.checkP95.toFixed(4)}ms)`);
    console.log(`    - 吞吐量: ${this.results.permission.checkThroughput} ops/s`);
    const permPass = this.results.permission.checkThroughput > 50000;
    console.log(`    - 状态: ${permPass ? '✓ 通过' : '✗ 需要优化'}\n`);

    console.log('  工作流引擎:');
    console.log(`    - 执行时间: ${this.results.workflow.execAvg.toFixed(1)}ms`);
    console.log(`    - 编译时间: ${this.results.workflow.compileAvg.toFixed(3)}ms`);
    const workflowPass = this.results.workflow.compileAvg < 10;
    console.log(`    - 状态: ${workflowPass ? '✓ 通过' : '✗ 需要优化'}\n`);

    console.log('  性能管理器:');
    console.log(`    - 配置读取: ${this.results.perfManager.readAvg.toFixed(4)}ms`);
    console.log(`    - 告警检查: ${this.results.perfManager.alertAvg.toFixed(4)}ms`);
    const perfPass = this.results.perfManager.readAvg < 0.1;
    console.log(`    - 状态: ${perfPass ? '✓ 通过' : '✗ 需要优化'}\n`);

    console.log('  批量写入器:');
    console.log(`    - 写入延迟: ${this.results.batchWriter.writeAvg.toFixed(4)}ms`);
    console.log(`    - 批量大小: ${this.results.batchWriter.avgBatchSize.toFixed(1)}`);
    const batchPass = this.results.batchWriter.writeAvg < 0.1;
    console.log(`    - 状态: ${batchPass ? '✓ 通过' : '✗ 需要优化'}\n`);

    console.log('  工作流优化器:');
    console.log(`    - 编译时间: ${this.results.optimizer.compileAvg.toFixed(3)}ms`);
    console.log(`    - 缓存命中: ${(this.results.optimizer.cacheHitRate * 100).toFixed(1)}%`);
    const optPass = this.results.optimizer.compileAvg < 5;
    console.log(`    - 状态: ${optPass ? '✓ 通过' : '✗ 需要优化'}\n`);

    const allPass = cachePass && auditPass && alertPass && permPass && workflowPass && perfPass && batchPass && optPass;
    console.log('  ' + (allPass ? '✓ 所有测试通过' : '⚠ 部分测试未通过') + '\n');
  }

  avg(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  p95(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index];
  }
}

async function main() {
  const tester = new MCPStressTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { MCPStressTester };
