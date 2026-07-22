jest.mock('fs');
const fs = require('fs');
const SelfCodeImprover = require('../../src/core/SelfCodeImprover');

describe('SelfCodeImprover', () => {
  let improver;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['test.js']);
    fs.readFileSync.mockReturnValue('module.exports = {};');
    improver = new SelfCodeImprover(null);
  });

  describe('constructor', () => {
    test('sets brainSystem', () => {
      const brain = {};
      const imp = new SelfCodeImprover(brain);
      expect(imp.brain).toBe(brain);
    });

    test('initializes scan paths for 7 directories', () => {
      expect(improver.scanPaths).toHaveLength(7);
      expect(improver.scanPaths[0]).toContain('core');
    });

    test('enables autoFix by default', () => {
      expect(improver.autoFixEnabled).toBe(true);
    });
  });

  describe('_getFilesFromPath', () => {
    test('returns .js files excluding .test.js', () => {
      fs.readdirSync.mockReturnValue(['a.js', 'b.test.js', 'c.js', 'd.ts']);
      const files = improver._getFilesFromPath('/fake/path');
      expect(files).toHaveLength(2);
      expect(files[0]).toContain('a.js');
      expect(files[1]).toContain('c.js');
    });

    test('returns empty array on read error', () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('permission denied'); });
      expect(improver._getFilesFromPath('/bad/path')).toEqual([]);
    });
  });

  describe('_checkDuplicateRequire', () => {
    test('detects duplicate requires', () => {
      const content = 'const a = require(\'fs\'); const b = require(\'fs\');';
      const result = improver._checkDuplicateRequire(content, 'test.js');
      expect(result.found).toBe(true);
      expect(result.severity).toBe('high');
      expect(result.message).toContain('fs');
    });

    test('returns not found when no duplicates', () => {
      const content = 'const a = require(\'fs\'); const b = require(\'path\');';
      const result = improver._checkDuplicateRequire(content, 'test.js');
      expect(result.found).toBe(false);
    });
  });

  describe('_checkVersionInconsistency', () => {
    test('detects inconsistent versions', () => {
      const content = '@version 1.0.0\n@version 2.0.0';
      const result = improver._checkVersionInconsistency(content, 'test.js');
      expect(result.found).toBe(true);
      expect(result.severity).toBe('medium');
    });

    test('returns not found for single version', () => {
      const content = '@version 1.0.0';
      const result = improver._checkVersionInconsistency(content, 'test.js');
      expect(result.found).toBe(false);
    });

    test('returns not found when no versions', () => {
      const result = improver._checkVersionInconsistency('no versions', 'test.js');
      expect(result.found).toBe(false);
    });
  });

  describe('_checkEmptyCatch', () => {
    test('detects empty catch blocks', () => {
      const content = 'try { x() } catch (e) {}';
      const result = improver._checkEmptyCatch(content, 'test.js');
      expect(result.found).toBe(true);
      expect(result.severity).toBe('medium');
    });

    test('returns not found when catch has body', () => {
      const content = 'try { x() } catch (e) { console.log(e); }';
      const result = improver._checkEmptyCatch(content, 'test.js');
      expect(result.found).toBe(false);
    });
  });

  describe('_checkUnusedVariable', () => {
    test('always returns not found', () => {
      const result = improver._checkUnusedVariable('any content', 'test.js');
      expect(result.found).toBe(false);
    });
  });

  describe('_checkConsoleLogLeak', () => {
    test('detects > 2 debug logs', () => {
      const lines = Array.from({ length: 5 }, () => 'console.log("debug x");').join('\n');
      const result = improver._checkConsoleLogLeak(lines, 'test.js');
      expect(result.found).toBe(true);
      expect(result.severity).toBe('low');
    });

    test('ignores <= 2 debug logs', () => {
      const content = 'console.log("debug x");\nconsole.log("info y");';
      const result = improver._checkConsoleLogLeak(content, 'test.js');
      expect(result.found).toBe(false);
    });
  });

  describe('_checkSyncFileOps', () => {
    test('detects > 60 sync operations', () => {
      const ops = Array.from({ length: 61 }, () => 'fs.readFileSync(').join('\n');
      const result = improver._checkSyncFileOps(ops, 'test.js');
      expect(result.found).toBe(true);
      expect(result.severity).toBe('low');
    });

    test('ignores <= 60 sync operations', () => {
      const ops = Array.from({ length: 30 }, () => 'fs.readFileSync(').join('\n');
      const result = improver._checkSyncFileOps(ops, 'test.js');
      expect(result.found).toBe(false);
    });
  });

  describe('_checkHardcodedSecret', () => {
    test('detects API key pattern', () => {
      const content = '"api_key": "abcdefghijklmnopqrstuvwxyz12345"';
      const result = improver._checkHardcodedSecret(content, 'test.js');
      expect(result.found).toBe(true);
      expect(result.severity).toBe('high');
    });

    test('detects password pattern', () => {
      const content = '"password": "s3cret!"';
      const result = improver._checkHardcodedSecret(content, 'test.js');
      expect(result.found).toBe(true);
    });

    test('returns not found for clean content', () => {
      const content = 'const x = 1;';
      const result = improver._checkHardcodedSecret(content, 'test.js');
      expect(result.found).toBe(false);
    });
  });

  describe('_scanFile', () => {
    test('reads file and runs all checks', () => {
      fs.readFileSync.mockReturnValue('const x = require(\'fs\'); require(\'fs\');');
      const issues = improver._scanFile('/fake/test.js');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].file).toBe('test.js');
    });

    test('returns empty list when no issues', () => {
      fs.readFileSync.mockReturnValue('const x = 1;');
      const issues = improver._scanFile('/fake/clean.js');
      expect(issues).toEqual([]);
    });

    test('includes file name in issues', () => {
      fs.readFileSync.mockReturnValue('const a = require(\'x\'); const b = require(\'x\');');
      const issues = improver._scanFile('/some/path/myfile.js');
      expect(issues[0].file).toBe('myfile.js');
    });
  });

  describe('_groupBySeverity', () => {
    test('groups issues by severity', () => {
      const issues = [
        { severity: 'high' }, { severity: 'low' }, { severity: 'high' }
      ];
      const grouped = improver._groupBySeverity(issues);
      expect(grouped.high).toHaveLength(2);
      expect(grouped.low).toHaveLength(1);
    });

    test('puts unknown severity in medium', () => {
      const grouped = improver._groupBySeverity([{ severity: 'unknown' }]);
      expect(grouped.medium).toHaveLength(1);
    });
  });

  describe('_updateIssueTracker', () => {
    test('updates byFile and bySeverity', () => {
      improver._updateIssueTracker([
        { file: 'a.js', severity: 'high' },
        { file: 'a.js', severity: 'low' },
        { file: 'b.js', severity: 'high' }
      ]);
      expect(improver.issueTracker.byFile['a.js']).toHaveLength(2);
      expect(improver.issueTracker.byFile['b.js']).toHaveLength(1);
      expect(improver.issueTracker.bySeverity.high).toHaveLength(2);
      expect(improver.issueTracker.bySeverity.low).toHaveLength(1);
    });
  });

  describe('getTrackingReport', () => {
    test('returns report with counts', () => {
      improver.issueTracker.byFile['a.js'] = [{ severity: 'high' }];
      improver.issueTracker.bySeverity.high = [{ severity: 'high' }];
      const report = improver.getTrackingReport();
      expect(report.totalIssues).toBe(1);
      expect(report.fileCount).toBe(1);
      expect(report.scanHistory).toBe(0);
    });
  });

  describe('_canAutoFix', () => {
    test('returns true for duplicate-require', () => {
      expect(improver._canAutoFix('duplicate-require')).toBe(true);
    });

    test('returns true for version-inconsistency', () => {
      expect(improver._canAutoFix('version-inconsistency')).toBe(true);
    });

    test('returns false for other types', () => {
      expect(improver._canAutoFix('empty-catch')).toBe(false);
    });
  });

  describe('_applyFix', () => {
    test('duplicate-require returns manual handle', () => {
      const result = improver._applyFix({ type: 'duplicate-require' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('手动');
    });

    test('version-inconsistency returns manual confirm', () => {
      const result = improver._applyFix({ type: 'version-inconsistency' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('手动');
    });

    test('unknown type returns error', () => {
      const result = improver._applyFix({ type: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('_autoFix', () => {
    test('returns only fixed results', () => {
      const issues = [
        { type: 'empty-catch', message: 'catch' },
        { type: 'duplicate-require', message: 'dup' }
      ];
      const fixes = improver._autoFix(issues);
      expect(fixes).toHaveLength(0);
    });

  });

  describe('fullScan', () => {
    test('scans all paths and returns results', () => {
      fs.readdirSync.mockReturnValue(['test.js']);
      fs.readFileSync.mockReturnValue('module.exports = {};');
      const result = improver.fullScan();
      expect(result.stats.totalFiles).toBeGreaterThan(0);
      expect(result.timestamp).toBeDefined();
      expect(result.issues).toBeDefined();
    });

    test('skips non-existent paths', () => {
      fs.existsSync.mockReturnValue(false);
      const result = improver.fullScan();
      expect(result.stats.totalFiles).toBe(0);
    });

    test('counts issues by severity in stats', () => {
      const scanSpy = jest.spyOn(improver, '_scanFile').mockReturnValue([
        { file: 'a.js', type: 'dup', severity: 'high', line: 1, message: 'dup', suggestion: 'fix' }
      ]);
      const result = improver.fullScan();
      expect(result.stats.high).toBeGreaterThan(0);
      scanSpy.mockRestore();
    });

    test('pushes to history', () => {
      jest.spyOn(improver, '_scanFile').mockReturnValue([]);
      improver.fullScan();
      expect(improver.history).toHaveLength(1);
      jest.restoreAllMocks();
    });
  });

  describe('setAutoFix', () => {
    test('disables autoFix', () => {
      improver.setAutoFix(false);
      expect(improver.autoFixEnabled).toBe(false);
    });

    test('enables autoFix', () => {
      improver.setAutoFix(true);
      expect(improver.autoFixEnabled).toBe(true);
    });
  });

  describe('runImprovementCycle', () => {
    test('calls fullScan and logs', () => {
      const spy = jest.spyOn(improver, 'fullScan').mockReturnValue({ issues: [], fixes: [] });
      improver.runImprovementCycle();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test('calls brain.evolution.learn when brain has evolution', () => {
      const learn = jest.fn();
      improver.brain = { evolution: { learn } };
      jest.spyOn(improver, 'fullScan').mockReturnValue({ issues: [1, 2], fixes: ['f1'] });
      improver.runImprovementCycle();
      expect(learn).toHaveBeenCalledWith('code-scan', 'auto', { issuesFound: 2, fixesApplied: 1 });
      jest.restoreAllMocks();
    });
  });

  describe('getSuggestions', () => {
    test('suggests run-scan when no history', () => {
      const suggestions = improver.getSuggestions();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].action).toBe('run-scan');
    });

    test('suggests manual-fix when issues found', () => {
      improver.history.push({ issuesFound: 3, fixesApplied: 0, filesScanned: 2, timestamp: Date.now() });
      const suggestions = improver.getSuggestions();
      expect(suggestions.some(s => s.action === 'manual-fix')).toBe(true);
    });

    test('suggests expand-scan when > 5 files scanned', () => {
      improver.history.push({ issuesFound: 0, fixesApplied: 0, filesScanned: 10, timestamp: Date.now() });
      const suggestions = improver.getSuggestions();
      expect(suggestions.some(s => s.action === 'expand-scan')).toBe(true);
    });
  });

  describe('generateReport', () => {
    test('returns report with zeros when no history', () => {
      const report = improver.generateReport();
      expect(report.summary.totalFiles).toBe(0);
      expect(report.summary.totalIssues).toBe(0);
    });

    test('returns report with history data', () => {
      improver.history.push({ timestamp: Date.now(), issuesFound: 3, fixesApplied: 1, filesScanned: 7 });
      const report = improver.generateReport();
      expect(report.summary.totalFiles).toBe(7);
      expect(report.summary.totalIssues).toBe(0);
      expect(report.history).toHaveLength(1);
    });
  });

  describe('startAutoImprovementLoop / stopAutoImprovementLoop', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('starts interval and runs first cycle', () => {
      jest.spyOn(improver, 'fullScan').mockReturnValue({ issues: [], fixes: [] });
      const spy = jest.spyOn(improver, 'runImprovementCycle');
      improver.startAutoImprovementLoop(60000);
      expect(spy).toHaveBeenCalledTimes(1);
      improver.stopAutoImprovementLoop();
      spy.mockRestore();
    });

    test('advances timer triggers second cycle', () => {
      jest.spyOn(improver, 'fullScan').mockReturnValue({ issues: [], fixes: [] });
      const spy = jest.spyOn(improver, 'runImprovementCycle');
      improver.startAutoImprovementLoop(60000);
      spy.mockClear();
      jest.advanceTimersByTime(60000);
      expect(spy).toHaveBeenCalledTimes(1);
      improver.stopAutoImprovementLoop();
      spy.mockRestore();
    });

    test('stopAutoImprovementLoop clears interval', () => {
      jest.spyOn(improver, 'fullScan').mockReturnValue({ issues: [], fixes: [] });
      improver.startAutoImprovementLoop(60000);
      improver.stopAutoImprovementLoop();
      expect(improver.improvementLoop).toBeNull();
      jest.restoreAllMocks();
    });

    test('does not start duplicate loop', () => {
      jest.spyOn(improver, 'fullScan').mockReturnValue({ issues: [], fixes: [] });
      improver.startAutoImprovementLoop(60000);
      const spy = jest.spyOn(improver, 'runImprovementCycle');
      spy.mockClear();
      improver.startAutoImprovementLoop(60000);
      jest.advanceTimersByTime(60000);
      expect(spy).toHaveBeenCalledTimes(1);
      improver.stopAutoImprovementLoop();
      spy.mockRestore();
    });

    test('starts with default interval when none provided', () => {
      jest.spyOn(improver, 'fullScan').mockReturnValue({ issues: [], fixes: [] });
      const spy = jest.spyOn(improver, 'runImprovementCycle');
      improver.startAutoImprovementLoop();
      expect(spy).toHaveBeenCalledTimes(1);
      improver.stopAutoImprovementLoop();
      spy.mockRestore();
    });

    test('stopAutoImprovementLoop handles no running loop', () => {
      improver.stopAutoImprovementLoop();
      expect(improver.improvementLoop).toBeUndefined();
    });
  });

  describe('_updateIssueTracker (additional branches)', () => {
    test('skips bySeverity when severity is not in tracker keys', () => {
      improver._updateIssueTracker([
        { file: 'a.js', severity: 'unknown' }
      ]);
      expect(improver.issueTracker.byFile['a.js']).toHaveLength(1);
    });
  });

  describe('_groupBySeverity (additional branches)', () => {
    test('falls back to medium when issue has no severity', () => {
      const grouped = improver._groupBySeverity([{ }]);
      expect(grouped.medium).toHaveLength(1);
    });
  });

  describe('_autoFix (additional branches)', () => {
    test('catches error when _applyFix throws', () => {
      const spy = jest.spyOn(improver, '_applyFix').mockImplementation(() => { throw new Error('模拟错误'); });
      const fixes = improver._autoFix([{ type: 'duplicate-require', message: 'dup' }]);
      expect(fixes).toHaveLength(0);
      spy.mockRestore();
    });

    test('includes fixed result when _applyFix succeeds', () => {
      const spy = jest.spyOn(improver, '_applyFix').mockReturnValue({ success: true, error: null });
      const fixes = improver._autoFix([{ type: 'duplicate-require', message: 'dup' }]);
      expect(fixes).toHaveLength(1);
      expect(fixes[0].result).toBe('fixed');
      spy.mockRestore();
    });
  });
});
