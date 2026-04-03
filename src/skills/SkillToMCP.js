const { MCPBridge } = require('../mcp/MCPBridge');
const { SkillMCPGenerator } = require('./mcp/SkillMCPGenerator');
const { SkillNodeDefinitions } = require('./SkillNodeDefinitions');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execFileAsync = promisify(execFile);

class SkillToMCP {
  constructor(mcpBridge, skillLoader) {
    this.mcpBridge = mcpBridge;
    this.skillLoader = skillLoader;
    this.mcpGenerator = new SkillMCPGenerator();
    this.registeredTools = new Map(); // skillName + action -> toolFullName
    this.registeredServers = new Map(); // skillName -> server config
  }

  // Convert a skill to MCP tools
  async convertSkillToMCPTools(skillName) {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    // Generate MCP configuration for the skill
    const mcpConfig = this.mcpGenerator.generateMCPConfig(skill);
    
    // Get enhanced node definition if available
    const nodeDefinition = SkillNodeDefinitions.getNodeDefinition(skillName);
    
    if (nodeDefinition && nodeDefinition.actions && nodeDefinition.actions.length > 0) {
      // Create tools for each action
      for (const action of nodeDefinition.actions) {
        const toolName = `${skillName}:${action.name}`;
        if (!this.registeredTools.has(toolName)) {
          this.registeredTools.set(toolName, {
            skillName,
            action: action.name,
            definition: action,
            mcpConfig
          });
        }
      }
    } else {
      // Fallback to scripts or generic tool
      if (skill.scripts && skill.scripts.length > 0) {
        for (const script of skill.scripts) {
          await this.createMCPToolFromScript(skill, script, mcpConfig);
        }
      } else if (skill.description) {
        await this.createGenericMCPTool(skill, mcpConfig);
      }
    }
    
    this.registeredServers.set(skillName, mcpConfig);
    
    return mcpConfig;
  }

  // Create an MCP tool from a skill script
  async createMCPToolFromScript(skill, script, mcpConfig) {
    // Determine the tool name based on skill and action
    const action = skill.inputs.find(i => i.name === 'action')?.enum?.[0] || 'execute';
    const toolName = `${skill.name}:${action}`;

    // Check if we've already registered this
    if (this.registeredTools.has(toolName)) {
      return this.registeredTools.get(toolName);
    }

    // Store tool information
    const toolInfo = {
      skillName: skill.name,
      action,
      script,
      mcpConfig,
      definition: {
        name: action,
        description: `Execute ${action} action for ${skill.name}`,
        inputs: this.extractInputsFromSkill(skill)
      }
    };
    
    this.registeredTools.set(toolName, toolInfo);

    return toolName;
  }

  // Create a generic MCP tool when no specific scripts are defined
  async createGenericMCPTool(skill, mcpConfig) {
    const toolName = `${skill.name}:generic`;

    // Check if we've already registered this
    if (this.registeredTools.has(toolName)) {
      return this.registeredTools.get(toolName);
    }

    // Store tool information
    const toolInfo = {
      skillName: skill.name,
      action: 'generic',
      mcpConfig,
      definition: {
        name: 'generic',
        description: skill.description || `Generic action for ${skill.name}`,
        inputs: this.extractInputsFromSkill(skill)
      }
    };
    
    this.registeredTools.set(toolName, toolInfo);

    return toolName;
  }

  // Actually register the skill as an MCP tool with the bridge
  async registerAsMCPTool(skillName, action = 'execute') {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    // Get or generate MCP configuration
    let mcpConfig = this.registeredServers.get(skillName);
    if (!mcpConfig) {
      mcpConfig = await this.convertSkillToMCPTools(skillName);
    }

    // Determine the tool name
    let toolName = action ? `${skillName}:${action}` : `${skillName}:execute`;
    if (!action && this.registeredTools.has(`${skillName}:generic`)) {
      toolName = `${skillName}:generic`;
    }

    // Register the MCP server with the bridge
    try {
      const result = await this.mcpBridge.register(mcpConfig);
      
      // Mark as registered in bridge
      this.registeredTools.set(toolName, {
        ...this.registeredTools.get(toolName),
        registeredInBridge: true,
        bridgeResult: result
      });
      
      return {
        success: true,
        skillName,
        toolName,
        serverName: mcpConfig.name,
        toolsCount: result.toolsCount,
        mcpConfig
      };
    } catch (error) {
      // If registration fails (e.g., server already registered), return info
      return {
        success: false,
        skillName,
        toolName,
        error: error.message,
        mcpConfig
      };
    }
  }

