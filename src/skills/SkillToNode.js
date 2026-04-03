const { NodeWorkflowEngine } = require('../workflow/NodeWorkflowEngine');
const { MCPBridge } = require('../mcp/MCPBridge');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const { PythonEnvManager } = require('../performance/PythonEnvManager');
const path = require('path');
const { SkillNodeDefinitions } = require('./SkillNodeDefinitions');

const execFileAsync = promisify(execFile);
const { SkillSandbox } = require('./Sandbox/SkillSandbox');

class SkillToNode {
  static _pyEnv = new PythonEnvManager({ cacheEnabled: true, dockerEnabled: true });
  constructor(workflowEngine, mcpBridge, skillLoader) {
    this.workflowEngine = workflowEngine;
    this.mcpBridge = mcpBridge;
    this.skillLoader = skillLoader;
    this.convertedNodes = new Map(); // skillName + action -> nodeType
    this._resultCache = new Map();
  }

  // Convert a skill to workflow nodes
  async convertSkillToNodes(skillName) {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    // For each script in the skill, create a node type
    for (const script of skill.scripts) {
      await this.createNodeFromScript(skill, script);
    }

    // If no scripts but skill has description, create a generic node
    if (skill.scripts.length === 0 && skill.description) {
      await this.createGenericNode(skill);
    }
  }

  // Create a node type from a skill script
  async createNodeFromScript(skill, script) {
    // Get enhanced node definition if available
    const nodeDefinition = SkillNodeDefinitions.getNodeDefinition(skill.name);
    
    if (nodeDefinition && nodeDefinition.actions && nodeDefinition.actions.length > 0) {
      // Create nodes for each action defined in the node definition
      for (const actionDef of nodeDefinition.actions) {
        const nodeTypeName = `skill.${skill.name}.${actionDef.name}`;
        const nodeKey = `${skill.name}:${actionDef.name}`;
        
        if (this.convertedNodes.has(nodeKey)) {
          continue;
        }
        
        // Create enhanced node type
        const nodeType = {
          name: actionDef.label || `Skill: ${skill.name} - ${actionDef.name}`,
          category: nodeDefinition.category || `Skill: ${skill.name}`,
          description: actionDef.description || nodeDefinition.description,
          inputs: this.mapEnhancedInputsToNodeInputs(actionDef.inputs),
          outputs: this.mapEnhancedOutputsToNodeOutputs(actionDef.outputs),
          execute: async (node, inputs) => {
            // Prepare inputs with action specified
            const skillInputs = {
              ...inputs,
              action: actionDef.name,
              skill: { name: skill.name }
            };
            return await this.executeSkillScript(skill, script, skillInputs);
          }
        };
        
        this.workflowEngine.registerNodeType(nodeTypeName, nodeType);
        this.convertedNodes.set(nodeKey, nodeTypeName);
      }
      
      // Return the first node type name for backward compatibility
      const firstAction = nodeDefinition.actions[0];
      return `skill.${skill.name}.${firstAction.name}`;
    }
    
    // Fallback to original logic for skills without enhanced definitions
    const action = skill.inputs.find(i => i.name === 'action')?.enum?.[0] || 'execute';
    const nodeTypeName = `skill.${skill.name}.${action}`;

    // Check if we've already converted this
    const nodeKey = `${skill.name}:${action}`;
    if (this.convertedNodes.has(nodeKey)) {
      return this.convertedNodes.get(nodeKey);
    }

    // Create the node type
    const nodeType = {
      name: `Skill: ${skill.name} - ${action}`,
      category: `Skill: ${skill.name}`,
      inputs: this.mapSkillInputsToNodeInputs(skill.inputs),
      outputs: this.mapSkillOutputsToNodeOutputs(skill.outputs || [{ name: 'result', type: 'object' }]),
      execute: async (node, inputs) => {
        return await this.executeSkillScript(skill, script, inputs);
      }
    };

    // Register the node type with the workflow engine
    this.workflowEngine.registerNodeType(nodeTypeName, nodeType);
    this.convertedNodes.set(nodeKey, nodeTypeName);

    return nodeTypeName;
  }

  // Create a generic node when no specific scripts are defined
  async createGenericNode(skill) {
    const nodeTypeName = `skill.${skill.name}.generic`;

    // Check if we've already converted this
    if (this.convertedNodes.has(skill.name)) {
      return this.convertedNodes.get(skill.name);
    }

    // Create the node type
    const nodeType = {
      name: `Skill: ${skill.name}`,
      category: `Skill: ${skill.name}`,
      inputs: this.mapSkillInputsToNodeInputs(skill.inputs),
      outputs: this.mapSkillOutputsToNodeOutputs(skill.outputs || [{ name: 'result', type: 'object' }]),
      execute: async (node, inputs) => {
        // For generic skills, we might just return the inputs or a success message
        return { 
          message: `Executed skill ${skill.name}`, 
          inputs: inputs,
          skillDescription: skill.description
        };
      }
    };

    // Register the node type with the workflow engine
    this.workflowEngine.registerNodeType(nodeTypeName, nodeType);
    this.convertedNodes.set(skill.name, nodeTypeName);

    return nodeTypeName;
  }

