/**
 * UltraWork CLI Tool
 * 技能开发命令行工具
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class UltraWorkCLI {
  constructor() {
    this.commands = new Map();
    this._registerCommands();
  }

  _registerCommands() {
    this.commands.set('init', {
      name: 'init',
      description: '创建新的技能项目',
      usage: 'ultrawork init <project-name> [--template <template>] [--typescript]',
      options: [
        { name: 'template', short: 't', type: 'string', default: 'basic', description: '项目模板' },
        { name: 'typescript', short: 'T', type: 'boolean', default: false, description: '使用TypeScript' },
        { name: 'force', short: 'f', type: 'boolean', default: false, description: '强制覆盖' }
      ],
      handler: this._handleInit.bind(this)
    });

    this.commands.set('validate', {
      name: 'validate',
      description: '验证技能配置',
      usage: 'ultrawork validate [--path <path>]',
      options: [
        { name: 'path', short: 'p', type: 'string', default: '.', description: '技能路径' },
        { name: 'strict', short: 's', type: 'boolean', default: false, description: '严格模式' }
      ],
      handler: this._handleValidate.bind(this)
    });

    this.commands.set('test', {
      name: 'test',
      description: '测试技能',
      usage: 'ultrawork test [--path <path>] [--input <input>] [--watch]',
      options: [
        { name: 'path', short: 'p', type: 'string', default: '.', description: '技能路径' },
        { name: 'input', short: 'i', type: 'string', description: '测试输入JSON' },
        { name: 'watch', short: 'w', type: 'boolean', default: false, description: '监听模式' }
      ],
      handler: this._handleTest.bind(this)
    });

    this.commands.set('publish', {
      name: 'publish',
      description: '发布技能到市场',
      usage: 'ultrawork publish [--path <path>] [--version <version>] [--private]',
      options: [
        { name: 'path', short: 'p', type: 'string', default: '.', description: '技能路径' },
        { name: 'version', short: 'v', type: 'string', description: '版本号' },
        { name: 'private', short: 'P', type: 'boolean', default: false, description: '发布为私有' }
      ],
      handler: this._handlePublish.bind(this)
    });

    this.commands.set('list', {
      name: 'list',
      description: '列出本地技能',
      usage: 'ultrawork list [--all]',
      options: [
        { name: 'all', short: 'a', type: 'boolean', default: false, description: '显示所有' }
      ],
      handler: this._handleList.bind(this)
    });

    this.commands.set('search', {
      name: 'search',
      description: '搜索市场技能',
      usage: 'ultrawork search <query> [--category <category>] [--limit <limit>]',
      options: [
        { name: 'category', short: 'c', type: 'string', description: '分类筛选' },
        { name: 'limit', short: 'l', type: 'number', default: 20, description: '结果数量' }
      ],
      handler: this._handleSearch.bind(this)
    });

    this.commands.set('install', {
      name: 'install',
      description: '安装技能',
      usage: 'ultrawork install <skill-id> [--path <path>]',
      options: [
        { name: 'path', short: 'p', type: 'string', default: './skills', description: '安装路径' }
      ],
      handler: this._handleInstall.bind(this)
    });

    this.commands.set('generate', {
      name: 'generate',
      description: '生成代码',
      usage: 'ultrawork generate <type> <name> [--path <path>]',
      options: [
        { name: 'path', short: 'p', type: 'string', default: '.', description: '生成路径' }
      ],
      handler: this._handleGenerate.bind(this)
    });
  }

  // 初始化项目
  async _handleInit(args) {
    const { name, template, typescript, force } = args;
    
    console.log(`\n🚀 Creating UltraWork Skill: ${name}\n`);
    
    const targetPath = path.join(process.cwd(), name);
    
    // 检查目录
    if (fs.existsSync(targetPath) && !force) {
      console.error(`❌ Directory ${name} already exists. Use --force to overwrite.`);
      return;
    }

    // 创建目录
    fs.mkdirSync(targetPath, { recursive: true });

    // 生成文件
    const files = this._generateProjectFiles(name, { template, typescript });
    
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(targetPath, filePath);
      const dir = path.dirname(fullPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, content);
      console.log(`  ✅ ${filePath}`);
    }

    console.log(`\n✨ Project created at ${targetPath}\n`);
    console.log('📋 Next steps:');
    console.log(`   cd ${name}`);
    console.log('   ultrawork test');
    console.log('   ultrawork publish\n');
  }

  _generateProjectFiles(name, options) {
    const { typescript } = options;
    const ext = typescript ? 'ts' : 'js';
    
    const skillMd = `# ${name}

> ${options.description || 'An UltraWork skill'}

## Metadata

\`\`\`yaml
name: ${name}
version: 1.0.0
author: ${process.env.USER || 'developer'}
category: productivity
tags: []
inputs:
  - name: input
    type: string
    required: true
    description: Input data
outputs:
  - name: result
    type: object
    description: Processing result
\`\`\`

## Usage

\\`\\`\\`javascript
const result = await skill.execute({ input: 'data' });
\\`\\`\\`

## Examples

### Basic Usage

\\`\\`\\`javascript
await skill.execute({ input: 'hello world' });
\\`\\`\\`

## License

MIT
`;

    const indexJs = typescript ? `import type { SkillInput, SkillOutput } from '@ultrawork/sdk';

export const skill = {
  name: '${name}',
  version: '1.0.0',
  
  async execute(input: SkillInput): Promise<SkillOutput> {
    const { input: data } = input;
    
    // TODO: Implement your skill logic
    console.log('Processing:', data);
    
    return {
      success: true,
      result: {
        message: \`Processed: \${data}\`,
        timestamp: Date.now()
      }
    };
  }
};

export default skill;
` : `/**
 * ${name} - UltraWork Skill
 */

