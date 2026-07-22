const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['NODE_ENV_CHECK_MISSING'],
  description: '添加 NODE_ENV 环境变量检查',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const src = content;

    if (/NODE_ENV/.test(src) && /production/.test(src) && /process\.env/.test(src)) return null;

    let insertIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (/require\s*\(/.test(lines[i])) {
        insertIdx = i + 1;
      }
    }

    if (dryRun) {
      return { file: match.file, changes: [
        { line: insertIdx + 1, text: '' },
        { line: insertIdx + 2, text: "if (process.env.NODE_ENV !== 'production') {" },
        { line: insertIdx + 3, text: "  console.log('Running in ' + process.env.NODE_ENV + ' mode');" },
        { line: insertIdx + 4, text: '}' },
      ]};
    }

    lines.splice(insertIdx, 0, "", "if (process.env.NODE_ENV !== 'production') {", "  console.log('Running in ' + process.env.NODE_ENV + ' mode');", "}");
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: insertIdx + 1, fixed: true };
  }
});
