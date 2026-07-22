/**
 * 快速上下文注入
 * 读取大脑状态，注入到 Agent 上下文中
 */
const fs = require('fs');
const path = require('path');

// 数据目录
const EVOLUTION_DIR = path.join(__dirname, '.opencode', 'evolution');
const OPENCODE_DIR = path.join(__dirname, '.opencode');

function loadEvolution(filename) {
  const file = path.join(EVOLUTION_DIR, `${filename}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    // 进化数据未初始化，使用空对象
  }
  return {};
}

function loadOpencode(filename) {
  const file = path.join(OPENCODE_DIR, `${filename}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    // opencode数据未初始化，使用空对象
  }
  return {};
}

// 读取真实教训库 (94条)
const realLessons = loadOpencode('lessons');
const lessonArray = realLessons.lessons || [];

// 读取记忆 (最近5条)
const memory = loadEvolution('memory');
const memoryArray = memory.items?.slice(-5) || [];

// 读取成长轨迹
const growth = loadEvolution('growth');

// 读取用户画像
const profile = loadEvolution('user_profile');

// 读取主动思考状态
const proactive = loadEvolution('proactive');

const context = {
  user: {
    ...(profile.preferences ? profile : {}),
    interactions: growth.totalInteractions || 0,
    proactiveCount: proactive?.count || 0
  },
  memory: memoryArray,
  lessons: lessonArray.map(l => ({
    id: l.id,
    lesson: l.lesson,
    category: l.category,
    priority: l.priority,
    status: l.status,
    useCount: l.useCount || 0,
    effectiveness: l.effectiveness || 3,
    lastUsed: l.lastUsed,
    source: l.source
  })),
  growth: {
    interactions: growth.totalInteractions || 0,
    lessons_count: lessonArray.length,
    evolution_items: growth.total || 0
  },
  summary: {
    total_active: lessonArray.filter(l => l.status === 'active').length,
    total_deprecated: lessonArray.filter(l => l.status === 'deprecated').length,
    needs_review: lessonArray.filter(l => new Date(l.reviewDate) < new Date()).length,
    avg_effectiveness: (lessonArray.reduce((s,l)=>s+(l.effectiveness||3),0) / lessonArray.length).toFixed(1),
    key_reminders: [
      '先分析问题再动手',
      '复杂任务先制定计划',
      '修改代码前先运行测试',
      '修复后需要验证',
      '善用已有资源避免重复造轮子'
    ]
  }
};

// 快速摘要
console.log('=== BRAIN_SUMMARY ===');
console.log('教训总数:', lessonArray.length);
console.log('活跃教训:', context.summary.total_active);
console.log('需复习:', context.summary.needs_review);
console.log('平均有效性:', context.summary.avg_effectiveness);
console.log('交互次数:', growth.totalInteractions || 0);
console.log('=== BRAIN_SUMMARY_END ===');
console.log('');

console.log('=== BRAIN_CONTEXT_START ===');
console.log(JSON.stringify(context, null, 2));
console.log('=== BRAIN_CONTEXT_END ===');
