const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['WEAK_HASH'],
  description: '替换 md5/sha1 为 sha256',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const lines = content.split('\n');
    const line = lines[lineNum];

    const replacement = line
      .replace(/['"`]md5['"`]/g, "'sha256'")
      .replace(/['"`]sha1['"`]/g, "'sha256'");

    if (dryRun) {
      return { file: match.file, line: lineNum + 1, before: line.trim(), after: replacement.trim() };
    }

    lines[lineNum] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: lineNum + 1, fixed: true };
  }
});
