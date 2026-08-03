const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('SkillSecurityValidator', () => {
  let SkillSecurityValidator;
  let DANGEROUS_PATTERNS;
  let ALLOWED_COMMANDS;
  let COMMAND_BLACKLIST;
  let validator;

  beforeAll(() => {
    const mod = require('../../src/skills/security/SkillSecurityValidator');
    SkillSecurityValidator = mod.SkillSecurityValidator;
    DANGEROUS_PATTERNS = mod.DANGEROUS_PATTERNS;
    ALLOWED_COMMANDS = mod.ALLOWED_COMMANDS;
    COMMAND_BLACKLIST = mod.COMMAND_BLACKLIST;
  });

  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
    validator = new SkillSecurityValidator();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('exports', () => {
    it('exports the class', () => {
      expect(SkillSecurityValidator).toBeDefined();
    });

    it('exports DANGEROUS_PATTERNS with categories', () => {
      expect(DANGEROUS_PATTERNS).toBeDefined();
      expect(DANGEROUS_PATTERNS.shellInjection).toBeInstanceOf(Array);
      expect(DANGEROUS_PATTERNS.pathTraversal).toBeInstanceOf(Array);
      expect(DANGEROUS_PATTERNS.dangerousImports).toBeInstanceOf(Array);
      expect(DANGEROUS_PATTERNS.shellInjection.length).toBeGreaterThan(0);
      expect(DANGEROUS_PATTERNS.pathTraversal.length).toBeGreaterThan(0);
      expect(DANGEROUS_PATTERNS.dangerousImports.length).toBeGreaterThan(0);
    });

    it('exports ALLOWED_COMMANDS Set', () => {
      expect(ALLOWED_COMMANDS).toBeInstanceOf(Set);
      expect(ALLOWED_COMMANDS.has('node')).toBe(true);
      expect(ALLOWED_COMMANDS.has('npm')).toBe(true);
    });

    it('exports COMMAND_BLACKLIST Set', () => {
      expect(COMMAND_BLACKLIST).toBeInstanceOf(Set);
      expect(COMMAND_BLACKLIST.has('rm')).toBe(true);
      expect(COMMAND_BLACKLIST.has('format')).toBe(true);
    });
  });

  describe('constructor', () => {
    it('sets defaults', () => {
      expect(validator.strictMode).toBe(true);
      expect(validator.allowChildProcess).toBe(false);
      expect(validator.scanScripts).toBe(true);
      expect(validator.commandWhitelist).toBe(ALLOWED_COMMANDS);
      expect(validator.commandBlacklist).toBe(COMMAND_BLACKLIST);
      expect(validator.violations).toEqual([]);
      expect(validator.warnings).toEqual([]);
      expect(validator.quarantined).toBeInstanceOf(Set);
    });

    it('sets strictMode from options', () => {
      const v = new SkillSecurityValidator({ strictMode: false });
      expect(v.strictMode).toBe(false);
    });

    it('sets allowChildProcess from options', () => {
      const v = new SkillSecurityValidator({ allowChildProcess: true });
      expect(v.allowChildProcess).toBe(true);
    });

    it('sets custom whitelist', () => {
      const custom = new Set(['mycmd']);
      const v = new SkillSecurityValidator({ commandWhitelist: custom });
      expect(v.commandWhitelist).toBe(custom);
    });

    it('sets custom blacklist', () => {
      const custom = new Set(['badcmd']);
      const v = new SkillSecurityValidator({ commandBlacklist: custom });
      expect(v.commandBlacklist).toBe(custom);
    });

    it('sets scanScripts to false', () => {
      const v = new SkillSecurityValidator({ scanScripts: false });
      expect(v.scanScripts).toBe(false);
    });

    it('uses default quarantine directory', () => {
      expect(validator.quarantineDir).toContain('.opencode');
      expect(validator.quarantineDir).toContain('quarantine');
    });

    it('uses custom quarantine directory', () => {
      const v = new SkillSecurityValidator({ quarantineDir: '/custom/q' });
      expect(v.quarantineDir).toBe('/custom/q');
    });
  });

  describe('validateSkill', () => {
    it('returns error when path does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = validator.validateSkill('/nonexistent');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Skill path does not exist');
    });

    it('returns valid for empty skill', () => {
      const result = validator.validateSkill('/skill');
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('scans script files when scanScripts is true', () => {
      fs.readdirSync.mockImplementation((_dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name: 'test.js', isDirectory: () => false }];
        }
        return [];
      });
      const result = validator.validateSkill('/skill');
      expect(result).toBeDefined();
    });

    it('does not scan scripts when scanScripts is false', () => {
      const v = new SkillSecurityValidator({ scanScripts: false });
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name: 'test.js', isDirectory: () => false }];
        }
        return [];
      });
      const result = v.validateSkill('/skill');
      expect(result.valid).toBe(true);
    });

    it('validates SKILL.md if present', () => {
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.endsWith('SKILL.md')) return 'risk: high';
        return '';
      });
      const result = validator.validateSkill('/skill');
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('handles SKILL.md read error gracefully', () => {
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.endsWith('SKILL.md')) throw new Error('access denied');
        return '';
      });
      const result = validator.validateSkill('/skill');
      const warn = result.warnings.find(w => w.message.includes('Cannot read'));
      expect(warn).toBeDefined();
    });

    it('returns canLoad false when CRITICAL violations exist', () => {
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name: 'bad.js', isDirectory: () => false }];
        }
        return [];
      });
      fs.readFileSync.mockReturnValue('eval("danger")');
      const result = validator.validateSkill('/skill');
      expect(result.canLoad).toBe(false);
    });

    it('returns canLoad true when no CRITICAL violations', () => {
      const result = validator.validateSkill('/skill');
      expect(result.canLoad).toBe(true);
    });

    it('resets state on each call', () => {
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name: 'a.js', isDirectory: () => false }];
        }
        return [];
      });
      fs.readFileSync.mockReturnValue('eval("bad")');
      const result1 = validator.validateSkill('/skill-a');
      fs.readFileSync.mockReturnValue('');
      const result2 = validator.validateSkill('/skill-b');
      expect(result1.violations.length).toBeGreaterThan(0);
      expect(result2.violations.length).toBe(0);
    });

    it('handles directory read error', () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('permission denied'); });
      const result = validator.validateSkill('/skill');
      const warn = result.warnings.find(w => w.message.includes('Cannot read directory'));
      expect(warn).toBeDefined();
    });
  });

  describe('_getSkillFiles', () => {
    it('scans scripts and references subdirectories', () => {
      let callCount = 0;
      fs.readdirSync.mockImplementation((dir, _opts) => {
        callCount++;
        if (callCount === 1) {
          return [{ name: 'scripts', isDirectory: () => true }];
        }
        if (dir.includes('scripts')) {
          return [{ name: 'run.sh', isDirectory: () => false }];
        }
        return [];
      });
      const files = validator._getSkillFiles('/skill');
      const names = files.map(f => path.basename(f));
      expect(names).toContain('run.sh');
    });

    it('handles missing directories gracefully', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p === '/skill') return true;
        return false;
      });
      const files = validator._getSkillFiles('/skill');
      expect(files).toEqual([]);
    });

    it('handles readdir error for subdirectory', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockImplementation((dir, _opts) => {
        if (dir === '/skill') {
          return [{ name: 'scripts', isDirectory: () => true }];
        }
        throw new Error('access denied');
      });
      const files = validator._getSkillFiles('/skill');
      expect(files).toEqual([]);
      expect(validator.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('_isScriptFile', () => {
    it('returns true for .js files', () => {
      expect(validator._isScriptFile('test.js')).toBe(true);
    });

    it('returns true for .ts files', () => {
      expect(validator._isScriptFile('test.ts')).toBe(true);
    });

    it('returns true for .sh files', () => {
      expect(validator._isScriptFile('test.sh')).toBe(true);
    });

    it('returns true for .bash files', () => {
      expect(validator._isScriptFile('test.bash')).toBe(true);
    });

    it('returns true for .ps1 files', () => {
      expect(validator._isScriptFile('test.ps1')).toBe(true);
    });

    it('returns true for .py files', () => {
      expect(validator._isScriptFile('test.py')).toBe(true);
    });

    it('returns true for .rb files', () => {
      expect(validator._isScriptFile('test.rb')).toBe(true);
    });

    it('returns false for non-script files', () => {
      expect(validator._isScriptFile('readme.md')).toBe(false);
      expect(validator._isScriptFile('image.png')).toBe(false);
      expect(validator._isScriptFile('data.json')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(validator._isScriptFile('test.JS')).toBe(true);
      expect(validator._isScriptFile('test.PY')).toBe(true);
    });
  });

  describe('_validateScriptFile', () => {
    function setupFile(name, content) {
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [{ name, isDirectory: () => false }];
        }
        return [];
      });
      fs.readFileSync.mockReturnValue(content);
    }

    it('detects shell injection patterns', () => {
      setupFile('bad.js', 'eval("dangerous")');
      const result = validator.validateSkill('/skill');
      const hasEval = result.violations.some(v => v.type === 'Eval usage');
      expect(hasEval).toBe(true);
    });

    it('detects backtick command patterns', () => {
      setupFile('bad.js', 'const out = `ls -la`');
      const result = validator.validateSkill('/skill');
      const hasBacktick = result.violations.some(v => v.type === 'Backtick Command');
      expect(hasBacktick).toBe(true);
    });

    it('detects command substitution', () => {
      setupFile('bad.js', '$(rm -rf /)');
      const result = validator.validateSkill('/skill');
      const hasSub = result.violations.some(v => v.type === 'Command Substitution $(...)');
      expect(hasSub).toBe(true);
    });

    it('detects command chaining with rm', () => {
      setupFile('bad.js', '; rm -rf /');
      const result = validator.validateSkill('/skill');
      const hasChain = result.violations.some(v => v.type === 'Command Chaining with rm');
      expect(hasChain).toBe(true);
    });

    it('detects AND chaining with rm', () => {
      setupFile('bad.js', '&& rm -rf /');
      const result = validator.validateSkill('/skill');
      const hasChain = result.violations.some(v => v.type === 'AND Chaining with rm');
      expect(hasChain).toBe(true);
    });

    it('detects pipe to sensitive commands', () => {
      setupFile('bad.js', '| cat /etc/passwd');
      const result = validator.validateSkill('/skill');
      const hasPipe = result.violations.some(v => v.type === 'Pipe to sensitive commands');
      expect(hasPipe).toBe(true);
    });

    it('detects exec usage', () => {
      setupFile('bad.js', 'exec("malicious")');
      const result = validator.validateSkill('/skill');
      const hasExec = result.violations.some(v => v.type === 'Exec usage');
      expect(hasExec).toBe(true);
    });

    it('detects path traversal patterns as warnings', () => {
      setupFile('bad.js', '../../etc/passwd');
      const result = validator.validateSkill('/skill');
      const hasTraversal = result.warnings.some(w => w.type === 'Parent directory traversal');
      expect(hasTraversal).toBe(true);
    });

    it('detects Windows path traversal as warnings', () => {
      setupFile('bad.js', '..\\..\\etc\\passwd');
      const result = validator.validateSkill('/skill');
      const hasWinTraversal = result.warnings.some(w => w.type === 'Windows parent directory traversal');
      expect(hasWinTraversal).toBe(true);
    });

    it('detects env variable in path as warnings', () => {
      setupFile('bad.js', 'path/%env%/config');
      const result = validator.validateSkill('/skill');
      const hasEnvVar = result.warnings.some(w => w.type === 'Environment variable in path');
      expect(hasEnvVar).toBe(true);
    });

    it('detects child_process import as warnings', () => {
      setupFile('bad.js', 'require("child_process")');
      const result = validator.validateSkill('/skill');
      const hasImport = result.warnings.some(w => w.type === 'child_process import');
      expect(hasImport).toBe(true);
    });

    it('detects child_process ES import as warnings', () => {
      setupFile('bad.js', 'import { exec } from "child_process"');
      const result = validator.validateSkill('/skill');
      const hasImport = result.warnings.some(w => w.type === 'child_process ES import');
      expect(hasImport).toBe(true);
    });

    it('adds warnings in non-strict mode for CRITICAL', () => {
      setupFile('bad.js', 'eval("test")');
      const v = new SkillSecurityValidator({ strictMode: false });
      const result = v.validateSkill('/skill');
      expect(result.violations.length).toBe(0);
      const hasEval = result.warnings.some(w => w.type === 'Eval usage');
      expect(hasEval).toBe(true);
    });

    it('handles file read error', () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('permission denied'); });
      validator._validateScriptFile('/skill/bad.js');
      const warn = validator.warnings.find(w => w.message.includes('Cannot read file'));
      expect(warn).toBeDefined();
    });

    it('quarantines files with shell injection patterns', () => {
      setupFile('bad.js', 'eval("danger")');
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === validator.quarantineDir) return false;
        return true;
      });
      validator.validateSkill('/skill');
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();
    });
  });

  describe('_checkCommandUsage', () => {
    it('flags execSync without array form', () => {
      validator.allowChildProcess = false;
      validator._checkCommandUsage('execSync("node script.js")', 'test.js');
      const hasViolation = validator.violations.some(v => v.type === 'execSync without array form');
      expect(hasViolation).toBe(true);
    });

    it('allows execSync with array form', () => {
      validator.allowChildProcess = false;
      validator._checkCommandUsage('execSync("node", ["script.js"])', 'test.js');
      const hasViolation = validator.violations.some(v => v.type === 'execSync without array form');
      expect(hasViolation).toBe(false);
    });

    it('flags spawn with blacklisted command', () => {
      validator.allowChildProcess = false;
      validator._checkCommandUsage('spawn("rm", ["-rf", "/"])', 'test.js');
      const hasViolation = validator.violations.some(v => v.type === 'Blacklisted command');
      expect(hasViolation).toBe(true);
    });

    it('allows spawn with whitelisted command', () => {
      validator.allowChildProcess = false;
      validator._checkCommandUsage('spawn("node", ["script.js"])', 'test.js');
      const hasViolation = validator.violations.some(v => v.type === 'Blacklisted command');
      expect(hasViolation).toBe(false);
    });

    it('skips check when allowChildProcess is true', () => {
      fs.readFileSync.mockReturnValue('execSync("rm -rf /")');
      const v = new SkillSecurityValidator({ allowChildProcess: true, strictMode: false });
      v._validateScriptFile('/skill/test.js');
      expect(v.violations.length).toBe(0);
    });

    it('detects execSync with template string', () => {
      validator._checkCommandUsage('execSync(`some command`)', 'test.js');
      const hasViolation = validator.violations.some(v => v.type === 'execSync without array form');
      expect(hasViolation).toBe(true);
    });
  });

  describe('_isArrayForm', () => {
    it('returns true when array form is used', () => {
      expect(validator._isArrayForm('execSync("node", ["arg"])', 'execSync')).toBe(true);
    });

    it('returns false when no array form', () => {
      expect(validator._isArrayForm('execSync("node arg")', 'execSync')).toBe(false);
    });

    it('handles special regex characters in function name', () => {
      expect(validator._isArrayForm('my$ync("cmd", ["a"])', 'my$ync')).toBe(true);
    });
  });

  describe('_validateSkillMetadata', () => {
    it('warns on risk: high', () => {
      fs.readFileSync.mockReturnValue('risk: high');
      validator._validateSkillMetadata('/skill/SKILL.md');
      const warn = validator.warnings.find(w => w.type === 'High Risk Skill');
      expect(warn).toBeDefined();
    });

    it('warns on riskLevel: high', () => {
      fs.readFileSync.mockReturnValue('riskLevel: high');
      validator._validateSkillMetadata('/skill/SKILL.md');
      const warn = validator.warnings.find(w => w.type === 'High Risk Skill');
      expect(warn).toBeDefined();
    });

    it('warns on executable code reference', () => {
      fs.readFileSync.mockReturnValue('Run exec() to start');
      validator._validateSkillMetadata('/skill/SKILL.md');
      const warn = validator.warnings.find(w => w.type === 'Executable Code Reference');
      expect(warn).toBeDefined();
    });

    it('handles read error', () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('no access'); });
      validator._validateSkillMetadata('/skill/SKILL.md');
      const warn = validator.warnings.find(w => w.message.includes('Cannot read'));
      expect(warn).toBeDefined();
    });
  });

  describe('_quarantineFile', () => {
    it('creates quarantine directory if missing', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === validator.quarantineDir) return false;
        return true;
      });
      validator._quarantineFile('/skill/danger.js');
      expect(fs.mkdirSync).toHaveBeenCalledWith(validator.quarantineDir, { recursive: true });
    });

    it('renames file to quarantine', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      validator._quarantineFile('/skill/danger.js');
      expect(fs.renameSync).toHaveBeenCalled();
      expect(validator.quarantined.has('/skill/danger.js')).toBe(true);
    });

    it('adds quarantine violation on success', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      validator._quarantineFile('/skill/danger.js');
      const violation = validator.violations.find(v => v.type === 'Quarantined');
      expect(violation).toBeDefined();
      expect(violation.file).toBe('/skill/danger.js');
    });

    it('adds quarantine failed violation on error', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('access denied'); });
      validator._quarantineFile('/skill/danger.js');
      const violation = validator.violations.find(v => v.type === 'Quarantine Failed');
      expect(violation).toBeDefined();
    });
  });

  describe('validateMCPCommand', () => {
    it('validates valid command', () => {
      const result = validator.validateMCPCommand('node', ['-e', 'safeScript']);
      expect(result.valid).toBe(true);
    });

    it('rejects non-string command', () => {
      const result = validator.validateMCPCommand(123);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    it('rejects command not in whitelist', () => {
      const result = validator.validateMCPCommand('malicious');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in whitelist');
    });

    it('rejects blacklisted command', () => {
      const customBlacklist = new Set(ALLOWED_COMMANDS);
      const v = new SkillSecurityValidator({ commandBlacklist: customBlacklist });
      const result = v.validateMCPCommand('node', ['-e', 'ok']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blacklisted');
    });

    it('rejects arguments with shell metacharacters', () => {
      const result = validator.validateMCPCommand('echo', ['hello; rm -rf /']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('shell metacharacters');
      expect(result.dangerousChars).toBeDefined();
    });

    it('accepts commands without args', () => {
      const result = validator.validateMCPCommand('node');
      expect(result.valid).toBe(true);
    });

    it('rejects args with backtick', () => {
      const result = validator.validateMCPCommand('echo', ['`ls`']);
      expect(result.valid).toBe(false);
    });

    it('returns allowed list on whitelist failure', () => {
      const result = validator.validateMCPCommand('unknown');
      expect(result.allowed).toBeInstanceOf(Array);
      expect(result.allowed).toContain('node');
    });
  });

  describe('_containsShellMetacharacters', () => {
    it('returns true for semicolon', () => {
      expect(validator._containsShellMetacharacters('hello;world')).toBe(true);
    });

    it('returns true for pipe', () => {
      expect(validator._containsShellMetacharacters('hello|world')).toBe(true);
    });

    it('returns true for dollar sign', () => {
      expect(validator._containsShellMetacharacters('$HOME')).toBe(true);
    });

    it('returns true for backtick', () => {
      expect(validator._containsShellMetacharacters('`cmd`')).toBe(true);
    });

    it('returns true for angle brackets', () => {
      expect(validator._containsShellMetacharacters('>file')).toBe(true);
    });

    it('returns false for safe strings', () => {
      expect(validator._containsShellMetacharacters('hello world')).toBe(false);
      expect(validator._containsShellMetacharacters('safe-input_123')).toBe(false);
      expect(validator._containsShellMetacharacters('')).toBe(false);
    });
  });

  describe('_getShellMetacharacters', () => {
    it('returns unique dangerous characters', () => {
      const chars = validator._getShellMetacharacters(';|&`$<>()');
      expect(chars.sort()).toEqual(['$', '(', ')', ';', '<', '>', '&', '`', '|'].sort());
    });

    it('does not duplicate characters', () => {
      const chars = validator._getShellMetacharacters(';;;|||');
      expect(chars.length).toBe(2);
    });

    it('returns empty array for safe string', () => {
      const chars = validator._getShellMetacharacters('safe');
      expect(chars).toEqual([]);
    });

    it('detects brackets and braces', () => {
      const chars = validator._getShellMetacharacters('[{}]');
      expect(chars).toContain('[');
      expect(chars).toContain('{');
      expect(chars).toContain('}');
      expect(chars).toContain(']');
    });
  });

  describe('sanitizeInput', () => {
    it('removes shell metacharacters', () => {
      expect(validator.sanitizeInput('hello; world|test`ls`')).toBe('hello worldtestls');
    });

    it('returns non-string input unchanged', () => {
      expect(validator.sanitizeInput(123)).toBe(123);
      expect(validator.sanitizeInput(null)).toBe(null);
      expect(validator.sanitizeInput(undefined)).toBe(undefined);
    });

    it('returns empty string unchanged', () => {
      expect(validator.sanitizeInput('')).toBe('');
    });

    it('removes angle brackets', () => {
      expect(validator.sanitizeInput('<script>')).toBe('script');
    });

    it('removes dollar sign', () => {
      expect(validator.sanitizeInput('$PATH')).toBe('PATH');
    });
  });

  describe('getReport', () => {
    it('returns timestamp and summary', () => {
      const report = validator.getReport();
      expect(report.timestamp).toBeDefined();
      expect(report.strictMode).toBe(true);
      expect(report.summary).toBeDefined();
      expect(report.summary.critical).toBe(0);
      expect(report.summary.high).toBe(0);
      expect(report.summary.medium).toBe(0);
      expect(report.summary.warnings).toBe(0);
    });

    it('counts violations by severity', () => {
      validator.violations.push({ severity: 'CRITICAL' });
      validator.violations.push({ severity: 'CRITICAL' });
      validator.violations.push({ severity: 'HIGH' });
      validator.warnings.push({});
      const report = validator.getReport();
      expect(report.summary.critical).toBe(2);
      expect(report.summary.high).toBe(1);
      expect(report.summary.medium).toBe(0);
      expect(report.summary.warnings).toBe(1);
    });

    it('returns quarantined files', () => {
      validator.quarantined.add('/skill/bad.js');
      const report = validator.getReport();
      expect(report.quarantined).toContain('/skill/bad.js');
    });
  });

  describe('reset', () => {
    it('clears violations, warnings, and quarantined', () => {
      validator.violations.push({ severity: 'CRITICAL' });
      validator.warnings.push({ message: 'test' });
      validator.quarantined.add('/skill/bad.js');
      validator.reset();
      expect(validator.violations).toEqual([]);
      expect(validator.warnings).toEqual([]);
      expect(validator.quarantined.size).toBe(0);
    });
  });

  describe('integration - end to end', () => {
    it('validates a safe skill package', () => {
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [
            { name: 'safe.js', isDirectory: () => false },
            { name: 'SKILL.md', isDirectory: () => false }
          ];
        }
        return [];
      });
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.endsWith('SKILL.md')) return '# Safe Skill';
        if (filePath.endsWith('safe.js')) return 'console.log("hello")';
        return '';
      });
      const result = validator.validateSkill('/skill');
      expect(result.valid).toBe(true);
      expect(result.canLoad).toBe(true);
    });

    it('validates a dangerous skill package', () => {
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [
            { name: 'danger.js', isDirectory: () => false },
            { name: 'SKILL.md', isDirectory: () => false }
          ];
        }
        return [];
      });
      const files = {};
      files['SKILL.md'] = 'riskLevel: high';
      files['danger.js'] = 'require("child_process"); eval("bad")';
      fs.readFileSync.mockImplementation((filePath) => {
        for (const f in files) {
          if (filePath.endsWith(f)) return files[f];
        }
        return '';
      });
      const result = validator.validateSkill('/skill');
      expect(result.valid).toBe(false);
      expect(result.canLoad).toBe(false);
      const violationTypes = result.violations.map(v => v.type);
      expect(violationTypes).toContain('Eval usage');
      const warningTypes = result.warnings.map(w => w.type);
      expect(warningTypes).toContain('child_process import');
    });

    it('handles multiple files with different extensions', () => {
      fs.readdirSync.mockImplementation((dir, opts) => {
        if (opts && opts.withFileTypes) {
          return [
            { name: 'script.js', isDirectory: () => false },
            { name: 'readme.md', isDirectory: () => false },
            { name: 'config.json', isDirectory: () => false },
            { name: 'run.sh', isDirectory: () => false }
          ];
        }
        return [];
      });
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.endsWith('.js')) return 'eval("x")';
        if (filePath.endsWith('.sh')) return '; rm -rf /';
        return '';
      });
      const result = validator.validateSkill('/skill');
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });
});
