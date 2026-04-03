/**
 * Agent Skill Integration Example
 * Demonstrates how to use SkillDiscovery, SessionManager, MultimodalPresenter, and AsyncExecutor
 */

const AgentLoop = require('../src/agent/AgentLoop');
const { SkillDiscovery } = require('../src/skills/agent/SkillDiscovery');
const { SkillManager } = require('../src/skills/SkillManager');
const { SessionManager } = require('../src/skills/agent/SessionManager');
const { MultimodalPresenter } = require('../src/skills/agent/MultimodalPresenter');
const { AsyncExecutor } = require('../src/skills/agent/AsyncExecutor');

class AgentSkillIntegrationExample {
  constructor() {
    this.skillManager = new SkillManager();
    this.skillDiscovery = new SkillDiscovery({ skillManager: this.skillManager });
    this.sessionManager = new SessionManager();
    this.presenter = new MultimodalPresenter();
    this.executor = new AsyncExecutor();
    this.agentLoop = null;
  }

  /**
   * Initialize the integration
   */
  async initialize() {
    console.log('🚀 Initializing Agent Skill Integration...');
    
    // Load skills
    await this.skillManager.loadSkills();
    console.log(`✅ Loaded ${this.skillManager.getSkills().length} skills`);
    
    // Create AgentLoop with skill integration
    this.agentLoop = new AgentLoop({
      skillDiscovery: this.skillDiscovery,
      skillManager: this.skillManager,
      maxIterations: 10,
      timeout: 120000,
      onStep: (step) => this.handleStep(step),
      onError: (error) => this.handleError(error)
    });
    
    console.log('✅ AgentLoop initialized with skill integration');
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log('✅ Integration ready!');
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Async executor events
    this.executor.on('progress', (data) => {
      console.log(`📊 Progress: ${data.progress}% - ${data.message}`);
    });
    
    this.executor.on('completed', (execution) => {
      console.log(`✅ Execution completed: ${execution.skillName} (${execution.duration}ms)`);
    });
    
    this.executor.on('failed', (execution) => {
      console.error(`❌ Execution failed: ${execution.skillName} - ${execution.error}`);
    });
  }

  /**
   * Handle agent step
   */
  handleStep(step) {
    console.log(`🔄 Step ${step.iteration}: ${step.action.type}`);
    
    if (step.action.type === 'skillCall') {
      console.log(`   Skill: ${step.action.params.skillName}`);
    } else if (step.action.type === 'mcpCall') {
      console.log(`   MCP Tool: ${step.action.params.toolFullName}`);
    }
  }

  /**
   * Handle agent error
   */
  handleError(error) {
    console.error('❌ Agent error:', error.message);
  }

  /**
   * Run a simple example
   */
  async runSimpleExample() {
    console.log('\n📝 Running Simple Example: Create a sales chart');
    
    // Create session
    const session = this.sessionManager.getSession('example-session-1', {
      userId: 'user-123',
      context: { locale: 'zh-CN' }
    });
    
    // Add to history
    this.sessionManager.addToHistory(session.id, {
      type: 'user',
      content: 'Create a sales chart for Q1 2026'
    });
    
    // Analyze input
    const analysis = this.skillDiscovery.analyzeInput('Create a sales chart for Q1 2026');
    console.log('🔍 Skill Analysis:', analysis);
    
    if (analysis.hasMatch) {
      const topSkill = analysis.matchedSkills[0];
      console.log(`🎯 Best skill match: ${topSkill.name} (confidence: ${topSkill.confidence})`);
      
      // Execute skill asynchronously
      const execution = await this.executor.execute(topSkill.name, {
        data: this.generateSampleSalesData(),
        chartType: 'bar',
        title: 'Q1 2026 Sales'
      }, {
        sessionId: session.id,
        onProgress: (progress, message) => {
          this.sessionManager.addToHistory(session.id, {
            type: 'system',
            content: `Progress: ${progress}% - ${message}`
          });
        }
      });
      
      console.log(`⏳ Execution started: ${execution.executionId}`);
      
      // Wait for completion
      try {
        const result = await this.executor.waitForCompletion(execution.executionId);
        console.log('📊 Execution result:', result);
        
        // Present result
        const presentation = await this.presenter.present({
          format: 'image',
          imageUrl: result.chartUrl || 'https://example.com/chart.png',
          alt: 'Sales Chart Q1 2026'
        }, {
          enableStyles: true
        });
        
        console.log('🎨 Presentation:', presentation);
        
        // Record execution
        this.sessionManager.recordSkillExecution(session.id, topSkill.name, execution.executionId, {
          success: true,
          duration: result.duration,
          result: presentation
        });
        
        return presentation;
      } catch (error) {
        console.error('❌ Execution failed:', error.message);
        throw error;
      }
    }
  }

