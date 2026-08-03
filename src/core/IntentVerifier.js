/**
 * IntentVerifier - 输出前意图校验系统 (v10.1)
 * 防止答非所问
 *
 * Extracted from BrainSystem.js (v22.1)
 */

function verifyIntent(userQuestion, myAnswer) {
  const userLower = userQuestion.toLowerCase();
  const answerLower = myAnswer.toLowerCase();

  const intentChecks = [
    {
      pattern: /什么.*[是的]/i,
      expect: /是|定义|本质|核心|意思/i,
      fail: '回答缺少定义'
    },
    {
      pattern: /AI大脑|brain|意识/i,
      forbid: /检查|验证|56项/i,
      fail: '用检查代替了AI大脑定义'
    }
  ];

  const issues = [];
  for (const check of intentChecks) {
    if (check.pattern.test(userLower)) {
      if (check.expect && !check.expect.test(answerLower)) {
        issues.push(check.fail);
      }
      if (check.forbid && check.forbid.test(answerLower)) {
        issues.push(check.fail);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

module.exports = { verifyIntent };