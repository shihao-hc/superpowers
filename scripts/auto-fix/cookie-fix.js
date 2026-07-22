const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['COOKIE_WITHOUT_SECURE', 'COOKIE_WITHOUT_HTTPONLY'],
  description: '为 cookie 添加 Secure/HttpOnly 标志',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const lines = content.split('\n');
    const line = lines[lineNum];

    if (!/res\.cookie/.test(line)) return null;
    const key = match.ruleId === 'COOKIE_WITHOUT_SECURE' ? 'secure' : 'httpOnly';
    if (new RegExp('\\b' + key + '\\s*:(?!\\s*false\\b)').test(line)) return null;

    const closeIdx = line.lastIndexOf('}');
    if (closeIdx === -1) return null;

    const chunk = line.slice(0, closeIdx).replace(/\s+$/, '');
    const needsComma = /\S/.test(chunk) && !/,\s*$/.test(chunk) && !/\{\s*$/.test(chunk);
    const flag = key + ': true';
    const replacement = chunk + (needsComma ? ', ' : ' ') + flag + line.slice(closeIdx);

    if (replacement === line) return null;

    if (dryRun) {
      return { file: match.file, line: lineNum + 1, before: line.trim(), after: replacement.trim() };
    }

    lines[lineNum] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: lineNum + 1, fixed: true };
  }
});
