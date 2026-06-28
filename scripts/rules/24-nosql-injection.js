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
  references: ['CWE-943'],
  since: '2026-06-28',
};