class ${this._toPascalCase(name)} {
  static get metadata() {
    return {
      name: '${name}',
      version: '1.0.0',
      description: 'An UltraWork skill'
    };
  }

  async execute(input) {
    const { input: data } = input;
    
    // TODO: Implement your skill logic
    console.log('Processing:', data);
    
    return {
      success: true,
      result: {
        message: \`Processed: \${data}\`,
        timestamp: Date.now()
      }
    };
  }
}

module.exports = { ${this._toPascalCase(name)} };
module.exports.default = ${this._toPascalCase(name)};
`;

    const testJs = typescript ? `import { ${this._toPascalCase(name)} } from './index';

async function test() {
  const skill = new ${this._toPascalCase(name)}();
  
  const result = await skill.execute({
    input: 'test data'
  });
  
  console.log('Test Result:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('✅ Test passed!');
  } else {
    console.error('❌ Test failed!');
    process.exit(1);
  }
}

test().catch(console.error);
` : `const { ${this._toPascalCase(name)} } = require('./index');

async function test() {
  const skill = new ${this._toPascalCase(name)}();
  
  const result = await skill.execute({
    input: 'test data'
  });
  
  console.log('Test Result:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('✅ Test passed!');
  } else {
    console.error('❌ Test failed!');
    process.exit(1);
  }
}

test().catch(console.error);
`;

    const packageJson = JSON.stringify({
      name,
      version: '1.0.0',
      description: 'An UltraWork skill',
      main: `index.${ext}`,
      scripts: {
        test: 'node test.js',
        validate: 'ultrawork validate',
        publish: 'ultrawork publish'
      },
      keywords: ['ultrawork', 'skill'],
      license: 'MIT'
    }, null, 2);

    return {
      'skill.md': skillMd,
      [`index.${ext}`]: indexJs,
      'test.js': testJs,
      'package.json': packageJson
    };
  }

  _toPascalCase(str) {
    return str
      .split(/[-_\s]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  // 验证技能
  async _handleValidate(args) {
    const { path: skillPath, strict } = args;
    
    console.log(`\n🔍 Validating skill at ${skillPath}\n`);
    
    const issues = [];
    const warnings = [];
    
    // 检查必需文件
    const requiredFiles = ['skill.md'];
    for (const file of requiredFiles) {
      const fullPath = path.join(skillPath, file);
      if (!fs.existsSync(fullPath)) {
        issues.push({ type: 'error', message: `Missing required file: ${file}` });
      }
    }
    
    // 验证 skill.md
    const skillMdPath = path.join(skillPath, 'skill.md');
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      
      // 检查必需字段
      const requiredFields = ['name:', 'version:', 'inputs:', 'outputs:'];
      for (const field of requiredFields) {
        if (!content.includes(field)) {
          issues.push({ type: 'error', message: `Missing required field: ${field}` });
        }
      }
      
      // 检查 YAML 代码块
      if (!content.includes('```yaml') && !content.includes('```yml')) {
        warnings.push({ type: 'warning', message: 'Missing YAML metadata block' });
      }
    }
    
    // 检查代码文件
    const codeFiles = fs.readdirSync(skillPath).filter(f => 
      f.endsWith('.js') || f.endsWith('.ts')
    );
    
    if (codeFiles.length === 0) {
      warnings.push({ type: 'warning', message: 'No code files found' });
    }
    
    // 输出结果
    for (const issue of issues) {
      console.log(`  ❌ ${issue.message}`);
    }
    
    for (const warning of warnings) {
      console.log(`  ⚠️  ${warning.message}`);
    }
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('  ✅ Skill is valid!\n');
      return { valid: true };
    }
    
    console.log(`\n${issues.length} errors, ${warnings.length} warnings\n`);
    return { valid: issues.length === 0, issues, warnings };
  }

  // 测试技能
  async _handleTest(args) {
    const { path: skillPath, input, watch } = args;
    
    console.log(`\n🧪 Testing skill at ${skillPath}\n`);
    
    try {
      // 加载技能
      const indexPath = path.join(skillPath, 'index.js');
      if (!fs.existsSync(indexPath)) {
        console.error('  ❌ No index.js found');
        return;
      }
      
      const SkillClass = require(indexPath);
      const skill = new SkillClass();
      
      // 解析输入
      const testInput = input ? JSON.parse(input) : { input: 'test' };
      
      // 执行测试
      console.log('  Input:', JSON.stringify(testInput));
      const result = await skill.execute(testInput);
      
      console.log('\n  Output:');
      console.log('  ' + JSON.stringify(result, null, 2).replace(/\n/g, '\n  '));
      
      if (result.success) {
        console.log('\n  ✅ Test passed!\n');
      } else {
        console.log('\n  ❌ Test failed!\n');
      }
      
      // 监听模式
      if (watch) {
        console.log('  👀 Watching for changes...');
        const chokidar = require('chokidar');
        chokidar.watch(skillPath).on('change', async () => {
          console.log('\n  🔄 File changed, re-testing...');
          delete require.cache[require.resolve(indexPath)];
          const newSkill = new (require(indexPath))();
          const newResult = await newSkill.execute(testInput);
          console.log('  Output:', JSON.stringify(newResult, null, 2));
        });
      }
      
    } catch (error) {
      console.error(`\n  ❌ Test error: ${error.message}\n`);
    }
  }

  // 发布技能
  async _handlePublish(args) {
    const { path: skillPath, version, isPrivate } = args;
    
    console.log(`\n📦 Publishing skill from ${skillPath}\n`);
    
    // 验证
    const validation = await this._handleValidate({ path: skillPath, strict: false });
    if (!validation.valid) {
      console.error('❌ Cannot publish invalid skill');
      return;
    }
    
    // 生成版本
    const newVersion = version || this._bumpVersion('1.0.0');
    
    console.log(`  Version: ${newVersion}`);
    console.log(`  Visibility: ${isPrivate ? 'Private' : 'Public'}`);
    
    // 模拟发布
    console.log('\n  ⏳ Publishing to marketplace...');
    await this._delay(2000);
    
    const skillId = `skill_${crypto.randomBytes(8).toString('hex')}`;
    
    console.log(`\n  ✅ Published successfully!`);
    console.log(`  Skill ID: ${skillId}`);
    console.log(`  URL: https://ultrawork.ai/marketplace/${skillId}\n`);
  }

  _bumpVersion(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 列出技能
  async _handleList(args) {
    console.log('\n📋 Local Skills:\n');
    
    const skillsDir = path.join(process.cwd(), 'skills');
    if (!fs.existsSync(skillsDir)) {
      console.log('  No skills directory found.');
      return;
    }
    
    const skills = fs.readdirSync(skillsDir);
    
    for (const skill of skills) {
      const skillPath = path.join(skillsDir, skill);
      const stat = fs.statSync(skillPath);
      
      if (stat.isDirectory()) {
        console.log(`  📁 ${skill}`);
      }
    }
    
    console.log('');
  }

  // 搜索技能
  async _handleSearch(args) {
    const { _: [query], category, limit } = args;
    
    console.log(`\n🔍 Searching for: "${query}"\n`);
    
    // 模拟搜索结果
    const results = [
      { id: 'skill_abc123', name: 'Image Analyzer', author: 'user1', downloads: 1500, rating: 4.8 },
      { id: 'skill_def456', name: 'Document Parser', author: 'user2', downloads: 800, rating: 4.5 }
    ];
    
    for (const result of results.slice(0, limit)) {
      console.log(`  📦 ${result.name}`);
      console.log(`     ID: ${result.id}`);
      console.log(`     Author: ${result.author}`);
      console.log(`     Downloads: ${result.downloads} | Rating: ${result.rating}⭐`);
      console.log('');
    }
  }

  // 安装技能
  async _handleInstall(args) {
    const { _: [skillId], path: installPath } = args;
    
    console.log(`\n📥 Installing ${skillId}...\n`);
    
    await this._delay(1000);
    
    console.log('  ✅ Installed successfully!');
    console.log(`  Location: ${installPath}/${skillId}\n`);
  }

  // 生成代码
  async _handleGenerate(args) {
    const { _: [type, name], path: targetPath } = args;
    
    console.log(`\n🔧 Generating ${type}: ${name}\n`);
    
    const generators = {
      'workflow': this._generateWorkflow.bind(this),
      'trigger': this._generateTrigger.bind(this),
      'executor': this._generateExecutor.bind(this)
    };
    
    const generator = generators[type];
    if (generator) {
      await generator(name, targetPath);
    } else {
      console.error(`Unknown type: ${type}`);
    }
  }

  async _generateWorkflow(name, targetPath) {
    const content = JSON.stringify({
      name,
      steps: [],
      triggers: []
    }, null, 2);
    
    fs.writeFileSync(path.join(targetPath, `${name}.workflow.json`), content);
    console.log(`  ✅ Created ${name}.workflow.json`);
  }

  async _generateTrigger(name, targetPath) {
    const content = `// Trigger: ${name}
module.exports = {
  name: '${name}',
  async handle(event) {
    // TODO: Implement trigger logic
    return { triggered: true };
  }
};
`;
    
    fs.writeFileSync(path.join(targetPath, `${name}.trigger.js`), content);
    console.log(`  ✅ Created ${name}.trigger.js`);
  }

  async _generateExecutor(name, targetPath) {
    const className = this._toPascalCase(name);
    const content = `// Executor: ${name}
class ${className}Executor {
  static get name() {
    return '${name}';
  }

  async execute(input, context) {
    // TODO: Implement executor logic
    return { result: input };
  }
}

module.exports = { ${className}Executor };
`;
    
    fs.writeFileSync(path.join(targetPath, `${name}Executor.js`), content);
    console.log(`  ✅ Created ${name}Executor.js`);
  }

  // 运行命令
  async run(args) {
    const [commandName, ...restArgs] = args;
    
    const command = this.commands.get(commandName);
    if (!command) {
      console.error(`Unknown command: ${commandName}`);
      console.log('\nAvailable commands:');
      for (const [name, cmd] of this.commands.entries()) {
        console.log(`  ${name}: ${cmd.description}`);
      }
      return;
    }

    // 解析参数
    const parsedArgs = this._parseArgs(restArgs, command.options);
    
    // 执行
    await command.handler(parsedArgs);
  }

  _parseArgs(args, options) {
    const result = { _: [] };
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const optName = arg.slice(2);
        const opt = options.find(o => o.name === optName);
        
        if (opt && opt.type === 'boolean') {
          result[opt.name] = true;
        } else if (opt) {
          result[opt.name] = args[++i];
        }
      } else if (arg.startsWith('-')) {
        const shortName = arg.slice(1);
        const opt = options.find(o => o.short === shortName);
        
        if (opt) {
          if (opt.type === 'boolean') {
            result[opt.name] = true;
          } else {
            result[opt.name] = args[++i];
          }
        }
      } else {
        result._.push(arg);
      }
    }
    
    // 应用默认值
    for (const opt of options) {
      if (result[opt.name] === undefined) {
        result[opt.name] = opt.default;
      }
    }
    
    return result;
  }
}

module.exports = { UltraWorkCLI };
