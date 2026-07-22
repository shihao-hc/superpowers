const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['MISSING_HELMET'],
  description: '添加 helmet 导入和中间件',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const src = content;

    if (!/express\s*\(\)/.test(src) || /express\.Router/.test(src)) return null;

    if (/require\s*\(\s*['"]helmet['"]\s*\)/.test(src) || /\bhelmet\s*\(/.test(src)) return null;

    let hasImport = false;
    let importIdx = -1;
    let listenIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!hasImport && /require\s*\(\s*['"]express['"]\s*\)/.test(line)) {
        hasImport = true;
        importIdx = i;
      }
      if (listenIdx === -1 && /\.listen\s*\(/.test(line)) {
        listenIdx = i;
      }
    }

    if (importIdx === -1) return null;

    const changes = [];
    changes.push({ idx: importIdx + 1, text: `const helmet = require('helmet');` });

    if (listenIdx !== -1) {
      let useHelmet = false;
      for (let i = listenIdx; i >= 0 && i > listenIdx - 20; i--) {
        if (/\.use\s*\(\s*helmet\s*\(/.test(lines[i])) {
          useHelmet = true;
          break;
        }
      }
      if (!useHelmet) {
        changes.push({ idx: listenIdx, text: `app.use(helmet());` });
      }
    }

    changes.sort((a, b) => b.idx - a.idx);

    if (dryRun) {
      const result = changes.map(c => ({
        line: c.idx + 1,
        text: c.text
      }));
      return { file: match.file, dryRun: true, changes: result };
    }

    for (const c of changes) {
      lines.splice(c.idx, 0, c.text);
    }
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, fixed: true, changes: changes.length };
  }
});
