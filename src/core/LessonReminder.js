/**
 * LessonReminder - 教训自动提醒机制
 *
 * 遵循教训: "好记性不如烂笔头"
 * 在每次任务前自动加载相关教训，避免重复犯错
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const LESSONS_FILE = path.join(process.cwd(), '.opencode', 'lessons.json');

// 任务类型到教训分类的映射
const TASK_CATEGORY_MAP = {
  'code': ['thinking', 'tool', 'mistake'],
  'test': ['thinking', 'mistake'],
  'fix': ['thinking', 'mistake', 'tool'],
  'feature': ['thinking', 'pattern'],
  'refactor': ['thinking', 'pattern', 'tool'],
  'security': ['tool', 'mistake'],
  'deploy': ['tool', 'pattern'],
  'review': ['thinking', 'success'],
  'default': ['thinking', 'tool', 'pattern']
};

/**
 * 根据任务类型获取相关教训
 * @param {string} taskType - 任务类型 (code/test/fix/feature/refactor/security/deploy/review)
 * @param {number} maxLessons - 最多返回教训数
 * @returns {Array} 相关教训列表
 */
function getRelevantLessons(taskType = 'default', maxLessons = 5) {
  const categories = TASK_CATEGORY_MAP[taskType] || TASK_CATEGORY_MAP.default;

  try {
    if (!fs.existsSync(LESSONS_FILE)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf8'));
    const lessons = data.lessons || [];

    // 按分类过滤，排序规则：
    // 1. 高优先级优先
    // 2. 使用次数少的优先（需要多复习）
    // 3. 有效性高的优先
    const relevant = lessons.filter((l) =>
      l.status === 'active' && categories.includes(l.category)
    ).sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const aP = priorityOrder[a.priority] ?? 2;
      const bP = priorityOrder[b.priority] ?? 2;
      if (aP !== bP) {return aP - bP;}
      const aE = a.effectiveness || 3;
      const bE = b.effectiveness || 3;
      if (aE !== bE) {return bE - aE;}
      return (a.useCount || 0) - (b.useCount || 0);
    });

    return relevant.slice(0, maxLessons);
  } catch (e) {
    return [];
  }
}

/**
 * 格式化教训为可读提醒
 * @param {Array} lessons - 教训列表
 * @returns {string} 格式化后的提醒文本
 */
function formatReminder(lessons) {
  if (!lessons || lessons.length === 0) {
    return '';
  }

  const lines = ['=== 教训提醒 ==='];
  lessons.forEach((l, _i) => {
    const star = l.effectiveness >= 4 ? '★' : '○';
    lines.push(`${star} ${l.lesson} (使用${l.useCount || 0}次)`);
  });
  lines.push('==============');

  return lines.join('\n');
}

/**
 * 获取快速教训摘要（单行）
 * @param {string} taskType - 任务类型
 * @returns {string} 单行摘要
 */
function getQuickReminder(taskType = 'default') {
  const lessons = getRelevantLessons(taskType, 3);
  if (lessons.length === 0) {return '';}

  return lessons.map((l) => l.lesson).join(' | ');
}

/**
 * 打印教训提醒到控制台
 * @param {string} taskType - 任务类型
 */
function printReminder(taskType = 'default') {
  const reminder = formatReminder(getRelevantLessons(taskType, 5));
  if (reminder) {
    console.log(reminder);
  }
}

module.exports = {
  getRelevantLessons,
  formatReminder,
  getQuickReminder,
  printReminder,
  TASK_CATEGORY_MAP
};
