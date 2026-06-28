module.exports = {
  id: 'EVAL_VARIANT',
  severity: 'HIGH',
  cwe: 'CWE-95',
  description: 'setTimeout/setInterval/Function 含动态字符串，可执行任意代码',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:setTimeout|setInterval|new Function)\s*\(/.test(line)) {
        const hasStringBuilding = /\$\{|['"`]\s*\+/.test(line) && /(?:return|alert|console|eval|process|require|fetch)/i.test(line);
        const isBareVariable = /setTimeout|setInterval/.test(line) && /\(\s*\w+\s*[,)]/.test(line) && !/\bfunction\b/.test(line) && !/=>/.test(line) && !/['"`]/.test(line);
        if (hasStringBuilding) {
          report('HIGH', 'EVAL_VARIANT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'setTimeout/setInterval/Function 含动态字符串，可执行任意代码');
        }
        if (isBareVariable && /code|script|cmd|command|input|payload|expr/i.test(line)) {
          report('MEDIUM', 'EVAL_VARIABLE_ARG', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'setTimeout/setInterval 含变量参数，若为字符串则等效 eval');
        }
      }
    }
  },
  references: ['CWE-95'],
  since: '2026-06-28',
};
