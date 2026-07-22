const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['MISSING_BODY_LIMIT'],
  description: '为 express.json/urlencoded 添加显式 limit 参数',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const lines = content.split('\n');

    // Pre-check: skip if next 3 lines already have limit config
    for (let j = 1; j <= 3; j++) {
      if (lineNum + j < lines.length && /limit\s*[:=]/.test(lines[lineNum + j])) {
        return null;
      }
    }

    const line = lines[lineNum];
    let replacement;
    if (/express\.(json|urlencoded)\s*\(\s*\{/.test(line)) {
      replacement = line.replace(/(\{)/, '$1\n    limit: \'1mb\',');
    } else if (/express\.(json|urlencoded)\s*\(\)/.test(line)) {
      replacement = line.replace(/\(\)/, '({ limit: \'1mb\' })');
    } else if (/express\.(json|urlencoded)\s*\(\s*$/.test(line)) {
      replacement = line.replace(/(\s*)$/, ' { limit: \'1mb\' }$1');
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
