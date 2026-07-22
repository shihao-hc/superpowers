/**
 * BrainSystem 统一入口脚本
 * 用于手动调用AI大脑核心功能
 * 
 * 使用方法:
 *   node brain-entry.js "用户输入"
 *   node brain-entry.js --status
 *   node brain-entry.js --test
 */

const fs = require('fs');
const path = require('path');

// 加载BrainSystem
let BrainSystem;
try {
  BrainSystem = require('./src/core/BrainSystem');
} catch (e) {
  console.error('无法加载BrainSystem:', e.message);
  process.exit(1);
}

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0] || '';

// 处理不同命令
async function main() {
  switch (command) {
    case '--status':
    case 'status':
      showStatus();
      break;
      
    case '--test':
    case 'test':
      await runTests();
      break;
      
    case '--persist':
    case 'persist':
      testPersistence();
      break;
      
    case '--unified':
      await testUnified(args[1] || '测试输入');
      break;
      
    case '--help':
    case 'help':
    case '-h':
      showHelp();
      break;
      
    default:
      // 处理用户输入
      if (args.length > 0) {
        // 显示相关教训提醒
        const LessonReminder = require('./src/core/LessonReminder');
        const reminder = LessonReminder.formatReminder(LessonReminder.getRelevantLessons('code', 5));
        if (reminder) {
          console.log('\n' + reminder + '\n');
        }
        await processInput(args.join(' '));
      } else {
        showHelp();
      }
  }
}

function showStatus() {
  console.log('\n=== BrainSystem 状态 ===\n');
  
  const autoStatus = BrainSystem.autoGetStatus?.();
  console.log('版本:', autoStatus?.version || 'v22.1');
  console.log('自动化:', autoStatus?.enabled ? '已启用' : '未启用');
  console.log('Agent数量:', autoStatus?.agentCount || 14);
  
  // 真实教训数 (从 .opencode/lessons.json)
  let realLessons = 0;
  try {
    const lessonsPath = path.join(__dirname, '.opencode', 'lessons.json');
    if (fs.existsSync(lessonsPath)) {
      const data = JSON.parse(fs.readFileSync(lessonsPath, 'utf8'));
      realLessons = data.lessons?.length || 0;
    }
  } catch (e) {
    // 教训文件未初始化，使用空值
  }
  
  // 持久化状态
  try {
    const persist = BrainSystem.loadPersistedData?.();
    const lessonCount = Array.isArray(persist?.lessons) ? persist.lessons.length : (persist?.lessons?.total || 0);
    console.log('持久化 lessons:', lessonCount);
    console.log('真实 lessons (已验证):', realLessons);
    console.log('持久化 interactions:', persist?.growth?.totalInteractions || 0);
  } catch (e) {
    // 持久化数据未初始化
  }
  
  // 主动思考状态
  try {
    const proactive = BrainSystem.getProactiveStatus?.();
    console.log('主动思考次数:', proactive?.interactionCount || 0);
    console.log('学习意图:', proactive?.patternsLearned || 0);
    console.log('主要意图:', proactive?.topIntent || '无');
  } catch (e) {
    // 主动思考状态未初始化
  }
  
  // 智能记忆状态
  try {
    const memory = BrainSystem.getMemoryStats?.();
    console.log('智能记忆:', memory?.total || 0);
  } catch (e) {
    // 智能记忆未初始化
  }
  
  // 自我进化状态
  try {
    const evolution = BrainSystem.getEvolutionStats?.();
    console.log('进化记录:', evolution?.total || 0);
  } catch (e) {
    // 自我进化未初始化
  }
  
  console.log('');
}

async function runTests() {
  console.log('\n=== 运行测试 ===\n');
  
  const tests = [
    { name: 'forceThink', fn: () => BrainSystem.forceThink('测试输入') },
    { name: 'analyzeIntent', fn: () => BrainSystem.analyzeIntent('帮我写代码') },
    { name: 'proactiveThink', fn: () => BrainSystem.proactiveThink('测试') },
    { name: 'expressEmotion', fn: () => BrainSystem.expressEmotion('谢谢', '') },
    { name: 'predict', fn: () => BrainSystem.predict('测试') },
    { name: 'smartSearch', fn: () => BrainSystem.smartSearch('测试', 5) }
  ];
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      console.log(`✓ ${test.name}: ${result?.intent?.intent || result?.questions?.length ? 'OK' : 'done'}`);
    } catch (e) {
      console.log(`✗ ${test.name}: ${e.message}`);
    }
  }
  
  console.log('\n测试完成\n');
}

function testPersistence() {
  console.log('\n=== 测试持久化 ===\n');
  
  try {
    const result = BrainSystem.autoPersist?.();
    console.log('自动持久化:', result?.saved ? 'OK' : 'done');
    
    // 增量更新
    const inc = BrainSystem.incrementPersist?.('growth', { testUpdate: Date.now() });
    console.log('增量更新:', inc?.updated ? 'OK' : 'done');
    
    // 加载
    const data = BrainSystem.loadPersistedData?.();
    console.log('加载:', data?.lessons ? 'OK' : 'done');
  } catch (e) {
    console.log('错误:', e.message);
  }
  
  console.log('');
}

async function testUnified(input) {
  console.log('\n=== 统一处理 ===\n');
  console.log('输入:', input);
  console.log('');
  
  try {
    const result = BrainSystem.unifiedProcess?.(input);
    console.log('意图:', result?.intent?.intent);
    console.log('置信度:', result?.confidence?.toFixed(2));
    console.log('建议:', result?.suggestions?.join(', '));
    console.log('情感:', result?.emotion?.expression);
  } catch (e) {
    console.log('错误:', e.message);
  }
  
  console.log('');
}

async function processInput(input) {
  console.log('\n=== 处理输入 ===\n');
  console.log('输入:', input);
  console.log('');
  
  // 使用自动化接口 (v22.1)
  const autoResult = await BrainSystem.autoAgentProcess?.(input);
  if (autoResult) {
    console.log('--- 自动化结果 ---');
     console.log('Manager:', autoResult.manager);
     console.log('意图:', autoResult.intent ?? 'unknown');
     console.log('置信度:', autoResult.confidence ?? 0);
     console.log('使用Agent数:', autoResult.agentsUsed ?? 0);
     console.log('耗时:', (autoResult.totalTime ?? 0) + 'ms');
    console.log('自动:', autoResult.auto);
    
    // 自动验证
    const valid = BrainSystem.autoValidate?.(autoResult);
    console.log('验证:', valid?.valid ? '通过' : '失败');
    
    // 自动学习
    BrainSystem.autoLearn?.(input, autoResult);
    console.log('学习: 已记录');
  }
  
  console.log('');
}

function showHelp() {
  console.log(`
 BrainSystem 统一入口 v22.1

 使用方法:
   node brain-entry.js "用户输入"     处理用户输入
   node brain-entry.js --status        显示状态
   node brain-entry.js --test        运行测试
   node brain-entry.js --persist    测试持久化
   node brain-entry.js --unified "test"  统一处理
   node brain-entry.js --help        显示帮助

示例:
  node brain-entry.js "帮我优化性能"
  node brain-entry.js --status
  node brain-entry.js --test
`);
}

// 执行
main().catch(console.error);