  /**
   * Run advanced example with multiple skills
   */
  async runAdvancedExample() {
    console.log('\n🚀 Running Advanced Example: Multi-skill workflow');
    
    const session = this.sessionManager.getSession('example-session-2', {
      userId: 'user-456',
      context: { locale: 'zh-CN', department: 'sales' }
    });
    
    // Define workflow steps
    const workflow = [
      {
        step: 'data-collection',
        skill: 'data-cleaner',
        description: 'Clean and prepare sales data',
        parameters: {
          data: this.generateSampleSalesData(),
          operations: ['remove_nulls', 'format_dates', 'normalize']
        }
      },
      {
        step: 'analysis',
        skill: 'statistics',
        description: 'Analyze sales trends',
        parameters: {
          data: '$data-collection.result',
          metrics: ['mean', 'median', 'trend']
        }
      },
      {
        step: 'visualization',
        skill: 'chart-generator',
        description: 'Create visualization',
        parameters: {
          data: '$analysis.result',
          chartType: 'line',
          title: 'Sales Trends 2026'
        }
      },
      {
        step: 'report',
        skill: 'pdf-generator',
        description: 'Generate PDF report',
        parameters: {
          template: 'quarterly-report',
          data: {
            analysis: '$analysis.result',
            chart: '$visualization.result'
          }
        }
      }
    ];
    
    const results = {};
    
    for (const step of workflow) {
      console.log(`\n🔄 Step: ${step.description}`);
      
      // Resolve parameters
      const resolvedParams = this.resolveParameters(step.parameters, results);
      
      // Execute step
      const execution = await this.executor.execute(step.skill, resolvedParams, {
        sessionId: session.id
      });
      
      try {
        const result = await this.executor.waitForCompletion(execution.executionId);
        results[step.step] = result;
        
        // Record execution
        this.sessionManager.recordSkillExecution(session.id, step.skill, execution.executionId, {
          success: true,
          duration: result.duration,
          result
        });
        
        console.log(`✅ Step completed: ${step.step}`);
      } catch (error) {
        console.error(`❌ Step failed: ${step.step} - ${error.message}`);
        throw error;
      }
    }
    
    // Present final result
    const finalPresentation = await this.presenter.present(results.report, {
      format: 'pdf'
    });
    
    console.log('\n🎉 Workflow completed!');
    return finalPresentation;
  }

