'use strict';

const { AutoUpdateSystem } = require('../../src/auto-update/AutoUpdater');

describe('AutoUpdateSystem', () => {
  let updater;

  beforeEach(() => {
    updater = new AutoUpdateSystem();
  });

  describe('constructor', () => {
    it('sets default options', () => {
      expect(updater.checkInterval).toBe(3600000);
      expect(updater.autoApply).toBe(false);
      expect(updater.backupDir).toBe('./backups');
      expect(updater.currentVersion).toBe('1.0.0');
      expect(updater.updateChannel).toBe('stable');
    });

    it('accepts custom options', () => {
      const custom = new AutoUpdateSystem({
        checkInterval: 60000,
        autoApply: true,
        backupDir: '/custom/backups',
        channel: 'beta'
      });
      expect(custom.checkInterval).toBe(60000);
      expect(custom.autoApply).toBe(true);
      expect(custom.backupDir).toBe('/custom/backups');
      expect(custom.updateChannel).toBe('beta');
    });
  });

  describe('checkForUpdates', () => {
    it('returns update information', async () => {
      const result = await updater.checkForUpdates();
      expect(result).toEqual({
        available: true,
        version: '1.1.0',
        changelog: [
          'Performance improvements',
          'Security patches',
          'Bug fixes'
        ],
        critical: false
      });
    });
  });

  describe('downloadUpdate', () => {
    it('returns download status', async () => {
      const result = await updater.downloadUpdate('1.1.0');
      expect(result).toEqual({
        status: 'downloaded',
        version: '1.1.0'
      });
    });
  });

  describe('applyUpdate', () => {
    it('backs up current version and applies update', async () => {
      const backupSpy = jest.spyOn(updater, 'backup').mockResolvedValue({ status: 'backed-up' });

      const result = await updater.applyUpdate({ version: '1.1.0' });

      expect(backupSpy).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'applied',
        version: '1.1.0'
      });
    });
  });

  describe('rollback', () => {
    it('returns rollback status', async () => {
      const result = await updater.rollback('1.0.0');
      expect(result).toEqual({
        status: 'rolled-back',
        version: '1.0.0'
      });
    });
  });

  describe('backup', () => {
    it('returns backup status with timestamp', async () => {
      const before = Date.now();
      const result = await updater.backup();
      const after = Date.now();

      expect(result.status).toBe('backed-up');
      expect(result.timestamp).toEqual(expect.any(String));
      const ts = new Date(result.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after + 100);
    });
  });

  describe('startAutoCheck', () => {
    let setIntervalSpy, clearIntervalSpy;

    beforeEach(() => {
      clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
      setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue('interval-id');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('stops previous interval if one exists', () => {
      updater.autoCheckInterval = 'old-interval';
      updater.startAutoCheck();

      expect(clearIntervalSpy).toHaveBeenCalledWith('old-interval');
    });

    it('creates a new periodic check interval', () => {
      updater.checkInterval = 5000;
      updater.startAutoCheck();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(setIntervalSpy.mock.calls[0][1]).toBe(5000);
      expect(typeof setIntervalSpy.mock.calls[0][0]).toBe('function');
      expect(updater.autoCheckInterval).toBe('interval-id');
    });

    it('auto-applies updates when autoApply is true', async () => {
      let intervalCb;
      setIntervalSpy.mockImplementation((fn, _ms) => {
        intervalCb = fn;
        return 'interval-id';
      });

      updater.autoApply = true;
      const checkSpy = jest.spyOn(updater, 'checkForUpdates');
      const downloadSpy = jest.spyOn(updater, 'downloadUpdate').mockResolvedValue({ status: 'downloaded', version: '1.1.0' });
      const applySpy = jest.spyOn(updater, 'applyUpdate').mockResolvedValue({ status: 'applied', version: '1.1.0' });

      updater.startAutoCheck();
      await intervalCb();

      expect(checkSpy).toHaveBeenCalled();
      expect(downloadSpy).toHaveBeenCalledWith('1.1.0');
      expect(applySpy).toHaveBeenCalled();
    });

    it('does not auto-apply when autoApply is false', async () => {
      let intervalCb;
      setIntervalSpy.mockImplementation((fn, _ms) => {
        intervalCb = fn;
        return 'interval-id';
      });

      updater.autoApply = false;
      const downloadSpy = jest.spyOn(updater, 'downloadUpdate').mockResolvedValue({ status: 'downloaded', version: '1.1.0' });

      updater.startAutoCheck();
      await intervalCb();

      expect(downloadSpy).not.toHaveBeenCalled();
    });

    it('handles errors in auto-check gracefully', async () => {
      let intervalCb;
      setIntervalSpy.mockImplementation((fn, _ms) => {
        intervalCb = fn;
        return 'interval-id';
      });

      const checkSpy = jest.spyOn(updater, 'checkForUpdates').mockRejectedValue(new Error('Network error'));

      updater.startAutoCheck();
      await expect(intervalCb()).resolves.toBeUndefined();

      expect(checkSpy).toHaveBeenCalled();
    });
  });

  describe('stopAutoCheck', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('clears the interval and resets to null', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
      updater.autoCheckInterval = 'interval-1';

      updater.stopAutoCheck();

      expect(clearIntervalSpy).toHaveBeenCalledWith('interval-1');
      expect(updater.autoCheckInterval).toBeNull();
    });

    it('does nothing when autoCheckInterval is not set', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

      expect(() => updater.stopAutoCheck()).not.toThrow();

      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });
  });
});
