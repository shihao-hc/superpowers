/**
 * 输入触发系统
 * 自动识别输入关键词并触发相关模块
 */
function autoTrigger(input) {
  const triggers = [];

  const emotionKeywords = /开心|难过|生气|害怕|高兴|伤心|愤怒|担心|兴奋|沮丧|满意|失望/i;
  if (emotionKeywords.test(input)) {
    triggers.push({ module: 'Emotion', triggered: true, reason: '输入包含情感词' });
  }

  const memoryKeywords = /记得|记住|以前|上次|之前|历史|回忆|曾经|过去|存储|保存/i;
  if (memoryKeywords.test(input)) {
    triggers.push({ module: 'Memory', triggered: true, reason: '输入包含记忆词' });
  }

  const taskKeywords = /执行|运行|运行|启动|创建|生成|修改|删除|更新|完成|实现/i;
  if (taskKeywords.test(input)) {
    triggers.push({ module: 'ToolExecutor', triggered: true, reason: '输入包含任务词' });
  }

  const personalityKeywords = /风格|语气|性格|表达|说话方式|回答方式/i;
  if (personalityKeywords.test(input)) {
    triggers.push({ module: 'Personality', triggered: true, reason: '输入包含人格词' });
  }

  const learningKeywords = /学习|教训|经验|改进|优化|提高|增强|反思|复盘/i;
  if (learningKeywords.test(input)) {
    triggers.push({ module: 'Evolution', triggered: true, reason: '输入包含学习词' });
  }

  const toolKeywords = /代码|脚本|文件|命令|运行|编译|测试|检查|验证/i;
  if (toolKeywords.test(input)) {
    triggers.push({ module: 'ToolManager', triggered: true, reason: '输入包含工具词' });
  }

  const reverseKeywords = /反过来|反之|如果错了|反例|反向|相反|换个角度/i;
  if (reverseKeywords.test(input)) {
    triggers.push({ module: 'ReverseThinking', triggered: true, reason: '输入包含逆向词' });
  }

  const plannerKeywords = /计划|规划|步骤|流程|安排|先后|顺序|下一步/i;
  if (plannerKeywords.test(input)) {
    triggers.push({ module: 'Planner', triggered: true, reason: '输入包含规划词' });
  }

  const dreamKeywords = /目标|梦想|愿望|想要|希望|未来|理想|愿景/i;
  if (dreamKeywords.test(input)) {
    triggers.push({ module: 'Dream', triggered: true, reason: '输入包含目标词' });
  }

  const ethicsKeywords = /安全|风险|危险|隐私|敏感|合规|法律|道德|伦理|禁止/i;
  if (ethicsKeywords.test(input)) {
    triggers.push({ module: 'Ethics', triggered: true, reason: '输入包含安全词' });
  }

  const verifyKeywords = /验证|校验|检查|测试|确认|核实|证明/i;
  if (verifyKeywords.test(input)) {
    triggers.push({ module: 'Verifier', triggered: true, reason: '输入包含验证词' });
  }

  const improveKeywords = /改进|优化|重构|改善|提升|增强|修复/i;
  if (improveKeywords.test(input)) {
    triggers.push({ module: 'CodeImprover', triggered: true, reason: '输入包含改进词' });
  }

  const securityKeywords = /安全扫描|漏洞|威胁|攻击|入侵|泄露|密码|密钥/i;
  if (securityKeywords.test(input)) {
    triggers.push({ module: 'Security', triggered: true, reason: '输入包含安全扫描词' });
  }

  const agentKeywords = /多个|并行|协作|团队|分配|协调|合作/i;
  if (agentKeywords.test(input)) {
    triggers.push({ module: 'Agents', triggered: true, reason: '输入包含Agent词' });
  }

  const skillKeywords = /skill|技能|模板|提示词|角色|系统/i;
  if (skillKeywords.test(input)) {
    triggers.push({ module: 'SkillRecognizer', triggered: true, reason: '输入包含Skill词' });
  }

  const comprehensiveKeywords = /全方面|56项|全面检查|完整检查|所有项/i;
  if (comprehensiveKeywords.test(input)) {
    triggers.push({ module: 'ComprehensiveChecker', triggered: true, reason: '输入包含全面检查词' });
  }

  const introspectionKeywords = /深度|内省|反思|思考|分析|探讨|研究/i;
  if (introspectionKeywords.test(input)) {
    triggers.push({ module: 'Introspection', triggered: true, reason: '输入包含深度思考词' });
  }

  const enhancedMemoryKeywords = /记忆|存储|保存|长期|短期|上下文|会话/i;
  if (enhancedMemoryKeywords.test(input)) {
    triggers.push({ module: 'EnhancedMemory', triggered: true, reason: '输入包含增强记忆词' });
  }

  const controllerKeywords = /思考|思维|流程|控制|协调/i;
  if (controllerKeywords.test(input)) {
    triggers.push({ module: 'Controller', triggered: true, reason: '输入包含控制器词' });
  }

  return {
    triggers,
    count: triggers.length,
    input: input.substring(0, 50)
  };
}

module.exports = { autoTrigger };