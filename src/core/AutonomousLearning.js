/**
 * AutonomousLearning - 自主学习系统
 *
 * 自主发现问题、主动学习、持续改进
 * 从交互历史中发现模式，识别知识缺口，生成改进建议
 *
 * @version 22.1.0
 * @license MIT
 */

const fs = require('fs');
const path = require('path');

class AutonomousLearning {
  constructor(options = {}) {
    this._learningHistory = [];
    this._knowledgeGaps = [];
    this._discoveredPatterns = [];
    this._improvements = [];
    this._stats = {
      totalInteractions: 0,
      gapsFound: 0,
      patternsFound: 0,
      learningsApplied: 0
    };
    this._maxHistory = options.maxHistory || 1000;
    this._persistenceFile = options.persistenceFile || null;
    this._load();
  }

  /**
   * 主学习循环 — 接收交互数据，执行完整学习流程
   */
  learn(interaction = {}) {
    this._recordInteraction(interaction);
    const gaps = this._discoverGaps(interaction);
    const knowledge = this._acquireKnowledge(gaps);
    const patterns = this._discoverPatterns();
    const learning = this._activeLearn(patterns, knowledge);
    const improvements = this._improve(learning);
    this._save();
    return { gaps, knowledge, patterns, learning, improvements, timestamp: Date.now() };
  }

