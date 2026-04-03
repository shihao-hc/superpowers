/**
 * MCP Context7 Bridge - 文档查询桥接器
 * 支持版本感知、文档与思维链融合
 */

const fs = require('fs');
const path = require('path');
const { thinkingChain } = require('../engines/ThinkingChain');

class Context7Bridge {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || 'https://mcp.context7.io';
    this.cacheDir = config.cacheDir || path.join(process.cwd(), '.context7-cache');
    this.cache = new Map();
    
    this._ensureCacheDir();
  }

  _ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 获取所有工具
   */
  getTools() {
    return [
      this._tool('resolve_library_id', '解析库ID', {
        query: { type: 'string' },
        libraryName: { type: 'string' }
      }),
      this._tool('query_docs', '查询文档', {
        libraryId: { type: 'string' },
        query: { type: 'string' },
        version: { type: 'string' }
      }),
      this._tool('list_cached_libraries', '列出缓存库'),
      this._tool('get_library_info', '获取库信息', { libraryId: { type: 'string' } }),
      this._tool('refresh_docs', '刷新文档', { libraryId: { type: 'string' } }),
      this._tool('invalidate_cache', '清除缓存', { libraryId: { type: 'string' } }),
      this._tool('add_library', '添加库到监控', { libraryId: { type: 'string' }, version: { type: 'string' } }),
      this._tool('detect_project_version', '检测项目版本', { projectPath: { type: 'string' } }),
    ];
  }

  _tool(name, description, inputSchema = {}) {
    return { name, description, inputSchema, handler: this._getHandler(name) };
  }

  _getHandler(name) {
    const handlers = {
      resolve_library_id: this.resolveLibraryId.bind(this),
      query_docs: this.queryDocs.bind(this),
      list_cached_libraries: this.listCachedLibraries.bind(this),
      get_library_info: this.getLibraryInfo.bind(this),
      refresh_docs: this.refreshDocs.bind(this),
      invalidate_cache: this.invalidateCache.bind(this),
      add_library: this.addLibrary.bind(this),
      detect_project_version: this.detectProjectVersion.bind(this),
    };
    return handlers[name];
  }

  /**
   * 解析库ID
   */
  async resolveLibraryId(params) {
    const { query, libraryName } = params;

    // 常用库的映射
    const libraryMappings = {
      'react': '/facebook/react',
      'next': '/vercel/next.js',
      'nextjs': '/vercel/next.js',
      'vue': '/vuejs/core',
      'vue3': '/vuejs/core',
      'angular': '/angular/angular',
      'svelte': '/sveltejs/svelte',
      'tailwind': '/tailwindlabs/tailwindcss',
      'tailwindcss': '/tailwindlabs/tailwindcss',
      'express': '/expressjs/express',
      'fastify': '/fastify/fastify',
      'nest': '/nestjs/nest',
      'nestjs': '/nestjs/nest',
      'django': '/django/django',
      'flask': '/pallets/flask',
      'fastapi': '/tiangoto/fastapi',
      'supabase': '/supabase/supabase',
      'prisma': '/prisma/prisma',
      'typescript': '/microsoft/TypeScript',
      'react-native': '/facebook/react-native',
      'electron': '/electron/electron',
    };

    const normalizedName = libraryName?.toLowerCase().replace(/[^a-z0-9]/g, '');
    let libraryId = libraryMappings[normalizedName];

    if (!libraryId) {
      // 调用 Context7 API
      const result = await this._apiRequest('/resolve', { query: query || libraryName });
      libraryId = result.libraryId;
    }

    return {
      libraryId,
      libraryName,
      source: libraryId ? 'mapping' : 'api'
    };
  }

  /**
   * 查询文档
   */
  async queryDocs(params, context = {}) {
    const { libraryId, query, version } = params;

    // 尝试从缓存获取
    const cacheKey = `${libraryId}:${version || 'latest'}:${query}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 3600000) { // 1小时
        return { ...cached.data, fromCache: true };
      }
    }

    // 调用 Context7 API
    const result = await this._apiRequest('/query', {
      libraryId,
      query,
      version
    });

    // 缓存结果
    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    // 记录到思维链
    const chain = thinkingChain.getCurrentChain();
    if (chain) {
      thinkingChain.addThought(chain.id, `查询文档: ${libraryId}`, {
        reasoning: result.content?.substring(0, 100) || '无结果',
        metadata: {
          type: 'context7_query',
          libraryId,
          query,
          sources: result.sources
        }
      });
    }

    return result;
  }

  /**
   * 检测项目依赖版本
   */
  async detectProjectVersion(params) {
    const { projectPath = process.cwd() } = params;
    const deps = {};

    // package.json (Node.js)
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        deps.npm = {
          ...pkg.dependencies,
          ...pkg.devDependencies
        };
        deps.packageManager = 'npm';
      } catch {}
    }

    // requirements.txt (Python)
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      try {
        const lines = fs.readFileSync(requirementsPath, 'utf-8').split('\n');
        deps.pip = {};
        for (const line of lines) {
          const match = line.match(/^([a-zA-Z0-9_-]+)(==|>=|<=|~=)?(.+)?/);
          if (match) {
            deps.pip[match[1]] = match[3] || 'latest';
          }
        }
        deps.packageManager = 'pip';
      } catch {}
    }

    // go.mod (Go)
    const goModPath = path.join(projectPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = fs.readFileSync(goModPath, 'utf-8');
        deps.go = {};
        const requireLines = content.split('\n').filter(l => l.startsWith('\t'));
        for (const line of requireLines) {
          const match = line.trim().match(/^([^\s]+)\s+v?([^\s]+)/);
          if (match) {
            deps.go[match[1]] = match[2];
          }
        }
        deps.packageManager = 'go';
      } catch {}
    }

    return {
      projectPath,
      dependencies: deps,
      detected: Object.keys(deps).filter(k => k !== 'packageManager').length
    };
  }

  /**
   * 添加库到监控
   */
  async addLibrary(params) {
    const { libraryId, version } = params;
    const cacheFile = path.join(this.cacheDir, `${libraryId.replace(/\//g, '_')}.json`);
    
    const entry = {
      libraryId,
      version: version || 'latest',
      addedAt: new Date().toISOString()
    };

    fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));

    return { success: true, library: entry };
  }

  /**
   * 列出缓存的库
   */
  async listCachedLibraries() {
    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    const libraries = files.map(file => {
      try {
        const content = fs.readFileSync(path.join(this.cacheDir, file), 'utf-8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return { libraries, count: libraries.length };
  }

  /**
   * 获取库信息
   */
  async getLibraryInfo(params) {
    const { libraryId } = params;
    const cacheFile = path.join(this.cacheDir, `${libraryId.replace(/\//g, '_')}.json`);

    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }

    return { libraryId, cached: false };
  }

  /**
   * 刷新文档
   */
  async refreshDocs(params) {
    const { libraryId } = params;
    
    // 清除相关缓存
    const keysToDelete = [];
    for (const [key] of this.cache) {
      if (key.startsWith(`${libraryId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(k => this.cache.delete(k));

    return { success: true, libraryId, clearedCache: keysToDelete.length };
  }

  /**
   * 清除缓存
   */
  async invalidateCache(params) {
    const { libraryId } = params;
    const cacheFile = path.join(this.cacheDir, `${libraryId.replace(/\//g, '_')}.json`);

    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }

    return { success: true, libraryId };
  }

  /**
   * 调用 Context7 API
   */
  async _apiRequest(endpoint, data) {
    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`Context7 API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      // 模拟响应（当API不可用时）
      return {
        libraryId: data.libraryId,
        content: `Documentation for ${data.libraryId}\n\nThis is a mock response when Context7 API is unavailable.`,
        sources: [`https://context7.com/${data.libraryId}`]
      };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this._apiRequest('/health', {});
      return { status: 'healthy', api: this.apiUrl };
    } catch (error) {
      return { status: 'degraded', api: this.apiUrl, error: error.message };
    }
  }
}

module.exports = { Context7Bridge };
