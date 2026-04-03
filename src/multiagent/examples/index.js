/**
 * Multi-Agent Patterns 完整示例
 * 
 * 演示如何组合使用所有模式:
 * 1. Supervisor-Expert (主管-专家) 进行并发分析
 * 2. Debate-Decision (辩论-决策) 进行决策
 * 3. LLM Adapter (LLM适配器) 提供智能能力
 * 4. Multi-Level Cache (多级缓存) 优化性能
 */

const { Supervisor, Expert, createExpert } = require('../patterns/SupervisorExpertOrchestrator');
const { DebateManager, BullDebater, BearDebater, Judge } = require('../patterns/DebateDecisionManager');
const { createLLMAdapter } = require('../patterns/BaseLLMAdapter');
const { MultiLevelCache } = require('../patterns/MultiLevelCache');

/**
 * 示例1: 代码审查系统
 */

// 代码审查专家
class SecurityExpert extends Expert {
  async analyze(context, state) {
    const { code, language } = context;
    
    // 模拟安全分析
    const issues = [];
    
    if (code.includes('eval(')) {
      issues.push({ severity: 'high', type: 'code-injection', description: '使用eval可能导致代码注入' });
    }
    if (code.includes('innerHTML')) {
      issues.push({ severity: 'medium', type: 'xss', description: 'innerHTML可能存在XSS风险' });
    }
    if (code.includes('password') && !code.includes('encrypt')) {
      issues.push({ severity: 'high', type: 'security', description: '密码未加密存储' });
    }
    
    return {
      expert: this.name,
      role: 'security',
      issues,
      score: Math.max(0, 100 - issues.filter(i => i.severity === 'high').length * 30 - issues.filter(i => i.severity === 'medium').length * 10),
      summary: `发现 ${issues.length} 个安全问题`
    };
  }
}

class PerformanceExpert extends Expert {
  async analyze(context, state) {
    const { code } = context;
    
    const issues = [];
    
    if (code.includes('for (') && code.includes('for (')) {
      issues.push({ severity: 'medium', type: 'nested-loop', description: '可能存在嵌套循环' });
    }
    if (code.includes('JSON.parse') || code.includes('JSON.stringify')) {
      issues.push({ severity: 'low', type: 'serialization', description: '大量JSON序列化可能影响性能' });
    }
    
    return {
      expert: this.name,
      role: 'performance',
      issues,
      score: Math.max(0, 100 - issues.length * 15),
      summary: `发现 ${issues.length} 个性能问题`
    };
  }
}

class StyleExpert extends Expert {
  async analyze(context, state) {
    const { code, language } = context;
    
    const issues = [];
    
    if (code.length > 500 && !code.includes('// ') && !code.includes('#')) {
      issues.push({ severity: 'low', type: 'documentation', description: '长代码块缺少注释' });
    }
    if (!code.includes('\n')) {
      issues.push({ severity: 'medium', type: 'formatting', description: '代码格式不规范' });
    }
    
    return {
      expert: this.name,
      role: 'style',
      issues,
      score: Math.max(0, 100 - issues.length * 5),
      summary: `发现 ${issues.length} 个风格问题`
    };
  }
}