  /**
   * 记录交互到历史
   */
  _recordInteraction(interaction) {
    this._learningHistory.push({
      ...interaction,
      timestamp: interaction.timestamp || Date.now(),
      _id: `interact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    });
    if (this._learningHistory.length > this._maxHistory) {
      this._learningHistory = this._learningHistory.slice(-this._maxHistory);
    }
    this._stats.totalInteractions++;
  }

  /**
   * 发现知识缺口 — 从交互数据中识别不足
   */
  _discoverGaps(interaction) {
    const gaps = [];

    if (interaction.confidence !== undefined && interaction.confidence < 0.7) {
      gaps.push({
        type: 'low_confidence',
        area: interaction.intent || 'unknown',
        urgency: interaction.confidence < 0.4 ? 'critical' : 'high',
        confidence: interaction.confidence,
        suggestion: `Confidence ${(interaction.confidence * 100).toFixed(1)}% is below threshold`
      });
    }

    if (interaction.error) {
      gaps.push({
        type: 'error',
        area: interaction.errorArea || 'general',
        urgency: 'high',
        error: interaction.error,
        suggestion: 'Review error patterns and develop recovery strategies'
      });
    }

    const recentErrors = this._learningHistory
      .filter((h) => h.error && Date.now() - h.timestamp < 3600000)
      .map((h) => h.error);
    if (recentErrors.length >= 3) {
      gaps.push({
        type: 'repeated_error',
        area: 'error_handling',
        urgency: 'critical',
        count: recentErrors.length,
        suggestion: `${recentErrors.length} errors in the last hour — need systematic fix`
      });
    }

    if (interaction.intent) {
      const intentHistory = this._learningHistory.filter((h) => h.intent === interaction.intent);
      if (intentHistory.length === 1) {
        gaps.push({
          type: 'new_intent',
          area: interaction.intent,
          urgency: 'medium',
          suggestion: `First encounter with intent "${interaction.intent}" — need to learn handling`
        });
      }
    }

    if (this._learningHistory.length % 10 === 0 && this._learningHistory.length > 0) {
      gaps.push({
        type: 'periodic_review',
        area: 'system',
        urgency: 'low',
        suggestion: 'Periodic knowledge review recommended'
      });
    }

    this._knowledgeGaps = gaps;
    this._stats.gapsFound += gaps.length;
    return gaps;
  }

  /**
   * 主动获取知识 — 根据缺口生成学习任务
   */
  _acquireKnowledge(gaps) {
    const knowledge = [];

    for (const gap of gaps) {
      switch (gap.type) {
      case 'low_confidence':
        knowledge.push({
          action: 'deep_research',
          area: gap.area,
          method: 'context_expansion',
          priority: gap.urgency === 'critical' ? 1 : 2,
          steps: [
            `Analyze inputs related to "${gap.area}"`,
            'Search for similar successful interactions',
            'Build context-specific knowledge base'
          ]
        });
        break;

      case 'error':
        knowledge.push({
          action: 'error_analysis',
          area: gap.area,
          method: 'case_study',
          priority: 1,
          steps: [
            'Collect error occurrence data',
            'Identify root cause patterns',
            'Develop prevention strategies',
            'Create error recovery playbook'
          ]
        });
        break;

      case 'repeated_error':
        knowledge.push({
          action: 'systematic_fix',
          area: gap.area,
          method: 'pattern_elimination',
          priority: 0,
          steps: [
            'Root cause analysis of repeated errors',
            'Implement defensive checks',
            'Add automated recovery',
            'Monitor recurrence'
          ]
        });
        break;

      case 'new_intent':
        knowledge.push({
          action: 'intent_learning',
          area: gap.area,
          method: 'example_collection',
          priority: 3,
          steps: [
            `Study intent "${gap.area}" semantics`,
            'Collect example inputs',
            'Build intent-specific response patterns',
            'Test with varied inputs'
          ]
        });
        break;

      case 'periodic_review':
        knowledge.push({
          action: 'knowledge_review',
          area: 'system',
          method: 'comprehensive_audit',
          priority: 4,
          steps: [
            'Review recent interaction patterns',
            'Identify knowledge decay',
            'Update stale knowledge',
            'Consolidate learning'
          ]
        });
        break;
      }
    }

    return knowledge;
  }

  /**
   * 发现模式 — 分析历史交互中的规律
   */
  _discoverPatterns() {
    const patterns = [];

    if (this._learningHistory.length < 3) { return patterns; }

    const intentCounts = {};
    this._learningHistory.forEach((h) => {
      if (h.intent) {
        intentCounts[h.intent] = (intentCounts[h.intent] || 0) + 1;
      }
    });

    for (const [intent, count] of Object.entries(intentCounts)) {
      if (count >= 3) {
        patterns.push({
          type: 'repeated_intent',
          intent,
          count,
          confidence: Math.min(count / 10, 1),
          source: 'intent_frequency'
        });
      }
    }

    const hourlyDistribution = {};
    this._learningHistory.forEach((h) => {
      const hour = new Date(h.timestamp).getHours();
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    });

    const peakHours = Object.entries(hourlyDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (peakHours.length > 0 && peakHours[0][1] >= 5) {
      patterns.push({
        type: 'peak_usage',
        hours: peakHours.map(([h, c]) => ({ hour: parseInt(h), count: c })),
        confidence: Math.min(peakHours[0][1] / 20, 1),
        source: 'temporal_analysis'
      });
    }

    const errorIntents = this._learningHistory
      .filter((h) => h.error)
      .map((h) => h.intent)
      .filter(Boolean);

    if (errorIntents.length >= 3) {
      const errorIntentCounts = {};
      errorIntents.forEach((i) => {
        errorIntentCounts[i] = (errorIntentCounts[i] || 0) + 1;
      });

      for (const [intent, count] of Object.entries(errorIntentCounts)) {
        if (count >= 2) {
          patterns.push({
            type: 'error_cluster',
            intent,
            errorCount: count,
            confidence: Math.min(count / 5, 1),
            source: 'error_analysis'
          });
        }
      }
    }

    const recentConfidences = this._learningHistory
      .slice(-10)
      .map((h) => h.confidence)
      .filter((c) => c !== undefined);

    if (recentConfidences.length >= 5) {
      const avgRecent = recentConfidences.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const prevSlice = recentConfidences.slice(0, -5);
      const avgPrevious = prevSlice.length > 0
        ? prevSlice.reduce((a, b) => a + b, 0) / prevSlice.length
        : avgRecent;

      if (avgRecent < avgPrevious - 0.1) {
        patterns.push({
          type: 'confidence_degradation',
          recentAvg: avgRecent,
          previousAvg: avgPrevious,
          delta: avgRecent - avgPrevious,
          confidence: 0.8,
          source: 'trend_analysis'
        });
      }
    }

    const seen = new Set();
    const uniquePatterns = patterns.filter((p) => {
      const key = `${p.type}_${p.intent || ''}`;
      if (seen.has(key)) { return false; }
      seen.add(key);
      return true;
    });

    this._discoveredPatterns = uniquePatterns;
    this._stats.patternsFound += uniquePatterns.length;
    return uniquePatterns;
  }

  /**
   * 主动学习 — 从模式和知识中生成学习计划
   */
  _activeLearn(patterns, knowledge) {
    const learnings = [];

    for (const pattern of patterns) {
      switch (pattern.type) {
      case 'repeated_intent':
        learnings.push({
          topic: pattern.intent,
          action: 'deep_dive',
          reason: `Intent "${pattern.intent}" repeated ${pattern.count} times`,
          method: 'focused_study',
          expectedOutcome: `Improved handling of "${pattern.intent}" requests`
        });
        break;

      case 'error_cluster':
        learnings.push({
          topic: pattern.intent,
          action: 'error_prevention',
          reason: `${pattern.errorCount} errors on intent "${pattern.intent}"`,
          method: 'defensive_programming',
          expectedOutcome: `Reduced error rate for "${pattern.intent}"`
        });
        break;

      case 'confidence_degradation':
        learnings.push({
          topic: 'system_performance',
          action: 'quality_review',
          reason: `Confidence dropped from ${pattern.previousAvg.toFixed(2)} to ${pattern.recentAvg.toFixed(2)}`,
          method: 'root_cause_analysis',
          expectedOutcome: 'Restore confidence levels'
        });
        break;

      case 'peak_usage':
        learnings.push({
          topic: 'resource_optimization',
          action: 'capacity_planning',
          reason: `Peak hours: ${pattern.hours.map((h) => h.hour).join(', ')}`,
          method: 'load_balancing',
          expectedOutcome: 'Optimized resource allocation'
        });
        break;
      }
    }

    for (const k of knowledge) {
      learnings.push({
        topic: k.area,
        action: k.action,
        reason: `Knowledge acquisition: ${k.method}`,
        method: k.method,
        expectedOutcome: `Improved ${k.area} capabilities`
      });
    }

    this._learningHistory.push(...learnings.map((l) => ({
      ...l,
      timestamp: Date.now(),
      _type: 'learning_record'
    })));

    return learnings;
  }

  /**
   * 反馈改进 — 跟踪改进计划的状态
   */
  _improve(learning) {
    const improvements = [];

    for (const l of learning) {
      const improvement = {
        area: l.topic,
        action: l.action,
        method: l.method,
        status: 'planned',
        plannedAt: Date.now(),
        expectedOutcome: l.expectedOutcome
      };

      const existing = this._improvements.find(
        (i) => i.area === improvement.area && i.action === improvement.action
      );

      if (existing) {
        existing.status = 'reinforced';
        existing.reinforcedAt = Date.now();
        improvements.push(existing);
      } else {
        this._improvements.push(improvement);
        improvements.push(improvement);
      }
    }

    this._stats.learningsApplied += improvements.length;
    return improvements;
  }

  /**
   * 获取改进建议
   */
  getRecommendations() {
    const recommendations = [];

    const urgentGaps = this._knowledgeGaps.filter(
      (g) => g.urgency === 'critical' || g.urgency === 'high'
    );

    for (const gap of urgentGaps) {
      recommendations.push({
        type: 'gap_resolution',
        priority: gap.urgency === 'critical' ? 0 : 1,
        area: gap.area,
        action: `Resolve ${gap.type} gap in ${gap.area}`,
        suggestion: gap.suggestion
      });
    }

    const unreinforced = this._improvements.filter((i) => i.status === 'planned');
    for (const imp of unreinforced.slice(0, 3)) {
      recommendations.push({
        type: 'learning_application',
        priority: 2,
        area: imp.area,
        action: `Apply: ${imp.action}`,
        suggestion: imp.expectedOutcome
      });
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      historyCount: this._learningHistory.length,
      gapsFound: this._stats.gapsFound,
      patternsDiscovered: this._stats.patternsFound,
      improvementsTracked: this._improvements.length,
      improvementsByStatus: {
        planned: this._improvements.filter((i) => i.status === 'planned').length,
        reinforced: this._improvements.filter((i) => i.status === 'reinforced').length
      },
      totalInteractions: this._stats.totalInteractions,
      learningsApplied: this._stats.learningsApplied
    };
  }

  /**
   * 获取最近的历史记录
   */
  getHistory(limit = 50) {
    return this._learningHistory.slice(-limit);
  }

  /**
   * 获取发现的模式
   */
  getPatterns() {
    return [...this._discoveredPatterns];
  }

  /**
   * 获取改进列表
   */
  getImprovements() {
    return [...this._improvements];
  }

  /**
   * 清空所有学习数据
   */
  clearHistory() {
    this._learningHistory = [];
    this._knowledgeGaps = [];
    this._discoveredPatterns = [];
    this._improvements = [];
    this._stats = {
      totalInteractions: 0,
      gapsFound: 0,
      patternsFound: 0,
      learningsApplied: 0
    };
    this._save();
  }

  _load() {
    if (!this._persistenceFile) { return; }
    try {
      if (fs.existsSync(this._persistenceFile)) {
        const data = JSON.parse(fs.readFileSync(this._persistenceFile, 'utf8'));
        this._learningHistory = data.history || [];
        this._knowledgeGaps = data.gaps || [];
        this._discoveredPatterns = data.patterns || [];
        this._improvements = data.improvements || [];
        this._stats = { ...this._stats, ...(data.stats || {}) };
      }
    } catch (e) { /* silent — persistence is best-effort */ }
  }

  _save() {
    if (!this._persistenceFile) { return; }
    try {
      const dir = path.dirname(this._persistenceFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this._persistenceFile, JSON.stringify({
        history: this._learningHistory,
        gaps: this._knowledgeGaps,
        patterns: this._discoveredPatterns,
        improvements: this._improvements,
        stats: this._stats,
        savedAt: Date.now()
      }, null, 2));
    } catch (e) { /* silent — persistence is best-effort */ }
  }
}

module.exports = AutonomousLearning;
