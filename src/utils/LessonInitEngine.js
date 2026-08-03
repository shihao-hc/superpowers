/**
 * LessonInitEngine - 预设教训库初始化
 *
 * 初始化34条核心经验和清理无效的设计笔记教训
 */

class LessonInitEngine {
  constructor(bs) {
    this.bs = bs;
  }

  _initDefaultLessons() {
    const bs = this.bs;
    const existingStats = bs.lessonLibrary.getStats();

    if (existingStats.total > 0) {
      const designNotes = bs.lessonLibrary.lessons.filter((l) =>
        l.lesson.includes('需要感知层') ||
        l.lesson.includes('需要执行器') ||
        l.lesson.includes('需要意识控制') ||
        l.lesson.includes('需要静默思考') ||
        l.lesson.includes('需要超越会话') ||
        l.lesson.includes('需要情感系统') ||
        l.lesson.includes('需要价值观') ||
        l.lesson.includes('需要人格系统') ||
        l.lesson.includes('需要关系系统') ||
        l.lesson.includes('需要目标系统') ||
        l.lesson.includes('需要伦理系统') ||
        l.lesson.includes('需要自动验证') ||
        l.lesson.includes('唯一测试教训') ||
        l.lesson.includes('模块间协作正常') ||
        l.lesson.includes('AI大脑能够') ||
        l.lesson.includes('这是一个测试教训') ||
        l.lesson.includes('执行 shouldSell')
      );

      if (designNotes.length > 0) {
        console.log(`[BrainSystem] 清理 ${designNotes.length} 条无效教训`);
        for (const l of designNotes) {
          l.applied = true;
        }
        bs.lessonLibrary._save();
      }
    }

    const defaultLessons = [
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '遇到问题直接开始解决，没有先分析', lesson: '先分析问题再动手，理解问题本质是解决问题的一半', improvement: '使用"先思考再行动"的习惯' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '做任务时没有先制定计划', lesson: '复杂任务需要先制定计划再执行', improvement: '任务开始前强制思考步骤' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '没有检查代码是否符合项目规范', lesson: '遵循项目规范能减少错误和返工', improvement: '添加lint检查步骤' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '直接修改代码不先测试', lesson: '修改代码前先运行测试验证当前状态', improvement: '修改前先运行测试' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '没有理解需求就开始编码', lesson: '理解需求是开发的第一步', improvement: '先阅读文档或询问清楚' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '同时做多个任务导致效率低', lesson: '专注单一任务效率更高', improvement: '使用番茄工作法' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '没有定期回顾和总结经验', lesson: '定期复盘能持续改进', improvement: '每天/每周做一次复盘' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '遇到困难就跳过不解决', lesson: '面对困难是成长的机会', improvement: '记录问题并尝试解决' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '没有验证修复是否真正解决了问题', lesson: '修复后需要验证问题是否真正解决', improvement: '修复后重新测试' },
      { category: 'thinking', type: 'mistake', priority: 'high', problem: '没有记录解决方案以便将来参考', lesson: '好记性不如烂笔头', improvement: '记录问题和解决方案' },
      { category: 'tool', type: 'mistake', priority: 'high', problem: '不知道有哪些工具可用', lesson: '了解可用工具能大幅提高效率', improvement: '熟悉所有工具能力' },
      { category: 'tool', type: 'mistake', priority: 'high', problem: '用错工具导致效率低', lesson: '选择合适的工具事半功倍', improvement: '了解工具适用场景' },
      { category: 'tool', type: 'mistake', priority: 'high', problem: '没有利用已有的工具和技能', lesson: '善用已有资源，避免重复造轮子', improvement: '先检查是否已有解决方案' },
      { category: 'tool', type: 'mistake', priority: 'high', problem: '不知道某个技能的存在', lesson: '了解技能系统能发现更多可能', improvement: '定期查看技能列表' },
      { category: 'tool', type: 'mistake', priority: 'high', problem: '手动操作可以自动化却没做', lesson: '自动化重复任务能节省大量时间', improvement: '识别可自动化的任务' },
      { category: 'tool', type: 'mistake', priority: 'high', problem: '没有使用代码搜索工具', lesson: '搜索现有代码能避免重复和发现模式', improvement: '使用grep/搜索工具' },
      { category: 'tool', type: 'mistake', priority: 'high', problem: '不使用版本控制查看历史', lesson: 'git历史能帮助理解代码演变', improvement: '经常查看git log' },
      { category: 'pattern', type: 'success', priority: 'high', problem: '没有意识到类似的之前做过', lesson: '识别模式能快速复用经验', improvement: '遇到新问题先思考是否见过类似' },
      { category: 'pattern', type: 'success', priority: 'high', problem: '成功解决问题后没有总结', lesson: '总结经验能形成可复用模式', improvement: '解决问题后做记录' },
      { category: 'pattern', type: 'success', priority: 'high', problem: '没有把好的实践变成习惯', lesson: '好习惯需要重复养成', improvement: '坚持执行好的实践' },
      { category: 'pattern', type: 'mistake', priority: 'high', problem: '忽略项目中已有的模式', lesson: '遵循项目约定能减少理解成本', improvement: '先了解项目约定' },
      { category: 'pattern', type: 'mistake', priority: 'high', problem: '没有把常用的代码片段存档', lesson: '建立个人代码库提高效率', improvement: '整理常用代码片段' },
      { category: 'pattern', type: 'mistake', priority: 'high', problem: '解决后没有思考是否可应用到其他地方', lesson: '一个解决方案可能有多种用途', improvement: '多思考通用性' },
      { category: 'mistake', type: 'mistake', priority: 'medium', problem: '提交了不完整的代码', lesson: '提交前检查改动是否完整', improvement: '使用git diff检查' },
      { category: 'mistake', type: 'mistake', priority: 'medium', problem: '写了没有测试的代码', lesson: '测试是代码质量的基础', improvement: '为新代码添加测试' },
      { category: 'mistake', type: 'mistake', priority: 'medium', problem: '创建了不必要的文件', lesson: '保持项目整洁很重要', improvement: '删除不需要的文件' },
      { category: 'mistake', type: 'mistake', priority: 'medium', problem: '提交信息不清楚', lesson: '清晰的提交信息便于追溯', improvement: '写描述性提交信息' },
      { category: 'success', type: 'success', priority: 'medium', problem: '没有分享好的解决方案', lesson: '分享能帮助他人也能加深理解', improvement: '记录并分享经验' },
      { category: 'success', type: 'success', priority: 'medium', problem: '没有利用好代码审查', lesson: '代码审查是学习的好机会', improvement: '认真对待审查意见' },
      { category: 'success', type: 'success', priority: 'medium', problem: '没有主动寻求反馈', lesson: '反馈能帮助发现盲点', improvement: '主动询问反馈' },
      { category: 'success', type: 'success', priority: 'medium', problem: '没有把学到的知识巩固', lesson: '知识需要复习才能牢记', improvement: '定期复习学到的内容' },
      { category: 'thinking', type: 'mistake', priority: 'medium', problem: '没有考虑边界情况', lesson: '边界情况往往是最容易出错的地方', improvement: '列出所有边界情况' },
      { category: 'thinking', type: 'mistake', priority: 'medium', problem: '没有考虑代码的可维护性', lesson: '可维护的代码减少未来的麻烦', improvement: '写代码时考虑可读性' },
      { category: 'thinking', type: 'mistake', priority: 'medium', problem: '没有考虑性能影响', lesson: '性能问题往往在后期影响明显', improvement: '关注代码复杂度' }
    ];

    let added = 0;
    for (const lesson of defaultLessons) {
      try {
        bs.lessonLibrary.add(lesson);
        added++;
      } catch (e) {
        console.warn('[BrainSystem] Skipping duplicate/invalid lesson:', e.message);
      }
    }

    console.log(`[BrainSystem] 已初始化 ${added} 条预设教训`);
  }
}

module.exports = LessonInitEngine;
