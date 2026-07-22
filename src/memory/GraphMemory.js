/**
 * Graph Memory System
 * 图记忆系统 - 用于实体关系追踪
 * 基于 Neo4j 风格的设计
 */

const fs = require('fs');
const path = require('path');

class GraphMemory {
  constructor(options = {}) {
    this.options = {
      storageDir: options.storageDir || './memory/graph',
      ...options
    };

    this.nodes = new Map();
    this.relationships = new Map();
    this.indices = {
      byType: new Map(),
      byLabel: new Map()
    };

    this.ensureStorage();
    this.load();
  }

  /**
   * 确保存储目录
   */
  ensureStorage() {
    if (!fs.existsSync(this.options.storageDir)) {
      fs.mkdirSync(this.options.storageDir, { recursive: true });
    }
  }

  /**
   * 创建节点
   */
  createNode(id, type, properties = {}, labels = []) {
    const node = {
      id,
      type,
      properties,
      labels,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.nodes.set(id, node);

    // 更新索引
    this.updateIndices(node);

    return node;
  }

  /**
   * 创建关系
   */
  createRelationship(sourceId, targetId, type, properties = {}) {
    const id = `${sourceId}_${type}_${targetId}`;

    const relationship = {
      id,
      source: sourceId,
      target: targetId,
      type,
      properties,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.relationships.set(id, relationship);

    return relationship;
  }

  /**
   * 获取节点
   */
  getNode(id) {
    return this.nodes.get(id) || null;
  }

  /**
   * 获取关系
   */
  getRelationship(id) {
    return this.relationships.get(id) || null;
  }

  /**
   * 更新节点
   */
  updateNode(id, properties) {
    const node = this.nodes.get(id);
    if (!node) {return null;}

    Object.assign(node.properties, properties);
    node.updatedAt = Date.now();

    return node;
  }

  /**
   * 删除节点及其关系
   */
  deleteNode(id) {
    const node = this.nodes.get(id);
    if (!node) {return false;}

    // 删除相关关系
    for (const [relId, rel] of this.relationships) {
      if (rel.source === id || rel.target === id) {
        this.relationships.delete(relId);
      }
    }

    // 从索引中移除
    this.removeFromIndices(node);
    this.nodes.delete(id);

    return true;
  }

  /**
   * 按类型查询节点
   */
  findNodesByType(type) {
    const nodes = this.indices.byType.get(type);
    if (!nodes) {return [];}

    return Array.from(nodes).map((id) => this.nodes.get(id)).filter(Boolean);
  }

  /**
   * 按标签查询节点
   */
  findNodesByLabel(label) {
    const nodes = this.indices.byLabel.get(label);
    if (!nodes) {return [];}

    return Array.from(nodes).map((id) => this.nodes.get(id)).filter(Boolean);
  }

  /**
   * 获取节点的所有关系
   */
  getNodeRelationships(id) {
    const results = [];

    for (const rel of this.relationships.values()) {
      if (rel.source === id || rel.target === id) {
        results.push({
          ...rel,
          sourceNode: this.nodes.get(rel.source),
          targetNode: this.nodes.get(rel.target)
        });
      }
    }

    return results;
  }

  /**
   * 获取节点的关系（指定方向和类型）
   */
  getNodeRelations(id, options = {}) {
    const { direction = 'both', type = null } = options;
    const results = [];

    for (const rel of this.relationships.values()) {
      let include = false;

      if (direction === 'outgoing' && rel.source === id) {
        include = true;
      } else if (direction === 'incoming' && rel.target === id) {
        include = true;
      } else if (direction === 'both' && (rel.source === id || rel.target === id)) {
        include = true;
      }

      if (include && (!type || rel.type === type)) {
        results.push(rel);
      }
    }

    return results;
  }

  /**
   * 路径查询（简化版 BFS）
   */
  findPath(startId, endId, maxDepth = 5) {
    const visited = new Set();
    const queue = [{ id: startId, path: [] }];

    while (queue.length > 0) {
      const current = queue.shift();

      if (current.id === endId) {
        return current.path;
      }

      if (current.path.length >= maxDepth) {
        continue;
      }

      visited.add(current.id);

      const relations = this.getNodeRelations(current.id, { direction: 'outgoing' });

      for (const rel of relations) {
        if (!visited.has(rel.target)) {
          queue.push({
            id: rel.target,
            path: [...current.path, rel]
          });
        }
      }
    }

    return null;
  }

  /**
   * 图遍历查询
   */
  traverse(startId, options = {}) {
    const {
      depth = 2,
      direction = 'both',
      types = null
    } = options;

    const results = [];
    const visited = new Set();

    const dfs = (nodeId, currentDepth, path) => {
      if (currentDepth > depth || visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);

      if (currentDepth > 0) {
        results.push({ node: this.nodes.get(nodeId), depth: currentDepth, path: [...path] });
      }

      const relations = this.getNodeRelations(nodeId, { direction });

      for (const rel of relations) {
        const nextId = rel.source === nodeId ? rel.target : rel.source;

        if (!types || types.includes(rel.type)) {
          dfs(nextId, currentDepth + 1, [...path, rel]);
        }
      }
    };

    dfs(startId, 0, []);

    return results;
  }

  /**
   * 查询两个节点是否相连
   */
  areConnected(id1, id2) {
    for (const rel of this.relationships.values()) {
      if ((rel.source === id1 && rel.target === id2) ||
          (rel.source === id2 && rel.target === id1)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      nodes: this.nodes.size,
      relationships: this.relationships.size,
      nodeTypes: this.indices.byType.size,
      labels: this.indices.byLabel.size
    };
  }

  /**
   * 更新索引
   */
  updateIndices(node) {
    // 按类型索引
    if (!this.indices.byType.has(node.type)) {
      this.indices.byType.set(node.type, new Set());
    }
    this.indices.byType.get(node.type).add(node.id);

    // 按标签索引
    for (const label of node.labels) {
      if (!this.indices.byLabel.has(label)) {
        this.indices.byLabel.set(label, new Set());
      }
      this.indices.byLabel.get(label).add(node.id);
    }
  }

  /**
   * 从索引中移除
   */
  removeFromIndices(node) {
    const typeSet = this.indices.byType.get(node.type);
    if (typeSet) {
      typeSet.delete(node.id);
      if (typeSet.size === 0) {
        this.indices.byType.delete(node.type);
      }
    }

    for (const label of node.labels) {
      const labelSet = this.indices.byLabel.get(label);
      if (labelSet) {
        labelSet.delete(node.id);
        if (labelSet.size === 0) {
          this.indices.byLabel.delete(label);
        }
      }
    }
  }

  /**
   * 保存到磁盘
   */
  save() {
    const data = {
      nodes: Object.fromEntries(this.nodes),
      relationships: Object.fromEntries(this.relationships)
    };

    fs.writeFileSync(
      path.join(this.options.storageDir, 'graph.json'),
      JSON.stringify(data, null, 2)
    );
  }

  /**
   * 从磁盘加载
   */
  load() {
    const filePath = path.join(this.options.storageDir, 'graph.json');

    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        for (const [id, node] of Object.entries(data.nodes || {})) {
          this.nodes.set(id, node);
          this.updateIndices(node);
        }

        for (const [id, rel] of Object.entries(data.relationships || {})) {
          this.relationships.set(id, rel);
        }
      } catch (error) {
        console.error('Failed to load graph:', error.message);
      }
    }
  }

  /**
   * 清空图
   */
  clear() {
    this.nodes.clear();
    this.relationships.clear();
    this.indices.byType.clear();
    this.indices.byLabel.clear();
  }
}

module.exports = { GraphMemory };
