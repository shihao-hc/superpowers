const fs = require('fs');
const { register } = require('./index');

register({
  ruleIds: ['VAR_DECLARATION'],
  description: '将 var 替换为 const 或 let',

  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const lines = content.split('\n');
    const line = lines[lineNum];

    const varMatch = line.match(/\bvar\s+(\w+)\s*=/);
    if (!varMatch) return null;

    const varName = varMatch[1];
    const idx = content.indexOf(line.trim());
    const afterDecl = content.slice(idx + line.trim().length);
    const isReassigned = new RegExp('\\b' + varName + '\\s*=').test(afterDecl);
    const keyword = isReassigned ? 'let' : 'const';
    const replacement = line.replace(/\bvar\s+/, keyword + ' ');

    if (replacement === line) return null;

    if (dryRun) {
      return { file: match.file, line: lineNum + 1, before: line.trim(), after: replacement.trim() };
    }

    lines[lineNum] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: lineNum + 1, fixed: true };
  }
});
