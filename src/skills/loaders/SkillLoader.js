/**
 * SKILL.md 解析器
 * 支持 GitHub Agent Skills 标准格式
 *
 * 标准格式:
 * skill-name/
 *   - SKILL.md (必需)
 *   - scripts/ (可选)
 *   - references/ (可选)
 *   - assets/ (可选)
 */

const { splitLines } = require('../../utils/UltraWorkUtils');

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, content: content.trim() };
  }

  const yamlStr = match[1];
  const body = match[2].trim();
  const metadata = parseYamlSimple(yamlStr);

  return { metadata, content: body };
}

/**
 * 简化 YAML 解析器 (仅支持基本格式)
 */
function parseYamlSimple(yamlStr) {
  const result = {};
  const lines = splitLines(yamlStr);
  let currentKey = null;
  let _currentIndent = 0;
  let inArray = false;
  let arrayValues = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {continue;}

    const indent = line.search(/\S/);

    // 数组项
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      if (value.includes('\'') || value.includes('"')) {
        arrayValues.push(parseString(value));
      } else {
        arrayValues.push(value);
      }
      inArray = true;
      continue;
    }

    // 保存之前的数组
    if (inArray && currentKey) {
      result[currentKey] = arrayValues;
      arrayValues = [];
      inArray = false;
    }

    // 键值对
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      if (value === '' || value === '|') {
        currentKey = key;
        _currentIndent = indent;
        continue;
      }

      // 解析字符串值
      if (value.startsWith('\'') && value.endsWith('\'')) {
        value = value.slice(1, -1);
      } else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      result[key] = value;
      currentKey = null;
    }
  }

  // 保存最后的数组
  if (inArray && currentKey) {
    result[currentKey] = arrayValues;
  }

  return result;
}

/**
 * 解析引号字符串
 */
function parseString(str) {
  if (str.startsWith('\'') && str.endsWith('\'')) {
    return str.slice(1, -1);
  }
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return str;
}

module.exports = { parseFrontmatter, parseYamlSimple };
