/**
 * Cache Warmup Manager
 * Preloads frequently used skills and metadata on system startup
 */

const { EventEmitter } = require('events');

class CacheWarmupManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      enabled: options.enabled !== false,
      parallelLimit: options.parallelLimit || 3,
      warmupDelay: options.warmupDelay || 2000,
      retryAttempts: options.retryAttempts || 2,
      ...options
    };
    
    this.warmupTasks = new Map();
    this.stats = {
      totalTasks: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      startTime: null,
      endTime: null
    };
    
    this._isWarming = false;
  }

  /**
   * Register a warmup task
   */
  register(name, handler, options = {}) {
    this.warmupTasks.set(name, {
      name,
      handler,
      priority: options.priority || 5,
      dependencies: options.dependencies || [],
      timeout: options.timeout || 30000,
      enabled: options.enabled !== false
    });
    return this;
  }

  /**
   * Register multiple tasks at once
   */
  registerBatch(tasks) {
    for (const task of tasks) {
      this.register(task.name, task.handler, task.options);
    }
    return this;
  }

  /**
   * Execute all warmup tasks
   */
  async warmup(cacheService, skillManager) {
    if (!this.options.enabled) {
      console.log('[CacheWarmup] Warmup disabled, skipping');
      return this.stats;
    }

    if (this._isWarming) {
      console.log('[CacheWarmup] Warmup already in progress');
      return this.stats;
    }

    this._isWarming = true;
    this.stats.startTime = Date.now();
    this.stats.totalTasks = this.warmupTasks.size;

    console.log(`[CacheWarmup] Starting warmup with ${this.stats.totalTasks} tasks`);

    // Sort tasks by priority
    const sortedTasks = Array.from(this.warmupTasks.values())
      .filter(t => t.enabled)
      .sort((a, b) => a.priority - b.priority);

    // Execute tasks with parallel limit
    const results = [];
    for (let i = 0; i < sortedTasks.length; i += this.options.parallelLimit) {
      const batch = sortedTasks.slice(i, i + this.options.parallelLimit);
      const batchResults = await Promise.allSettled(
        batch.map(task => this._executeTask(task, cacheService, skillManager))
      );
      results.push(...batchResults);
    }

    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.stats.completed++;
      } else {
        this.stats.failed++;
      }
    }

    this.stats.endTime = Date.now();
    this._isWarming = false;

    const duration = this.stats.endTime - this.stats.startTime;
    console.log(`[CacheWarmup] Completed: ${this.stats.completed}/${this.stats.totalTasks} in ${duration}ms`);
    
    this.emit('warmup-complete', this.stats);
    return this.stats;
  }

  async _executeTask(task, cacheService, skillManager) {
    const startTime = Date.now();
    
    try {
      // Check dependencies
      for (const dep of task.dependencies) {
        if (!this.warmupTasks.has(dep)) {
          throw new Error(`Dependency ${dep} not found`);
        }
      }

      // Execute with timeout
      const result = await Promise.race([
        task.handler(cacheService, skillManager),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), task.timeout)
        )
      ]);

      const duration = Date.now() - startTime;
      console.log(`[CacheWarmup] ✓ ${task.name} completed in ${duration}ms`);
      
      this.emit('task-complete', { name: task.name, duration, result });
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[CacheWarmup] ✗ ${task.name} failed: ${error.message}`);
      
      this.emit('task-failed', { name: task.name, duration, error: error.message });
      throw error;
    }
  }

  /**
   * Warmup skill metadata
   */
  async warmupSkillMetadata(cacheService, skillManager) {
    if (!skillManager || !cacheService) return;
    
    const skills = skillManager.getAllSkills?.() || [];
    const metadata = skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      tags: skill.tags
    }));

    if (metadata.length > 0) {
      await cacheService.set('skills:metadata', metadata, 3600);
      console.log(`[CacheWarmup] Cached ${metadata.length} skill metadata entries`);
    }
    
    return metadata;
  }

  /**
   * Warmup user permissions
   */
  async warmupUserPermissions(cacheService) {
    // This would typically load from database
    // For now, just set a placeholder
    const permissions = {
      admin: ['*'],
      user: ['read', 'execute'],
      guest: ['read']
    };
    
    await cacheService.set('permissions:roles', permissions, 7200);
    console.log('[CacheWarmup] Cached role permissions');
    
    return permissions;
  }

  /**
   * Warmup industry solutions
   */
  async warmupIndustrySolutions(cacheService) {
    try {
      const { IndustrySolutions } = require('../skills/solutions/IndustrySolutions');
      const solutions = new IndustrySolutions();
      const allSolutions = solutions.getAllSolutions();
      
      if (allSolutions.length > 0) {
        await cacheService.set('solutions:all', allSolutions, 1800);
        console.log(`[CacheWarmup] Cached ${allSolutions.length} industry solutions`);
      }
      
      return allSolutions;
    } catch (error) {
      console.error('[CacheWarmup] Failed to warmup industry solutions:', error.message);
      return [];
    }
  }

  /**
   * Warmup tool annotations
   */
  async warmupToolAnnotations(cacheService) {
    try {
      const { ToolAnnotations } = require('../mcp/engines/ToolAnnotations');
      const annotations = ToolAnnotations.getAllAnnotations();
      
      if (Object.keys(annotations).length > 0) {
        await cacheService.set('annotations:tools', annotations, 3600);
        console.log(`[CacheWarmup] Cached ${Object.keys(annotations).length} tool annotations`);
      }
      
      return annotations;
    } catch (error) {
      console.error('[CacheWarmup] Failed to warmup tool annotations:', error.message);
      return {};
    }
  }

  /**
   * Get warmup statistics
   */
  getStats() {
    return {
      ...this.stats,
      isWarming: this._isWarming,
      duration: this.stats.endTime ? this.stats.endTime - this.stats.startTime : null
    };
  }

  /**
   * Clear all registered tasks
   */
  clear() {
    this.warmupTasks.clear();
    this.stats = {
      totalTasks: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      startTime: null,
      endTime: null
    };
  }
}

// Default warmup configuration
const defaultWarmupConfig = [
  {
    name: 'skill-metadata',
    handler: (cache, skillMgr) => CacheWarmupManager.prototype.warmupSkillMetadata(cache, skillMgr),
    options: { priority: 1 }
  },
  {
    name: 'user-permissions',
    handler: (cache) => CacheWarmupManager.prototype.warmupUserPermissions(cache),
    options: { priority: 2 }
  },
  {
    name: 'industry-solutions',
    handler: (cache) => CacheWarmupManager.prototype.warmupIndustrySolutions(cache),
    options: { priority: 3 }
  },
  {
    name: 'tool-annotations',
    handler: (cache) => CacheWarmupManager.prototype.warmupToolAnnotations(cache),
    options: { priority: 4 }
  }
];

module.exports = { CacheWarmupManager, defaultWarmupConfig };
