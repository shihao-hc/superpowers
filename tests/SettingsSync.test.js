/**
 * SettingsSync Tests
 */

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn(),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn(),
    unlink: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn()
  })
}));

const { SettingsSync, SettingsWatcher, SyncKeys, SyncDirection, SyncStatus } = require('../src/config/SettingsSync.js');

describe('SettingsSync', () => {
  let sync;
  let mockRemoteApi;

  beforeEach(() => {
    const mockFs = require('fs');
    mockFs.promises.mkdir.mockClear();
    mockFs.promises.readFile.mockClear().mockRejectedValue({ code: 'ENOENT' });
    mockFs.promises.writeFile.mockClear();
    mockFs.promises.readdir.mockClear().mockResolvedValue([]);
    mockFs.promises.unlink.mockClear();

    mockRemoteApi = {
      download: jest.fn(),
      upload: jest.fn()
    };

    sync = new SettingsSync({
      remoteApi: mockRemoteApi,
      authToken: 'test-token'
    });
  });

  describe('SyncKeys', () => {
    it('should have correct keys', () => {
      expect(SyncKeys.USER_SETTINGS).toBe('settings.json');
      expect(SyncKeys.USER_MEMORY).toBe('CLAUDE.md');
      expect(SyncKeys.PROJECT_SETTINGS).toBe('settings.local.json');
      expect(SyncKeys.PROJECT_MEMORY).toBe('CLAUDE.local.md');
    });
  });

  describe('SyncDirection', () => {
    it('should have correct directions', () => {
      expect(SyncDirection.UPLOAD).toBe('upload');
      expect(SyncDirection.DOWNLOAD).toBe('download');
      expect(SyncDirection.BIDIRECTIONAL).toBe('bidirectional');
    });
  });

  describe('SyncStatus', () => {
    it('should have correct statuses', () => {
      expect(SyncStatus.IDLE).toBe('idle');
      expect(SyncStatus.SYNCING).toBe('syncing');
      expect(SyncStatus.SUCCESS).toBe('success');
      expect(SyncStatus.FAILED).toBe('failed');
      expect(SyncStatus.CONFLICT).toBe('conflict');
    });
  });

  describe('constructor', () => {
    it('should set default values', () => {
      expect(sync.authToken).toBe('test-token');
    });

    it('should use custom logger', () => {
      const customLogger = { log: () => {} };
      const syncWithLogger = new SettingsSync({
        remoteApi: mockRemoteApi,
        logger: customLogger
      });
      expect(syncWithLogger.logger).toBe(customLogger);
    });
  });

  describe('diff', () => {
    it('should detect changed values', () => {
      const local = { a: 1, b: 2 };
      const remote = { a: 1, b: 3, c: 4 };

      const changes = sync.diff(local, remote);

      expect(changes.b).toBe(2); // local has b:2, remote has b:3
    });

    it('should return empty object when no changes', () => {
      const local = { a: 1 };
      const remote = { a: 1 };

      const changes = sync.diff(local, remote);

      expect(Object.keys(changes)).toHaveLength(0);
    });
  });

  describe('merge', () => {
    it('should merge remote with local (remote first)', () => {
      const local = { a: 1, b: 2 };
      const remote = { a: 1, c: 3 };

      const merged = sync.merge(remote, local);

      expect(merged.a).toBe(1);
      expect(merged.b).toBe(2);
      expect(merged.c).toBe(3);
    });
  });

  describe('detectConflict', () => {
    it('should detect conflicting keys', () => {
      const remote = { a: 1 };
      const local = { a: 2 };

      const conflicts = sync.detectConflict(remote, local);

      expect(conflicts).not.toBeNull();
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('should return null when no conflicts', () => {
      const remote = { a: 1 };
      const local = { a: 1 };

      const conflicts = sync.detectConflict(remote, local);

      expect(conflicts).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return status object', () => {
      const status = sync.getStatus();
      expect(status).toHaveProperty('status');
      expect(status.status).toBe(SyncStatus.IDLE);
    });
  });

  describe('setAuthToken', () => {
    it('should set auth token', () => {
      sync.setAuthToken('new-token');
      expect(sync.authToken).toBe('new-token');
    });
  });

  describe('authenticate', () => {
    it('should throw if no remote API', async () => {
      const syncNoApi = new SettingsSync({});
      await expect(syncNoApi.authenticate()).rejects.toThrow('Remote API not configured');
    });

    it('should return auth URL', async () => {
      const result = await sync.authenticate();

      expect(result).toHaveProperty('authUrl');
      expect(result.authUrl).toContain('auth.anthropic.com');
    });
  });

  describe('upload', () => {
    it('should throw if not authenticated', async () => {
      const syncNoAuth = new SettingsSync({ remoteApi: mockRemoteApi });

      await expect(syncNoAuth.upload({})).rejects.toThrow('Not authenticated');
    });
  });

  describe('download', () => {
    it('should throw if not authenticated', async () => {
      const syncNoAuth = new SettingsSync({ remoteApi: mockRemoteApi });

      await expect(syncNoAuth.download()).rejects.toThrow('Not authenticated');
    });

    it('should use cache when available', async () => {
      sync.downloadCache = { cached: true };

      const settings = await sync.download();

      expect(settings.cached).toBe(true);
    });
  });

  describe('buildOAuthUrl', () => {
    it('should build correct OAuth URL', () => {
      const url = sync.buildOAuthUrl();

      expect(url).toContain('auth.anthropic.com');
      expect(url).toContain('redirect_uri');
    });
  });

  describe('getDefaultLocalPath', () => {
    it('should use HOME env var', () => {
      const origHome = process.env.HOME;
      try {
        process.env.HOME = '/custom/home';
        const s = new SettingsSync({ remoteApi: mockRemoteApi });
        expect(s.localPath).toContain('home');
      } finally {
        process.env.HOME = origHome;
      }
    });

    it('should fallback to USERPROFILE when HOME not set', () => {
      const origHome = process.env.HOME;
      const origUP = process.env.USERPROFILE;
      try {
        delete process.env.HOME;
        process.env.USERPROFILE = 'C:\\Users\\TestUser';
        const s = new SettingsSync({ remoteApi: mockRemoteApi });
        expect(s.localPath).toContain('TestUser');
      } finally {
        process.env.HOME = origHome;
        process.env.USERPROFILE = origUP;
      }
    });
  });

  describe('initialize', () => {
    it('should create local directory', async () => {
      const mockFs = require('fs');
      await sync.initialize();
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith(
        sync.localPath,
        { recursive: true }
      );
    });
  });

  describe('upload full path', () => {
    it('should skip upload when no changes detected', async () => {
      mockRemoteApi.download.mockResolvedValue({ entries: { a: 1 } });
      const result = await sync.upload({ a: 1 });
      expect(result.uploaded).toBe(false);
      expect(result.reason).toBe('No changes');
      expect(mockRemoteApi.upload).not.toHaveBeenCalled();
    });

    it('should upload settings with changes', async () => {
      mockRemoteApi.download.mockResolvedValue({ entries: { a: 1 } });
      mockRemoteApi.upload.mockResolvedValue(undefined);
      const result = await sync.upload({ a: 2 });
      expect(result.uploaded).toBe(true);
      expect(mockRemoteApi.upload).toHaveBeenCalled();
      expect(sync.status).toBe(SyncStatus.SUCCESS);
    });

    it('should set FAILED status on upload error', async () => {
      mockRemoteApi.download.mockRejectedValue(new Error('Network error'));
      await expect(sync.upload({ a: 1 })).rejects.toThrow('Network error');
      expect(sync.status).toBe(SyncStatus.FAILED);
    });
  });

  describe('download full path', () => {
    it('should download and merge remote settings', async () => {
      mockRemoteApi.download.mockResolvedValue({ entries: { a: 1, b: 2 } });
      const result = await sync.download();
      expect(result).toEqual({ a: 1, b: 2 });
      expect(sync.status).toBe(SyncStatus.SUCCESS);
    });

    it('should handle response without entries property', async () => {
      mockRemoteApi.download.mockResolvedValue({ a: 1 });
      const result = await sync.download();
      expect(result).toEqual({ a: 1 });
    });

    it('should bypass cache with force flag', async () => {
      sync.downloadCache = { cached: true };
      mockRemoteApi.download.mockResolvedValue({ entries: { fresh: true } });
      const result = await sync.download({ force: true });
      expect(result).toEqual({ fresh: true });
    });

    it('should set FAILED status on download error', async () => {
      mockRemoteApi.download.mockRejectedValue(new Error('Server error'));
      await expect(sync.download()).rejects.toThrow('Server error');
      expect(sync.status).toBe(SyncStatus.FAILED);
    });
  });

  describe('sync', () => {
    it('should sync with no conflict', async () => {
      mockRemoteApi.download.mockResolvedValue({ entries: { a: 1 } });
      const result = await sync.sync();
      expect(result.conflict).toBe(false);
      expect(sync.status).toBe(SyncStatus.SUCCESS);
    });

    it('should handle loadLocal failure in sync gracefully', async () => {
      const mockFs = require('fs');
      mockFs.promises.readFile.mockRejectedValue(new Error('Disk error'));
      mockRemoteApi.download.mockResolvedValue({ entries: {} });
      const result = await sync.sync();
      expect(result.conflict).toBe(false);
      expect(sync.status).toBe(SyncStatus.SUCCESS);
    });

    it('should resolve conflict when remote differs from local', async () => {
      const mockFs = require('fs');
      mockFs.promises.readFile.mockResolvedValue('{"a": 1}');
      mockRemoteApi.download.mockResolvedValue({ entries: { a: 2 } });
      sync.conflictResolver = jest.fn().mockResolvedValue({ a: 2 });
      const result = await sync.sync();
      expect(result.conflict).toBe(true);
      expect(sync.status).toBe(SyncStatus.SUCCESS);
    });

    it('should set FAILED status on sync error', async () => {
      const mockFs = require('fs');
      mockFs.promises.readFile.mockResolvedValue('{"a": 1}');
      mockRemoteApi.download.mockResolvedValue({ entries: { a: 2 } });
      sync.conflictResolver = jest.fn().mockRejectedValue(new Error('Conflict failed'));
      await expect(sync.sync()).rejects.toThrow('Conflict failed');
      expect(sync.status).toBe(SyncStatus.FAILED);
    });
  });

  describe('fetchRemote', () => {
    it('should return empty when no remoteApi', async () => {
      const s = new SettingsSync({ authToken: 'test' });
      const result = await s.fetchRemote('key');
      expect(result).toEqual({});
    });

    it('should return entries from remote', async () => {
      mockRemoteApi.download.mockResolvedValue({ entries: { x: 1 } });
      const result = await sync.fetchRemote('key');
      expect(result).toEqual({ x: 1 });
    });

    it('should return empty on 404', async () => {
      const err = new Error('Not found');
      err.status = 404;
      mockRemoteApi.download.mockRejectedValue(err);
      const result = await sync.fetchRemote('key');
      expect(result).toEqual({});
    });

    it('should rethrow non-404 errors', async () => {
      mockRemoteApi.download.mockRejectedValue(new Error('Server error'));
      await expect(sync.fetchRemote('key')).rejects.toThrow('Server error');
    });
  });

  describe('defaultConflictResolver', () => {
    it('should resolve conflicts with remote values', async () => {
      const resolved = await sync.defaultConflictResolver(
        { a: 1, b: 2 },
        { a: 99, b: 2 },
        [
          { key: 'a', remote: 1, local: 99 }
        ]
      );
      expect(resolved.a).toBe(1);
      expect(resolved.b).toBe(2);
    });
  });

  describe('loadLocal', () => {
    it('should load settings from file', async () => {
      const mockFs = require('fs');
      mockFs.promises.readFile.mockResolvedValue('{"x": 10}');
      const result = await sync.loadLocal('test-key');
      expect(result).toEqual({ x: 10 });
    });

    it('should return empty on ENOENT', async () => {
      const result = await sync.loadLocal('missing-key');
      expect(result).toEqual({});
    });

    it('should rethrow non-ENOENT error', async () => {
      const mockFs = require('fs');
      mockFs.promises.readFile.mockRejectedValue(new Error('Permission denied'));
      await expect(sync.loadLocal('bad-key')).rejects.toThrow('Permission denied');
    });
  });

  describe('saveLocal', () => {
    it('should write settings to file', async () => {
      const mockFs = require('fs');
      await sync.saveLocal({ a: 1 }, 'custom-key');
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });
  });

  describe('saveLocalBackup', () => {
    it('should create backup and clean old ones', async () => {
      const mockFs = require('fs');
      mockFs.promises.readdir.mockResolvedValue([
        'settings-2024-01-01.json',
        'settings-2024-01-02.json'
      ]);
      await sync.saveLocalBackup({ a: 1 }, 'settings');
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });
  });

  describe('cleanOldBackups', () => {
    it('should remove backups exceeding keep count', async () => {
      const mockFs = require('fs');
      const files = Array.from({ length: 15 }, (_, i) => `settings-2024-01-${String(i + 1).padStart(2, '0')}.json`);
      mockFs.promises.readdir.mockResolvedValue(files);
      await sync.cleanOldBackups('/backups', 'settings', 10);
      expect(mockFs.promises.unlink).toHaveBeenCalledTimes(5);
    });

    it('should not remove backups within keep count', async () => {
      const mockFs = require('fs');
      mockFs.promises.readdir.mockResolvedValue(['settings-2024-01-01.json']);
      await sync.cleanOldBackups('/backups', 'settings', 10);
      expect(mockFs.promises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('getLocalFilePath', () => {
    it('should return path with given key', () => {
      const fp = sync.getLocalFilePath('my-key.json');
      expect(fp).toContain('my-key.json');
    });

    it('should use default key when none provided', () => {
      const fp = sync.getLocalFilePath();
      expect(fp).toContain('settings.json');
    });
  });

  describe('forceRedownload', () => {
    it('should call download with force flag', async () => {
      mockRemoteApi.download.mockResolvedValue({ entries: { forced: true } });
      sync.downloadCache = { cached: true };
      const result = await sync.forceRedownload();
      expect(result).toEqual({ forced: true });
    });
  });
});

describe('SettingsWatcher', () => {
  let mockSync;
  let watcher;

  beforeEach(() => {
    mockSync = {
      localPath: '/test/path',
      upload: jest.fn().mockResolvedValue(undefined),
      logger: { debug: jest.fn(), error: jest.fn() }
    };
    watcher = new SettingsWatcher(mockSync);
  });

  it('should set default debounce', () => {
    expect(watcher.debounceMs).toBe(1000);
  });

  it('should use custom debounce', () => {
    const w = new SettingsWatcher(mockSync, { debounce: 500 });
    expect(w.debounceMs).toBe(500);
  });

  it('should use custom watchPath', () => {
    const w = new SettingsWatcher(mockSync, { watchPath: '/custom/watch' });
    expect(w.watchPath).toBe('/custom/watch');
  });

  describe('start', () => {
    it('should create chokidar watcher', async () => {
      await watcher.start();
      const chokidar = require('chokidar');
      expect(chokidar.watch).toHaveBeenCalledWith('/test/path', {
        persistent: true,
        ignoreInitial: true
      });
    });
  });

  describe('onFileChange', () => {
    it('should upload changed file', async () => {
      const mockFs = require('fs');
      mockFs.promises.readFile.mockResolvedValue('{"key": "val"}');
      await watcher.onFileChange('/test/path/settings.json');
      expect(mockSync.upload).toHaveBeenCalledWith({ key: 'val' }, { key: 'settings.json' });
      expect(mockSync.logger.debug).toHaveBeenCalled();
    });

    it('should log error on failure', async () => {
      const mockFs = require('fs');
      mockFs.promises.readFile.mockRejectedValue(new Error('Read error'));
      await watcher.onFileChange('/test/path/bad.json');
      expect(mockSync.logger.error).toHaveBeenCalled();
    });
  });

  describe('debounce', () => {
    it('should clear existing timer before setting new one', () => {
      jest.useFakeTimers();
      watcher.debounceTimer = setTimeout(() => {}, 10000);
      watcher.debounce(jest.fn());
      expect(watcher.debounceTimer).not.toBeNull();
      jest.useRealTimers();
    });
  });

  describe('stop', () => {
    it('should close watcher when exists', async () => {
      const closeFn = jest.fn();
      watcher.watcher = { close: closeFn };
      await watcher.stop();
      expect(closeFn).toHaveBeenCalled();
      expect(watcher.watcher).toBeNull();
    });

    it('should handle null watcher gracefully', async () => {
      watcher.watcher = null;
      await expect(watcher.stop()).resolves.toBeUndefined();
    });

    it('should clear debounce timer when exists', async () => {
      watcher.debounceTimer = setTimeout(() => {}, 10000);
      await watcher.stop();
      expect(watcher.debounceTimer).toBeNull();
    });
  });
});