async function runCodeReviewExample() {
  console.log('\n========== 代码审查系统示例 ==========\n');
  
  // 创建主管
  const supervisor = new Supervisor({
    name: 'CodeReviewSupervisor',
    maxParallelism: 3,
    timeout: 30000
  });
  
  // 注册专家
  supervisor
    .registerExpert(new SecurityExpert({ name: 'SecurityAnalyzer', role: 'security' }))
    .registerExpert(new PerformanceExpert({ name: 'PerformanceAnalyzer', role: 'performance' }))
    .registerExpert(new StyleExpert({ name: 'StyleAnalyzer', role: 'style' }));
  
  // 待审查代码
  const codeToReview = `
    function processUserData(userData) {
      const data = JSON.parse(userData);
      const html = '<div>' + data.name + '</div>';
      document.getElementById('output').innerHTML = html;
      const password = data.password;
      for (let i = 0; i < data.items.length; i++) {
        for (let j = 0; j < data.items[i].subitems.length; j++) {
          console.log(data.items[i].subitems[j]);
        }
      }
      eval('console.log("debug")');
      return data;
    }
  `;
  
  // 执行审查
  const result = await supervisor.analyze({
    code: codeToReview,
    language: 'javascript'
  });
  
  console.log('审查结果:');
  console.log('-'.repeat(50));
  
  for (const r of result.results) {
    if (r.success) {
      console.log(`\n[${r.expertName}] (${r.role})`);
      console.log(`  评分: ${r.result.score}/100`);
      console.log(`  问题: ${r.result.summary}`);
      r.result.issues.forEach(issue => {
        console.log(`    - [${issue.severity}] ${issue.description}`);
      });
    } else {
      console.log(`\n[${r.expertName}] 失败: ${r.error}`);
    }
  }
  
  console.log('\n汇总:');
  console.log(`  成功率: ${result.aggregated.summary.successRate}`);
  console.log(`  共识: ${result.aggregated.consensus ? JSON.stringify(result.aggregated.consensus) : '无'}`);
  console.log(`  冲突: ${result.aggregated.conflicts.length} 个`);
  
  return result;
}

/**
 * 示例2: 投资决策系统
 */

async function runInvestmentDebateExample() {
  console.log('\n\n========== 投资决策辩论示例 ==========\n');
  
  // 创建辩论管理器
  const debate = new DebateManager({
    name: 'InvestmentDebate',
    maxRounds: 3,
    convergenceThreshold: 0.75
  });
  
  // 背景信息
  const investmentContext = {
    stock: 'AAPL',
    price: 175.50,
    pe: 28.5,
    marketCap: '2.8T',
    recentNews: [
      '苹果发布新一代iPhone，销量超预期',
      '全球智能手机市场增长放缓',
      '苹果宣布100亿美元股票回购计划'
    ],
    financials: {
      revenue: '394.3B',
      profit: '99.8B',
      growth: '8.1%'
    },
    technical: {
      trend: 'uptrend',
      support: 170,
      resistance: 180
    }
  };
  
  // 执行辩论
  const result = await debate.debate(investmentContext);
  
  console.log('辩论过程:');
  console.log('-'.repeat(50));
  
  for (const round of result.history) {
    console.log(`\n第 ${round.round} 轮:`);
    console.log(`  看涨观点: ${round.bull.stance} (置信度: ${(round.bull.confidence * 100).toFixed(0)}%)`);
    console.log(`  看跌观点: ${round.bear.stance} (置信度: ${(round.bear.confidence * 100).toFixed(0)}%)`);
  }
  
  console.log('\n最终决策:');
  console.log('-'.repeat(50));
  console.log(`  决策: ${result.decision.decision.toUpperCase()}`);
  console.log(`  置信度: ${(result.decision.confidence * 100).toFixed(0)}%`);
  console.log(`  推理: ${result.decision.reasoning}`);
  console.log(`  是否收敛: ${result.converged ? '是' : '否'}`);
  
  return result;
}

/**
 * 示例3: 智能问答系统 (集成缓存)
 */

