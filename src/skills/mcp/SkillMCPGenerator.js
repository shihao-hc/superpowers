const fs = require('fs');
const path = require('path');
const { SkillNodeDefinitions } = require('../SkillNodeDefinitions');

/**
 * Generates MCP server scripts for skills
 */
class SkillMCPGenerator {
  constructor() {
    this.generatedServers = new Map(); // skillName -> server config
  }

  /**
   * Generate MCP server configuration for a skill
   * @param {Object} skill - Skill object
   * @returns {Object} MCP server configuration
   */
  generateMCPConfig(skill) {
    const nodeDefinition = SkillNodeDefinitions.getNodeDefinition(skill.name);
    
    // Create server script
    const scriptPath = this.createServerScript(skill, nodeDefinition);
    
    // Create MCP configuration
    const config = {
      name: `skill-${skill.name}`,
      command: 'node',
      args: [scriptPath],
      env: {
        SKILL_NAME: skill.name,
        SKILL_PATH: skill.skillPath,
        SKILL_DESCRIPTION: skill.description || ''
      },
      timeout: 30000,
      maxRetries: 2,
      retryDelay: 1000,
      heartbeatInterval: 30000
    };
    
    this.generatedServers.set(skill.name, {
      config,
      scriptPath,
      nodeDefinition,
      skill
    });
    
    return config;
  }

  /**
   * Create MCP server script for a skill
   * @param {Object} skill - Skill object
   * @param {Object} nodeDefinition - Node definition from SkillNodeDefinitions
   * @returns {string} Path to the generated script
   */
  createServerScript(skill, nodeDefinition) {
    const scriptDir = path.join(__dirname, 'generated');
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }
    
    const scriptPath = path.join(scriptDir, `${skill.name}-mcp-server.js`);
    
    // Get actions from node definition or create default ones
    const actions = nodeDefinition && nodeDefinition.actions ? nodeDefinition.actions : [
      {
        name: 'execute',
        label: 'Execute Skill',
        description: skill.description || `Execute ${skill.name} skill`,
        inputs: {
          action: { type: 'string', required: true, description: 'Action to perform' },
          ...this.extractInputsFromSkill(skill)
        },
        outputs: {
          result: { type: 'object', description: 'Execution result' }
        }
      }
    ];
    
    // Generate tool definitions
    const toolDefinitions = actions.map(action => {
      const properties = {};
      const required = [];
      
      if (action.inputs) {
        for (const [name, definition] of Object.entries(action.inputs)) {
          properties[name] = {
            type: this.mapTypeToJSONSchema(definition.type),
            description: definition.description || ''
          };
          
          if (definition.enum) {
            properties[name].enum = definition.enum;
          }
          
          if (definition.default !== undefined) {
            properties[name].default = definition.default;
          }
          
          if (definition.required) {
            required.push(name);
          }
        }
      }
      
      return {
        name: action.name,
        description: action.description || `${action.label || action.name} action for ${skill.name}`,
        inputSchema: {
          type: 'object',
          properties,
          required
        }
      };
    });
    
