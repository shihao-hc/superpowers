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
          if (/WHERE\s+\w+\s*=\s*\?|WHERE\s+\w+\s*=\s*\$|sequelize|knex|prisma|typeorm|escape\(|sanitize\(/.test(line)) continue;
          if (/LIMIT\s+\$\{|OFFSET\s+\$\{|ORDER BY\s+\$\{/.test(line)) continue;
          if (/^(const|let|var)\s+\w+\s*=/.test(line.trim())) continue;
          report('HIGH', 'SQL_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '可能的 SQL 注入 — 使用参数化查询或 ORM');
        }
      }
    }
  },
  suggest: '将字符串拼接 SQL 替换为参数化查询：使用 ? 占位符（mysql2/sequelize）、$1 占位符（pg）或 ORM 方法。例如：db.query("SELECT * FROM users WHERE id = ?", [userId])。禁止直接拼接用户输入到 SQL 语句。',
  references: ['CWE-89'],
  since: '2026-06-28',
};
