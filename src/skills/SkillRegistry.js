/**
 * 技能注册表
 * 中心化的技能管理和发现系统
 * 支持 GitHub Agent Skills 标准格式
 */

const fs = require('fs');
const path = require('path');
const { SkillLoader, parseFrontmatter } = require('./loaders/SkillLoader');

class SkillRegistry {
  constructor(skillsDir = path.join(process.cwd(), 'src', 'skills')) {
    this.skillsDir = skillsDir;
    this.loader = new SkillLoader(skillsDir);
    this.registry = new Map();
    this.categories = new Map();
    this.tags = new Map();
    this._loadRegistry();
  }

  /**
   * 加载注册表
   */
  _loadRegistry() {
    this.registry.clear();
    this.categories.clear();
    this.tags.clear();

    if (!fs.existsSync(this.skillsDir)) {
      return;
    }

    const dirs = fs.readdirSync(this.skillsDir);
    
    for (const dir of dirs) {
      const skillPath = path.join(this.skillsDir, dir);
      if (!fs.statSync(skillPath).isDirectory()) continue;

      const skill = this._discoverSkill(dir);
      if (skill) {
        this.registry.set(skill.name, skill);
        
        // 分类索引
        if (skill.category) {
          if (!this.categories.has(skill.category)) {
            this.categories.set(skill.category, []);
          }
          this.categories.get(skill.category).push(skill.name);
        }

        // 标签索引
        for (const tag of skill.tags || []) {
          if (!this.tags.has(tag)) {
            this.tags.set(tag, []);
          }
          this.tags.get(tag).push(skill.name);
        }
      }
    }
  }

