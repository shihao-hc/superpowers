const { autoTrigger } = require('../../src/core/InputTrigger');

describe('InputTrigger.autoTrigger', () => {
  test('returns empty triggers for empty input', () => {
    const result = autoTrigger('');
    expect(result.triggers).toEqual([]);
    expect(result.count).toBe(0);
  });

  test('returns empty triggers for non-keyword input', () => {
    const result = autoTrigger('你好，今天天气不错');
    expect(result.count).toBe(0);
  });

  test.each([
    ['开心', 'Emotion'],
    ['难过', 'Emotion'],
    ['生气', 'Emotion'],
    ['害怕', 'Emotion'],
    ['高兴', 'Emotion'],
    ['伤心', 'Emotion'],
    ['愤怒', 'Emotion'],
    ['担心', 'Emotion'],
    ['兴奋', 'Emotion'],
    ['沮丧', 'Emotion'],
    ['满意', 'Emotion'],
    ['失望', 'Emotion'],
  ])('emotion keywords: %s -> Emotion', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['记得', 'Memory'],
    ['记住', 'Memory'],
    ['以前', 'Memory'],
    ['上次', 'Memory'],
    ['之前', 'Memory'],
    ['历史', 'Memory'],
    ['回忆', 'Memory'],
    ['曾经', 'Memory'],
    ['过去', 'Memory'],
    ['存储', 'Memory'],
    ['保存', 'Memory'],
  ])('memory keywords: %s -> Memory', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['执行', 'ToolExecutor'],
    ['启动', 'ToolExecutor'],
    ['创建', 'ToolExecutor'],
    ['生成', 'ToolExecutor'],
    ['修改', 'ToolExecutor'],
    ['删除', 'ToolExecutor'],
    ['更新', 'ToolExecutor'],
    ['完成', 'ToolExecutor'],
    ['实现', 'ToolExecutor'],
  ])('task keywords: %s -> ToolExecutor', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['风格', 'Personality'],
    ['语气', 'Personality'],
    ['性格', 'Personality'],
    ['表达', 'Personality'],
    ['说话方式', 'Personality'],
    ['回答方式', 'Personality'],
  ])('personality keywords: %s -> Personality', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['学习', 'Evolution'],
    ['教训', 'Evolution'],
    ['经验', 'Evolution'],
    ['改进', 'Evolution'],
    ['优化', 'Evolution'],
    ['提高', 'Evolution'],
    ['增强', 'Evolution'],
    ['复盘', 'Evolution'],
  ])('learning keywords: %s -> Evolution', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['代码', 'ToolManager'],
    ['脚本', 'ToolManager'],
    ['文件', 'ToolManager'],
    ['命令', 'ToolManager'],
    ['编译', 'ToolManager'],
    ['运行', 'ToolManager'],
  ])('tool keywords: %s -> ToolManager', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['反过来', 'ReverseThinking'],
    ['反之', 'ReverseThinking'],
    ['如果错了', 'ReverseThinking'],
    ['反例', 'ReverseThinking'],
    ['反向', 'ReverseThinking'],
    ['相反', 'ReverseThinking'],
    ['换个角度', 'ReverseThinking'],
  ])('reverse keywords: %s -> ReverseThinking', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['计划', 'Planner'],
    ['规划', 'Planner'],
    ['步骤', 'Planner'],
    ['流程', 'Planner'],
    ['安排', 'Planner'],
    ['先后', 'Planner'],
    ['顺序', 'Planner'],
    ['下一步', 'Planner'],
  ])('planner keywords: %s -> Planner', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['目标', 'Dream'],
    ['梦想', 'Dream'],
    ['愿望', 'Dream'],
    ['想要', 'Dream'],
    ['希望', 'Dream'],
    ['未来', 'Dream'],
    ['理想', 'Dream'],
    ['愿景', 'Dream'],
  ])('dream keywords: %s -> Dream', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['风险', 'Ethics'],
    ['危险', 'Ethics'],
    ['隐私', 'Ethics'],
    ['敏感', 'Ethics'],
    ['合规', 'Ethics'],
    ['法律', 'Ethics'],
    ['道德', 'Ethics'],
    ['伦理', 'Ethics'],
    ['禁止', 'Ethics'],
  ])('ethics keywords: %s -> Ethics', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['验证', 'Verifier'],
    ['校验', 'Verifier'],
    ['确认', 'Verifier'],
    ['核实', 'Verifier'],
    ['证明', 'Verifier'],
  ])('verify keywords: %s -> Verifier', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['重构', 'CodeImprover'],
    ['改善', 'CodeImprover'],
    ['提升', 'CodeImprover'],
    ['修复', 'CodeImprover'],
  ])('improve keywords: %s -> CodeImprover', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['安全扫描', 'Security'],
    ['漏洞', 'Security'],
    ['威胁', 'Security'],
    ['攻击', 'Security'],
    ['入侵', 'Security'],
    ['泄露', 'Security'],
    ['密码', 'Security'],
    ['密钥', 'Security'],
  ])('security keywords: %s -> Security', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['多个', 'Agents'],
    ['并行', 'Agents'],
    ['协作', 'Agents'],
    ['团队', 'Agents'],
    ['分配', 'Agents'],
    ['协调', 'Agents'],
    ['合作', 'Agents'],
  ])('agent keywords: %s -> Agents', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['skill', 'SkillRecognizer'],
    ['技能', 'SkillRecognizer'],
    ['模板', 'SkillRecognizer'],
    ['提示词', 'SkillRecognizer'],
    ['角色', 'SkillRecognizer'],
    ['系统', 'SkillRecognizer'],
  ])('skill keywords: %s -> SkillRecognizer', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['全方面', 'ComprehensiveChecker'],
    ['56项', 'ComprehensiveChecker'],
    ['全面检查', 'ComprehensiveChecker'],
    ['完整检查', 'ComprehensiveChecker'],
    ['所有项', 'ComprehensiveChecker'],
  ])('comprehensive keywords: %s -> ComprehensiveChecker', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['深度', 'Introspection'],
    ['内省', 'Introspection'],
    ['思考', 'Introspection'],
    ['分析', 'Introspection'],
    ['探讨', 'Introspection'],
    ['研究', 'Introspection'],
  ])('introspection keywords: %s -> Introspection', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['记忆', 'EnhancedMemory'],
    ['长期', 'EnhancedMemory'],
    ['短期', 'EnhancedMemory'],
    ['上下文', 'EnhancedMemory'],
    ['会话', 'EnhancedMemory'],
  ])('enhanced memory keywords: %s -> EnhancedMemory', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test.each([
    ['思维', 'Controller'],
    ['控制', 'Controller'],
  ])('controller keywords: %s -> Controller', (input, module) => {
    const result = autoTrigger(input);
    expect(result.triggers.map((t) => t.module)).toContain(module);
  });

  test('multi-keyword input triggers multiple modules', () => {
    const result = autoTrigger('请帮我计划学习目标');
    const modules = result.triggers.map((t) => t.module);
    expect(modules).toContain('Planner');
    expect(modules).toContain('Evolution');
    expect(modules).toContain('Dream');
    expect(result.count).toBeGreaterThan(1);
  });

  test('triggers carry reason text', () => {
    const result = autoTrigger('我很开心');
    expect(result.triggers[0]).toMatchObject({
      module: 'Emotion',
      triggered: true,
    });
    expect(result.triggers[0].reason).toContain('情感词');
  });

  test('input is truncated to 50 chars', () => {
    const longInput = '这是一段超过五十个字符的测试输入内容，用来验证输入截断功能是否正常工作';
    const result = autoTrigger(longInput);
    expect(result.input).toBe(longInput.substring(0, 50));
    expect(result.input.length).toBeLessThanOrEqual(50);
  });

  test('short input is preserved', () => {
    const result = autoTrigger('验证一下');
    expect(result.input).toBe('验证一下');
  });
});
