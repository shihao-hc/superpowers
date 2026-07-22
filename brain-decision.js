/**
 * brain-decision.js - 大脑决策引导
 * 
 * 不是"给我看教训"，而是"告诉我该怎么做"
 * 根据任务类型输出具体的决策规则，必须遵守
 * 
 * 使用方法：
 *   node brain-decision.js <任务类型>
 *   任务类型: code / test / fix / feature / refactor / security / deploy / review
 */

const fs = require('fs');
const path = require('path');

const LESSONS_FILE = path.join(__dirname, '.opencode', 'lessons.json');

// 从 lessons.json 加载真实 ID 映射
function buildLessonMap() {
  try {
    if (fs.existsSync(LESSONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf8'));
      const map = {};
      data.lessons.forEach(function(l) {
        map[l.lesson] = l.id;
      });
      return map;
    }
  } catch (e) {
    // lessons.json 未初始化，使用空映射
  }
  return {};
}

function resolveId(lessonText, lessonMap) {
  return lessonMap[lessonText] || lessonText.substring(0, 20) + '...';
}

// 任务类型到决策规则的映射 (lesson 文本精确匹配 curated 文件)
function buildRules(lessonMap) {
  return {
    code: [
      { rule: '先分析问题再动手，理解问题本质是解决问题的一半', check: '✅ 我已理解问题本质', lessonId: resolveId('先分析问题再动手，理解问题本质是解决问题的一半', lessonMap) },
      { rule: '修改代码前先运行测试验证当前状态', check: '✅ 当前测试已通过', lessonId: resolveId('修改代码前先运行测试验证当前状态', lessonMap) },
      { rule: '善用已有资源，避免重复造轮子', check: '✅ 已检查是否存在复用模块', lessonId: resolveId('善用已有资源，避免重复造轮子', lessonMap) },
      { rule: '搜索现有代码能避免重复和发现模式', check: '✅ 已搜索现有实现', lessonId: resolveId('搜索现有代码能避免重复和发现模式', lessonMap) },
      { rule: '修复后需要验证问题是否真正解决', check: '✅ 修复已验证通过', lessonId: resolveId('修复后需要验证问题是否真正解决', lessonMap) },
      { rule: '提交前检查改动是否完整', check: '✅ 改动已审核完整', lessonId: resolveId('提交前检查改动是否完整', lessonMap) }
    ],
    test: [
      { rule: '测试是代码质量的基础', check: '✅ 已编写测试', lessonId: resolveId('测试是代码质量的基础', lessonMap) },
      { rule: '修改代码前先运行测试验证当前状态', check: '✅ 当前测试已通过', lessonId: resolveId('修改代码前先运行测试验证当前状态', lessonMap) },
      { rule: '边界情况往往是最容易出错的地方', check: '✅ 已覆盖边界测试', lessonId: resolveId('边界情况往往是最容易出错的地方', lessonMap) }
    ],
    fix: [
      { rule: '先分析问题再动手，理解问题本质是解决问题的一半', check: '✅ 已定位根因', lessonId: resolveId('先分析问题再动手，理解问题本质是解决问题的一半', lessonMap) },
      { rule: '修复后需要验证问题是否真正解决', check: '✅ 修复已验证通过', lessonId: resolveId('修复后需要验证问题是否真正解决', lessonMap) },
      { rule: '修复要完整：测试反映真实API', check: '✅ 修复覆盖所有相关处', lessonId: resolveId('修复要完整：测试反映真实API', lessonMap) },
      { rule: '修改代码前先运行测试验证当前状态', check: '✅ 当前测试已通过', lessonId: resolveId('修改代码前先运行测试验证当前状态', lessonMap) }
    ],
    refactor: [
      { rule: '复杂任务需要先制定计划再执行', check: '✅ 已制定重构计划', lessonId: resolveId('复杂任务需要先制定计划再执行', lessonMap) },
      { rule: '可维护的代码减少未来的麻烦', check: '✅ 重构后代码更清晰', lessonId: resolveId('可维护的代码减少未来的麻烦', lessonMap) },
      { rule: '删除模块前检查依赖或建兼容层', check: '✅ 无残留依赖', lessonId: resolveId('删除模块前检查依赖或建兼容层', lessonMap) },
      { rule: '提交前检查改动是否完整', check: '✅ 改动已审核完整', lessonId: resolveId('提交前检查改动是否完整', lessonMap) }
    ],
    security: [
      { rule: '_validatePath()验证路径防止越界', check: '✅ 路径验证到位', lessonId: resolveId('_validatePath()验证路径防止越界', lessonMap) },
      { rule: '禁止生产代码用mock数据', check: '✅ 无mock数据泄露', lessonId: resolveId('禁止生产代码用mock数据', lessonMap) },
      { rule: '使用 require 时，检查导出的是 class 还是 module.exports 对象', check: '✅ require使用正确', lessonId: resolveId('使用 require 时，检查导出的是 class 还是 module.exports 对象', lessonMap) }
    ],
    default: [
      { rule: '先分析问题再动手，理解问题本质是解决问题的一半', check: '✅ 已理解问题', lessonId: resolveId('先分析问题再动手，理解问题本质是解决问题的一半', lessonMap) },
      { rule: '复杂任务需要先制定计划再执行', check: '✅ 已制定计划', lessonId: resolveId('复杂任务需要先制定计划再执行', lessonMap) },
      { rule: '专注单一任务效率更高', check: '✅ 专注当前任务', lessonId: resolveId('专注单一任务效率更高', lessonMap) },
      { rule: '善用已有资源，避免重复造轮子', check: '✅ 已检查资源', lessonId: resolveId('善用已有资源，避免重复造轮子', lessonMap) }
    ]
  };
}

// 加载教训库详情
function loadLessonDetails() {
  try {
    if (fs.existsSync(LESSONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf8'));
      const map = {};
      data.lessons.forEach(function(l) { map[l.lesson] = l; });
      return map;
    }
  } catch (e) {
    // 教训文件未初始化，使用空映射
  }
  return {};
}

function main() {
  const taskType = process.argv[2] || 'default';
  const lessonMap = buildLessonMap();
  const rules = buildRules(lessonMap);
  const ruleSet = rules[taskType] || rules.default;
  const lessons = loadLessonDetails();
  
  console.log('========================================');
  console.log('🧠 大脑决策规则 - 任务类型: ' + taskType);
  console.log('========================================');
  console.log('');
  console.log('【以下规则必须逐条检查并遵守】');
  console.log('');
  
  ruleSet.forEach(function(r, i) {
    const detail = lessons[r.rule];
    const useCount = detail ? ' (已用' + (detail.useCount || 0) + '次)' : '';
    console.log('  ' + (i+1) + '. ' + r.rule + useCount);
    console.log('     Check: ' + r.check);
    console.log('     ID: ' + r.lessonId);
    console.log('');
  });
  
  // 显示 LessonReminder 相关教训
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📚 相关教训推荐 (LessonReminder)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const LessonReminder = require('./src/core/LessonReminder');
    const relevant = LessonReminder.getRelevantLessons(taskType, 3);
    if (relevant && relevant.length > 0) {
      relevant.forEach(function(l) {
        console.log('  ★ ' + l.lesson);
      });
    }
  } catch (e) {
    console.log('  (LessonReminder 未加载)');
  }
  
  console.log('');
  console.log('========================================');
  console.log('✅ 遵守以上规则后方可开始任务');
  console.log('========================================');
  
  // 增量 useCount: 被展示的教训使用次数+1
  try {
    if (fs.existsSync(LESSONS_FILE)) {
      var data = JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf8'));
      var changed = 0;
      ruleSet.forEach(function(r) {
        for (var j = 0; j < data.lessons.length; j++) {
          if (data.lessons[j].lesson === r.rule) {
            data.lessons[j].useCount = (data.lessons[j].useCount || 0) + 1;
            data.lessons[j].lastUsed = new Date().toISOString();
            changed++;
            break;
          }
        }
      });
      if (changed > 0) {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(LESSONS_FILE, JSON.stringify(data, null, 2));
      }
    }
  } catch (e) {
    // useCount 递增失败不影响规则展示
  }
}

main();