async function runSmartQAExample() {
  console.log('\n\n========== 智能问答系统示例 ==========\n');
  
  // 创建多级缓存
  const cache = new MultiLevelCache({
    l1MaxSize: 100,
    l1TTL: 60000,
    l3Dir: './qa-cache',
    enableL2: false
  });
  
  // 创建LLM适配器 (使用本地模拟)
  class MockLLM {
    async generate(prompt) {
      await new Promise(r => setTimeout(r, 100));
      
      if (prompt.includes('苹果')) {
        return '苹果公司是一家美国跨国科技公司，总部位于加利福尼亚州库比蒂诺。';
      }
      if (prompt.includes('Python')) {
        return 'Python是一种高级编程语言，以其简洁易读的语法而闻名。';
      }
      return '这是一个智能回答。';
    }
  }
  
  const llm = new MockLLM();
  
  // 问答函数
  async function answerQuestion(question, useCache = true) {
    const cacheKey = { question: question.toLowerCase().trim() };
    
    if (useCache) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        console.log(`[缓存命中] 问题: "${question}"`);
        return { ...cached, fromCache: true };
      }
    }
    
    console.log(`[LLM调用] 问题: "${question}"`);
    const answer = await llm.generate(question);
    const result = { question, answer, timestamp: new Date().toISOString() };
    
    if (useCache) {
      await cache.set(cacheKey, result, 300000);
    }
    
    return { ...result, fromCache: false };
  }
  
  // 测试问答
  console.log('问答测试:\n');
  
  const q1 = await answerQuestion('什么是苹果公司？');
  console.log(`回答: ${q1.answer}\n`);
  
  const q2 = await answerQuestion('什么是苹果公司？'); // 缓存命中
  console.log(`回答: ${q2.answer} (来自缓存: ${q2.fromCache})\n`);
  
  const q3 = await answerQuestion('什么是Python？');
  console.log(`回答: ${q3.answer}\n`);
  
  const q4 = await answerQuestion('什么是Python？'); // 缓存命中
  console.log(`回答: ${q4.answer} (来自缓存: ${q4.fromCache})\n`);
  
  console.log('缓存统计:');
  console.log(JSON.stringify(cache.getStats(), null, 2));
  
  return { cache, q1, q2, q3, q4 };
}

/**
 * 示例4: 完整的多智能体协作系统
 */

async function runCompleteExample() {
  console.log('\n\n========== 完整多智能体协作示例 ==========\n');
  
  // 创建组件
  const cache = new MultiLevelCache({ l1MaxSize: 50, enableL2: false, enableL3: false });
  
  class DataGatherer extends Expert {
    async analyze(context, state) {
      // 从缓存或数据源获取数据
      const cacheKey = { type: 'market_data', stock: context.stock };
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        return { source: 'cache', data: cached };
      }
      
      // 模拟数据获取
      const data = {
        stock: context.stock,
        price: 150 + Math.random() * 50,
        volume: Math.floor(Math.random() * 10000000),
        timestamp: new Date().toISOString()
      };
      
      await cache.set(cacheKey, data);
      return { source: 'fetch', data };
    }
  }
  
  class Analyzer extends Expert {
    async analyze(context, state) {
      const reports = state.get('expertReports') || {};
      const dataReport = reports['data_gatherer'];
      
      if (!dataReport) {
        return { recommendation: 'hold', confidence: 0.5 };
      }
      
      const { data } = dataReport.report;
      const price = data?.data?.price || 0;
      
      let recommendation, confidence;
      if (price > 180) {
        recommendation = 'sell';
        confidence = 0.8;
      } else if (price < 160) {
        recommendation = 'buy';
        confidence = 0.75;
      } else {
        recommendation = 'hold';
        confidence = 0.6;
      }
      
      return { recommendation, confidence, price };
    }
  }
  
  const supervisor = new Supervisor({ name: 'TradingSupervisor', maxParallelism: 4 });
  supervisor
    .registerExpert(new DataGatherer({ name: 'DataGatherer', role: 'data' }))
    .registerExpert(new Analyzer({ name: 'Analyzer', role: 'analysis' }));
  
  const result = await supervisor.analyze({ stock: 'AAPL' });
  
  console.log('完整协作结果:');
  console.log('-'.repeat(50));
  for (const r of result.results) {
    console.log(`[${r.expertName}] ${r.success ? '成功' : '失败'}`);
    if (r.success) {
      console.log(`  结果: ${JSON.stringify(r.result)}`);
    }
  }
  
  return result;
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('UltraWork 多智能体协作模式示例');
  console.log('='.repeat(60));
  
  try {
    await runCodeReviewExample();
    await runInvestmentDebateExample();
    await runSmartQAExample();
    await runCompleteExample();
    
    console.log('\n\n' + '='.repeat(60));
    console.log('所有示例执行完成!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('执行错误:', error);
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runCodeReviewExample,
  runInvestmentDebateExample,
  runSmartQAExample,
  runCompleteExample,
  main
};
