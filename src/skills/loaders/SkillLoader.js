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

const fs = require('fs');
const path = require('path');

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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
  const lines = yamlStr.split('\n');
  let currentKey = null;
  let currentIndent = 0;
  let inArray = false;
  let arrayValues = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const indent = line.search(/\S/);
    
    // 数组项
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      if (value.includes("'") || value.includes('"')) {
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
        currentIndent = indent;
        continue;
      }
      
      // 解析字符串值
      if (value.startsWith("'") && value.endsWith("'")) {
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
  if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1);
  }
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return str;
}

class SkillLoader {
  constructor(skillsDir = path.join(process.cwd(), 'src', 'skills')) {
    this.skillsDir = skillsDir;
    this.skillCache = new Map();
  }
  
  /**
   * 加载技能目录的 SKILL.md
   */
  loadSkill(skillPath) {
    const skillDir = path.isAbsolute(skillPath) ? skillPath : path.join(this.skillsDir, skillPath);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    
    if (!fs.existsSync(skillMdPath)) {
      return null;
    }
    
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const { metadata, content: body } = parseFrontmatter(content);
    
    const skill = {
      name: metadata.name || path.basename(skillDir),
      description: metadata.description || '',
      path: skillDir,
      content: body,
      metadata: metadata,
      files: this._scanSkillFiles(skillDir),
      scripts: this._loadScripts(skillDir),
      references: this._loadReferences(skillDir),
      loadedAt: new Date().toISOString()
    };
    
    this.skillCache.set(skill.name, skill);
    return skill;
  }
  
  /**
   * 扫描技能目录文件
   */
  _scanSkillFiles(skillDir) {
    const files = [];
    
    if (fs.existsSync(path.join(skillDir, 'scripts'))) {
      const scriptsDir = path.join(skillDir, 'scripts');
      for (const file of fs.readdirSync(scriptsDir)) {
        files.push({
          type: 'script',
          name: file,
          path: path.join(scriptsDir, file)
        });
      }
    }
    
    if (fs.existsSync(path.join(skillDir, 'references'))) {
      const refsDir = path.join(skillDir, 'references');
      for (const file of fs.readdirSync(refsDir)) {
        files.push({
          type: 'reference',
          name: file,
          path: path.join(refsDir, file)
        });
      }
    }
    
    if (fs.existsSync(path.join(skillDir, 'assets'))) {
      const assetsDir = path.join(skillDir, 'assets');
      for (const file of fs.readdirSync(assetsDir)) {
        files.push({
          type: 'asset',
          name: file,
          path: path.join(assetsDir, file)
        });
      }
    }
    
    return files;
  }
  
  /**
   * 加载脚本文件
   */
  _loadScripts(skillDir) {
    const scriptsDir = path.join(skillDir, 'scripts');
    if (!fs.existsSync(scriptsDir)) return [];
    
    const scripts = [];
    for (const file of fs.readdirSync(scriptsDir)) {
      if (file.endsWith('.js') || file.endsWith('.sh')) {
        scripts.push({
          name: path.basename(file, path.extname(file)),
          path: path.join(scriptsDir, file),
          content: fs.readFileSync(path.join(scriptsDir, file), 'utf8')
        });
      }
    }
    return scripts;
  }
  
  /**
   * 加载参考文档
   */
  _loadReferences(skillDir) {
    const refsDir = path.join(skillDir, 'references');
    if (!fs.existsSync(refsDir)) return [];
    
    const refs = [];
    for (const file of fs.readdirSync(refsDir)) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        refs.push({
          name: path.basename(file, path.extname(file)),
          path: path.join(refsDir, file),
          content: fs.readFileSync(path.join(refsDir, file), 'utf8')
        });
      }
    }
    return refs;
  }
  
  /**
   * 获取所有技能
   */
  getAllSkills() {
    const skills = [];
    
    if (!fs.existsSync(this.skillsDir)) {
      return skills;
    }
    
    for (const dir of fs.readdirSync(this.skillsDir)) {
      const skillPath = path.join(this.skillsDir, dir);
      if (fs.statSync(skillPath).isDirectory()) {
        const skill = this.loadSkill(dir);
        if (skill) {
          skills.push(skill);
        }
      }
    }
    
    return skills;
  }
  
  /**
   * 获取技能目录树
   */
  getSkillTree() {
    const skills = this.getAllSkills();
    return skills.map(skill => ({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      hasScripts: skill.scripts.length > 0,
      hasReferences: skill.references.length > 0,
      files: skill.files.map(f => f.name)
    }));
  }
  
  /**
   * 清除缓存
   */
  clearCache() {
    this.skillCache.clear();
  }
  
  /**
   * 搜索技能
   */
  searchSkills(query) {
    const skills = this.getAllSkills();
    const queryLower = query.toLowerCase();
    
    return skills.filter(skill => {
      return skill.name.toLowerCase().includes(queryLower) ||
             skill.description.toLowerCase().includes(queryLower) ||
             skill.content.toLowerCase().includes(queryLower);
    });
  }
}

module.exports = { SkillLoader, parseFrontmatter, parseYamlSimple };
