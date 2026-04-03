/**
 * Async Execution System with Progress Feedback
 * Handles asynchronous skill execution with real-time progress updates
 */

class AsyncExecutor {
  constructor(options = {}) {
    this.executions = new Map();
    this.maxConcurrent = options.maxConcurrent || 10;
    this.executionTimeout = options.executionTimeout || 300000; // 5 minutes
    this.progressInterval = options.progressInterval || 1000; // 1 second
    this.maxHistory = options.maxHistory || 1000;
    this.history = [];
    this.listeners = new Map();
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    
    this._startCleanupTimer();
  }

  /**
   * Execute a skill asynchronously
   */
  async execute(skillName, parameters, options = {}) {
    const executionId = options.executionId || this._generateExecutionId();
    const sessionId = options.sessionId || null;
    
    // Check concurrent limit
    if (this.executions.size >= this.maxConcurrent) {
      throw new Error(`Maximum concurrent executions (${this.maxConcurrent}) reached`);
    }

    // Create execution context
    const execution = {
      id: executionId,
      skillName,
      parameters,
      sessionId,
      status: 'pending',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      progressMessage: 'Initializing...',
      result: null,
      error: null,
      steps: [],
      metadata: options.metadata || {},
      callbacks: {
        onProgress: options.onProgress || null,
        onComplete: options.onComplete || null,
        onError: options.onError || null
      }
    };

    this.executions.set(executionId, execution);
    
    // Emit creation event
    this._emitEvent('created', execution);
    
    // Start execution
    this._executeAsync(execution, options);
    
    return {
      executionId,
      status: 'pending',
      estimatedDuration: options.estimatedDuration || 0,
      checkProgressUrl: `/api/skills/executions/${executionId}/progress`
    };
  }

  /**
   * Execute async
   */
  async _executeAsync(execution, options) {
    const startTime = Date.now();
    
    try {
      execution.status = 'running';
      execution.startedAt = startTime;
      
      this._emitEvent('started', execution);
      
      // Get skill executor
      const executor = options.executor || this._getDefaultExecutor();
      
      // Create progress tracker
      const progressTracker = this._createProgressTracker(execution);
      
      // Update progress
      await this._updateProgress(execution, 10, 'Starting skill execution...');
      
      // Execute skill with progress tracking
      const result = await executor.execute(execution.skillName, execution.parameters, {
        executionId: execution.id,
        sessionId: execution.sessionId,
        onProgress: (progress, message) => {
          this._updateProgress(execution, progress, message);
        },
        signal: execution.abortController?.signal
      });
      
      // Update final progress
      await this._updateProgress(execution, 100, 'Execution completed successfully');
      
      execution.status = 'completed';
      execution.completedAt = Date.now();
      execution.result = result;
      execution.duration = execution.completedAt - execution.startedAt;
      
      // Add to history
      this._addToHistory(execution);
      
      // Emit completion event
      this._emitEvent('completed', execution);
      
      // Call completion callback
      if (execution.callbacks.onComplete) {
        execution.callbacks.onComplete(execution);
      }
      
    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = Date.now();
      execution.error = error.message;
      execution.duration = execution.completedAt - execution.startedAt;
      
      // Add to history
      this._addToHistory(execution);
      
      // Emit error event
      this._emitEvent('failed', execution);
      
      // Call error callback
      if (execution.callbacks.onError) {
        execution.callbacks.onError(execution, error);
      }
    }
  }

  /**
   * Create progress tracker
   */
  _createProgressTracker(execution) {
    return {
      setProgress: (progress, message) => {
        this._updateProgress(execution, progress, message);
      },
      
      addStep: (stepName, description) => {
        const step = {
          name: stepName,
          description,
          status: 'pending',
          startedAt: null,
          completedAt: null
        };
        
        execution.steps.push(step);
        return {
          start: () => {
            step.status = 'running';
            step.startedAt = Date.now();
            this._emitEvent('step_started', { execution, step });
          },
          complete: (result) => {
            step.status = 'completed';
            step.completedAt = Date.now();
            step.result = result;
            this._emitEvent('step_completed', { execution, step });
          },
          fail: (error) => {
            step.status = 'failed';
            step.completedAt = Date.now();
            step.error = error;
            this._emitEvent('step_failed', { execution, step });
          }
        };
      }
    };
  }

  /**
   * Update execution progress
   */
  async _updateProgress(execution, progress, message) {
    execution.progress = Math.min(100, Math.max(0, progress));
    execution.progressMessage = message || `Progress: ${progress}%`;
    
    this._emitEvent('progress', {
      executionId: execution.id,
      progress: execution.progress,
      message: execution.progressMessage,
      timestamp: Date.now()
    });
    
    // Call progress callback
    if (execution.callbacks.onProgress) {
      execution.callbacks.onProgress(execution.progress, execution.progressMessage);
    }
  }

