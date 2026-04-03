const { NodeWorkflowEngine } = require('../src/workflow/NodeWorkflowEngine');
const { MCPBridge } = require('../src/mcp/MCPBridge');
const { SkillManager } = require('../src/skills');
const path = require('path');

// Create workflow engine and MCP bridge
const workflowEngine = new NodeWorkflowEngine();
const mcpBridge = new MCPBridge();

// Create skill manager and initialize it
const skillManager = new SkillManager({
  skillsDir: path.join(process.cwd(), 'skills-source', 'skills'),
  hotReload: true,
  convertToNodes: true,
  convertToMCP: true
});

// Initialize skill manager with our engines
skillManager.initialize(workflowEngine, mcpBridge);

// Load all skills from the anthropics repository
console.log('Loading skills from anthropics/skills...');
const loadedSkills = skillManager.loadAllSkills();
console.log(`Loaded ${loadedSkills.length} skills`);

// Enable some skills to convert them to workflow nodes and MCP tools
console.log('\nEnabling skills...');
const skillsToEnable = ['docx', 'pdf', 'brand-guidelines', 'mcp-builder'];

( async () => {
  for (const skillName of skillsToEnable) {
    try {
      await skillManager.enableSkill(skillName);
      console.log(`✓ Enabled ${skillName}`);
    } catch (error) {
      console.error(`✗ Failed to enable ${skillName}:`, error.message);
    }
  }
  
  // Show what nodes were created
  console.log('\n=== Created Workflow Nodes ===');
  const allNodes = workflowEngine.getAllNodeTypes();
  const skillNodes = allNodes.filter(node => node.type.startsWith('skill.'));
  console.log(`Created ${skillNodes.length} skill-based nodes:`);
  for (const node of skillNodes.slice(0, 10)) { // Show first 10
    console.log(`  - ${node.type}: ${node.name}`);
  }
  if (skillNodes.length > 10) {
    console.log(`  ... and ${skillNodes.length - 10} more`);
  }

// Show what MCP tools would be available
console.log('\n=== MCP Tools Available ===');
const registeredServers = mcpBridge.getRegisteredServers();
console.log(`MCP Bridge has ${registeredServers.size} registered servers`);
for (const [serverName, serverInfo] of registeredServers) {
  console.log(`  - ${serverName}: ${serverInfo.toolsCount} tools`);
}

  // Example: Create a workflow using skill nodes
  console.log('\n=== Example Workflow Using Skill Nodes ===');
  try {
    // Create a simple workflow that uses a skill node
    workflowEngine.createNode('skill.docx.create', { x: 100, y: 100 }, { 
      action: 'create',
      file_path: '/tmp/report.docx',
      content: '# Hello World\\nThis is a test document created via skill integration.'
    });
    
    workflowEngine.createNode('skill.pdf.create', { x: 300, y: 100 }, { 
      action: 'create',
      file_path: '/tmp/report.pdf',
      content: '%PDF-1.4\\n%Test PDF created via skill integration'
    });
    
    // Connect the nodes (in a real workflow, you'd connect outputs to inputs)
    // workflowEngine.connect(node1.id, 'result', node2.id, 'input');
    
    // Execute the workflow
    const execution = await workflowEngine.execute('skill-test-workflow', { parallel: false });
    console.log(`Workflow executed: ${execution.status}`);
    if (execution.error) {
      console.log(`Error: ${execution.error}`);
    }
    
  } catch (error) {
    console.error('Workflow execution failed:', error.message);
  }

  // Cleanup
  console.log('\nCleaning up...');
  skillManager.cleanup();
  workflowEngine.destroy();

  console.log('\nIntegration test complete!');
})();