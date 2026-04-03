/**
 * Skill Consolidator
 * 合并冗余技能，优化技能结构
 */

const fs = require('fs');
const path = require('path');

class SkillConsolidator {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'consolidation');
    this.consolidationsFile = path.join(this.dataDir, 'consolidations.json');
    
    // 已知的冗余技能组
    this.redundantGroups = [
      {
        id: 'performance-skills',
        name: '性能优化技能组',
        skills: ['performance-optimization', 'performance-tuning', 'stress-testing'],
        primarySkill: 'performance-optimization',
        action: 'merge',
        reason: '三个技能功能重叠，应该合并为一个综合性能优化技能'
      },
      {
        id: 'deployment-skills',
        name: '部署技能组',
        skills: ['cicd-pipeline', 'production-deployment'],
        primarySkill: 'cicd-pipeline',
        action: 'merge',
        reason: 'CI/CD和部署功能重叠，应该合并'
      },
      {
        id: 'monitoring-skills',
        name: '监控技能组',
        skills: ['monitoring-dashboard', 'performance-tuning'],
        primarySkill: 'monitoring-dashboard',
        action: 'reference',
        reason: '监控和性能调谐有重叠但功能不同，应该互相引用而非合并'
      },
      {
        id: 'security-skills',
        name: '安全技能组',
        skills: ['security-hardening', 'cli-tool-security', 'mcp-security'],
        primarySkill: 'security-hardening',
        action: 'hierarchy',
        reason: '应该建立安全技能层次结构，security-hardening作为基础'
      },
      {
        id: 'document-skills',
        name: '文档技能组',
        skills: ['docx', 'pdf', 'pptx', 'xlsx'],
        primarySkill: null,
        action: 'unify_executor',
        reason: '所有文档技能应该统一使用执行器模式'
      },
      {
        id: 'ai-skills',
        name: 'AI技能组',
        skills: ['multi-agent-orchestration', 'workflow-optimizer', 'task-scheduling'],
        primarySkill: 'multi-agent-orchestration',
        action: 'hierarchy',
        reason: '多智能体编排是核心，工作流优化和任务调度是子功能'
      },
      {
        id: 'testing-skills',
        name: '测试技能组',
        skills: ['webapp-testing', 'test-generation'],
        primarySkill: null,
        action: 'merge',
        reason: 'Web应用测试和测试生成功能应该合并'
      }
    ];
    
    // 合并历史
    this.consolidations = [];
    
    this._ensureDataDir();
    this._loadData();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadData() {
    try {
      if (fs.existsSync(this.consolidationsFile)) {
        const data = JSON.parse(fs.readFileSync(this.consolidationsFile, 'utf8'));
        this.consolidations = data.consolidations || [];
      }
    } catch (error) {
      console.warn('Failed to load consolidation data:', error.message);
    }
  }

  _saveData() {
    try {
      fs.writeFileSync(this.consolidationsFile, JSON.stringify({
        consolidations: this.consolidations,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.warn('Failed to save consolidation data:', error.message);
    }
  }

  /**
   * 分析技能冗余
   */
  analyzeRedundancy(skills) {
    const analysis = {
      redundantGroups: [],
      orphanedSkills: [],
      dependencies: {},
      recommendations: []
    };

    // 检查冗余组
    for (const group of this.redundantGroups) {
      const foundSkills = skills.filter(s => group.skills.includes(s.name || s.id));
      
      if (foundSkills.length >= 2) {
        analysis.redundantGroups.push({
          ...group,
          foundSkills: foundSkills.map(s => ({
            name: s.name || s.id,
            description: s.description,
            overlap: this._calculateOverlap(s, foundSkills)
          }))
        });
      }
    }

    // 检查孤立技能（没有被其他技能依赖）
    const allDependencies = new Set();
    for (const skill of skills) {
      if (skill.dependencies) {
        skill.dependencies.forEach(dep => allDependencies.add(dep));
      }
    }

    analysis.orphanedSkills = skills.filter(s => 
      !allDependencies.has(s.name || s.id) && 
      !this._isCoreSkill(s)
    ).map(s => ({
      name: s.name || s.id,
      reason: '没有被其他技能依赖'
    }));

    // 生成建议
    analysis.recommendations = this._generateRecommendations(analysis);

    return analysis;
  }

  /**
   * 计算技能重叠度
   */
  _calculateOverlap(skill, groupSkills) {
    // 基于功能描述和依赖计算重叠度
    const skillDeps = skill.dependencies || [];
    const groupDeps = groupSkills.flatMap(s => s.dependencies || []);
    
    const overlap = skillDeps.filter(dep => groupDeps.includes(dep)).length;
    const total = new Set([...skillDeps, ...groupDeps]).size;
    
    return total > 0 ? Math.round((overlap / total) * 100) : 0;
  }

  /**
   * 判断是否为核心技能
   */
  _isCoreSkill(skill) {
    const coreSkills = [
      'skill-creator', 'skill-manager', 'skill-validator',
      'skill-loader', 'skill-to-node', 'skill-to-mcp'
    ];
    return coreSkills.includes(skill.name || skill.id);
  }

  /**
   * 生成合并建议
   */
  _generateRecommendations(analysis) {
    const recommendations = [];

    // 基于冗余分析生成建议
    for (const group of analysis.redundantGroups) {
      if (group.action === 'merge') {
        recommendations.push({
          type: 'merge',
          priority: 'high',
          skills: group.foundSkills.map(s => s.name),
          target: group.primarySkill,
          reason: group.reason,
          estimatedEffort: 'medium',
          benefits: ['减少维护成本', '统一接口', '避免功能重复']
        });
      } else if (group.action === 'hierarchy') {
        recommendations.push({
          type: 'hierarchy',
          priority: 'medium',
          skills: group.foundSkills.map(s => s.name),
          primary: group.primarySkill,
          reason: group.reason,
          estimatedEffort: 'low',
          benefits: ['清晰的职责划分', '更好的可维护性']
        });
      }
    }

    // 基于孤立技能生成建议
    if (analysis.orphanedSkills.length > 3) {
      recommendations.push({
        type: 'cleanup',
        priority: 'low',
        skills: analysis.orphanedSkills.map(s => s.name),
        reason: '多个技能未被其他技能依赖，可能需要整合或标记为可选',
        estimatedEffort: 'low',
        benefits: ['减少系统复杂度', '提高可维护性']
      });
    }

    return recommendations;
  }

  /**
   * 合并技能
   */
  mergeSkills(primarySkill, secondarySkills, options = {}) {
    const { dryRun = false } = options;
    
    const mergeResult = {
      primary: primarySkill.name,
      merged: [],
      changes: [],
      warnings: []
    };

    // 合并功能
    const mergedFeatures = new Set(primarySkill.features || []);
    const mergedDependencies = new Set(primarySkill.dependencies || []);
    
    for (const secondary of secondarySkills) {
      mergeResult.merged.push(secondary.name);
      
      // 合并功能
      if (secondary.features) {
        secondary.features.forEach(f => mergedFeatures.add(f));
      }
      
      // 合并依赖（去重）
      if (secondary.dependencies) {
        secondary.dependencies.forEach(d => {
          if (!mergedDependencies.has(d)) {
            mergeResult.changes.push({
              type: 'dependency_added',
              from: secondary.name,
              dependency: d
            });
            mergedDependencies.add(d);
          }
        });
      }
      
      // 合并配置
      if (secondary.config) {
        mergeResult.changes.push({
          type: 'config_merged',
          from: secondary.name,
          config: secondary.config
        });
      }
    }

    // 创建合并后的技能定义
    const mergedSkill = {
      ...primarySkill,
      features: Array.from(mergedFeatures),
      dependencies: Array.from(mergedDependencies),
      metadata: {
        ...primarySkill.metadata,
        mergedFrom: secondarySkills.map(s => s.name),
        mergedAt: new Date().toISOString(),
        version: this._incrementVersion(primarySkill.version || '1.0.0', 'minor')
      }
    };

    if (!dryRun) {
      this.consolidations.push({
        timestamp: new Date().toISOString(),
        type: 'merge',
        primary: primarySkill.name,
        merged: secondarySkills.map(s => s.name),
        result: mergeResult
      });
      this._saveData();
    }

    return {
      success: true,
      mergedSkill,
      result: mergeResult
    };
  }

  /**
   * 建立层次结构
   */
  establishHierarchy(primarySkill, childSkills, options = {}) {
    const hierarchyResult = {
      primary: primarySkill.name,
      children: [],
      relationships: []
    };

    for (const child of childSkills) {
      hierarchyResult.children.push(child.name);
      hierarchyResult.relationships.push({
        parent: primarySkill.name,
        child: child.name,
        type: 'extends',
        description: `${child.name} extends ${primarySkill.name}`
      });
    }

    this.consolidations.push({
      timestamp: new Date().toISOString(),
      type: 'hierarchy',
      primary: primarySkill.name,
      children: childSkills.map(s => s.name)
    });
    this._saveData();

    return {
      success: true,
      hierarchy: hierarchyResult
    };
  }

  /**
   * 生成统一执行器
   */
  generateUnifiedExecutor(skills, options = {}) {
    const executorName = options.name || 'UnifiedDocumentExecutor';
    
    const executor = {
      name: executorName,
      supportedSkills: skills.map(s => s.name),
      supportedActions: [],
      implementations: {}
    };

    for (const skill of skills) {
      const skillActions = this._extractSkillActions(skill);
      executor.supportedActions.push(...skillActions);
      executor.implementations[skill.name] = {
        actions: skillActions,
        handler: `${skill.name}Handler`
      };
    }

    // 去重
    executor.supportedActions = [...new Set(executor.supportedActions)];

    return executor;
  }

  /**
   * 提取技能动作
   */
  _extractSkillActions(skill) {
    // 从技能定义中提取可用动作
    const defaultActions = ['create', 'read', 'update', 'delete', 'export'];
    return skill.actions || defaultActions;
  }

  /**
   * 版本号递增
   */
  _incrementVersion(version, type = 'patch') {
    const parts = version.split('.').map(Number);
    
    switch (type) {
      case 'major':
        parts[0] += 1;
        parts[1] = 0;
        parts[2] = 0;
        break;
      case 'minor':
        parts[1] += 1;
        parts[2] = 0;
        break;
      case 'patch':
      default:
        parts[2] += 1;
        break;
    }
    
    return parts.join('.');
  }

  /**
   * 获取合并历史
   */
  getConsolidationHistory() {
    return this.consolidations;
  }

  /**
   * 获取冗余组定义
   */
  getRedundantGroups() {
    return this.redundantGroups;
  }

  /**
   * 生成整合报告
   */
  generateReport(skills) {
    const analysis = this.analyzeRedundancy(skills);
    
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalSkills: skills.length,
        redundantGroups: analysis.redundantGroups.length,
        orphanedSkills: analysis.orphanedSkills.length,
        recommendations: analysis.recommendations.length
      },
      analysis,
      history: this.consolidations.slice(-10)
    };
  }
}

module.exports = { SkillConsolidator };
