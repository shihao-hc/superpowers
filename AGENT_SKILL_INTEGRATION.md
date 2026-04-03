# Agent Skill Integration

This document describes the integration of the skill system with the AgentLoop, including session management, multimodal presentation, and async execution.

## Overview

The UltraWork AI platform now supports deep integration between the AgentLoop and the skill system, enabling:

1. **Automatic Skill Discovery** - Agent automatically detects when skills are needed
2. **Session State Management** - Persistent session state across conversations
3. **Multimodal Result Presentation** - Rich output formats for skill results
4. **Async Execution with Progress** - Non-blocking skill execution with real-time feedback

## Components

### 1. SkillDiscovery Integration

The `SkillDiscovery` class has been integrated with `AgentLoop` to enable automatic skill selection:

```javascript
const AgentLoop = require('./src/agent/AgentLoop');
const { SkillDiscovery } = require('./src/skills/agent/SkillDiscovery');
const { SkillManager } = require('./src/skills/SkillManager');

// Initialize components
const skillManager = new SkillManager();
const skillDiscovery = new SkillDiscovery({ skillManager });

// Create AgentLoop with skill integration
const agentLoop = new AgentLoop({
  skillDiscovery,
  skillManager,
  // ... other options
});

// Or set services later
agentLoop.setSkillServices(skillDiscovery, skillManager);
```

**Available Actions:**

- `skillCall` - Execute a skill with parameters
- `batchSkillCall` - Execute multiple skills in parallel
- `skillAnalysis` - Analyze user input for skill matching

**Example Usage:**

```javascript
// Agent will automatically use skills when appropriate
await agentLoop.run('Create a quarterly sales report in Excel format');

// The AgentLoop will:
// 1. Analyze the request
// 2. Detect that "Excel format" requires xlsx skill
// 3. Use skillCall action to execute the skill
// 4. Present the result in appropriate format
```

### 2. SessionManager

The `SessionManager` provides persistent session state management:

```javascript
const { SessionManager } = require('./src/skills/agent/SessionManager');

const sessionManager = new SessionManager({
  maxSessions: 1000,
  sessionTimeout: 3600000, // 1 hour
  maxHistoryLength: 100
});

// Create or get session
const session = sessionManager.getSession('user-123-conversation-456', {
  userId: 'user-123',
  conversationId: 'conversation-456',
  context: { locale: 'zh-CN' }
});

// Update context
sessionManager.updateContext('user-123-conversation-456', {
  currentPage: 'dashboard',
  userPreferences: { theme: 'dark' }
});

// Add to history
sessionManager.addToHistory('user-123-conversation-456', {
  type: 'user',
  content: 'Create a chart showing sales trends'
});

// Get history
const history = sessionManager.getHistory('user-123-conversation-456', {
  limit: 20,
  types: ['user', 'assistant', 'skill_result']
});

// Track skill execution
sessionManager.recordSkillExecution('user-123-conversation-456', 'chart-generator', 'exec_123', {
  success: true,
  duration: 1500,
  result: { chartUrl: 'http://...' }
});
```

**Features:**

- Automatic session cleanup (expired sessions)
- Skill state tracking (success rate, duration, etc.)
- Execution queue management
- Conversation history with filtering
- Session statistics and export/import

### 3. MultimodalPresenter

The `MultimodalPresenter` handles different output formats:

```javascript
const { MultimodalPresenter } = require('./src/skills/agent/MultimodalPresenter');

const presenter = new MultimodalPresenter({
  defaultFormat: 'auto',
  enableCaching: true,
  cacheTTL: 300000
});

// Present result in appropriate format
const presentation = await presenter.present({
  format: 'excel',
  buffer: excelBuffer,
  filename: 'report.xlsx'
}, {
  format: 'auto',
  enableStyles: true
});

console.log(presentation);
// {
//   presentationId: 'pres_...',
//   format: 'Excel',
//   mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
//   content: '<a href="data:...">Download Excel File</a>',
//   metadata: { ... },
//   attachments: [...],
//   actions: [...]
// }
```

**Supported Formats:**

