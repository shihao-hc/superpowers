module.exports = {
  id: 'ERROR_MESSAGE_LEAK',
  severity: 'MEDIUM',
  cwe: 'CWE-209',
  description: 'error.message 直接返回客户端，应用通用错误消息替代',
  enabled: true,
  patterns: [
    /\.json\(\s*\{[^}]*error:\s*error\.message\s*\}/
  ],
  references: ['CWE-209'],
  since: '2026-06-28',
};
