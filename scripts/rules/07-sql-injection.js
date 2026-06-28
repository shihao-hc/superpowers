module.exports = {
  id: 'SQL_INJECTION',
  severity: 'HIGH',
  cwe: 'CWE-89',
  description: '可能的 SQL 注入 — 使用参数化查询或 ORM',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM/i.test(line)) {
        if (/\$\{/.test(line) || /['"`]\s*\+/.test(line)) {
          if (/\.query\(|\.execute\(|WHERE\s+\w+\s*=\s*\?|WHERE\s+\w+\s*=\s*\$|sequelize|knex|prisma|typeorm|escape\(|sanitize\(/.test(line)) continue;
          if (/LIMIT\s+\$\{|OFFSET\s+\$\{|ORDER BY\s+\$\{/.test(line)) continue;
          if (/^(const|let|var)\s+\w+\s*=/.test(line.trim())) continue;
          report('HIGH', 'SQL_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '可能的 SQL 注入 — 使用参数化查询或 ORM');
        }
      }
    }
  },
  references: ['CWE-89'],
  since: '2026-06-28',
};
