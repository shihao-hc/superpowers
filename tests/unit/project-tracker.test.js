'use strict';

const fs = require('fs');

jest.mock('fs');
jest.mock('../../src/utils/SafeExec', () => ({
  safeExecSync: jest.fn()
}));

const { safeExecSync } = require('../../src/utils/SafeExec');
const ProjectTracker = require('../../src/tracking/ProjectTracker');

const DEFAULT_SKILLS_DIR = 'D:/龙虾/.opencode/skills';
const CUSTOM_SKILLS_DIR = 'D:/custom/skills';

const GH_RELEASE_JSON = JSON.stringify({
  tagName: 'v2.0.0',
  body: 'Added visual focusing, dynamic background improvements',
  publishedAt: '2024-06-15T10:00:00Z'
});

const CURL_RELEASE_JSON = JSON.stringify({
  tag_name: 'v2.0.0',
  body: 'Patch fix for weights',
  published_at: '2024-07-01T00:00:00Z'
});

const GH_COMMITS_JSON = [
  { sha: 'abc123', message: 'Fix bug', date: '2024-06-15T10:00:00Z' },
  { sha: 'def456', message: 'Add feature', date: '2024-06-14T10:00:00Z' }
].map((c) => JSON.stringify(c)).join('\n');

const SKILL_MD_CONTENT = `# Test Skill

**版本**: v1.0.0

## 更新日志

| 日期 | 更新内容 |
|---|---|
|---|
| 2024/01/01 | v1.0.0: Initial release |
`;

