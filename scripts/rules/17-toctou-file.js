module.exports = {
  id: 'TOCTOU_FILE',
  severity: 'MEDIUM',
  cwe: 'CWE-367',
  description: 'existsSync + 文件操作未包 try-catch，存在 TOCTOU 竞态条件',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length - 5; i++) {
      if (/existsSync/.test(lines[i]) && /unlinkSync|renameSync|writeFileSync/.test(lines[i + 1]) ||
          /existsSync/.test(lines[i]) && /unlinkSync|renameSync|writeFileSync/.test(lines[i + 2])) {
        const block = lines.slice(Math.max(0, i - 2), i + 6).join('\n');
        if (!block.includes('try') && !block.includes('catch')) {
          report('MEDIUM', 'TOCTOU_FILE', `existsSync + 文件操作未包 try-catch (行 ${i + 1})`, lines[i].trim());
        }
      }
    }
  },
  suggest: '用 try-catch 包裹文件操作代替 existsSync 检查，避免 TOCTOU 竞态。例如：\n    try { await fs.promises.unlink(path); } catch (e) { if (e.code !== "ENOENT") throw e; }',
  references: ['CWE-367'],
  since: '2026-06-28',
};
