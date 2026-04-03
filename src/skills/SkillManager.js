const fs = require('fs');
const path = require('path');
const { SkillLoader } = require('./SkillLoader');
const { SkillToNode } = require('./SkillToNode');
const { SkillToMCP } = require('./SkillToMCP');

class SkillManager {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || path.join(process.cwd(), 'skills-source', 'skills');
    this.skillLoader = new SkillLoader(this.skillsDir);
    this.skillToNode = null; // Will be initialized when we have workflowEngine
    this.skillToMCP = null; // Will be initialized when we have mcpBridge
    this.loadedSkills = new Set(); // Track which skills have been converted/loaded
    this.watchers = new Map(); // skillName -> fs.FSWatcher
    this.enabledSkills = new Set(); // Skills that are currently enabled
    this.options = options;
  }

  // Initialize with workflow engine and MCP bridge
  initialize(workflowEngine, mcpBridge) {
    this.skillToNode = new SkillToNode(workflowEngine, mcpBridge, this.skillLoader);
    this.skillToMCP = new SkillToMCP(mcpBridge, this.skillLoader);
  }

  // Load all skills from the skills directory
  loadAllSkills() {
    const skills = this.skillLoader.loadAll();
    console.log(`Loaded ${skills.length} skills from skills source`);
    return skills;
  }

  // Load a specific skill
  loadSkill(skillName) {
    const skill = this.skillLoader.loadSkill(skillName);
    if (skill) {
      console.log(`Loaded skill: ${skill.name} (v${skill.version})`);
    } else {
      console.warn(`Failed to load skill: ${skillName}`);
    }
    return skill;
  }

  // Enable a skill (convert it to nodes and/or MCP tools)
  async enableSkill(skillName) {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      // Try to load it first
      this.loadSkill(skillName);
      // Try again
      const skillAfterLoad = this.skillLoader.getSkill(skillName);
      if (!skillAfterLoad) {
        throw new Error(`Skill not found: ${skillName}`);
      }
    }

    // Convert to workflow nodes
    if (this.skillToNode && this.options.convertToNodes !== false) {
      await this.skillToNode.convertSkillToNodes(skillName);
    }

    // Convert to MCP tools
    if (this.skillToMCP && this.options.convertToMCP !== false) {
      await this.skillToMCP.convertSkillToMCPTools(skillName);
    }

    this.loadedSkills.add(skillName);
    this.enabledSkills.add(skillName);

    // Set up file watcher for hot reloading if enabled
    if (this.options.hotReload !== false) {
      this.setupWatcher(skillName);
    }

    console.log(`Enabled skill: ${skill.name}`);
    return skill;
  }

  // Disable a skill (remove its nodes and/or MCP tools)
  async disableSkill(skillName) {
    // Remove from workflow nodes
    if (this.skillToNode) {
      this.skillToNode.clearConvertedNodes();
      // Note: In a full implementation, we'd unregister specific node types
    }

    // Remove from MCP tools
    if (this.skillToMCP) {
      this.skillToMCP.clearRegisteredTools();
      // Note: In a full implementation, we'd unregister specific MCP tools
    }

    this.loadedSkills.delete(skillName);
    this.enabledSkills.delete(skillName);

    // Remove watcher
    if (this.watchers.has(skillName)) {
      const watcher = this.watchers.get(skillName);
      watcher.close();
      this.watchers.delete(skillName);
    }

    console.log(`Disabled skill: ${skillName}`);
  }

  // Setup file watcher for hot reloading
  setupWatcher(skillName) {
    const skillPath = path.join(this.skillsDir, skillName);
    if (!fs.existsSync(skillPath)) return;

    const watcher = fs.watch(skillPath, (eventType, filename) => {
      if (eventType === 'change' || eventType === 'rename') {
        console.log(`Skill ${skillName} changed, reloading...`);
        // In a real implementation, we would reload just this skill
        // For now, we'll just log the change
        // this.reloadSkill(skillName);
      }
    });

    this.watchers.set(skillName, watcher);
  }

  // Check if a skill is enabled
  isEnabled(skillName) {
    return this.enabledSkills.has(skillName);
  }

  // Get all loaded skills
  getLoadedSkills() {
    return Array.from(this.loadedSkills);
  }

  // Get all enabled skills
  getEnabledSkills() {
    return Array.from(this.enabledSkills);
  }

  // Get skill information
  getSkillInfo(skillName) {
    return this.skillLoader.getSkill(skillName);
  }

  // Get all skills from the source
  getAllAvailableSkills() {
    return this.skillLoader.getAllSkills();
  }

  // Get all skills (alias for compatibility with SkillsApi)
  getAllSkills() {
    const skills = this.getAllAvailableSkills();
    // Add enabled status to each skill
    return skills.map(skill => ({
      ...skill,
      enabled: this.enabledSkills.has(skill.name)
    }));
  }

  // Get skill info
  getSkillInfo(skillName) {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      return null;
    }
    return {
      ...skill,
      enabled: this.enabledSkills.has(skillName)
    };
  }

  // Load all skills (alias for compatibility)
  async loadAll() {
    return this.loadAllSkills();
  }

  // Cleanup all watchers
  cleanup() {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

module.exports = { SkillManager };