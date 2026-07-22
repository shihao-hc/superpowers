/**
 * Relationship - 关系系统
 *
 * 让AI能够建立和维护与用户的关系
 * 超越单次对话的关系记忆
 */

const fs = require('fs');
const path = require('path');

class Relationship {
  constructor(brainSystem) {
    this.brain = brainSystem;

    this.storagePath = path.join(process.cwd(), '.opencode', 'relationships.json');

    // 关系类型
    this.types = {
      stranger: { intimacy: 0, trust: 0 },
      acquaintance: { intimacy: 0.3, trust: 0.3 },
      friend: { intimacy: 0.6, trust: 0.6 },
      partner: { intimacy: 0.8, trust: 0.8 },
      mentor: { intimacy: 0.5, trust: 0.9 }
    };

    // 当前关系
    this.current = 'stranger';

    // 关系历史
    this.relationships = {};

    // 交互统计
    this.stats = {
      totalInteractions: 0,
      successfulInteractions: 0,
      failedInteractions: 0,
      lastInteraction: null
    };

    this._load();

    console.log('[Relationship] 关系系统已初始化');
  }

  /**
   * 记录交互
   */
  recordInteraction(userId, interaction) {
    if (!this.relationships[userId]) {
      this.relationships[userId] = this._createRelationship(userId);
    }

    const rel = this.relationships[userId];
    rel.interactions++;
    rel.lastInteraction = Date.now();
    this.stats.totalInteractions++;

    if (interaction.success) {
      rel.successfulInteractions++;
      rel.trust = Math.min(1, rel.trust + 0.05);
      this.stats.successfulInteractions++;
    } else {
      rel.failedInteractions++;
      this.stats.failedInteractions++;
    }

    // 更新亲密值
    this._updateIntimacy(rel);

    // 更新关系类型
    this._updateType(rel);

    this._save();

    return rel;
  }

  /**
   * 获取关系
   */
  getRelationship(userId) {
    if (!this.relationships[userId]) {
      this.relationships[userId] = this._createRelationship(userId);
    }
    return this.relationships[userId];
  }

  /**
   * 调整关系
   */
  adjustRelationship(userId, adjustment) {
    const rel = this.getRelationship(userId);

    if (adjustment.intimacy) {
      rel.intimacy = Math.max(0, Math.min(1, rel.intimacy + adjustment.intimacy));
    }
    if (adjustment.trust) {
      rel.trust = Math.max(0, Math.min(1, rel.trust + adjustment.trust));
    }

    this._updateType(rel);
    this._save();

    return rel;
  }

  /**
   * 记住用户偏好
   */
  rememberPreference(userId, pref) {
    const rel = this.getRelationship(userId);

    if (!rel.preferences) {
      rel.preferences = {};
    }

    for (const [key, value] of Object.entries(pref)) {
      rel.preferences[key] = value;
    }

    this._save();

    return rel;
  }

  /**
   * 回忆偏好
   */
  recallPreference(userId) {
    const rel = this.relationships[userId];
    return rel?.preferences || {};
  }

  /**
   * 建立关系
   */
  buildConnection(userId, content) {
    const rel = this.getRelationship(userId);

    // 检查共同点
    if (content.topics) {
      if (!rel.sharedTopics) {rel.sharedTopics = [];}
      for (const topic of content.topics) {
        if (!rel.sharedTopics.includes(topic)) {
          rel.sharedTopics.push(topic);
        }
      }
      rel.intimacy = Math.min(1, rel.intimacy + 0.1);
    }

    // 检查信任建立
    if (content.helpful) {
      rel.trust = Math.min(1, rel.trust + 0.1);
      rel.trustBuilding = true;
    }

    this._updateType(rel);
    this._save();

    return rel;
  }

  /**
   * 获取关系建议
   */
  getAdvice(userId) {
    const rel = this.getRelationship(userId);
    const advice = [];

    if (rel.type === 'stranger') {
      advice.push('先自我介绍，建立基本信任');
    }
    if (rel.intimacy < 0.3) {
      advice.push('增加互动，建立亲密关系');
    }
    if (rel.trust < 0.5) {
      advice.push('提供可靠帮助，建立信任');
    }
    if (rel.sharedTopics?.length > 0) {
      advice.push(`可以聊共同话题: ${rel.sharedTopics[0]}`);
    }

    return advice;
  }

  /**
   * 创建关系
   */
  _createRelationship(userId) {
    return {
      userId,
      type: 'stranger',
      intimacy: 0,
      trust: 0,
      interactions: 0,
      successfulInteractions: 0,
      failedInteractions: 0,
      createdAt: Date.now(),
      lastInteraction: null,
      preferences: {},
      sharedTopics: [],
      milestones: []
    };
  }

  /**
   * 更新亲密值
   */
  _updateIntimacy(rel) {
    const { interactions, successfulInteractions, trust } = rel;
    const successRate = interactions > 0 ? successfulInteractions / interactions : 0;

    // 基于交互频率和成功率更新
    rel.intimacy = Math.min(1, (
      (interactions * 0.1) +
      (successRate * 0.4) +
      (trust * 0.5)
    ));
  }

  /**
   * 更新关系类型
   */
  _updateType(rel) {
    const thresholds = [
      { type: 'partner', threshold: 0.8 },
      { type: 'friend', threshold: 0.6 },
      { type: 'acquaintance', threshold: 0.3 },
      { type: 'stranger', threshold: 0 }
    ];

    for (const t of thresholds) {
      if (rel.intimacy >= t.threshold) {
        rel.type = t.type;
        break;
      }
    }
  }

  /**
   * 保存
   */
  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify({
        relationships: this.relationships,
        stats: this.stats
      }, null, 2));
    } catch (e) {
      console.log('[Relationship] 保存失败:', e.message);
    }
  }

  /**
   * 加载
   */
  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        this.relationships = data.relationships || {};
        this.stats = data.stats || this.stats;
      }
    } catch (e) {
      console.log('[Relationship] 加载失败:', e.message);
    }
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      ...this.stats,
      relationshipCount: Object.keys(this.relationships).length,
      averageIntimacy: Object.values(this.relationships).reduce((sum, r) => sum + r.intimacy, 0) / Math.max(1, Object.keys(this.relationships).length)
    };
  }
}

module.exports = Relationship;