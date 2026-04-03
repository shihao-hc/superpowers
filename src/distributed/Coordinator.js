class DistributedCoordinator {
  constructor() {
    this.nodes = new Map();
    this.tasks = new Map();
    this.consensusThreshold = 0.51;
  }

  registerNode(nodeId, nodeInfo) {
    this.nodes.set(nodeId, {
      ...nodeInfo,
      registeredAt: new Date().toISOString(),
      status: 'active'
    });
  }

  unregisterNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = 'inactive';
      node.unregisteredAt = new Date().toISOString();
    }
  }

  async proposeTask(task) {
    const taskId = `task-${Date.now()}`;
    this.tasks.set(taskId, {
      ...task,
      taskId,
      status: 'proposed',
      proposedAt: new Date().toISOString(),
      votes: []
    });
    return taskId;
  }

  async vote(taskId, nodeId, vote) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.votes.push({ nodeId, vote, timestamp: new Date().toISOString() });
      const votesFor = task.votes.filter(v => v.vote === 'approve').length;
      const totalVotes = task.votes.length;
      const threshold = Math.ceil(this.nodes.size * this.consensusThreshold);
      if (votesFor >= threshold) {
        task.status = 'approved';
      } else if (totalVotes - votesFor >= threshold) {
        task.status = 'rejected';
      }
    }
  }

  getTaskStatus(taskId) {
    return this.tasks.get(taskId);
  }

  getActiveNodes() {
    return Array.from(this.nodes.values()).filter(n => n.status === 'active');
  }
}

module.exports = { DistributedCoordinator };
