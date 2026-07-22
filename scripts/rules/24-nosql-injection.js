module.exports = {
  id: 'NOSQL_INJECTION',
  severity: 'HIGH',
  cwe: 'CWE-943',
  description: 'MongoDB 操作符中拼接/赋值用户输入，可能导致 NoSQL 注入',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\$\s*(?:where|gt|gte|lt|lte|ne|nin|regex|exists|type|mod|text|search)\s*[:=]/.test(line)) {
        const hasConcat = /\$\{|['"`]\s*\+/.test(line) && /req\.|body|query|params|\.username|\.password|\.email|\.search|\.input/i.test(line);
        const hasDirectAssignment = /\$\s*(?:regex|where)\s*[:=]\s*(?:req\.|body|query|params)/.test(line);
        if (hasConcat || hasDirectAssignment) {
          report('HIGH', 'NOSQL_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'MongoDB 操作符中拼接/赋值用户输入，可能导致 NoSQL 注入');
        }
      }
    }
  },
  suggest: '使用 MongoDB 的安全查询模式：避免将用户输入直接拼入 $where 操作符；对 $regex 输入进行转义（escapeRegex）；使用 schema 验证和白名单允许的操作符；优先使用 Mongoose 的类型化查询而非原生 MongoDB 驱动。',
  references: ['CWE-943'],
  since: '2026-06-28',
};
