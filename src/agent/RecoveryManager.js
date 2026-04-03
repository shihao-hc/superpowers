const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class RecoveryManager {
  constructor(options = {}) {
    this.stateDir = path.resolve(options.stateDir || './data/agent-states');
    this.agents = new Map();
    this.tasks = new Map();
    this.recoveryLog = [];
    this.maxLogSize = options.maxLogSize || 100;
    this._ensureDir();
  }

  _sanitizeId(id) {
    if (!id || typeof id !== 'string') return null;
    return id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
  }

  _safePath(filename) {
    const sanitized = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
    const resolved = path.resolve(this.stateDir, sanitized);
    if (!resolved.startsWith(this.stateDir)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  _ensureDir() {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  saveAgentState(agentId, state) {
    const safeId = this._sanitizeId(agentId);
    if (!safeId) return null;

    const stateData = {
      agentId: safeId,
      coarseState: state.coarseState || 'ready',
      fineState: state.fineState || 'idle',
      data: state.data || {},
      timestamp: Date.now()
    };

    this.agents.set(safeId, stateData);

    const filePath = this._safePath(`${safeId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(stateData, null, 2), 'utf-8');
    } catch (error) {
      console.error('[Recovery] Save state failed:', error.message);
    }

    return stateData;
  }

  loadAgentState(agentId) {
    const safeId = this._sanitizeId(agentId);
    if (!safeId) return null;

    const filePath = this._safePath(`${safeId}.json`);

    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.agents.set(safeId, data);
        return data;
      }
    } catch (error) {
      console.error('[Recovery] Load state failed:', error.message);
    }

    return null;
  }

  saveTaskState(taskId, state) {
    const safeId = this._sanitizeId(taskId);
    if (!safeId) return null;

    const taskData = {
      taskId: safeId,
      status: state.status || 'pending',
      assignedTo: state.assignedTo || null,
      progress: state.progress || 0,
      data: state.data || {},
      timestamp: Date.now()
    };

    this.tasks.set(safeId, taskData);

    const filePath = this._safePath(`task_${safeId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(taskData, null, 2), 'utf-8');
    } catch (error) {
      console.error('[Recovery] Save task failed:', error.message);
    }

    return taskData;
  }

  loadTaskState(taskId) {
    const safeId = this._sanitizeId(taskId);
    if (!safeId) return null;

    const filePath = this._safePath(`task_${safeId}.json`);

    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (error) {
      console.error('[Recovery] Load task failed:', error.message);
    }

    return null;
  }

  async recoverAfterRestart(agents, tasks) {
    const recoveryReport = {
      timestamp: Date.now(),
      agentsRecovered: 0,
      agentsReset: 0,
      tasksRecovered: 0,
      tasksInterrupted: 0,
      notifications: []
    };

    const stateFiles = fs.readdirSync(this.stateDir)
      .filter(f => f.endsWith('.json') && !f.startsWith('task_'));

    for (const file of stateFiles) {
      const agentId = file.replace('.json', '');
      const savedState = this.loadAgentState(agentId);

      if (!savedState) continue;

      const agent = agents.get(agentId);
      if (!agent) {
        this._addToLog('agent_not_found', { agentId });
        continue;
      }

      if (savedState.coarseState !== 'ready') {
        this.saveAgentState(agentId, {
          coarseState: 'ready',
          fineState: 'idle',
          data: { recoveredFrom: savedState.coarseState }
        });

        agent.status = 'idle';
        recoveryReport.agentsReset++;

        recoveryReport.notifications.push({
          type: 'agent_reset',
          agentId,
          previousState: savedState.coarseState
        });
      }

      recoveryReport.agentsRecovered++;
    }

    const taskFiles = fs.readdirSync(this.stateDir)
      .filter(f => f.startsWith('task_'));

    for (const file of taskFiles) {
      const taskId = file.replace('task_', '').replace('.json', '');
      const savedTask = this.loadTaskState(taskId);

      if (!savedTask) continue;

      if (savedTask.status === 'running') {
        this.saveTaskState(taskId, {
          status: 'interrupted',
          assignedTo: null,
          data: { ...savedTask.data, interruptedAt: Date.now() }
        });

        recoveryReport.tasksInterrupted++;

        recoveryReport.notifications.push({
          type: 'task_interrupted',
          taskId,
          assignedTo: savedTask.assignedTo
        });
      }

      recoveryReport.tasksRecovered++;
    }

    this._addToLog('recovery', recoveryReport);

    return recoveryReport;
  }

  async cancelAgent(agentId, maxRetries = 3) {
    const agent = this.agents.get(agentId);
    if (!agent) return { success: false, error: 'Agent not found' };

    let retries = 0;

    while (retries < maxRetries) {
      try {
        this.saveAgentState(agentId, {
          coarseState: 'shutdown',
          fineState: 'cancelling',
          data: { cancelRequestedAt: Date.now(), retry: retries }
        });

        await new Promise(r => setTimeout(r, 500));

        const currentState = this.loadAgentState(agentId);
        if (currentState && currentState.coarseState === 'shutdown') {
          this._addToLog('cancel_success', { agentId, retries });
          return { success: true, retries };
        }

        retries++;
      } catch (error) {
        retries++;
      }
    }

    this.saveAgentState(agentId, {
      coarseState: 'shutdown',
      fineState: 'force_stopped',
      data: { forcedAt: Date.now() }
    });

    this._addToLog('cancel_forced', { agentId, retries });

    return { success: true, forced: true, retries };
  }

  getAgentState(agentId) {
    return this.agents.get(agentId) || this.loadAgentState(agentId);
  }

  getTaskState(taskId) {
    return this.tasks.get(taskId) || this.loadTaskState(taskId);
  }

  getAllAgentStates() {
    return Array.from(this.agents.values());
  }

  getAllTaskStates() {
    return Array.from(this.tasks.values());
  }

  getInconsistentAgents() {
    const inconsistent = [];

    for (const [agentId, state] of this.agents) {
      if (state.coarseState !== 'ready' && state.coarseState !== 'shutdown') {
        inconsistent.push({
          agentId,
          state: state.coarseState,
          fineState: state.fineState,
          lastUpdate: state.timestamp
        });
      }
    }

    return inconsistent;
  }

  _addToLog(type, data) {
    this.recoveryLog.push({
      type,
      data,
      timestamp: Date.now()
    });

    if (this.recoveryLog.length > this.maxLogSize) {
      this.recoveryLog = this.recoveryLog.slice(-this.maxLogSize);
    }
  }

  getRecoveryLog(limit = 50) {
    return this.recoveryLog.slice(-limit);
  }

  cleanupOldStates(maxAge = 86400000) {
    const now = Date.now();
    const files = fs.readdirSync(this.stateDir);

    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(this.stateDir, file);

      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (error) {}
    }

    return cleaned;
  }

  getStats() {
    return {
      agents: this.agents.size,
      tasks: this.tasks.size,
      logEntries: this.recoveryLog.length,
      stateFiles: fs.readdirSync(this.stateDir).length
    };
  }
}

module.exports = { RecoveryManager };