describe('ProjectTracker', () => {
  let tracker;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new ProjectTracker();
  });

  /* ── Constructor & Initialization ── */

  describe('constructor', () => {
    it('sets default skillsDir', () => {
      expect(tracker.skillsDir).toBe(DEFAULT_SKILLS_DIR);
    });

    it('accepts custom skillsDir', () => {
      const custom = new ProjectTracker({ skillsDir: CUSTOM_SKILLS_DIR });
      expect(custom.skillsDir).toBe(CUSTOM_SKILLS_DIR);
    });

    it('initializes 22 projects', () => {
      expect(tracker.projects.size).toBe(22);
    });

    it('each project has required fields', () => {
      for (const [, project] of tracker.projects) {
        expect(project).toHaveProperty('owner');
        expect(project).toHaveProperty('repo');
        expect(project).toHaveProperty('skillPath');
        expect(project).toHaveProperty('currentVersion');
        expect(project).toHaveProperty('lastCheckTime');
        expect(project).toHaveProperty('features');
        expect(project.lastCheckTime).toBeNull();
      }
    });

    it('Tailor project has 15 feature patterns', () => {
      const tailor = tracker.projects.get('Tailor');
      expect(tailor).toBeDefined();
      expect(tailor.owner).toBe('FutureUniant');
      expect(tailor.repo).toBe('Tailor');
      expect(Object.keys(tailor.features).length).toBe(15);
    });

    it('Pixelle-Video project has 4 feature patterns', () => {
      const pv = tracker.projects.get('Pixelle-Video');
      expect(pv).toBeDefined();
      expect(Object.keys(pv.features).length).toBe(4);
    });
  });

  /* ── _compareVersions ── */

  describe('_compareVersions', () => {
    it('returns 0 for equal versions', () => {
      expect(tracker._compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('returns positive for newer version', () => {
      expect(tracker._compareVersions('1.0.0', '2.0.0')).toBe(1);
    });

    it('returns negative for older version', () => {
      expect(tracker._compareVersions('2.0.0', '1.0.0')).toBe(-1);
    });

    it('handles v prefix', () => {
      expect(tracker._compareVersions('v1.0.0', 'v2.0.0')).toBe(1);
      expect(tracker._compareVersions('v2.0.0', 'v1.0.0')).toBe(-1);
      expect(tracker._compareVersions('v1.0.0', '1.0.0')).toBe(0);
    });

    it('handles different segment lengths', () => {
      expect(tracker._compareVersions('1.0', '1.0.1')).toBe(1);
      expect(tracker._compareVersions('1.0.1', '1.0')).toBe(-1);
    });

    it('handles null and undefined', () => {
      expect(tracker._compareVersions(null, '1.0.0')).toBe(0);
      expect(tracker._compareVersions('1.0.0', null)).toBe(0);
      expect(tracker._compareVersions(null, null)).toBe(0);
    });

    it('compares patch versions correctly', () => {
      expect(tracker._compareVersions('1.0.0', '1.0.1')).toBe(1);
      expect(tracker._compareVersions('1.0.1', '1.0.0')).toBe(-1);
    });

    it('compares major versions correctly', () => {
      expect(tracker._compareVersions('1.9.9', '2.0.0')).toBe(1);
      expect(tracker._compareVersions('2.0.0', '1.9.9')).toBe(-1);
    });
  });

  /* ── _parseChangelog ── */

  describe('_parseChangelog', () => {
    const features = {
      '视觉聚焦': /视觉聚焦|visual focusing/i,
      '动态背景': /动态背景|dynamic background/i,
      '模型权重': /模型权重|weights/i,
      '字幕生成': /字幕|subtitle/i
    };

    it('returns [] for null body', () => {
      expect(tracker._parseChangelog(null, features)).toEqual([]);
    });

    it('returns [] for empty body', () => {
      expect(tracker._parseChangelog('', features)).toEqual([]);
    });

    it('returns [] when no features match', () => {
      expect(tracker._parseChangelog('Some unrelated changelog', features)).toEqual([]);
    });

    it('detects matching single feature', () => {
      const result = tracker._parseChangelog('Added visual focusing improvements', features);
      expect(result).toEqual(['视觉聚焦']);
    });

    it('detects multiple features', () => {
      const result = tracker._parseChangelog(
        'Added visual focusing and dynamic background. Also improved weights.',
        features
      );
      expect(result).toContain('视觉聚焦');
      expect(result).toContain('动态背景');
      expect(result).toContain('模型权重');
      expect(result.length).toBe(3);
    });

    it('is case insensitive', () => {
      const result = tracker._parseChangelog('VISUAL FOCUSING and SUBTITLE', features);
      expect(result).toContain('视觉聚焦');
      expect(result).toContain('字幕生成');
    });

    it('returns [] for empty features object', () => {
      expect(tracker._parseChangelog('Some changelog', {})).toEqual([]);
    });
  });

  /* ── getLatestRelease ── */

  describe('getLatestRelease', () => {
    it('returns null for unknown project', async () => {
      const result = await tracker.getLatestRelease('UnknownProject');
      expect(result).toBeNull();
      expect(safeExecSync).not.toHaveBeenCalled();
    });

    it('uses gh CLI and returns parsed release', async () => {
      safeExecSync.mockReturnValue(GH_RELEASE_JSON);

      const result = await tracker.getLatestRelease('Tailor');

      expect(safeExecSync).toHaveBeenCalledWith('gh',
        ['release', 'view', '-R', 'FutureUniant/Tailor',
          '--json', 'tagName,body,publishedAt',
          '--jq', '{tagName: .tagName, body: .body, publishedAt: .publishedAt}'],
        { encoding: 'utf8', timeout: 10000 }
      );
      expect(result).toEqual({
        tagName: 'v2.0.0',
        body: 'Added visual focusing, dynamic background improvements',
        publishedAt: '2024-06-15T10:00:00Z'
      });
    });

    it('falls back to curl when gh CLI fails', async () => {
      safeExecSync
        .mockImplementationOnce(() => { throw new Error('gh not available'); })
        .mockReturnValue(CURL_RELEASE_JSON);

      const result = await tracker.getLatestRelease('AutoClip');

      expect(safeExecSync).toHaveBeenCalledTimes(2);
      expect(safeExecSync).toHaveBeenLastCalledWith(
        expect.stringMatching(/curl/),
        ['-s', 'https://api.github.com/repos/zhouxiaoka/autoclip/releases/latest'],
        { encoding: 'utf8', timeout: 15000 }
      );
      expect(result).toEqual({
        tagName: 'v2.0.0',
        body: 'Patch fix for weights',
        publishedAt: '2024-07-01T00:00:00Z'
      });
    });

    it('returns null when both gh and curl fail', async () => {
      safeExecSync
        .mockImplementationOnce(() => { throw new Error('gh not available'); })
        .mockImplementationOnce(() => { throw new Error('curl failed'); });

      const result = await tracker.getLatestRelease('Tailor');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });

    it('uses curl.exe on Windows', async () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const Tracker = require('../../src/tracking/ProjectTracker');
      const winTracker = new Tracker();

      safeExecSync
        .mockImplementationOnce(() => { throw new Error('gh fail'); })
        .mockReturnValue(CURL_RELEASE_JSON);

      await winTracker.getLatestRelease('Tailor');

      expect(safeExecSync).toHaveBeenLastCalledWith(
        'curl.exe',
        expect.any(Array),
        expect.any(Object)
      );

      Object.defineProperty(process, 'platform', { value: origPlatform });
    });
  });

  /* ── getRecentCommits ── */

  describe('getRecentCommits', () => {
    it('returns [] for unknown project', async () => {
      const result = await tracker.getRecentCommits('Unknown');
      expect(result).toEqual([]);
    });

    it('uses gh CLI and returns parsed commits', async () => {
      safeExecSync.mockReturnValue(GH_COMMITS_JSON);

      const result = await tracker.getRecentCommits('Tailor', 5);

      expect(safeExecSync).toHaveBeenCalledWith('gh',
        ['api', 'repos/FutureUniant/Tailor/commits',
          '--jq', '.[:5] | .[] | {sha: .sha, message: .commit.message, date: .commit.author.date}'],
        { encoding: 'utf8', timeout: 10000 }
      );
      expect(result).toEqual([
        { sha: 'abc123', message: 'Fix bug', date: '2024-06-15T10:00:00Z' },
        { sha: 'def456', message: 'Add feature', date: '2024-06-14T10:00:00Z' }
      ]);
    });

    it('falls back to curl when gh fails', async () => {
      const curlCommits = [
        { sha: 'aaa', commit: { message: 'Curl commit', author: { date: '2024-06-01T00:00:00Z' } } }
      ];
      safeExecSync
        .mockImplementationOnce(() => { throw new Error('gh not available'); })
        .mockReturnValue(JSON.stringify(curlCommits));

      const result = await tracker.getRecentCommits('n8n', 3);

      expect(safeExecSync).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        { sha: 'aaa', message: 'Curl commit', date: '2024-06-01T00:00:00Z' }
      ]);
    });

    it('returns [] when both fail', async () => {
      safeExecSync
        .mockImplementationOnce(() => { throw new Error('gh fail'); })
        .mockImplementationOnce(() => { throw new Error('curl fail'); });

      const result = await tracker.getRecentCommits('Dify');
      expect(result).toEqual([]);
    });

    it('uses default count of 5', async () => {
      safeExecSync.mockReturnValue('');
      await tracker.getRecentCommits('Dify');
      expect(safeExecSync).toHaveBeenCalledWith('gh',
        expect.arrayContaining([expect.stringContaining('.[:5]')]),
        expect.any(Object)
      );
    });

    it('handles empty gh output', async () => {
      safeExecSync.mockReturnValue('');
      const result = await tracker.getRecentCommits('Dify');
      expect(result).toEqual([]);
    });
  });

  /* ── fetchFromAPI ── */

  describe('fetchFromAPI', () => {
    it('uses gh CLI by default', async () => {
      safeExecSync.mockReturnValue('{"stars": 100}');
      const result = await tracker.fetchFromAPI('owner/repo');
      expect(safeExecSync).toHaveBeenCalledWith('gh',
        ['api', 'repos/owner/repo'],
        { encoding: 'utf8', timeout: 15000 }
      );
      expect(result).toEqual({ stars: 100 });
    });

    it('falls back to curl when gh fails', async () => {
      safeExecSync
        .mockImplementationOnce(() => { throw new Error('gh fail'); })
        .mockReturnValue('{"forks": 50}');

      const result = await tracker.fetchFromAPI('owner/repo');
      expect(safeExecSync).toHaveBeenCalledTimes(2);
      expect(safeExecSync).toHaveBeenLastCalledWith(
        expect.stringMatching(/curl/),
        ['-s', 'https://api.github.com/owner/repo'],
        { encoding: 'utf8', timeout: 15000 }
      );
      expect(result).toEqual({ forks: 50 });
    });
  });

  /* ── checkUpdate ── */

  describe('checkUpdate', () => {
    it('returns null for unknown project', async () => {
      const result = await tracker.checkUpdate('Unknown');
      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('未找到项目: Unknown')
      );
    });

    it('returns null when no release found', async () => {
      safeExecSync.mockImplementation(() => { throw new Error('release fetch failed'); });

      const result = await tracker.checkUpdate('Tailor');

      expect(result).toBeNull();
    });

    it('returns update with hasUpdate=true when newer version exists', async () => {
      const tailor = tracker.projects.get('Tailor');
      tailor.currentVersion = 'v0.1.0';

      safeExecSync.mockReturnValue(JSON.stringify({
        tagName: 'v2.0.0',
        body: 'Added visual focusing, dynamic background',
        publishedAt: '2024-06-15T10:00:00Z'
      }));

      const result = await tracker.checkUpdate('Tailor');

      expect(result).not.toBeNull();
      expect(result.projectName).toBe('Tailor');
      expect(result.latestVersion).toBe('v2.0.0');
      expect(result.currentVersion).toBe('v0.1.0');
      expect(result.hasUpdate).toBe(true);
      expect(result.changelog).toContain('视觉聚焦');
      expect(result.changelog).toContain('动态背景');
    });

    it('returns update with hasUpdate=false when version is same', async () => {
      safeExecSync.mockReturnValue(JSON.stringify({
        tagName: 'v1.0.0',
        body: 'No changes',
        publishedAt: '2024-01-01T00:00:00Z'
      }));

      const result = await tracker.checkUpdate('AutoClip');

      expect(result).not.toBeNull();
      expect(result.hasUpdate).toBe(false);
    });

    it('sets lastCheckTime after check', async () => {
      const before = Date.now();
      safeExecSync.mockReturnValue(GH_RELEASE_JSON);

      await tracker.checkUpdate('Tailor');

      const after = Date.now();
      const time = new Date(tracker.projects.get('Tailor').lastCheckTime).getTime();
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(after);
    });

    it('parses feature changelog for Tailor', async () => {
      const tailor = tracker.projects.get('Tailor');
      tailor.currentVersion = 'v0.1.0';

      safeExecSync.mockReturnValue(JSON.stringify({
        tagName: 'v2.0.0',
        body: 'Added visual focusing, dynamic background, weights improvements, and subtitle support',
        publishedAt: '2024-06-15T00:00:00Z'
      }));

      const result = await tracker.checkUpdate('Tailor');

      expect(result.changelog).toContain('视觉聚焦');
      expect(result.changelog).toContain('动态背景');
      expect(result.changelog).toContain('模型权重');
      expect(result.changelog).toContain('字幕生成');
    });
  });

  /* ── checkAllUpdates ── */

  describe('checkAllUpdates', () => {
    it('returns array of updates for all projects', async () => {
      safeExecSync.mockReturnValue(GH_RELEASE_JSON);

      const results = await tracker.checkAllUpdates();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(22);
      results.forEach((r) => {
        expect(r).toHaveProperty('projectName');
        expect(r).toHaveProperty('latestVersion');
        expect(r).toHaveProperty('currentVersion');
        expect(r).toHaveProperty('hasUpdate');
      });
    });

    it('skips projects where release fetch fails', async () => {
      safeExecSync.mockImplementation(() => { throw new Error('fail'); });

      const results = await tracker.checkAllUpdates();
      expect(results).toEqual([]);
    });

    it('calls checkUpdate for each project', async () => {
      safeExecSync.mockReturnValue(GH_RELEASE_JSON);

      const results = await tracker.checkAllUpdates();
      expect(results.length).toBe(tracker.projects.size);
    });
  });

  /* ── updateSkillMarkdown ── */

  describe('updateSkillMarkdown', () => {
    const mockUpdate = {
      latestVersion: 'v2.0.0',
      publishedAt: '2024-06-15T10:00:00Z',
      changelog: ['视觉聚焦', '动态背景'],
      hasUpdate: true
    };

    it('returns false for unknown project', () => {
      const result = tracker.updateSkillMarkdown('Unknown', mockUpdate);
      expect(result).toBe(false);
    });

    it('returns false when hasUpdate is false', () => {
      const result = tracker.updateSkillMarkdown('Tailor', { ...mockUpdate, hasUpdate: false });
      expect(result).toBe(false);
    });

    it('returns false when SKILL.md does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = tracker.updateSkillMarkdown('Tailor', mockUpdate);

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('SKILL.md 不存在')
      );
    });

    it('returns false when version already exists in content', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('v2.0.0 already here');

      const result = tracker.updateSkillMarkdown('Tailor', mockUpdate);

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('已存在')
      );
    });

    it('successfully updates content and returns true', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(SKILL_MD_CONTENT);

      const result = tracker.updateSkillMarkdown('Tailor', mockUpdate);

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = fs.writeFileSync.mock.calls[0][1];
      expect(written).not.toBe(SKILL_MD_CONTENT);
      expect(written).toContain('**版本**: v2.0.0');
    });

    it('updates project currentVersion on success', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(SKILL_MD_CONTENT);

      expect(tracker.projects.get('Tailor').currentVersion).toBe('v0.1.5');

      tracker.updateSkillMarkdown('Tailor', mockUpdate);

      expect(tracker.projects.get('Tailor').currentVersion).toBe('v2.0.0');
    });

    it('does not write file when content already has version', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('Some content with v2.0.0');

      tracker.updateSkillMarkdown('Tailor', mockUpdate);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  /* ── getStatusReport ── */

  describe('getStatusReport', () => {
    it('returns array with all projects', () => {
      const report = tracker.getStatusReport();
      expect(Array.isArray(report)).toBe(true);
      expect(report.length).toBe(22);
    });

    it('each entry has correct fields', () => {
      const report = tracker.getStatusReport();
      report.forEach((entry) => {
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('owner');
        expect(entry).toHaveProperty('repo');
        expect(entry).toHaveProperty('currentVersion');
        expect(entry).toHaveProperty('lastCheckTime');
      });
    });

    it('includes lastCheckTime when set', async () => {
      safeExecSync.mockReturnValue(GH_RELEASE_JSON);
      await tracker.checkUpdate('Tailor');

      const report = tracker.getStatusReport();
      const tailor = report.find((r) => r.name === 'Tailor');
      expect(tailor.lastCheckTime).not.toBeNull();
    });

    it('reflects updated versions after updateSkillMarkdown', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(SKILL_MD_CONTENT);

      const update = {
        latestVersion: 'v3.0.0',
        publishedAt: '2024-08-01T00:00:00Z',
        changelog: [],
        hasUpdate: true
      };
      tracker.updateSkillMarkdown('Dify', update);

      const report = tracker.getStatusReport();
      const dify = report.find((r) => r.name === 'Dify');
      expect(dify.currentVersion).toBe('v3.0.0');
    });
  });
});
