module.exports = {
  id: 'DUPLICATE_OBJECT_KEY',
  severity: 'LOW',
  cwe: 'CWE-1104',
  description: '对象字面量中存在重复键',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    // 帧追踪: 跟踪对象字面量边界, 仅在同一个对象内检测重复键
    // stack 元素: { keys: Set, indent: number, type: 'object' | 'other' }
    // 跳过模板字符串块 (反引号可跨行), 防止 YAML/SQL/文档内容被误判为 JS 对象
    const stack = [];
    let inTemplate = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      // 模板字符串内: 只追踪反引号闭合, 不做任何键/括号处理
      const backtickCount = countUnescaped(raw, '`');
      if (inTemplate) {
        if (backtickCount % 2 === 1) {inTemplate = false;}
        continue;
      }
      if (backtickCount % 2 === 1) {inTemplate = true;}
      if (inTemplate) {continue;}

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {continue;}
      const indent = raw.match(/^\s*/)[0].length;

      // 1. 处理当前行的键 (仅当行内容形如 `key:` 且当前在对象内)
      if (/^[\w$]+:/.test(trimmed)) {
        const keyMatch = trimmed.match(/^([\w$]+):/);
        const top = stack[stack.length - 1];
        if (keyMatch && top && top.type === 'object' && top.indent <= indent) {
          const key = keyMatch[1];
          if (top.keys.has(key)) {
            report('LOW', 'DUPLICATE_OBJECT_KEY', `行 ${i + 1}: 重复键 "${key}"`, '对象字面量中存在重复键');
            return;
          }
          top.keys.add(key);
        }
      }

      // 2. 解析括号, 更新帧栈
      let inString = null;
      for (let j = 0; j < raw.length; j++) {
        const ch = raw[j];
        if (inString) {
          if (ch === '\\') {j++;}
          else if (ch === inString) {inString = null;}
          continue;
        }
        if (ch === '"' || ch === "'") {inString = ch; continue;}
        if (ch === '{') {
          stack.push({ keys: new Set(), indent, type: 'object' });
        } else if (ch === '}') {
          if (stack.length > 0) {stack.pop();}
        } else if (ch === '[') {
          stack.push({ keys: new Set(), indent, type: 'other' });
        } else if (ch === ']') {
          if (stack.length > 0 && stack[stack.length - 1].type === 'other') {stack.pop();}
        }
      }
    }
  },
  suggest: '删除多余的重复键，只保留意图正确的那个。如果两个键值不同，可能是复制粘贴错误，需要合并或重命名其中一个。',
  references: ['CWE-1104'],
  since: '2026-06-28',
};

function countUnescaped(str, ch) {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') {i++;}
    else if (str[i] === ch) {count++;}
  }
  return count;
}
