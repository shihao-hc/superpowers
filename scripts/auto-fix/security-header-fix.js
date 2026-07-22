const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['SENSITIVE_HEADER_EXPOSED'],
  description: '禁用 X-Powered-By 头',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const src = content;

    if (!/require\s*\(\s*['"]express['"]\s*\)/.test(src) && !/from\s+['"]express['"]/.test(src)) return null;
    if (/\.disable\s*\(\s*['"]x-powered-by['"]\s*\)/.test(src)) return null;
    if (/app\.set\s*\(\s*['"]x-powered-by['"]\s*,\s*false\s*\)/.test(src)) return null;

    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/app\s*=\s*express\s*\(\)/.test(line) || /const\s+app\s*=/.test(line)) {
        insertIdx = i + 1;
      }
    }
    if (insertIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/require\s*\(\s*['"]express['"]\s*\)/.test(lines[i])) {
          insertIdx = i + 2;
        }
      }
    }
    if (insertIdx === -1 || insertIdx >= lines.length) return null;

    if (dryRun) {
      return { file: match.file, line: insertIdx + 1, text: "app.disable('x-powered-by');" };
    }

    lines.splice(insertIdx, 0, "app.disable('x-powered-by');");
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: insertIdx + 1, fixed: true };
  }
});
