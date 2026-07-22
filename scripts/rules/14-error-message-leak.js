module.exports = {
  id: 'ERROR_MESSAGE_LEAK',
  severity: 'MEDIUM',
  cwe: 'CWE-209',
  description: 'error.message 直接返回客户端，应用通用错误消息替代',
  enabled: true,
  patterns: [
    /\.json\(\s*\{[^}]*error:\s*error\.message\s*\}/
  ],
  suggest: '返回通用错误消息替代 error.message：res.status(500).json({ error: "服务器内部错误" })。在开发环境可以记录完整错误栈但不要返回给客户端。使用错误码映射表将内部错误转换为用户安全的消息。',
  references: ['CWE-209'],
  since: '2026-06-28',
};