  /**
   * Run WebSocket example (simulated)
   */
  async runWebSocketExample() {
    console.log('\n🔌 Running WebSocket Example (simulated)');
    
    // Simulate WebSocket-like behavior
    const mockWebSocket = {
      send: (data) => {
        console.log('📤 WebSocket send:', data.type);
      }
    };
    
    const session = this.sessionManager.getSession('example-session-3');
    
    // Simulate client request
    const clientRequest = {
      type: 'execute_skill',
      skillName: 'docx-generator',
      parameters: {
        template: 'business-letter',
        data: {
          recipient: 'John Doe',
          subject: 'Quarterly Report',
          content: 'Please find attached the quarterly report...'
        }
      }
    };
    
    console.log('📥 Client request:', clientRequest);
    
    // Execute skill
    const execution = await this.executor.execute(clientRequest.skillName, clientRequest.parameters, {
      sessionId: session.id,
      onProgress: (progress, message) => {
        mockWebSocket.send({
          type: 'progress',
          executionId: execution.executionId,
          progress,
          message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Send initial response
    mockWebSocket.send({
      type: 'execution_started',
      executionId: execution.executionId,
      status: 'pending'
    });
    
    // Wait for completion
    try {
      const result = await this.executor.waitForCompletion(execution.executionId);
      
      // Send result
      mockWebSocket.send({
        type: 'execution_completed',
        executionId: execution.executionId,
        result,
        timestamp: new Date().toISOString()
      });
      
      // Present result
      const presentation = await this.presenter.present(result, {
        format: 'file',
        enableStyles: true
      });
      
      console.log('✅ WebSocket workflow completed');
      return presentation;
    } catch (error) {
      mockWebSocket.send({
        type: 'execution_failed',
        executionId: execution.executionId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Run session management example
   */
  async runSessionExample() {
    console.log('\n📚 Running Session Management Example');
    
    // Create multiple sessions
    const sessions = [];
    for (let i = 1; i <= 3; i++) {
      const session = this.sessionManager.getSession(`user-${i}-session`, {
        userId: `user-${i}`,
        context: { theme: i % 2 === 0 ? 'dark' : 'light' }
      });
      sessions.push(session);
      console.log(`👤 Session created: ${session.id}`);
    }
    
    // Update contexts
    this.sessionManager.updateContext(sessions[0].id, {
      currentPage: 'dashboard',
      lastActivity: new Date().toISOString()
    });
    
    // Add to history
    this.sessionManager.addToHistory(sessions[0].id, {
      type: 'user',
      content: 'Show me the sales report'
    });
    
    this.sessionManager.addToHistory(sessions[0].id, {
      type: 'assistant',
      content: 'Here is the sales report...'
    });
    
    this.sessionManager.addToHistory(sessions[0].id, {
      type: 'skill_result',
      content: { success: true, data: 'Report generated' },
      skillName: 'pdf-generator',
      executionId: 'exec_123'
    });
    
    // Get history
    const history = this.sessionManager.getHistory(sessions[0].id, {
      limit: 10,
      types: ['user', 'skill_result']
    });
    
    console.log('📜 Session history:', history.length, 'entries');
    
    // Get session stats
    const stats = this.sessionManager.getSessionStats(sessions[0].id);
    console.log('📊 Session stats:', stats);
    
    // Get active sessions
    const activeSessions = this.sessionManager.getActiveSessions();
    console.log('👥 Active sessions:', activeSessions.length);
    
    return sessions;
  }

  /**
   * Resolve parameters with references
   */
  resolveParameters(params, context) {
    const resolved = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        const ref = value.substring(1);
        const [stepName, ...path] = ref.split('.');
        
        if (context[stepName]) {
          let resolvedValue = context[stepName];
          for (const part of path) {
            resolvedValue = resolvedValue[part];
          }
          resolved[key] = resolvedValue;
        } else {
          resolved[key] = value; // Keep original if not resolved
        }
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }

  /**
   * Generate sample sales data
   */
  generateSampleSalesData() {
    return {
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      sales: [12000, 15000, 18000, 22000, 25000, 28000],
      revenue: [48000, 60000, 72000, 88000, 100000, 112000],
      costs: [30000, 35000, 40000, 45000, 50000, 55000]
    };
  }

  /**
   * Run all examples
   */
  async runAllExamples() {
    console.log('🎯 Running All Integration Examples\n');
    
    try {
      await this.initialize();
      
      // Run examples sequentially
      await this.runSimpleExample();
      await this.runAdvancedExample();
      await this.runWebSocketExample();
      await this.runSessionExample();
      
      console.log('\n🎉 All examples completed successfully!');
      
      // Print summary
      this.printSummary();
    } catch (error) {
      console.error('\n❌ Example failed:', error.message);
      console.error(error.stack);
    }
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n📊 Integration Summary:');
    
    const executorStats = this.executor.getStats();
    console.log('   Executor Stats:');
    console.log(`     - Active: ${executorStats.active}`);
    console.log(`     - Completed: ${executorStats.completed}`);
    console.log(`     - Failed: ${executorStats.failed}`);
    console.log(`     - Avg Duration: ${executorStats.averageDuration.toFixed(2)}ms`);
    
    const cacheStats = this.presenter.getCacheStats();
    console.log('   Presenter Cache:');
    console.log(`     - Size: ${cacheStats.size}`);
    
    const activeSessions = this.sessionManager.getActiveSessions();
    console.log('   Sessions:');
    console.log(`     - Active: ${activeSessions.length}`);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  const example = new AgentSkillIntegrationExample();
  example.runAllExamples().catch(console.error);
}

module.exports = AgentSkillIntegrationExample;