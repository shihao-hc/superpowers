const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['INSECURE_RANDOM'],
  description: '替换 Math.random() 为 crypto.randomBytes()',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const line = lines[lineNum];

    const replacement = line.replace(/Math\.random\(\)/, 'crypto.randomBytes(6).toString(\'hex\')');

    if (dryRun) {
      return { file: match.file, line: lineNum + 1, before: line.trim(), after: replacement.trim() };
    }

    const hasCryptoRequire = content.includes("require('crypto')") || content.includes('require("crypto")');
    if (!hasCryptoRequire) {
      lines.unshift(`const crypto = require('crypto');`);
    }
    lines[lineNum] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: lineNum + 1, fixed: true };
  }
});
