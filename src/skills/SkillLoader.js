const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class SkillLoader {
  constructor(skillsDir = path.join(process.cwd(), 'skills-source', 'skills')) {
    this.skillsDir = skillsDir;
    this.skills = new Map(); // name -> skill object
  }

  // Load all skills from the skills directory
  loadAll() {
    if (!fs.existsSync(this.skillsDir)) {
      console.warn(`Skills directory not found: ${this.skillsDir}`);
      return [];
    }

    const items = fs.readdirSync(this.skillsDir);
    for (const item of items) {
      const skillPath = path.join(this.skillsDir, item);
      if (fs.statSync(skillPath).isDirectory()) {
        try {
          const skill = this.loadSkill(item);
          if (skill) {
            this.skills.set(skill.name, skill);
          }
        } catch (error) {
          console.error(`Failed to load skill ${item}:`, error.message);
        }
      }
    }
    return Array.from(this.skills.values());
  }

  // Load a single skill by folder name
  loadSkill(skillName) {
    const skillPath = path.join(this.skillsDir, skillName);
    if (!fs.existsSync(skillPath)) return null;

    // Try to load skill.md or README.md
    let skillFile = null;
    for (const fileName of ['skill.md', 'README.md']) {
      const filePath = path.join(skillPath, fileName);
      if (fs.existsSync(filePath)) {
        skillFile = filePath;
        break;
      }
    }

    if (!skillFile) return null;

    const content = fs.readFileSync(skillFile, 'utf8');
    const skill = this.parseSkill(content, skillName);
    return skill;
  }

  // Parse skill markdown file to extract metadata
  parseSkill(content, skillName) {
    // Extract frontmatter (between --- lines)
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      // If no frontmatter, try to extract from content
      return this.parseFromContent(content, skillName);
    }

    const frontmatter = frontmatterMatch[1];
    let data;
    try {
      data = yaml.load(frontmatter);
    } catch (e) {
      console.warn(`Failed to parse frontmatter for skill ${skillName}:`, e.message);
      data = {};
    }

    // Ensure we have required fields
    const skill = {
      name: data.name || skillName,
      description: data.description || '',
      version: data.version || '1.0.0',
      pure: data.pure === true,
      riskLevel: data.riskLevel || data.risk || 'low',
      inputs: data.inputs || [],
      outputs: data.outputs || [],
      scripts: data.scripts || [],
      dependencies: data.dependencies || [],
      license: data.license || '',
      rawContent: content,
      skillPath: path.join(this.skillsDir, skillName)
    };

    // If there's no structured data, try to extract from content
    if (!skill.description && !skill.inputs.length) {
      const contentSkill = this.parseFromContent(content, skillName);
      if (contentSkill.description) {
        skill.description = contentSkill.description;
      }
      if (contentSkill.inputs.length) {
        skill.inputs = contentSkill.inputs;
      }
    }

    return skill;
  }

  // Fallback parsing from content when no frontmatter
  parseFromContent(content, skillName) {
    // Simple heuristic: look for description after title
    const lines = content.split('\n');
    let description = '';
    let inputs = [];

    // Look for a line that starts with # or ## for title, then take next lines as description
    let foundTitle = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('# ') || line.startsWith('## ')) {
        foundTitle = true;
        continue;
      }
      if (foundTitle && line && !line.startsWith('#')) {
        description += line + ' ';
      } else if (foundTitle && line.startsWith('#')) {
        break;
      }
    }

    // Look for inputs section (simple)
    const inputsMatch = content.match(/inputs:\s*((?:\s*-\s*name:.*\n)*)/i);
    if (inputsMatch) {
      const inputsText = inputsMatch[1];
      const inputLines = inputsText.split('\n');
      for (const line of inputLines) {
        const nameMatch = line.match(/name:\s*(\S+)/);
        if (nameMatch) {
          inputs.push({ name: nameMatch[1], type: 'string', required: false });
        }
      }
    }

    return {
      name: skillName,
      description: description.trim(),
      inputs: inputs,
      outputs: [],
      scripts: [],
      dependencies: []
    };
  }

  getSkill(name) {
    return this.skills.get(name);
  }

  getAllSkills() {
    return Array.from(this.skills.values());
  }
}

module.exports = { SkillLoader };