  /**
   * 发现技能
   */
  _discoverSkill(skillDir) {
    const skillPath = path.join(this.skillsDir, skillDir);
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const indexJsPath = path.join(skillPath, 'index.js');
    const packageJsonPath = path.join(skillPath, 'package.json');

    const skill = {
      name: skillDir,
      path: skillPath,
      discovered: new Date().toISOString(),
      hasSKILLMd: fs.existsSync(skillMdPath),
      hasIndexJs: fs.existsSync(indexJsPath),
      hasPackageJson: fs.existsSync(packageJsonPath),
      files: [],
      category: null,
      tags: [],
      description: '',
      version: '1.0.0',
      deprecated: false,
      replacement: null
    };

    // 解析 SKILL.md
    if (skill.hasSKILLMd) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const { metadata, content: body } = parseFrontmatter(content);
        
        skill.name = metadata.name || skillDir;
        skill.description = metadata.description || '';
        skill.category = metadata.category || null;
        skill.tags = metadata.tags || [];
        skill.version = metadata.version || '1.0.0';
        skill.deprecated = metadata.deprecated || false;
        skill.replacement = metadata.replacement || null;
        skill.content = body;
      } catch (e) {
        console.warn(`[SkillRegistry] 解析 SKILL.md 失败: ${skillDir}`, e.message);
      }
    }

    // 解析 package.json
    if (skill.hasPackageJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        skill.version = pkg.version || skill.version;
        skill.description = skill.description || pkg.description || '';
        skill.tags = skill.tags.length > 0 ? skill.tags : (pkg.keywords || []);
        if (pkg.category) skill.category = pkg.category;
      } catch (e) {
        console.warn(`[SkillRegistry] 解析 package.json 失败: ${skillDir}`, e.message);
      }
    }

    // 扫描文件
    skill.files = this._scanFiles(skillPath);

    // 检查弃用状态
    if (!skill.deprecated && indexJsPath) {
      try {
        const indexContent = fs.readFileSync(indexJsPath, 'utf8');
        if (indexContent.includes('@deprecated') || indexContent.includes('DEPRECATED: true')) {
          skill.deprecated = true;
        }
      } catch (e) {
        // 忽略
      }
    }

    return skill;
  }

  /**
   * 扫描技能文件
   */
  _scanFiles(skillPath) {
    const files = [];
    
    const scanDir = (dir, prefix = '') => {
      if (!fs.existsSync(dir)) return;
      
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const relPath = prefix ? `${prefix}/${entry}` : entry;
        
        if (fs.statSync(fullPath).isDirectory()) {
          // 只扫描标准子目录
          if (['scripts', 'references', 'assets', 'test', 'tests'].includes(entry)) {
            scanDir(fullPath, relPath);
          }
        } else {
          files.push({
            name: entry,
            path: relPath,
            fullPath: fullPath,
            size: fs.statSync(fullPath).size
          });
        }
      }
    };
    
    scanDir(skillPath);
    return files;
  }

  /**
   * 获取所有技能
   */
  getAllSkills(options = {}) {
    let skills = Array.from(this.registry.values());
    
    if (!options.includeDeprecated) {
      skills = skills.filter(s => !s.deprecated);
    }
    
    if (options.category) {
      skills = skills.filter(s => s.category === options.category);
    }
    
    if (options.tag) {
      skills = skills.filter(s => s.tags.includes(options.tag));
    }
    
    if (options.search) {
      const query = options.search.toLowerCase();
      skills = skills.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some(t => t.toLowerCase().includes(query))
      );
    }
    
    return skills;
  }

  /**
   * 获取单个技能
   */
  getSkill(name) {
    const skill = this.registry.get(name);
    if (!skill) return null;
    
    // 如果已弃用但有替代品，返回替代品信息
    if (skill.deprecated && skill.replacement) {
      const replacement = this.registry.get(skill.replacement);
      if (replacement) {
        return {
          ...skill,
          replacementSkill: replacement
        };
      }
    }
    
    return skill;
  }

  /**
   * 获取技能列表（简洁版）
   */
  listSkills(options = {}) {
    const skills = this.getAllSkills(options);
    return skills.map(s => ({
      name: s.name,
      description: s.description,
      category: s.category,
      tags: s.tags,
      version: s.version,
      deprecated: s.deprecated,
      hasSKILLMd: s.hasSKILLMd
    }));
  }

  /**
   * 获取所有分类
   */
  listCategories() {
    const cats = [];
    for (const [name, skillNames] of this.categories.entries()) {
      cats.push({
        name,
        skillCount: skillNames.length,
        skills: skillNames
      });
    }
    return cats.sort((a, b) => b.skillCount - a.skillCount);
  }

  /**
   * 获取所有标签
   */
  listTags() {
    const tagList = [];
    for (const [name, skillNames] of this.tags.entries()) {
      tagList.push({
        name,
        skillCount: skillNames.length,
        skills: skillNames
      });
    }
    return tagList.sort((a, b) => b.skillCount - a.skillCount);
  }

  /**
   * 获取技能统计
   */
  getStats() {
    const allSkills = Array.from(this.registry.values());
    const active = allSkills.filter(s => !s.deprecated);
    const deprecated = allSkills.filter(s => s.deprecated);
    const withSKILLMd = allSkills.filter(s => s.hasSKILLMd);

    return {
      total: allSkills.length,
      active: active.length,
      deprecated: deprecated.length,
      withSKILLMd: withSKILLMd.length,
      categories: this.categories.size,
      tags: this.tags.size
    };
  }

  /**
   * 搜索技能
   */
  search(query) {
    const skills = this.getAllSkills({ search: query });
    return skills.map(s => ({
      name: s.name,
      description: s.description,
      category: s.category,
      relevance: this._calculateRelevance(s, query)
    })).sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * 计算相关性
   */
  _calculateRelevance(skill, query) {
    let score = 0;
    const q = query.toLowerCase();
    
    if (skill.name.toLowerCase() === q) score += 100;
    else if (skill.name.toLowerCase().includes(q)) score += 50;
    
    if (skill.description.toLowerCase().includes(q)) score += 20;
    
    for (const tag of skill.tags || []) {
      if (tag.toLowerCase() === q) score += 30;
      else if (tag.toLowerCase().includes(q)) score += 15;
    }
    
    if (skill.category === q) score += 25;
    
    return score;
  }

  /**
   * 注册新技能（运行时）
   */
  register(skillData) {
    const skill = {
      ...skillData,
      registered: new Date().toISOString()
    };
    this.registry.set(skill.name, skill);
    return skill;
  }

  /**
   * 注销技能
   */
  unregister(name) {
    return this.registry.delete(name);
  }

  /**
   * 重新加载注册表
   */
  reload() {
    this._loadRegistry();
    return this.getStats();
  }

  /**
   * 导出注册表
   */
  export() {
    return {
      exportedAt: new Date().toISOString(),
      stats: this.getStats(),
      categories: this.listCategories(),
      tags: this.listTags(),
      skills: this.listSkills()
    };
  }

  /**
   * 获取技能树
   */
  getTree() {
    const skills = this.getAllSkills();
    const tree = {
      path: this.skillsDir,
      categories: {}
    };

    for (const skill of skills) {
      const cat = skill.category || 'uncategorized';
      if (!tree.categories[cat]) {
        tree.categories[cat] = [];
      }
      tree.categories[cat].push({
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
        files: skill.files.map(f => f.path)
      });
    }

    return tree;
  }
}

// 单例
let instance = null;

function getSkillRegistry(options) {
  if (!instance) {
    instance = new SkillRegistry(options?.skillsDir);
  }
  return instance;
}

module.exports = { SkillRegistry, getSkillRegistry };
