const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['TRUST_PROXY_MISSING'],
  description: '添加 trust proxy 配置',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const src = content;

    if (!/require\s*\(\s*['"]express['"]\s*\)/.test(src) && !/from\s+['"]express['"]/.test(src)) return null;
    if (/trust\s*proxy/i.test(src)) return null;

    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/app\s*=\s*express\s*\(\)/.test(lines[i]) || /const\s+app\s*=/.test(lines[i])) {
        insertIdx = i + 1;
      }
    }
    if (insertIdx === -1) return null;

    if (dryRun) {
      return { file: match.file, line: insertIdx + 1, text: "app.set('trust proxy', 1);" };
    }

    lines.splice(insertIdx, 0, "app.set('trust proxy', 1);");
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: insertIdx + 1, fixed: true };
  }
});