| Format | MIME Type | Use Case |
|--------|-----------|----------|
| text | text/plain | Plain text, logs, code |
| html | text/html | Rich text, styled content |
| json | application/json | Structured data, API responses |
| image | image/png/jpeg | Charts, diagrams, screenshots |
| pdf | application/pdf | Reports, documents |
| excel | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | Spreadsheets, data analysis |
| ppt | application/vnd.openxmlformats-officedocument.presentationml.presentation | Presentations, slides |
| video | video/mp4/webm | Recordings, animations |
| audio | audio/mp3/wav | Speech, sound effects |
| file | application/octet-stream | Generic files, archives |

### 4. AsyncExecutor

The `AsyncExecutor` provides asynchronous skill execution with progress feedback:

```javascript
const { AsyncExecutor } = require('./src/skills/agent/AsyncExecutor');

const executor = new AsyncExecutor({
  maxConcurrent: 10,
  executionTimeout: 300000,
  progressInterval: 1000
});

// Execute skill asynchronously
const result = await executor.execute('pdf-generator', {
  template: 'report',
  data: salesData
}, {
  sessionId: 'session-123',
  estimatedDuration: 5000,
  onProgress: (progress, message) => {
    console.log(`Progress: ${progress}% - ${message}`);
  },
  onComplete: (execution) => {
    console.log('Execution completed:', execution.result);
  },
  onError: (execution, error) => {
    console.error('Execution failed:', error);
  }
});

console.log(result);
// {
//   executionId: 'exec_...',
//   status: 'pending',
//   estimatedDuration: 5000,
//   checkProgressUrl: '/api/skills/executions/exec_.../progress'
// }

// Check progress
const progress = executor.getProgress(result.executionId);
// { executionId: 'exec_...', progress: 45, message: 'Generating pages...', status: 'running' }

// Wait for completion
try {
  const finalResult = await executor.waitForCompletion(result.executionId, {
    timeout: 60000
  });
  console.log('Final result:', finalResult);
} catch (error) {
  console.error('Execution failed:', error);
}

// Cancel execution
executor.cancel(result.executionId);

// Get active executions
const active = executor.getActiveExecutions();

// Get execution history
const history = executor.getHistory({
  limit: 20,
  skillName: 'pdf-generator',
  status: 'completed'
});

// Get statistics
const stats = executor.getStats();
// {
//   active: 2,
//   total: 5,
//   completed: 150,
//   failed: 10,
//   historySize: 160,
//   averageDuration: 2500,
//   maxConcurrent: 10
// }

// Listen to events
executor.on('progress', (data) => {
  console.log(`Progress update: ${data.progress}%`);
});

executor.on('completed', (execution) => {
  console.log(`Execution ${execution.id} completed`);
});
```

## Integration Examples

### Example 1: Basic Integration with AgentLoop

```javascript
const AgentLoop = require('./src/agent/AgentLoop');
const { SkillDiscovery } = require('./src/skills/agent/SkillDiscovery');
const { SkillManager } = require('./src/skills/SkillManager');
const { SessionManager } = require('./src/skills/agent/SessionManager');

async function main() {
  // Initialize components
  const skillManager = new SkillManager();
  const skillDiscovery = new SkillDiscovery({ skillManager });
  const sessionManager = new SessionManager();
  
  // Create AgentLoop
  const agentLoop = new AgentLoop({
    skillDiscovery,
    skillManager,
    llmAdapter: yourLLMAdapter,
    onStep: (step) => {
      console.log(`Step ${step.iteration}:`, step.action.type);
    }
  });
  
  // Create session
  const sessionId = sessionManager.getSession('user-123').id;
  
  // Run agent
  const result = await agentLoop.run('Create a presentation about our quarterly results', {
    sessionId,
    observe: (observation) => {
      // Custom observation logic
      return { customData: 'value' };
    }
  });
  
  console.log('Result:', result);
}

main();
```

### Example 2: Async Execution with Progress UI