  /**
   * Get execution status
   */
  getExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return null;
    }
    
    return {
      id: execution.id,
      skillName: execution.skillName,
      status: execution.status,
      progress: execution.progress,
      progressMessage: execution.progressMessage,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      duration: execution.duration,
      steps: execution.steps,
      result: execution.status === 'completed' ? execution.result : null,
      error: execution.status === 'failed' ? execution.error : null
    };
  }

  /**
   * Get execution progress
   */
  getProgress(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return null;
    }
    
    return {
      executionId: execution.id,
      progress: execution.progress,
      message: execution.progressMessage,
      status: execution.status,
      timestamp: Date.now()
    };
  }

  /**
   * Wait for execution to complete
   */
  async waitForCompletion(executionId, options = {}) {
    const timeout = options.timeout || this.executionTimeout;
    const pollInterval = options.pollInterval || 1000;
    
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const check = () => {
        const execution = this.executions.get(executionId);
        
        if (!execution) {
          reject(new Error(`Execution ${executionId} not found`));
          return;
        }
        
        if (execution.status === 'completed') {
          resolve(execution.result);
          return;
        }
        
        if (execution.status === 'failed') {
          reject(new Error(execution.error));
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Execution timeout after ${timeout}ms`));
          return;
        }
        
        setTimeout(check, pollInterval);
      };
      
      check();
    });
  }

  /**
   * Cancel execution
   */
  cancel(executionId) {
    const execution = this.executions.get(executionId);
    
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }
    
    if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
      throw new Error(`Execution ${executionId} is already ${execution.status}`);
    }
    
    execution.status = 'cancelled';
    execution.completedAt = Date.now();
    execution.error = 'Cancelled by user';
    
    // Abort if abort controller exists
    if (execution.abortController) {
      execution.abortController.abort();
    }
    
    this._emitEvent('cancelled', execution);
    this._addToHistory(execution);
    
    return {
      executionId,
      status: 'cancelled',
      timestamp: Date.now()
    };
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event).add(callback);
    
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  _emitEvent(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[AsyncExecutor] Event listener error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get all active executions
   */
  getActiveExecutions() {
    const active = [];
    
    for (const [id, execution] of this.executions) {
      if (execution.status === 'pending' || execution.status === 'running') {
        active.push(this.getExecution(id));
      }
    }
    
    return active;
  }

  /**
   * Get execution history
   */
  getHistory(options = {}) {
    const { limit = 50, offset = 0, skillName = null, status = null } = options;
    
    let history = [...this.history];
    
    if (skillName) {
      history = history.filter(h => h.skillName === skillName);
    }
    
    if (status) {
      history = history.filter(h => h.status === status);
    }
    
    history.sort((a, b) => b.createdAt - a.createdAt);
    
    return history.slice(offset, offset + limit);
  }

  /**
   * Add to history
   */
  _addToHistory(execution) {
    const historyEntry = {
      id: execution.id,
      skillName: execution.skillName,
      parameters: execution.parameters,
      status: execution.status,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      duration: execution.duration,
      progress: execution.progress,
      steps: execution.steps,
      error: execution.error,
      result: execution.status === 'completed' ? execution.result : null
    };
    
    this.history.unshift(historyEntry);
    
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const active = this.getActiveExecutions();
    const completed = this.history.filter(h => h.status === 'completed');
    const failed = this.history.filter(h => h.status === 'failed');
    
    const totalDuration = completed.reduce((sum, h) => sum + (h.duration || 0), 0);
    const avgDuration = completed.length > 0 ? totalDuration / completed.length : 0;
    
    return {
      active: active.length,
      total: this.executions.size,
      completed: completed.length,
      failed: failed.length,
      historySize: this.history.length,
      averageDuration: avgDuration,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * Cleanup old executions
   */
  _cleanupOldExecutions() {
    const now = Date.now();
    const toDelete = [];
    
    for (const [id, execution] of this.executions) {
      if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
        const age = now - execution.completedAt;
        if (age > 3600000) { // 1 hour
          toDelete.push(id);
        }
      } else if (now - execution.createdAt > this.executionTimeout) {
        // Timeout running executions
        execution.status = 'failed';
        execution.error = 'Execution timeout';
        execution.completedAt = now;
        this._addToHistory(execution);
        toDelete.push(id);
      }
    }
    
    for (const id of toDelete) {
      this.executions.delete(id);
    }
    
    if (toDelete.length > 0) {
      console.log(`[AsyncExecutor] Cleaned up ${toDelete.length} old executions`);
    }
  }

  /**
   * Start cleanup timer
   */
  _startCleanupTimer() {
    setInterval(() => {
      this._cleanupOldExecutions();
    }, this.cleanupInterval);
  }

  /**
   * Generate execution ID
   */
  _generateExecutionId() {
    return `exec_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default executor (placeholder)
   */
  _getDefaultExecutor() {
    return {
      execute: async (skillName, parameters, options) => {
        // This is a placeholder - in real implementation, 
        // this would call the actual skill manager
        return new Promise((resolve, reject) => {
          const duration = Math.random() * 5000 + 1000; // 1-6 seconds
          
          setTimeout(() => {
            resolve({
              success: true,
              message: `Skill ${skillName} executed successfully`,
              data: { skillName, parameters },
              duration
            });
          }, duration);
        });
      }
    };
  }

  /**
   * Clear all executions
   */
  clear() {
    this.executions.clear();
    this.history = [];
    this.listeners.clear();
  }
}

module.exports = { AsyncExecutor };