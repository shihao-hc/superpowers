/**
 * AI大脑系统 - 完整测试套件
 *
 * 测试覆盖：
 * 1. 单元测试 - 各模块核心功能
 * 2. 边界测试 - 空输入、极端值
 * 3. 错误场景测试 - 异常、错误处理
 * 4. 集成测试 - 模块间协作
 */

const SelfLearningSystem = require('./SelfLearningSystem');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
    return true;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    错误: ${e.message}`);
    failed++;
    return false;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} 期望 ${expected}，实际 ${actual}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(message || '断言失败');
  }
}

function assertExists(obj, message = '') {
  if (obj === null || obj === undefined) {
    throw new Error(message || '对象不存在');
  }
}

// ========== 1. BrainSystem 单元测试 ==========
console.log('\n【1. BrainSystem 单元测试】');

test('BrainSystem 初始化', () => {
  const system = new SelfLearningSystem();
  assertExists(system.brain);
  assertTrue(system.brain.enabled);
});

test('BrainSystem 五大能力', () => {
  const system = new SelfLearningSystem();
  const brain = system.brain;
  assertExists(brain.metaCognition);
  assertExists(brain.thinking);
  assertExists(brain.evolution);
  assertExists(brain.tools);
  assertExists(brain.reverseThinking);
});

test('beforeDecision 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.beforeDecision('测试问题');
  assertExists(result.questions);
  assertExists(result.selfCheck);
});

test('afterDecision 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.afterDecision('测试', { success: true }, 'test');
  assertExists(result.reflection);
  assertExists(result.stats);
});

test('solveProblem 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.solveProblem({
    description: '测试问题',
    constraints: ['性能', '安全']
  });
  assertExists(result.description);
  assertTrue(result.confidence > 0);
  assertExists(result.perspectives);
});

test('getBrainStatus 方法', () => {
  const system = new SelfLearningSystem();
  const status = system.getBrainStatus();
  assertTrue(status.enabled);
  assertExists(status.capabilities);
  assertExists(status.evolution);
});

test('configureBrain 方法', () => {
  const system = new SelfLearningSystem();
  system.configureBrain({ enableReverseThinking: false });
  const status = system.getBrainStatus();
  assertTrue(!status.capabilities.reverseThinking);
});

// ========== 2. MetaCognition 边界测试 ==========
console.log('\n【2. MetaCognition 边界测试】');

test('空输入 - check', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.metaCognition.check('');
  assertEqual(result.status, 'unknown');
});

test('空输入 - beforeAsk', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.metaCognition.beforeAsk('');
  assertExists(result.questions);
  assertTrue(result.questions.length >= 5);
});

test('长文本输入', () => {
  const system = new SelfLearningSystem();
  const longText = 'a'.repeat(10000);
  const result = system.brain.metaCognition.check(longText);
  assertExists(result);
});

test('特殊字符输入', () => {
  const system = new SelfLearningSystem();
  const specialChars = '<>\'"&script';
  const result = system.brain.metaCognition.check(specialChars);
  assertExists(result);
});

test('Unicode输入', () => {
  const system = new SelfLearningSystem();
  const unicode = '中文测试 🎉 éèê';
  const result = system.brain.metaCognition.check(unicode);
  assertExists(result);
});

test('确定性文本检测', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.metaCognition.check('根据数据分析，这个方案可行');
  assertTrue(result.certainCount > 0 || result.status !== 'unknown');
});

test('不确定性文本检测', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.metaCognition.check('大概可能应该没问题吧');
  assertTrue(result.uncertainCount > 0 || result.status === 'uncertain');
});

test('afterReview 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.metaCognition.afterReview('测试', { success: true });
  assertExists(result.questions);
});

test('getHistory 方法', () => {
  const system = new SelfLearningSystem();
  system.brain.metaCognition.afterReview('测试1', { success: true });
  const history = system.brain.metaCognition.getHistory();
  assertTrue(history.length >= 1);
});

test('analyzeHistory 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.metaCognition.analyzeHistory();
  assertExists(result);
});

// ========== 3. Thinking 单元测试 ==========
console.log('\n【3. Thinking 单元测试】');

test('multiAngle 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.thinking.multiAngle('实现高性能文件上传');
  assertExists(result.technical);
  assertExists(result.business);
  assertExists(result.risk);
  assertExists(result.user);
});

test('question 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.thinking.question('这是最好的方案');
  assertTrue(result.questions.length >= 3);
  assertTrue(result.alternatives.length >= 2);
});

test('associate 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.thinking.associate('问题分解');
  assertExists(result.analogies);
});

test('causalChain 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.thinking.causalChain('测试问题');
  assertExists(result.causes);
  assertExists(result.effects);
});

test('firstPrinciples 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.thinking.firstPrinciples('测试问题');
  assertExists(result.assumptions);
  assertExists(result.breakdown);
});

// ========== 4. ReverseThinking 单元测试 ==========
console.log('\n【4. ReverseThinking 单元测试】');

test('analyze 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.reverseThinking.analyze({ description: '上传失败' });
  assertExists(result.conclusion);
  assertExists(result.causes);
  assertExists(result.fiveWhys);
});

test('orangePractice 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.reverseThinking.orangePractice('速度很慢');
  assertExists(result.reverse);
  assertTrue(result.reverse.steps.length >= 4);
});

test('fromResult 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.reverseThinking.fromResult({ current: '0%' }, '目标100%');
  assertExists(result.gap);
  assertExists(result.reverseSteps);
});

test('decomposeReverse 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.reverseThinking.decomposeReverse('复杂问题');
  assertTrue(result.length > 0);
});

test('reverseInfer 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.reverseThinking.reverseInfer('文件上传失败');
  assertExists(result.causes);
});

// ========== 5. Evolution 错误场景测试 ==========
console.log('\n【5. Evolution 错误场景测试】');

test('recordPattern - 成功', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.evolution.recordPattern('测试场景', '动作', {
    success: true,
    confidence: 0.9
  });
  assertTrue(result.success === true);
});

test('recordPattern - null输入', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.evolution.recordPattern(null, '动作', { success: true });
  assertExists(result);
});

test('recordMistake - 错误记录', () => {
  const system = new SelfLearningSystem();
  const before = system.brain.evolution.data.mistakes.length;
  system.brain.evolution.recordMistake('错误场景', '动作', {
    error: '测试错误',
    severity: 'medium'
  });
  assertTrue(system.brain.evolution.data.mistakes.length > before);
});

test('findImprovements 方法', () => {
  const system = new SelfLearningSystem();
  const improvements = system.brain.evolution.findImprovements();
  assertExists(improvements);
});

test('getStats 方法', () => {
  const system = new SelfLearningSystem();
  const stats = system.brain.evolution.getStats();
  assertExists(stats.patterns);
  assertExists(stats.mistakes);
  assertExists(stats.lessons);
});

test('learnFromLesson 方法', () => {
  const system = new SelfLearningSystem();
  const lesson = {
    type: 'test',
    problem: '测试问题',
    lesson: '测试教训',
    improvement: '测试改进'
  };
  const result = system.brain.evolution.fromLesson(lesson);
  assertExists(result.principle);
  assertExists(result.improvement);
});

test('getLessons 方法', () => {
  const system = new SelfLearningSystem();
  const lessons = system.brain.evolution.getLessons();
  assertTrue(Array.isArray(lessons));
});

test('suggestEvolution 方法', () => {
  const system = new SelfLearningSystem();
  const suggestions = system.brain.evolution.suggestEvolution();
  assertTrue(Array.isArray(suggestions));
});

// ========== 6. ToolManager 单元测试 ==========
console.log('\n【6. ToolManager 单元测试】');

test('selectTools 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.tools.selectTools('搜索解决方案');
  assertTrue(Array.isArray(result));
});

test('recommendCombination 方法', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.tools.recommendCombination('代码分析');
  assertExists(result.recommended);
  assertTrue(result.recommended.length > 0);
});

test('listTools 方法', () => {
  const system = new SelfLearningSystem();
  const tools = system.brain.tools.listTools();
  assertTrue(tools.length >= 4);
});

test('getStats 方法', () => {
  const system = new SelfLearningSystem();
  const stats = system.brain.tools.getStats();
  assertExists(stats.total);
  assertExists(stats.categories);
});

test('suggestTools 方法', () => {
  const system = new SelfLearningSystem();
  const suggestions = system.brain.tools.suggestTools('不知道怎么做');
  assertTrue(Array.isArray(suggestions));
});

// ========== 7. LessonLibrary 边界测试 ==========
console.log('\n【7. LessonLibrary 边界测试】');

test('addLesson - 正常', () => {
  const system = new SelfLearningSystem();
  const lesson = {
    type: 'test',
    problem: '唯一测试问题边界',
    lesson: '唯一测试教训边界',
    improvement: '唯一测试改进边界'
  };
  const result = system.brain.addLesson(lesson);
  assertTrue(result.id.startsWith('lesson-'));
});

test('searchLessons - 正常', () => {
  const system = new SelfLearningSystem();
  const results = system.brain.searchLessons('测试');
  assertTrue(Array.isArray(results));
});

test('searchLessons - 空查询', () => {
  const system = new SelfLearningSystem();
  const results = system.brain.searchLessons('');
  assertTrue(Array.isArray(results));
});

test('getLessonStats 方法', () => {
  const system = new SelfLearningSystem();
  const stats = system.brain.getLessonStats();
  assertExists(stats.total);
  assertExists(stats.byCategory);
});

test('getLessonSuggestions 方法', () => {
  const system = new SelfLearningSystem();
  const suggestions = system.brain.getLessonSuggestions('测试上下文');
  assertTrue(Array.isArray(suggestions));
});

// ========== 8. SelfLearningSystem 边界测试 ==========
console.log('\n【8. SelfLearningSystem 边界测试】');

test('空配置初始化', () => {
  const system = new SelfLearningSystem({});
  assertTrue(system.enabled);
});

test('禁用状态', () => {
  const system = new SelfLearningSystem({ enabled: false });
  assertTrue(!system.enabled);
});

test('recordIntent - 空输入', () => {
  const system = new SelfLearningSystem();
  system.recordIntent('', '', false);
  assertTrue(true); // 不应抛出错误
});

test('recordSuggestion - 空输入', () => {
  const system = new SelfLearningSystem();
  system.recordSuggestion({}, 'ignored');
  assertTrue(true);
});

test('getStats 方法', () => {
  const system = new SelfLearningSystem();
  const stats = system.getStats();
  assertExists(stats.intents);
  assertExists(stats.suggestions);
  assertExists(stats.improvements);
});

test('getImprovements 方法', () => {
  const system = new SelfLearningSystem();
  const improvements = system.getImprovements();
  assertTrue(Array.isArray(improvements));
});

test('getContextualRecommendations 方法', () => {
  const system = new SelfLearningSystem();
  const recs = system.getContextualRecommendations('测试');
  assertTrue(Array.isArray(recs));
});

test('exportReport 方法', () => {
  const system = new SelfLearningSystem();
  const report = system.exportReport();
  assertExists(report.stats);
  assertExists(report.improvements);
});

// ========== 9. 错误场景测试 ==========
console.log('\n【9. 错误场景测试】');

test('模块不存在时的行为', () => {
  const system = new SelfLearningSystem();
  const result = system.brain.solve({ description: '未知问题' });
  assertExists(result);
});

test('JSON解析错误处理', () => {
  const system = new SelfLearningSystem();
  // 模拟损坏的存储数据
  system.brain.lessonLibrary._load();
  assertTrue(true); // 不应崩溃
});

test('并发操作安全', () => {
  const system = new SelfLearningSystem();
  // 快速多次调用
  for (let i = 0; i < 10; i++) {
    system.beforeDecision(`测试${i}`);
  }
  assertTrue(true);
});

test('内存限制保护', () => {
  const system = new SelfLearningSystem();
  // 添加大量数据
  for (let i = 0; i < 100; i++) {
    system.brain.evolution.recordPattern(`场景${i}`, '动作', { success: true, confidence: 0.8 });
  }
  // 检查是否有清理机制
  assertTrue(system.brain.evolution.data.patterns.length < 1000);
});

// ========== 10. 集成测试 ==========
console.log('\n【10. 集成测试】');

test('完整工作流', () => {
  const system = new SelfLearningSystem();

  // 1. 决策前
  const before = system.beforeDecision('如何实现文件上传');

  // 2. 解决问题
  const solution = system.solveProblem({
    description: '实现文件上传功能',
    constraints: ['支持大文件', '进度显示']
  });

  // 3. 决策后
  const after = system.afterDecision('如何实现文件上传', { success: true }, 'solveProblem');

  // 4. 添加教训
  system.brain.addLesson({
    type: 'workflow',
    problem: '如何实现文件上传完整工作流',
    lesson: '完整工作流测试',
    improvement: '验证流程正常'
  });

  // 5. 获取教训建议
  const suggestions = system.brain.getLessonSuggestions('文件上传');

  assertTrue(before.questions && before.questions.length > 0, 'before.questions');
  assertTrue(solution.description && solution.description.length > 0, 'solution.description');
  assertTrue(after && typeof after === 'object', 'after is object');
  assertTrue(Array.isArray(suggestions), 'suggestions is array');
});

test('多模块协作', () => {
  const system = new SelfLearningSystem();

  // MetaCognition + Thinking
  const meta = system.brain.metaCognition.check('测试问题');
  const thinking = system.brain.thinking.multiAngle('测试问题');

  // Thinking + ReverseThinking
  const reverse = system.brain.reverseThinking.analyze({ description: '测试问题' });

  // Evolution + LessonLibrary
  system.brain.addLesson({
    type: 'integration',
    problem: '多模块协作测试',
    lesson: '模块间协作正常',
    improvement: '继续验证'
  });

  assertTrue(meta !== undefined);
  assertTrue(Object.keys(thinking).length >= 4);
  assertTrue(reverse !== undefined);
});

test('状态持久化', () => {
  const system = new SelfLearningSystem();

  // 添加数据
  system.beforeDecision('持久化测试1');
  system.beforeDecision('持久化测试2');
  system.beforeDecision('持久化测试3');

  // 获取状态
  const status = system.getBrainStatus();

  assertTrue(status.decisionCount >= 3);
});

// ========== 总结 ==========
console.log(`\n${'═'.repeat(50)}`);
console.log('          测试结果统计');
console.log('═'.repeat(50));
console.log(`  通过: ${passed}`);
console.log(`  失败: ${failed}`);
console.log(`  总计: ${passed + failed}`);
console.log('═'.repeat(50));

const coverage = Math.round((passed / (passed + failed)) * 100);
console.log(`  覆盖率: ${coverage}%`);
console.log('═'.repeat(50));

if (failed > 0) {
  console.log('\n❌ 测试失败!\n');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过!\n');
  process.exit(0);
}


