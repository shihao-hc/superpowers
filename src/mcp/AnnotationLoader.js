/**
 * MCP Annotation Loader - 声明式注解加载器
 * 从 YAML 配置文件中加载工具注解
 */

const fs = require('fs');
const path = require('path');

class AnnotationLoader {
  constructor(annotationsDir = null) {
    this.annotationsDir = annotationsDir || path.join(__dirname, 'annotations');
    this.cache = new Map();
    this.allAnnotations = new Map();
  }

  /**
   * 加载所有注解配置
   */
  loadAll() {
    if (!fs.existsSync(this.annotationsDir)) {
      console.warn(`Annotations directory not found: ${this.annotationsDir}`);
      return {};
    }

    const files = fs.readdirSync(this.annotationsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    
    for (const file of files) {
      const mcpName = path.basename(file, path.extname(file));
      const annotations = this._loadYamlFile(path.join(this.annotationsDir, file));
      this.allAnnotations.set(mcpName, annotations);
    }

    return Object.fromEntries(this.allAnnotations);
  }

  /**
   * 加载指定 MCP 的注解
   */
  loadMcpAnnotations(mcpName) {
    const cacheKey = `mcp:${mcpName}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const filePath = path.join(this.annotationsDir, `${mcpName}.yaml`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const annotations = this._loadYamlFile(filePath);
    this.cache.set(cacheKey, annotations);
    return annotations;
  }

  /**
   * 获取工具注解
   */
  getToolAnnotation(mcpName, toolName) {
    const mcpAnnotations = this.loadMcpAnnotations(mcpName);
    if (!mcpAnnotations) return null;

    const mcpTools = Object.values(mcpAnnotations)[0];
    if (!mcpTools) return null;

    return mcpTools[toolName] || null;
  }

  /**
   * 获取 MCP 的所有工具注解
   */
  getMcpTools(mcpName) {
    const mcpAnnotations = this.loadMcpAnnotations(mcpName);
    if (!mcpAnnotations) return [];

    const tools = Object.values(mcpAnnotations)[0] || {};
    return Object.entries(tools).map(([name, annotation]) => ({
      name,
      ...annotation
    }));
  }

  /**
   * 获取所有注解（扁平化）
   */
  getAllAnnotations() {
    const result = {};
    
    for (const [mcpName, annotations] of this.allAnnotations) {
      const tools = Object.values(annotations)[0] || {};
      for (const [toolName, annotation] of Object.entries(tools)) {
        result[toolName] = annotation;
      }
    }

    return result;
  }

  /**
   * 合并注解（配置文件 + 代码定义）
   */
  mergeWithCodeAnnotations(codeAnnotations) {
    const yamlAnnotations = this.getAllAnnotations();
    
    const merged = { ...codeAnnotations };
    for (const [toolName, yamlAnn] of Object.entries(yamlAnnotations)) {
      if (merged[toolName]) {
        merged[toolName] = { ...merged[toolName], ...yamlAnn };
      } else {
        merged[toolName] = yamlAnn;
      }
    }

    return merged;
  }

  /**
   * 解析 YAML 文件
   */
  _loadYamlFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this._parseYaml(content);
    } catch (error) {
      console.error(`Failed to load ${filePath}:`, error.message);
      return {};
    }
  }

  /**
   * 简单 YAML 解析器
   */
  _parseYaml(content) {
    const result = {};
    let currentMcp = null;
    let currentSection = null;
    let currentTool = null;
    let indentLevel = 0;

    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim() === '' || line.trim().startsWith('#')) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      if (indent === 0) {
        currentMcp = trimmed.replace(':', '');
        result[currentMcp] = {};
      } else if (indent === 2 && trimmed.includes(':')) {
        currentSection = trimmed.replace(':', '');
        result[currentMcp][currentSection] = {};
      } else if (indent === 4 && !trimmed.includes(':')) {
        currentTool = trimmed;
        result[currentMcp][currentSection][currentTool] = {
          readOnlyHint: false,
          idempotentHint: true,
          destructiveHint: false
        };
      } else if (indent === 6 && trimmed.includes(':')) {
        const [key, value] = trimmed.split(':').map(s => s.trim());
        if (currentTool && result[currentMcp][currentSection]) {
          if (!result[currentMcp][currentSection][currentTool]) {
            result[currentMcp][currentSection][currentTool] = {};
          }
          result[currentMcp][currentSection][currentTool][key] = this._parseValue(value);
        }
      }
    }

    return result;
  }

  /**
   * 解析 YAML 值
   */
  _parseValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value)) return Number(value);
    return value;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
    this.loadAll();
  }

  /**
   * 重新加载
   */
  reload() {
    this.allAnnotations.clear();
    this.cache.clear();
    return this.loadAll();
  }
}

const annotationLoader = new AnnotationLoader();

module.exports = {
  AnnotationLoader,
  annotationLoader
};
