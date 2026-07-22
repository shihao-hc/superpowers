const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['EMPTY_CATCH'],
  description: '为空 catch 块添加注释',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const lines = content.split('\n');
    const line = lines[lineNum];

    if (!/catch/.test(line)) return null;
    let replacement = line;
    if (/\{\s*$/.test(line)) {
      replacement = line.replace(/\{\s*$/, '{ // ignored intentionally');
    } else if (/\{\s*return/.test(line)) {
      replacement = line.replace(/\{\s*return/, '{ /* ignored */ return');
    } else if (/\{\s*\w+\.\w+\s*=/.test(line)) {
      replacement = line.replace(/\{\s*/, '{ /* ignored */ ');
    } else {
      return null;
    }

    if (dryRun) {
      return { file: match.file, line: lineNum + 1, before: line.trim(), after: replacement.trim() };
    }

    lines[lineNum] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: lineNum + 1, fixed: true };
  }
});