  // Map skill inputs to node inputs
  mapSkillInputsToNodeInputs(skillInputs) {
    const nodeInputs = {};
    for (const input of skillInputs) {
      nodeInputs[input.name] = {
        type: this.mapSkillTypeToNodeType(input.type || 'string'),
        required: input.required || false
      };
    }
    return nodeInputs;
  }

  // Map enhanced inputs to node inputs
  mapEnhancedInputsToNodeInputs(inputsDefinition) {
    const nodeInputs = {};
    if (!inputsDefinition) return nodeInputs;
    
    for (const [name, definition] of Object.entries(inputsDefinition)) {
      nodeInputs[name] = {
        type: this.mapEnhancedTypeToNodeType(definition.type),
        required: definition.required || false,
        description: definition.description || '',
        default: definition.default,
        enum: definition.enum
      };
    }
    return nodeInputs;
  }

  // Map enhanced outputs to node outputs
  mapEnhancedOutputsToNodeOutputs(outputsDefinition) {
    const nodeOutputs = [];
    if (!outputsDefinition) return nodeOutputs;
    
    for (const [name, definition] of Object.entries(outputsDefinition)) {
      nodeOutputs.push({
        name: name,
        type: this.mapEnhancedTypeToNodeType(definition.type),
        description: definition.description || ''
      });
    }
    return nodeOutputs;
  }

  // Map enhanced types to node types
  mapEnhancedTypeToNodeType(type) {
    if (!type) return 'any';
    
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'array',
      'file': 'file',
      'image': 'image',
      'any': 'any',
      'string|array': 'string',
      'object|string': 'object',
      'number|object': 'number',
      'number|array': 'number',
      'boolean|string': 'boolean',
      'object|array': 'object'
    };
    