```javascript
const { AsyncExecutor } = require('./src/skills/agent/AsyncExecutor');
const { MultimodalPresenter } = require('./src/skills/agent/MultimodalPresenter');

async function generateReport(userData, onProgress) {
  const executor = new AsyncExecutor();
  const presenter = new MultimodalPresenter();
  
  // Start async execution
  const execution = await executor.execute('pdf-generator', {
    template: 'quarterly-report',
    data: userData,
    options: { includeCharts: true }
  }, {
    onProgress: (progress, message) => {
      // Update UI progress bar
      updateProgressBar(progress);
      updateProgressMessage(message);
      
      // Call external callback if provided
      if (onProgress) onProgress(progress, message);
    }
  });
  
  // Wait for completion
  try {
    const result = await executor.waitForCompletion(execution.executionId);
    
    // Present result
    const presentation = await presenter.present(result, {
      format: 'pdf',
      enableStyles: true
    });
    
    return presentation;
  } catch (error) {
    console.error('Report generation failed:', error);
    throw error;
  }
}

// Usage
const report = await generateReport(salesData, (progress, message) => {
  console.log(`Report generation: ${progress}% - ${message}`);
});

// Display in UI
document.getElementById('report-container').innerHTML = report.content;
```

### Example 3: WebSocket Real-time Updates

```javascript
const WebSocket = require('ws');
const { AsyncExecutor } = require('./src/skills/agent/AsyncExecutor');

function setupWebSocketServer(wss) {
  const executor = new AsyncExecutor();
  
  wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Listen for skill execution requests
    ws.on('message', async (message) => {
      const data = JSON.parse(message);
      
      if (data.type === 'execute_skill') {
        const execution = await executor.execute(data.skillName, data.parameters, {
          onProgress: (progress, message) => {
            ws.send(JSON.stringify({
              type: 'progress',
              executionId: execution.executionId,
              progress,
              message
            }));
          }
        });
        
        // Send initial response
        ws.send(JSON.stringify({
          type: 'execution_started',
          executionId: execution.executionId,
          status: 'pending'
        }));
        
        // Wait for completion and send result
        try {
          const result = await executor.waitForCompletion(execution.executionId);
          ws.send(JSON.stringify({
            type: 'execution_completed',
            executionId: execution.executionId,
            result
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'execution_failed',
            executionId: execution.executionId,
            error: error.message
          }));
        }
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
}
```

## API Endpoints

### Skill Execution

```javascript
// POST /api/skills/execute
{
  "skillName": "pdf-generator",
  "parameters": { ... },
  "sessionId": "session-123",
  "async": true
}

// Response
{
  "executionId": "exec_...",
  "status": "pending",
  "checkProgressUrl": "/api/skills/executions/exec_.../progress"
}

// GET /api/skills/executions/:id/progress
{
  "executionId": "exec_...",
  "progress": 45,
  "message": "Generating pages...",
  "status": "running",
  "timestamp": "2026-03-21T..."
}

// GET /api/skills/executions/:id/result
{
  "executionId": "exec_...",
  "status": "completed",
  "result": { ... },
  "duration": 2500
}

// DELETE /api/skills/executions/:id
{
  "executionId": "exec_...",
  "status": "cancelled",
  "timestamp": "2026-03-21T..."
}
```

### Session Management

```javascript
// GET /api/sessions/:id
{
  "id": "session-123",
  "createdAt": "2026-03-21T...",
  "lastAccessed": "2026-03-21T...",
  "history": [...],
  "skillStats": { ... }
}

// PUT /api/sessions/:id/context
{
  "context": { "theme": "dark", "locale": "zh-CN" }
}

// GET /api/sessions/:id/history
{
  "history": [...],
  "total": 150,
  "limit": 20,
  "offset": 0
}

// DELETE /api/sessions/:id
{
  "deleted": true
}
```

## Configuration

### AgentLoop Configuration

```javascript
const agentLoop = new AgentLoop({
  maxIterations: 15,
  timeout: 120000,
  
  // Skill integration
  skillDiscovery: skillDiscoveryInstance,
  skillManager: skillManagerInstance,
  skillToolCacheTTL: 600000, // 10 minutes
  
  // MCP integration (existing)
  mcpBridge: mcpBridgeInstance,
  mcpRegistry: mcpRegistryInstance,
  mcpToolCacheTTL: 300000,
  
  // Callbacks
  onStep: (step) => { ... },
  onError: (error) => { ... }
});
```

