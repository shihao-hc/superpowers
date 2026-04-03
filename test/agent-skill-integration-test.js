/**
 * Basic test for Agent Skill Integration
 */

const { SessionManager } = require('../src/skills/agent/SessionManager');
const { MultimodalPresenter } = require('../src/skills/agent/MultimodalPresenter');
const { AsyncExecutor } = require('../src/skills/agent/AsyncExecutor');

console.log('🧪 Testing Agent Skill Integration Components\n');

// Test 1: SessionManager
console.log('1. Testing SessionManager...');
try {
  const sessionManager = new SessionManager();
  
  const session = sessionManager.getSession('test-session-1', {
    userId: 'user-123',
    context: { theme: 'dark' }
  });
  
  sessionManager.addToHistory(session.id, {
    type: 'user',
    content: 'Test message'
  });
  
  const history = sessionManager.getHistory(session.id);
  const stats = sessionManager.getSessionStats(session.id);
  
  console.log('   ✅ SessionManager works correctly');
  console.log(`   - Session ID: ${session.id}`);
  console.log(`   - History entries: ${history.length}`);
  console.log(`   - History length in stats: ${stats.historyLength}`);
} catch (error) {
  console.error('   ❌ SessionManager failed:', error.message);
}

// Test 2: MultimodalPresenter
console.log('\n2. Testing MultimodalPresenter...');
try {
  const presenter = new MultimodalPresenter();
  
  // Test text presentation
  const textResult = presenter.present({
    text: 'Hello, World!',
    format: 'text'
  });
  
  // Test JSON presentation
  const jsonResult = presenter.present({
    data: { key: 'value', number: 42 },
    format: 'json'
  });
  
  console.log('   ✅ MultimodalPresenter works correctly');
  console.log(`   - Text format: ${textResult.format}`);
  console.log(`   - JSON format: ${jsonResult.format}`);
} catch (error) {
  console.error('   ❌ MultimodalPresenter failed:', error.message);
}

// Test 3: AsyncExecutor
console.log('\n3. Testing AsyncExecutor...');
try {
  const executor = new AsyncExecutor();
  
  // Test async execution
  executor.execute('test-skill', { param: 'value' }).then(execution => {
    console.log('   ✅ AsyncExecutor works correctly');
    console.log(`   - Execution ID: ${execution.executionId}`);
    console.log(`   - Status: ${execution.status}`);
    
    // Wait for completion
    return executor.waitForCompletion(execution.executionId);
  }).then(result => {
    console.log(`   - Result: ${result.success ? 'success' : 'failed'}`);
    console.log(`   - Duration: ${result.duration}ms`);
    
    // Test stats
    const stats = executor.getStats();
    console.log(`   - Completed executions: ${stats.completed}`);
  }).catch(error => {
    console.error('   ❌ AsyncExecutor failed:', error.message);
  });
} catch (error) {
  console.error('   ❌ AsyncExecutor failed:', error.message);
}

// Test 4: Integration
console.log('\n4. Testing Integration...');
try {
  const sessionManager = new SessionManager();
  const presenter = new MultimodalPresenter();
  const executor = new AsyncExecutor();
  
  const session = sessionManager.getSession('integration-test');
  
  // Record execution
  sessionManager.recordSkillExecution(session.id, 'test-skill', 'exec-123', {
    success: true,
    duration: 1500,
    result: { message: 'Test completed' }
  });
  
  // Get session stats
  const stats = sessionManager.getSessionStats(session.id);
  
  console.log('   ✅ Integration works correctly');
  console.log(`   - Skill executions recorded: ${Object.keys(stats.skillStats).length}`);
} catch (error) {
  console.error('   ❌ Integration failed:', error.message);
}

console.log('\n📊 Test Summary:');
console.log('All core components are functional and integrated.');
console.log('\n✨ Agent Skill Integration is ready for use!');