    // Generate the MCP server script
    const scriptContent = `#!/usr/bin/env node

const { SkillExecutor } = require('${path.relative(scriptDir, path.join(__dirname, '..', 'executors')).replace(/\\/g, '/')}');
const { DocxExecutor } = require('${path.relative(scriptDir, path.join(__dirname, '..', 'executors', 'DocxExecutor.js')).replace(/\\/g, '/')}');
const { PdfExecutor } = require('${path.relative(scriptDir, path.join(__dirname, '..', 'executors', 'PdfExecutor.js')).replace(/\\/g, '/')}');
const { CanvasExecutor } = require('${path.relative(scriptDir, path.join(__dirname, '..', 'executors', 'CanvasExecutor.js')).replace(/\\/g, '/')}');

const SKILL_NAME = '${skill.name}';
const SKILL_PATH = '${skill.skillPath.replace(/\\/g, '/')}';

// MCP Server implementation
class SkillMCPServer {
  constructor() {
    this.tools = new Map();
    this.setupTools();
    this.setupMessageHandlers();
  }

  setupTools() {
    const toolDefinitions = ${JSON.stringify(toolDefinitions, null, 2)};
    
    for (const tool of toolDefinitions) {
      this.tools.set(tool.name, tool);
    }
  }

  setupMessageHandlers() {
    // Handle stdin messages (MCP protocol)
    process.stdin.setEncoding('utf8');
    let buffer = '';
    
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line.trim());
        }
      }
    });
    
    process.stdin.on('end', () => {
      process.exit(0);
    });
    
    // Send initialize response
    this.sendResponse({
      jsonrpc: '2.0',
      id: null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'skill-' + SKILL_NAME,
          version: '1.0.0'
        }
      }
    });
  }

  async handleMessage(message) {
    try {
      const request = JSON.parse(message);
      const { id, method, params } = request;
      
      let response;
      
      switch (method) {
        case 'initialize':
          response = await this.handleInitialize(params);
          break;
        case 'tools/list':
          response = await this.handleListTools(params);
          break;
        case 'tools/call':
          response = await this.handleCallTool(params);
          break;
        case 'ping':
          response = { pong: true };
          break;
        default:
          throw new Error(\`Unknown method: \${method}\`);
      }
      
      this.sendResponse({
        jsonrpc: '2.0',
        id,
        result: response
      });
      
    } catch (error) {
      this.sendError(id, -32603, error.message);
    }
  }

  async handleInitialize(params) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'skill-' + SKILL_NAME,
        version: '1.0.0'
      }
    };
  }

  async handleListTools(params) {
    return {
      tools: Array.from(this.tools.values())
    };
  }

  async handleCallTool(params) {
    const { name, arguments: args } = params;
    
    if (!this.tools.has(name)) {
      throw new Error(\`Tool not found: \${name}\`);
    }
    
    const tool = this.tools.get(name);
    const result = await this.executeTool(name, args || {});
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async executeTool(toolName, inputs) {
    // Map tool name to executor action
    const action = toolName;
    
    // Add skill information
    inputs.skill = { name: SKILL_NAME };
    
    try {
      let executor;
      
      // Select the appropriate executor based on skill name
      switch (SKILL_NAME) {
        case 'docx':
          executor = DocxExecutor;
          break;
        case 'pdf':
          executor = PdfExecutor;
          break;
        case 'canvas-design':
          executor = CanvasExecutor;
          break;
        default:
          throw new Error(\`No executor available for skill: \${SKILL_NAME}\`);
      }
      
      // Execute the action
      const result = await executor.execute({
        ...inputs,
        action: action
      });
      
      return {
        success: true,
        skill: SKILL_NAME,
        action: action,
        result: result
      };
      
    } catch (error) {
      return {
        success: false,
        skill: SKILL_NAME,
        action: action,
        error: error.message
      };
    }
  }

  sendResponse(response) {
    process.stdout.write(JSON.stringify(response) + '\\n');
  }

  sendError(id, code, message) {
    this.sendResponse({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    });
  }
}

// Start the server
const server = new SkillMCPServer();
`;
    
    fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    
    // Make the script executable on Unix systems
    try {
      fs.chmodSync(scriptPath, '755');
    } catch (e) {
      // Ignore on Windows
    }
    
    return scriptPath;
  }

  /**
   * Extract inputs from skill definition
   * @param {Object} skill - Skill object
   * @returns {Object} Inputs definition
   */
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

  /**
   * Map skill type to JSON Schema type
   * @param {string} type - Skill type
   * @returns {string} JSON Schema type
   */
  mapTypeToJSONSchema(type) {
    if (!type) return 'string';
    
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'array',
      'file': 'string',
      'image': 'string',
      'any': 'string',
      'string|array': 'string',
      'object|string': 'object',
      'number|object': 'number',
      'number|array': 'number',
      'boolean|string': 'boolean',
      'object|array': 'object'
    };
    
    return typeMap[type] || 'string';
  }

  /**
   * Get all generated server configurations
   * @returns {Map} Map of skill names to server configs
   */
  getGeneratedServers() {
    return this.generatedServers;
  }

  /**
   * Get server configuration for a specific skill
   * @param {string} skillName - Skill name
   * @returns {Object|null} Server configuration or null
   */
  getServerConfig(skillName) {
    const serverInfo = this.generatedServers.get(skillName);
    return serverInfo ? serverInfo.config : null;
  }

  /**
   * Clean up generated server files
   */
  cleanup() {
    const scriptDir = path.join(__dirname, 'generated');
    if (fs.existsSync(scriptDir)) {
      const files = fs.readdirSync(scriptDir);
      for (const file of files) {
        if (file.endsWith('-mcp-server.js')) {
          fs.unlinkSync(path.join(scriptDir, file));
        }
      }
    }
    this.generatedServers.clear();
  }
}

module.exports = { SkillMCPGenerator };