### SessionManager Configuration

```javascript
const sessionManager = new SessionManager({
  maxSessions: 1000,
  sessionTimeout: 3600000, // 1 hour
  maxHistoryLength: 100,
  cleanupInterval: 300000 // 5 minutes
});
```

### MultimodalPresenter Configuration

```javascript
const presenter = new MultimodalPresenter({
  defaultFormat: 'auto',
  maxContentSize: 1024 * 1024, // 1MB
  enableCompression: true,
  enableCaching: true,
  cacheTTL: 300000 // 5 minutes
});
```

### AsyncExecutor Configuration

```javascript
const executor = new AsyncExecutor({
  maxConcurrent: 10,
  executionTimeout: 300000, // 5 minutes
  progressInterval: 1000, // 1 second
  maxHistory: 1000,
  cleanupInterval: 60000 // 1 minute
});
```

## Error Handling

### Skill Execution Errors

```javascript
try {
  const result = await executor.waitForCompletion(executionId);
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout
    console.error('Execution timed out');
  } else if (error.message.includes('not found')) {
    // Handle not found
    console.error('Execution not found');
  } else {
    // Handle other errors
    console.error('Execution failed:', error.message);
  }
}
```

### Session Errors

```javascript
try {
  const session = sessionManager.getSession(sessionId);
} catch (error) {
  if (error.message.includes('limit')) {
    // Handle session limit
    sessionManager._cleanupOldSessions();
    // Retry
  }
}
```

## Performance Considerations

1. **Caching**: Both SkillDiscovery and MultimodalPresenter use caching to improve performance
2. **Connection Pooling**: Reuse SessionManager instances across requests
3. **Async Execution**: Use AsyncExecutor for long-running skills to avoid blocking
4. **Progress Updates**: Use appropriate progress intervals to balance responsiveness and overhead
5. **History Management**: Configure appropriate history limits to prevent memory issues

## Security Considerations

1. **Session Isolation**: Sessions are isolated by ID
2. **Input Validation**: All parameters are validated before execution
3. **Timeout Protection**: Execution timeout prevents hanging
4. **Rate Limiting**: Max concurrent executions prevent resource exhaustion
5. **History Privacy**: Session history can be cleared manually

## Migration Guide

### From Direct Skill Execution

**Before:**
```javascript
const result = await skillManager.executeSkill('pdf-generator', params);
console.log(result);
```

**After:**
```javascript
const executor = new AsyncExecutor();
const execution = await executor.execute('pdf-generator', params);
const result = await executor.waitForCompletion(execution.executionId);
```

### From Synchronous AgentLoop

**Before:**
```javascript
const result = await agentLoop.run(goal);
```

**After:**
```javascript
const agentLoop = new AgentLoop({ skillDiscovery, skillManager });
const result = await agentLoop.run(goal, {
  sessionId: sessionManager.getSession('user-123').id
});
```

## Troubleshooting

### Common Issues

1. **Skills not being detected**
   - Ensure SkillDiscovery is initialized with SkillManager
   - Check that skills are loaded in SkillManager
   - Verify skill descriptions include relevant keywords

2. **Session not persisting**
   - Check sessionTimeout configuration
   - Ensure sessionId is consistent across requests
   - Verify session cleanup interval is not too aggressive

3. **Progress not updating**
   - Check progressInterval configuration
   - Ensure onProgress callback is provided
   - Verify WebSocket connection if using real-time updates

4. **Execution timing out**
   - Increase executionTimeout configuration
   - Check skill implementation for blocking operations
   - Consider breaking long tasks into smaller steps

## Next Steps

1. Add more skill format handlers to MultimodalPresenter
2. Implement distributed session storage for scalability
3. Add skill execution retry logic
4. Implement skill result caching
5. Add skill usage analytics and monitoring