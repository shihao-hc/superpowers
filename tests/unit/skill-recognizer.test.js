jest.mock('fs');

const fs = require('fs');
const SkillRecognizer = require('../../src/core/SkillRecognizer');

describe('SkillRecognizer', () => {
  let recognizer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(SkillRecognizer.prototype, '_loadSkills').mockReturnValue();
    recognizer = new SkillRecognizer();
    recognizer.skills = [
      { name: 'test-driven-development', description: 'TDD methodology and unit testing', category: '测试', path: '/fake/tdd' },
      { name: 'security-audit', description: 'Security auditing and vulnerability scanning', category: '安全', path: '/fake/security' },
      { name: 'browser-automation', description: 'Browser automation with Playwright', category: '浏览器/爬虫', path: '/fake/browser' }
    ];
    recognizer.categories = {
      '测试': [recognizer.skills[0]],
      '安全': [recognizer.skills[1]],
      '浏览器/爬虫': [recognizer.skills[2]]
    };
  });

  describe('constructor', () => {
    test('initializes state', () => {
      const r = new SkillRecognizer();
      expect(Array.isArray(r.skills)).toBe(true);
      expect(r.customSystems instanceof Map).toBe(true);
    });
  });

  describe('_guessCategory', () => {
    test('guesses from test path', () => {
      expect(recognizer._guessCategory('/project/tests/unit/test.js')).toBe('测试');
    });

    test('defaults to 其他', () => {
      expect(recognizer._guessCategory('/project/xyz/file.js')).toBe('其他');
    });

    test('matches security paths', () => {
      expect(recognizer._guessCategory('/project/security/auth.js')).toBe('安全');
    });
  });

  describe('_getCustomModule', () => {
    test('returns module for DynamicScraper', () => {
      const mod = recognizer._getCustomModule('DynamicScraper');
      expect(mod.type).toBe('爬虫系统');
    });

    test('returns null for unknown module', () => {
      expect(recognizer._getCustomModule('nonexistent')).toBeNull();
    });
  });

  describe('registerSystem / getCustomSystems', () => {
    test('registers and retrieves', () => {
      recognizer.registerSystem('my-sys', { keywords: ['test'], features: {} });
      expect(recognizer.customSystems.has('my-sys')).toBe(true);
      const systems = recognizer.getCustomSystems();
      expect(systems.some(s => s.name === 'my-sys')).toBe(true);
    });

    test('defaults keywords and features when not provided', () => {
      recognizer.registerSystem('bare-sys', {});
      const sys = recognizer.customSystems.get('bare-sys');
      expect(sys.keywords).toEqual([]);
      expect(sys.features).toEqual({});
    });
  });

  describe('recognize', () => {
    test('keyword match for 测试', () => {
      const results = recognizer.recognize('测试');
      expect(results.some(r => r.skill.name === 'test-driven-development' && r.match === 'keyword')).toBe(true);
    });

    test('keyword match for security', () => {
      const results = recognizer.recognize('security audit 漏洞');
      expect(results.some(r => r.skill.name === 'security-audit' && r.match === 'keyword')).toBe(true);
    });

    test('returns empty for unrelated input', () => {
      expect(recognizer.recognize('zzzzyyyyxxxx')).toEqual([]);
    });

    test('deduplicates results', () => {
      const results = recognizer.recognize('test');
      const names = results.map(r => r.skill.name);
      expect(new Set(names).size).toBe(names.length);
    });

    test('returns at most topN results', () => {
      const results = recognizer.recognize('test', { topN: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('skips keywords shorter than minimum match length', () => {
      const results = recognizer.recognize('buildui');
      expect(results).toEqual([]);
    });

    test('skips keyword mapping to an unloaded skill', () => {
      const results = recognizer.recognize('docker');
      expect(results).toEqual([]);
    });

    test('skips fuzzy matching when topN is already reached', () => {
      const results = recognizer.recognize('测试', { topN: 1 });
      expect(results).toHaveLength(1);
    });

    test('recognizes non-crawler module as custom-module', () => {
      const results = recognizer.recognize('tailor');
      expect(results.some(r => r.skill.name === 'Tailor' && r.match === 'custom-module')).toBe(true);
    });

    test('handles module keyword for an unknown module', () => {
      recognizer.keywordMap.set('ghostmod', 'module:NotRegistered');
      const results = recognizer.recognize('ghostmod');
      expect(results).toEqual([]);
    });

    test('fuzzy matching handles skills missing name and description', () => {
      recognizer.skills.push({ path: '/a' }, { name: 'no-desc', path: '/b' });
      const results = recognizer.recognize('zzzznomatch');
      expect(results).toEqual([]);
    });

    test('fuzzy matching scores name substring matches', () => {
      recognizer.skills.push({ name: 'quickstart', description: 'a skill', category: 'x', path: '/q' });
      const results = recognizer.recognize('quick');
      expect(results.some(r => r.skill.name === 'quickstart' && r.match === 'fuzzy')).toBe(true);
    });
  });

  describe('_matchCustomSystems', () => {
    test('returns empty for no matches', () => {
      const analysis = { isDomestic: false, isVideo: false, isSocial: false };
      const result = recognizer._matchCustomSystems('zzzz', analysis);
      expect(result).toEqual([]);
    });

    test('matches by keyword', () => {
      const analysis = { isDomestic: false, isVideo: false, isSocial: false };
      const result = recognizer._matchCustomSystems('爬虫', analysis);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('DynamicScraper');
    });

    test('matches by feature', () => {
      const analysis = { isDomestic: true, isVideo: true, isSocial: true };
      const result = recognizer._matchCustomSystems('抖音', analysis);
      expect(result.length).toBeGreaterThan(0);
    });

    test('matches featureless custom system by keyword only', () => {
      recognizer.customSystems.set('featureless', { name: 'featureless', keywords: ['foobar'] });
      const result = recognizer._matchCustomSystems('foobar', { isDomestic: true, isVideo: true });
      expect(result.some(s => s.name === 'featureless' && s.score === 1)).toBe(true);
    });
  });

  describe('_makeDecision', () => {
    test('returns default for no matches', () => {
      const result = recognizer._makeDecision([], [], {});
      expect(result.recommendation).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    test('includes matched custom system', () => {
      const result = recognizer._makeDecision(
        [{ name: 'DynamicScraper', type: '爬虫系统', score: 3 }],
        [],
        {}
      );
      expect(result.options.length).toBeGreaterThan(0);
    });

    test('defaults type for a bare custom system', () => {
      const result = recognizer._makeDecision([{ name: 'bare', score: 3 }], [], {});
      expect(result.options[0].type).toBe('自有系统');
    });

    test('defaults matchType and scales fuzzy scores for bare skills', () => {
      const result = recognizer._makeDecision(
        [],
        [{ name: 's', description: 'd', category: 'c', score: 0.5 }],
        {}
      );
      expect(result.options[0].matchType).toBe('skill');
      expect(result.options[0].score).toBe(0.4);
    });

    test('does not build a combine option when only one side matches', () => {
      const result = recognizer._makeDecision(
        [{ name: 'cs', type: '爬虫系统', score: 3 }],
        [],
        { isLargeScale: true }
      );
      expect(result.options.some(o => o.combine)).toBe(false);
    });

    test('sorts skill options by score when no keyword match exists', () => {
      const result = recognizer._makeDecision(
        [],
        [
          { name: 'low', description: 'd', category: 'c', score: 0.3 },
          { name: 'high', description: 'd', category: 'c', score: 0.9 },
          { name: 'mid', description: 'd', category: 'c', score: 0.6 }
        ],
        {}
      );
      expect(result.options.map(o => o.name)).toEqual(['high', 'mid', 'low']);
      expect(result.recommendation.name).toBe('high');
      expect(result.reason).toBe('推荐使用 Skill: high');
    });
  });

  describe('decide', () => {
    test('returns object with expected keys', () => {
      const result = recognizer.decide('test driven development');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('combine');
      expect(result).toHaveProperty('analysis');
    });

    test('recognizes crawler input', () => {
      const result = recognizer.decide('爬取抖音视频数据');
      expect(result.options.length).toBeGreaterThan(0);
    });
  });

  describe('decideCrawler', () => {
    test('returns object structure', () => {
      const result = recognizer.decideCrawler('');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('reason');
    });

    test('default recommendation is DynamicScraper', () => {
      const result = recognizer.decideCrawler('');
      expect(result.recommendation.name).toBe('DynamicScraper');
    });

    test('detects domestic platform', () => {
      const result = recognizer.decideCrawler('抖音爬取');
      expect(result.analysis.isDomestic).toBe(true);
    });

    test('detects specific tool', () => {
      const result = recognizer.decideCrawler('use playwright');
      expect(result.analysis.isSpecificTool).toBe(true);
    });
  });

  describe('loadSkill', () => {
    test('loads skill by name', () => {
      fs.readFileSync.mockReturnValueOnce('# content');
      const result = recognizer.loadSkill('test-driven-development');
      expect(result).toBeTruthy();
      expect(result.content).toBe('# content');
    });

    test('returns null for unknown', () => {
      expect(recognizer.loadSkill('nonexistent')).toBeNull();
    });
  });

  describe('getByCategory / getCategories', () => {
    test('returns skills for existing category', () => {
      const skills = recognizer.getByCategory('安全');
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('security-audit');
    });

    test('returns empty for unknown', () => {
      expect(recognizer.getByCategory('unknown')).toEqual([]);
    });

    test('returns all categories', () => {
      const cats = recognizer.getCategories();
      expect(cats).toContain('测试');
      expect(cats).toContain('安全');
    });
  });

  describe('getStats', () => {
    test('returns stats structure', () => {
      const stats = recognizer.getStats();
      expect(stats.total).toBe(3);
      expect(stats.categories).toBe(3);
      expect(stats.byCategory.测试).toBe(1);
    });
  });

  describe('_guessCategory additional branches', () => {
    test('guesses claude-code category', () => {
      expect(recognizer._guessCategory('/project/claude-code/test.js')).toBe('Claude Code');
    });

    test('guesses audit path as 安全', () => {
      expect(recognizer._guessCategory('/project/audit/test.js')).toBe('安全');
    });

    test('guesses browser/crawl category', () => {
      expect(recognizer._guessCategory('/project/browser/test.js')).toBe('浏览器/爬虫');
    });

    test('guesses agent category', () => {
      expect(recognizer._guessCategory('/project/agent/test.js')).toBe('AI Agent');
    });

    test('guesses mcp category', () => {
      expect(recognizer._guessCategory('/project/mcp/test.js')).toBe('MCP');
    });

    test('guesses deploy category', () => {
      expect(recognizer._guessCategory('/project/deploy/test.js')).toBe('部署');
    });

    test('guesses docker category', () => {
      expect(recognizer._guessCategory('/project/docker/test.js')).toBe('部署');
    });

    test('guesses frontend category', () => {
      expect(recognizer._guessCategory('/project/vue/module.js')).toBe('前端');
    });

    test('guesses llm/voice category', () => {
      expect(recognizer._guessCategory('/project/tts/module.js')).toBe('LLM/语音');
    });

    test('guesses vtuber category', () => {
      expect(recognizer._guessCategory('/project/vrm/module.js')).toBe('VTuber');
    });

    test('guesses memory category', () => {
      expect(recognizer._guessCategory('/project/skill/memory.js')).toBe('记忆系统');
    });
  });

  describe('_makeDecision additional branches', () => {
    test('keyword match takes priority over fuzzy', () => {
      const result = recognizer._makeDecision(
        [],
        [{ name: 'test-driven-development', description: 'TDD', category: '测试', score: 0.5, matchType: 'keyword' }],
        {}
      );
      expect(result.recommendation.name).toBe('test-driven-development');
      expect(result.reason).toBe('推荐: test-driven-development');
    });

    test('combine option added when customSystems and skills both present with large scale', () => {
      const result = recognizer._makeDecision(
        [{ name: 'DynamicScraper', type: '爬虫系统', score: 3, description: '爬虫系统' }],
        [{ name: 'crawl4ai-patterns', description: 'Crawl4AI', category: '爬虫', score: 1.0, matchType: 'fuzzy' }],
        { isLargeScale: true, isDeepCrawl: false }
      );
      const combineOpt = result.options.find(o => o.combine);
      expect(combineOpt).toBeDefined();
      expect(combineOpt.name).toContain('DynamicScraper');
    });

    // Lines 764-767 (_makeDecision custom-system/combine branches) are structurally unreachable
    // because customSystems at line 713 always get matchType: 'keyword', which causes
    // the keywordMatches filter at line 745 to return early. These branches can only
    // be reached if no customSystems matchType 'keyword' exists in options.
  });

  describe('_analyzeInput', () => {
    test('detects isVideo', () => {
      const result = recognizer._analyzeInput('视频下载');
      expect(result.isVideo).toBe(true);
    });

    test('detects isSocial', () => {
      const result = recognizer._analyzeInput('小红书');
      expect(result.isSocial).toBe(true);
    });

    test('detects isEcommerce', () => {
      const result = recognizer._analyzeInput('淘宝数据');
      expect(result.isEcommerce).toBe(true);
    });

    test('detects isLargeScale', () => {
      const result = recognizer._analyzeInput('批量爬取');
      expect(result.isLargeScale).toBe(true);
    });

    test('detects isDeepCrawl', () => {
      const result = recognizer._analyzeInput('深度递归');
      expect(result.isDeepCrawl).toBe(true);
    });

    test('detects isLLMOutput', () => {
      const result = recognizer._analyzeInput('markdown格式');
      expect(result.isLLMOutput).toBe(true);
    });

    test('detects isAntiDetect', () => {
      const result = recognizer._analyzeInput('反检测模式');
      expect(result.isAntiDetect).toBe(true);
    });

    test('detects isAPI', () => {
      const result = recognizer._analyzeInput('api接口');
      expect(result.isAPI).toBe(true);
    });

    test('detects isSimple', () => {
      const result = recognizer._analyzeInput('简单任务');
      expect(result.isSimple).toBe(true);
    });

    test('detects isSpecificTool', () => {
      const result = recognizer._analyzeInput('crawl4ai');
      expect(result.isSpecificTool).toBe(true);
    });

    test('detects isCustomSystem', () => {
      const result = recognizer._analyzeInput('我的爬虫');
      expect(result.isCustomSystem).toBe(true);
    });

    test('detects isAnalysis', () => {
      const result = recognizer._analyzeInput('数据分析');
      expect(result.isAnalysis).toBe(true);
    });

    test('detects isGeneration', () => {
      const result = recognizer._analyzeInput('创作');
      expect(result.isGeneration).toBe(true);
    });

    test('detects isSearch', () => {
      const result = recognizer._analyzeInput('搜索数据');
      expect(result.isSearch).toBe(true);
    });
  });

  describe('decideCrawler additional branches', () => {
    test('domestic platform adds option', () => {
      const result = recognizer.decideCrawler('抖音爬取');
      expect(result.options.some(o => o.type === '拾号-爬虫')).toBe(true);
    });

    test('crawl4ai specific tool', () => {
      const result = recognizer.decideCrawler('use crawl4ai');
      expect(result.options.some(o => o.name === 'crawl4ai-patterns')).toBe(true);
    });

    test('scrapling specific tool', () => {
      const result = recognizer.decideCrawler('use scrapling');
      expect(result.options.some(o => o.name === 'scrapling')).toBe(true);
    });

    test('selenium specific tool', () => {
      const result = recognizer.decideCrawler('use selenium');
      expect(result.options.some(o => o.name === 'seleniumbase-patterns')).toBe(true);
    });

    test('playwright specific tool', () => {
      const result = recognizer.decideCrawler('use playwright');
      expect(result.options.some(o => o.name === 'browser-automation')).toBe(true);
    });

    test('easyspider specific tool', () => {
      const result = recognizer.decideCrawler('use easyspider');
      expect(result.options.some(o => o.name === 'easyspider-patterns')).toBe(true);
    });

    test('large scale adds combine option', () => {
      const result = recognizer.decideCrawler('批量爬取');
      expect(result.options.some(o => o.combine)).toBe(true);
    });

    test('simple task adds isSimple option', () => {
      const result = recognizer.decideCrawler('简单任务');
      expect(result.options.some(o => o.name === 'DynamicScraper' && o.score === 0.95)).toBe(true);
    });

    test('deep crawl combine becomes recommendation when no domestic match', () => {
      const result = recognizer.decideCrawler('深度');
      expect(result.combine).toBe(true);
      expect(result.reason).toContain('组合');
    });
  });

  describe('loadSkill error handling', () => {
    test('returns null on read error', () => {
      fs.readFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
      const result = recognizer.loadSkill('test-driven-development');
      expect(result).toBeNull();
    });
  });

  describe('recognize module matches', () => {
    test('recognizes DynamicScraper module', () => {
      const results = recognizer.recognize('拾号爬虫');
      expect(results.some(r => r.skill.name === 'DynamicScraper' && r.skill.isCustomModule)).toBe(true);
    });

    test('fuzzy matching adds results when keyword results below topN', () => {
      const results = recognizer.recognize('methodology', { topN: 5 });
      const fuzzy = results.filter(r => r.match === 'fuzzy');
      expect(fuzzy.length).toBeGreaterThan(0);
    });
  });

  describe('filesystem skill loading', () => {
    const realFs = jest.requireActual('fs');
    const os = require('os');
    const pathMod = require('path');
    let tmpDir;

    const write = (relPath, content) => {
      const full = pathMod.join(tmpDir, relPath);
      realFs.mkdirSync(pathMod.dirname(full), { recursive: true });
      realFs.writeFileSync(full, content, 'utf8');
    };

    beforeAll(() => {
      tmpDir = realFs.mkdtempSync(pathMod.join(os.tmpdir(), 'skillrec-'));
      write('claude-code/SKILL.md', '---\nname: cc-skill\ndescription: A Claude Code skill\n---\n# CC');
      write('claude-code/sub/SKILL.md', '---\nname: cc-sub\ndescription: Nested Claude Code skill\n---\n# Sub');
      write('nested/plain/SKILL.md', '# No frontmatter here\n');
      write('nested/deep/more/SKILL.md', '---\nname: deep-skill\n---\n# Deep');
      write('nameless/SKILL.md', '---\ndescription: No name field\n---\n# Nameless');
      write('misc/README.md', '# ignored');
    });

    beforeEach(() => {
      jest.restoreAllMocks();
      fs.existsSync.mockImplementation(realFs.existsSync);
      fs.readdirSync.mockImplementation(realFs.readdirSync);
      fs.readFileSync.mockImplementation(realFs.readFileSync);
    });

    afterAll(() => {
      realFs.rmSync(tmpDir, { recursive: true, force: true });
      fs.existsSync.mockImplementation(() => false);
      fs.readdirSync.mockImplementation(() => []);
      fs.readFileSync.mockImplementation(() => undefined);
    });

    test('loads all skills from the filesystem and builds categories', () => {
      const r = new SkillRecognizer({ skillsDir: tmpDir });
      const names = r.skills.map(s => s.name);
      expect(names).toContain('cc-skill');
      expect(names).toContain('cc-sub');
      expect(names).toContain('deep-skill');
      expect(names).toContain('nameless');
      expect(names).toContain('plain');
      expect(r.skills).toHaveLength(5);
      expect(r.categories['Claude Code']).toHaveLength(2);
      expect(r.categories['其他']).toHaveLength(3);
    });

    test('parses frontmatter and falls back to directory name', () => {
      const r = new SkillRecognizer({ skillsDir: tmpDir });
      const deep = r.skills.find(s => s.name === 'deep-skill');
      expect(deep.description).toBe('');
      const plain = r.skills.find(s => s.name === 'plain');
      expect(plain.description).toBe('');
      const nameless = r.skills.find(s => s.name === 'nameless');
      expect(nameless.name).toBe('nameless');
      expect(nameless.description).toBe('No name field');
    });

    test('returns an empty file list for a missing directory', () => {
      const r = new SkillRecognizer({ skillsDir: tmpDir });
      expect(r._getSkillFiles(pathMod.join(tmpDir, 'missing'))).toEqual([]);
    });

    test('logs and returns when the skills directory does not exist', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const r = new SkillRecognizer({ skillsDir: pathMod.join(tmpDir, 'missing') });
      expect(r.skills).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
    });

    test('skips unreadable skill files', () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('EACCES'); });
      const r = new SkillRecognizer({ skillsDir: tmpDir });
      expect(r.skills).toEqual([]);
    });
  });
});