  // Register all skills as MCP tools
  async registerAllSkills() {
    const results = [];
    const skills = this.skillLoader.getAllSkills();
    
    for (const skill of skills) {
      try {
        const result = await this.registerAsMCPTool(skill.name);
        results.push({
          skillName: skill.name,
          success: result.success,
          toolsCount: result.toolsCount || 0,
          error: result.error
        });
      } catch (error) {
        results.push({
          skillName: skill.name,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Extract inputs from skill definition
  extractInputsFromSkill(skill) {
    const inputs = {};
    
    if (skill.inputs && Array.isArray(skill.inputs)) {
      for (const input of skill.inputs) {
        inputs[input.name] = {
          type: input.type || 'string',
          description: input.description || input.name,
          required: input.required || false
        };
        
        if (input.enum) {
          inputs[input.name].enum = input.enum;
        }
        
        if (input.default !== undefined) {
          inputs[input.name].default = input.default;
        }
      }
    }
    
    return inputs;
  }

  // Get all registered tool names for a skill
  getRegisteredTools(skillName) {
    const tools = [];
    for (const [key, toolInfo] of this.registeredTools.entries()) {
      if (key.startsWith(`${skillName}:`)) {
        tools.push({
          toolName: key,
          action: toolInfo.action,
          description: toolInfo.definition?.description
        });
      }
    }
    return tools;
  }

  // Get all registered tools across all skills
  getAllRegisteredTools() {
    const allTools = [];
    for (const [toolName, toolInfo] of this.registeredTools.entries()) {
      allTools.push({
        toolName,
        skillName: toolInfo.skillName,
        action: toolInfo.action,
        description: toolInfo.definition?.description,
        registeredInBridge: toolInfo.registeredInBridge || false
      });
    }
    return allTools;
  }

  // Get MCP server configurations for all skills
  getMCPConfigs() {
    const configs = [];
    for (const [skillName, config] of this.registeredServers.entries()) {
      configs.push({
        skillName,
        serverName: config.name,
        command: config.command,
        scriptPath: config.args[0]
      });
    }
    return configs;
  }

  // Clear all registered tools (for reloading)
  clearRegisteredTools() {
    this.registeredTools.clear();
    this.registeredServers.clear();
    this.mcpGenerator.cleanup();
  }

  // Generate MCP server script content for a skill (for inspection)
  generateMCPServerScript(skillName) {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    
    const nodeDefinition = SkillNodeDefinitions.getNodeDefinition(skillName);
    const scriptPath = this.mcpGenerator.createServerScript(skill, nodeDefinition);
    
    // Read and return the generated script content
    return fs.readFileSync(scriptPath, 'utf8');
  }

  // Test MCP server for a skill (spawn and test initialization)
  async testMCPServer(skillName) {
    const config = this.registeredServers.get(skillName);
    if (!config) {
      throw new Error(`MCP server not generated for skill: ${skillName}`);
    }
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = 10000; // 10 second timeout
      
      const child = require('child_process').spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      let initialized = false;
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        
        // Look for initialize response
        if (!initialized && stdout.includes('"protocolVersion"')) {
          initialized = true;
          child.kill();
          resolve({
            success: true,
            skillName,
            serverName: config.name,
            initializationTime: Date.now() - startTime,
            response: stdout.substring(0, 500) + (stdout.length > 500 ? '...' : '')
          });
        }
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('error', (error) => {
        reject({
          success: false,
          skillName,
          error: error.message,
          stderr
        });
      });
      
      child.on('exit', (code, signal) => {
        if (!initialized) {
          reject({
            success: false,
            skillName,
            error: `Process exited with code ${code} and signal ${signal}`,
            stdout: stdout.substring(0, 500),
            stderr: stderr.substring(0, 500),
            initializationTime: Date.now() - startTime
          });
        }
      });
      
      // Set timeout
      setTimeout(() => {
        if (!initialized) {
          child.kill();
          reject({
            success: false,
            skillName,
            error: 'Initialization timeout',
            stdout: stdout.substring(0, 500),
            stderr: stderr.substring(0, 500),
            initializationTime: Date.now() - startTime
          });
        }
      }, timeout);
      
      // Send initialize message
      const initMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      });
      
      child.stdin.write(initMessage + '\n');
    });
  }
}

module.exports = { SkillToMCP };