    return typeMap[type] || 'any';
  }

  // Map skill outputs to node outputs
  mapSkillOutputsToNodeOutputs(skillOutputs) {
    const nodeOutputs = [];
    for (const output of skillOutputs) {
      nodeOutputs.push({
        name: output.name,
        type: this.mapSkillTypeToNodeType(output.type || 'object')
      });
    }
    return nodeOutputs;
  }

  // Map skill type to node type (simplified mapping)
  mapSkillTypeToNodeType(skillType) {
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'array',
      'file': 'string', // Treat file paths as strings
      'any': 'any'
    };
    return typeMap[skillType] || 'string';
  }

  // Execute a skill script with given inputs
  async executeSkillScript(skill, script, inputs) {
    // If a Python-based script is defined for this skill, try to run in isolated Python env
    try {
      if (script && script.language === 'python') {
        const scriptPath = path.join(skill.skillPath, script.entry || 'main.py');
        const pyResult = await SkillToNode._pyEnv.runPythonScript(
          skill.name, 
          scriptPath, 
          inputs, 
          {
            requirements: skill.dependencies || [],
            isPure: skill.pure === true,
            forceDocker: false,
            forceLocal: false
          }
        );
        return pyResult;
      }
    } catch (e) {
      // fallthrough to existing path if Python execution fails
      console.warn('[PythonExec] Failed to run Python skill:', e.message);
    }
    
    // Phase 2: ensure Python env for dependencies if present (for local execution)
    try {
      if (skill && skill.dependencies && skill.dependencies.length > 0) {
        await SkillToNode._pyEnv.ensureEnvironment(skill.name, skill.dependencies);
      }
    } catch (e) {
      // Non-fatal; continue with execution
      console.warn('[PythonEnvManager] env setup warning:', e.message);
    }
    
    // 1) Try per-skill executor module if available
    const explicitPath = path.join(__dirname, 'executors', `${skill.name}Executor.js`);
    if (fs.existsSync(explicitPath)) {
      try {
        const ExecutorClass = require(explicitPath);
        let execFn = null;
        if (ExecutorClass && typeof ExecutorClass.execute === 'function') {
          execFn = ExecutorClass.execute.bind(ExecutorClass);
        } else if (ExecutorClass && ExecutorClass.DocxExecutor && typeof ExecutorClass.DocxExecutor.execute === 'function') {
          execFn = ExecutorClass.DocxExecutor.execute.bind(ExecutorClass.DocxExecutor);
        } else if (ExecutorClass && ExecutorClass.PdfExecutor && typeof ExecutorClass.PdfExecutor.execute === 'function') {
          execFn = ExecutorClass.PdfExecutor.execute.bind(ExecutorClass.PdfExecutor);
        } else if (ExecutorClass && ExecutorClass.CanvasExecutor && typeof ExecutorClass.CanvasExecutor.execute === 'function') {
          execFn = ExecutorClass.CanvasExecutor.execute.bind(ExecutorClass.CanvasExecutor);
        }
        if (execFn) {
          const result = await execFn({ action: 'test', inputs });
          return result;
        }
      } catch (e) {
        // fall back to generic path if executor fails
        console.warn(`Skill executor ${skill.name} failed, falling back to script execution: ${e.message}`);
      }
    }

    // 2) Optional sandboxed JS execution path
    if (skill.sandboxCode) {
      try {
        const sandbox = new SkillSandbox({ timeout: 1000 });
        return await sandbox.executeCode(skill.sandboxCode, inputs);
      } catch (e) {
        // ignore sandbox errors and proceed to normal execution
        console.warn('[SkillSandbox] execution failed:', e.message);
      }
    }

    // 3) Global executors for common skills
    if (skill.name === 'docx' && typeof require('./executors/DocxExecutor').DocxExecutor === 'function') {
      // fall back to default docx executor if available
      const DocxExec = require('./executors/DocxExecutor');
      if (DocxExec && typeof DocxExec.execute === 'function') {
        return await DocxExec.execute(inputs);
      }
    }

    if (skill.name === 'pdf' && fs.existsSync(path.join(__dirname, 'executors/PdfExecutor.js'))) {
      const PdfExec = require('./executors/PdfExecutor');
      if (PdfExec && typeof PdfExec.execute === 'function') {
        return await PdfExec.execute(inputs);
      }
    }

    if (skill.name === 'canvas-design' && fs.existsSync(path.join(__dirname, 'executors/CanvasExecutor.js'))) {
      const CanvasExec = require('./executors/CanvasExecutor');
      if (CanvasExec && typeof CanvasExec.execute === 'function') {
        return await CanvasExec.execute(inputs);
      }
    }
    // Check if we have a specific executor for this skill
    const executorPath = path.join(__dirname, 'executors', `${skill.name}Executor.js`);
    if (fs.existsSync(executorPath)) {
      try {
        const ExecutorClass = require(executorPath);
        const result = await ExecutorClass.execute(inputs);
        return result;
      } catch (error) {
        // If executor fails, fall back to script execution
        console.warn(`Executor for ${skill.name} failed, falling back to script execution: ${error.message}`);
      }
    }

    try {
      // Prepare the command and arguments based on script language
      let command, args = [];

      switch (script.language) {
        case 'python':
          command = 'python';
          args = [path.join(skill.skillPath, script.entry || 'main.py')];
          break;
        case 'node':
        case 'javascript':
          command = 'node';
          args = [path.join(skill.skillPath, script.entry || 'index.js')];
          break;
        case 'bash':
        case 'shell':
          command = 'bash';
          args = [path.join(skill.skillPath, script.entry || 'script.sh')];
          break;
        default:
          // Default to node for unknown languages
          command = 'node';
          args = [path.join(skill.skillPath, script.entry || 'index.js')];
          break;
      }

      // Prepare input data as JSON
      const inputData = {
        inputs: inputs,
        skill: {
          name: skill.name,
          description: skill.description,
          version: skill.version
        }
      };

      // Set up environment variables if needed
      const env = { ...process.env };
      if (skill.dependencies) {
        // In a real implementation, we might check/install dependencies here
        // For now, we just pass them through
        env.SKILL_DEPENDENCIES = JSON.stringify(skill.dependencies);
      }

      // Execute the script with timeout
      const { stdout, stderr } = await execFileAsync(command, args, {
        input: JSON.stringify(inputData),
        encoding: 'utf8',
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      // Parse the output as JSON if possible
      let result;
      try {
        result = JSON.parse(stdout);
      } catch (e) {
        // If not JSON, return as text
        result = { output: stdout.trim() };
      }

      // Include any stderr in the result for debugging
      if (stderr.trim()) {
        result.stderr = stderr.trim();
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to execute skill ${skill.name}: ${error.message}`);
    }
  }

  // Get all converted node types for a skill
  getConvertedNodes(skillName) {
    const nodes = [];
    for (const [key, nodeType] of this.convertedNodes.entries()) {
      if (key.startsWith(`${skillName}:`)) {
        nodes.push(nodeType);
      }
    }
    return nodes;
  }

  // Clear all converted nodes (for reloading)
  clearConvertedNodes() {
    this.convertedNodes.clear();
    // Note: In a real implementation, we'd also need to unregister from workflowEngine
  }

  // Get metrics from PythonEnvManager
  static getPythonEnvMetrics() {
    return SkillToNode._pyEnv.getMetrics();
  }

  // Get cache statistics from PythonEnvManager
  static getPythonEnvCacheStats() {
    return SkillToNode._pyEnv.getCacheStats();
  }

  // Clear PythonEnvManager cache
  static clearPythonEnvCache() {
    SkillToNode._pyEnv.clearCache();
  }
}

module.exports = { SkillToNode };
