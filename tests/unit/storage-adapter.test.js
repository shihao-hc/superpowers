'use strict';

jest.mock('fs');
jest.mock('../../server/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock flags for cloud provider init behavior
let mockS3ClientThrow = false;
let mockOSSClientThrow = false;
let mockMinIOClientThrow = false;

jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn(() => {
      if (mockS3ClientThrow) throw new Error('S3 init failed');
      return { send: mockSend };
    }),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    HeadObjectCommand: jest.fn(),
    ListObjectsV2Command: jest.fn()
  };
}, { virtual: true });

jest.mock('@aws-sdk/s3-request-presigner', () => {
  return { getSignedUrl: jest.fn() };
}, { virtual: true });

jest.mock('ali-oss', () => {
  return jest.fn(() => {
    if (mockOSSClientThrow) throw new Error('OSS init failed');
    return {
      put: jest.fn(),
      delete: jest.fn(),
      head: jest.fn(),
      list: jest.fn(),
      signatureUrl: jest.fn()
    };
  });
}, { virtual: true });

jest.mock('minio', () => {
  const client = {
    putObject: jest.fn(),
    removeObject: jest.fn(),
    statObject: jest.fn(),
    listObjects: jest.fn(() => {
      async function* emptyStream() { return; } // eslint-disable-line require-yield
      return emptyStream();
    }),
    presignedGetObject: jest.fn()
  };
  return {
    Client: jest.fn(() => {
      if (mockMinIOClientThrow) throw new Error('MinIO init failed');
      return client;
    })
  };
}, { virtual: true });

const fs = require('fs');
const path = require('path');
const { warn: warnLog } = require('../../server/utils/logger');

const BASE_PATH = path.join(process.cwd(), 'data', 'exports');

let StorageAdapter, MultiFormatExporter;

beforeAll(() => {
  const mod = require('../../src/skills/export/StorageAdapter');
  StorageAdapter = mod.StorageAdapter;
  MultiFormatExporter = mod.MultiFormatExporter;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockS3ClientThrow = false;
  mockOSSClientThrow = false;
  mockMinIOClientThrow = false;
  fs.existsSync.mockReturnValue(false);
  fs.mkdirSync.mockReturnValue(undefined);
  fs.writeFileSync.mockReturnValue(undefined);
  fs.readdirSync.mockReturnValue([]);
  fs.statSync.mockReturnValue({ size: 0, mtime: new Date(), isFile: () => true });
  fs.unlinkSync.mockReturnValue(undefined);
  fs.readFileSync.mockReturnValue(Buffer.from('test'));
});

// ===================================================================
// StorageAdapter
// ===================================================================
describe('StorageAdapter', () => {
  describe('constructor', () => {
    it('sets default config when no options given', () => {
      const a = new StorageAdapter();
      expect(a.config.provider).toBe('local');
      expect(a.config.bucket).toBe('skill-exports');
      expect(a.config.region).toBe('us-east-1');
      expect(a.config.localPath).toBe(BASE_PATH);
      expect(a.config.baseUrl).toBeNull();
      expect(a.config.endpoint).toBeNull();
    });

    it('merges custom config with defaults', () => {
      const a = new StorageAdapter({
        provider: 's3', bucket: 'x', region: 'cn-north-1',
        baseUrl: 'https://cdn.example.com'
      });
      expect(a.config.provider).toBe('s3');
      expect(a.config.bucket).toBe('x');
      expect(a.config.region).toBe('cn-north-1');
      expect(a.config.baseUrl).toBe('https://cdn.example.com');
      expect(a.config.localPath).toBe(BASE_PATH);
    });

    it('reads AWS credentials from environment', () => {
      process.env.AWS_ACCESS_KEY_ID = 'env-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'env-secret';
      const a = new StorageAdapter();
      expect(a.config.accessKeyId).toBe('env-key');
      expect(a.config.secretAccessKey).toBe('env-secret');
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    });

    it('config accessKeyId overrides env', () => {
      process.env.AWS_ACCESS_KEY_ID = 'env-key';
      const a = new StorageAdapter({ accessKeyId: 'explicit' });
      expect(a.config.accessKeyId).toBe('explicit');
      delete process.env.AWS_ACCESS_KEY_ID;
    });
  });

  describe('_ensureLocalDir', () => {
    it('creates directory when it does not exist', () => {
      const a = new StorageAdapter();
      a._ensureLocalDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith(BASE_PATH, { recursive: true });
    });

    it('skips creation when directory exists', () => {
      fs.existsSync.mockReturnValue(true);
      const a = new StorageAdapter();
      a._ensureLocalDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('S3 init', () => {
    it('initializes S3 client successfully', () => {
      const a = new StorageAdapter({ provider: 's3', accessKeyId: 'k', secretAccessKey: 's' });
      expect(a.client).toBeDefined();
      expect(a.client.send).toBeDefined();
      expect(a.PutObjectCommand).toBeDefined();
      expect(a.GetObjectCommand).toBeDefined();
      expect(a.DeleteObjectCommand).toBeDefined();
      expect(a.HeadObjectCommand).toBeDefined();
      expect(a.config.provider).toBe('s3');
    });

    it('falls back to local when S3 client constructor throws', () => {
      mockS3ClientThrow = true;
      const a = new StorageAdapter({ provider: 's3' });
      expect(a.config.provider).toBe('local');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('OSS init', () => {
    it('initializes OSS client successfully', () => {
      const a = new StorageAdapter({ provider: 'oss', accessKeyId: 'k', secretAccessKey: 's' });
      expect(a.client).toBeDefined();
      expect(a.client.put).toBeDefined();
      expect(a.config.provider).toBe('oss');
    });

    it('falls back to local when OSS client constructor throws', () => {
      mockOSSClientThrow = true;
      const a = new StorageAdapter({ provider: 'oss' });
      expect(a.config.provider).toBe('local');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('MinIO init', () => {
    it('initializes MinIO client successfully', () => {
      const a = new StorageAdapter({
        provider: 'minio', accessKeyId: 'k', secretAccessKey: 's',
        endpoint: 'play.min.io'
      });
      expect(a.client).toBeDefined();
      expect(a.client.putObject).toBeDefined();
      expect(a.config.provider).toBe('minio');
    });

    it('falls back to local when MinIO client constructor throws', () => {
      mockMinIOClientThrow = true;
      const a = new StorageAdapter({ provider: 'minio' });
      expect(a.config.provider).toBe('local');
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ----- upload -----
  describe('upload', () => {
    describe('local', () => {
      it('uploads a Buffer', async () => {
        fs.existsSync.mockReturnValue(true);
        const a = new StorageAdapter();
        const result = await a.upload(Buffer.from('hello'), { key: 'test.txt', contentType: 'text/plain' });
        expect(result.key).toBe('test.txt');
        expect(result.url).toBe('/api/skills/export/local/test.txt');
        expect(result.provider).toBe('local');
        expect(result.size).toBe(5);
        expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(BASE_PATH, 'test.txt'), Buffer.from('hello'));
      });

      it('uploads using file.buffer', async () => {
        fs.existsSync.mockReturnValue(true);
        const a = new StorageAdapter();
        const file = { buffer: Buffer.from('data'), originalname: 'file.json' };
        const result = await a.upload(file);
        // sanitizeFilename removes '/' so 'exports/...' becomes 'exports...'
        expect(result.key).toMatch(/^exports\d+_file_[a-f0-9]+\.json$/);
        expect(result.url).toContain('/api/skills/export/local/');
        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      it('uploads using file.path when buffer absent', async () => {
        fs.existsSync.mockReturnValue(true);
        const a = new StorageAdapter();
        const file = { path: '/tmp/upload', originalname: 'doc.pdf' };
        const result = await a.upload(file, { key: 'doc.pdf' });
        expect(result.key).toBe('doc.pdf');
        expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/upload');
      });

      it('uploads using file as string path', async () => {
        fs.existsSync.mockReturnValue(true);
        const a = new StorageAdapter();
        await a.upload('/tmp/raw', { key: 'raw.bin' });
        expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/raw');
      });

      it('sanitizes special characters from key', async () => {
        fs.existsSync.mockReturnValue(true);
        const a = new StorageAdapter();
        // '../../etc/passwd' → remove / → '....etcpasswd' → remove .. → 'etcpasswd'
        const result = await a.upload(Buffer.from('x'), { key: '../../etc/passwd' });
        expect(result.key).toBe('etcpasswd');
        expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(BASE_PATH, 'etcpasswd'), Buffer.from('x'));
      });

      it('sanitizes path separators and special chars from key', async () => {
        fs.existsSync.mockReturnValue(true);
        const a = new StorageAdapter();
        const result = await a.upload(Buffer.from('x'), { key: 'foo\\bar|baz<>qux' });
        // \\ stripped, |<> → _, result: 'foobar_baz__qux'
        expect(result.key).toBe('foobar_baz__qux');
      });

      it('generates key automatically from originalname', async () => {
        fs.existsSync.mockReturnValue(true);
        const a = new StorageAdapter();
        const file = { buffer: Buffer.from('data'), originalname: 'auto.csv' };
        const result = await a.upload(file);
        expect(result.key).toMatch(/^exports\d+_auto_[a-f0-9]+\.csv$/);
      });

      it('creates local directory when it does not exist', async () => {
        // existsSync defaults to false in beforeEach
        const a = new StorageAdapter();
        await a.upload(Buffer.from('x'), { key: 'nested.txt' });
        expect(fs.mkdirSync).toHaveBeenCalled();
      });
    });

    describe('S3', () => {
      it('uploads to S3 with default URL', async () => {
        const a = new StorageAdapter({
          provider: 's3', bucket: 'my-bucket', region: 'us-west-2',
          accessKeyId: 'k', secretAccessKey: 's'
        });
        a.client.send.mockResolvedValue({});
        const result = await a.upload(Buffer.from('data'), { key: 'dir/file.txt', contentType: 'text/plain' });
        expect(result.key).toBe('dir/file.txt');
        expect(result.url).toBe('https://my-bucket.s3.us-west-2.amazonaws.com/dir/file.txt');
        expect(result.provider).toBe('s3');
      });

      it('uploads to S3 with custom baseUrl', async () => {
        const a = new StorageAdapter({
          provider: 's3', bucket: 'b', region: 'r', baseUrl: 'https://cdn.example.com',
          accessKeyId: 'k', secretAccessKey: 's'
        });
        a.client.send.mockResolvedValue({});
        const result = await a.upload(Buffer.from('x'), { key: 'img.png' });
        expect(result.url).toBe('https://cdn.example.com/img.png');
      });

      it('includes metadata in S3 upload', async () => {
        const a = new StorageAdapter({
          provider: 's3', bucket: 'b', region: 'r',
          accessKeyId: 'k', secretAccessKey: 's'
        });
        a.client.send.mockResolvedValue({});
        const result = await a.upload(Buffer.from('x'), { key: 'k', metadata: { source: 'test' } });
        expect(result.size).toBe(1);
        expect(result.bucket).toBe('b');
      });
    });

    describe('OSS', () => {
      it('uploads to OSS and returns result', async () => {
        const a = new StorageAdapter({
          provider: 'oss', bucket: 'ob', region: 'cn-hangzhou',
          accessKeyId: 'k', secretAccessKey: 's'
        });
        a.client.put.mockResolvedValue({ url: 'https://oss.aliyuncs.com/ob/k' });
        const result = await a.upload(Buffer.from('data'), { key: 'k', contentType: 'application/json' });
        expect(result.key).toBe('k');
        expect(result.url).toBe('https://oss.aliyuncs.com/ob/k');
        expect(result.provider).toBe('oss');
        expect(a.client.put).toHaveBeenCalledWith('k', Buffer.from('data'), {
          headers: { 'Content-Type': 'application/json' }
        });
      });
    });

    describe('MinIO', () => {
      it('uploads to MinIO with endpoint and https', async () => {
        const a = new StorageAdapter({
          provider: 'minio', bucket: 'mb', endpoint: 'play.min.io',
          port: 9000, useSSL: true, accessKeyId: 'k', secretAccessKey: 's'
        });
        a.client.putObject.mockResolvedValue({});
        const result = await a.upload(Buffer.from('x'), { key: 'f', contentType: 'text/csv' });
        expect(result.url).toBe('https://play.min.io:9000/mb/f');
        expect(a.client.putObject).toHaveBeenCalledWith('mb', 'f', Buffer.from('x'), 1, { 'Content-Type': 'text/csv' });
      });

      it('uploads to MinIO without endpoint', async () => {
        const a = new StorageAdapter({
          provider: 'minio', bucket: 'mb', accessKeyId: 'k', secretAccessKey: 's'
        });
        a.client.putObject.mockResolvedValue({});
        const result = await a.upload(Buffer.from('x'), { key: 'f' });
        expect(result.url).toBe('/mb/f');
      });
    });
  });

  // ----- getSignedURL -----
  describe('getSignedURL', () => {
    it('returns local URL', async () => {
      const a = new StorageAdapter();
      const result = await a.getSignedURL('report.pdf');
      expect(result.url).toBe('/api/skills/export/local/report.pdf');
    });

    it('returns presigned S3 URL', async () => {
      const a = new StorageAdapter({ provider: 's3', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' });
      a.getSignedUrl.mockResolvedValue('https://s3.presigned/url');
      const result = await a.getSignedURL('key', { expiresIn: 7200 });
      expect(result.url).toBe('https://s3.presigned/url');
      expect(result.expiresAt).toBeDefined();
    });

    it('returns presigned OSS URL', async () => {
      const a = new StorageAdapter({ provider: 'oss', bucket: 'ob', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.signatureUrl.mockReturnValue('https://oss.presigned/url');
      const result = await a.getSignedURL('key');
      expect(result.url).toBe('https://oss.presigned/url');
    });

    it('returns presigned MinIO URL', async () => {
      const a = new StorageAdapter({ provider: 'minio', bucket: 'mb', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.presignedGetObject.mockResolvedValue('https://minio.presigned/url');
      const result = await a.getSignedURL('key');
      expect(result.url).toBe('https://minio.presigned/url');
    });
  });

  // ----- delete -----
  describe('delete', () => {
    it('deletes local file that exists', async () => {
      fs.existsSync.mockReturnValue(true);
      const a = new StorageAdapter();
      const result = await a.delete('test.txt');
      expect(result).toEqual({ deleted: true });
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(BASE_PATH, 'test.txt'));
    });

    it('returns deleted:false when local file does not exist', async () => {
      const a = new StorageAdapter();
      const result = await a.delete('missing.txt');
      expect(result).toEqual({ deleted: false, error: 'Delete failed' });
    });

    it('logs warning when local delete throws', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => { throw new Error('permission denied'); });
      const a = new StorageAdapter();
      const result = await a.delete('protected.txt');
      expect(result).toEqual({ deleted: false, error: 'Delete failed' });
      expect(warnLog).toHaveBeenCalled();
    });

    it('sanitizes path traversal attempts in delete', async () => {
      fs.existsSync.mockReturnValue(true);
      const a = new StorageAdapter();
      // sanitizeFilename removes '/..' etc., so '../../etc/passwd' becomes 'etcpasswd'
      const result = await a.delete('../../etc/passwd');
      expect(result).toEqual({ deleted: true });
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(BASE_PATH, 'etcpasswd'));
    });

    it('deletes from S3', async () => {
      const a = new StorageAdapter({ provider: 's3', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.send.mockResolvedValue({});
      const result = await a.delete('key');
      expect(result).toEqual({ deleted: true });
    });

    it('deletes from OSS', async () => {
      const a = new StorageAdapter({ provider: 'oss', bucket: 'ob', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.delete.mockResolvedValue({});
      const result = await a.delete('key');
      expect(result).toEqual({ deleted: true });
    });

    it('deletes from MinIO', async () => {
      const a = new StorageAdapter({ provider: 'minio', bucket: 'mb', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.removeObject.mockResolvedValue({});
      const result = await a.delete('key');
      expect(result).toEqual({ deleted: true });
    });
  });

  // ----- exists -----
  describe('exists', () => {
    it('returns true when local file exists', async () => {
      fs.existsSync.mockReturnValue(true);
      const a = new StorageAdapter();
      expect(await a.exists('file.txt')).toBe(true);
    });

    it('returns false when local file absent', async () => {
      const a = new StorageAdapter();
      expect(await a.exists('file.txt')).toBe(false);
    });

    it('returns false on sanitized path traversal', async () => {
      const a = new StorageAdapter();
      // Sanitized key is 'etcpasswd' which doesn't exist
      expect(await a.exists('../../etc/passwd')).toBe(false);
    });

    it('returns true when S3 object exists', async () => {
      const a = new StorageAdapter({ provider: 's3', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.send.mockResolvedValue({});
      expect(await a.exists('key')).toBe(true);
    });

    it('returns false when S3 object does not exist', async () => {
      const a = new StorageAdapter({ provider: 's3', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.send.mockRejectedValue(new Error('Not found'));
      expect(await a.exists('key')).toBe(false);
    });

    it('returns true when OSS object exists', async () => {
      const a = new StorageAdapter({ provider: 'oss', bucket: 'ob', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.head.mockResolvedValue({});
      expect(await a.exists('key')).toBe(true);
    });

    it('returns false when OSS object does not exist', async () => {
      const a = new StorageAdapter({ provider: 'oss', bucket: 'ob', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.head.mockRejectedValue(new Error('Not found'));
      expect(await a.exists('key')).toBe(false);
    });

    it('returns true when MinIO object exists', async () => {
      const a = new StorageAdapter({ provider: 'minio', bucket: 'mb', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.statObject.mockResolvedValue({});
      expect(await a.exists('key')).toBe(true);
    });

    it('returns false when MinIO object does not exist', async () => {
      const a = new StorageAdapter({ provider: 'minio', bucket: 'mb', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.statObject.mockRejectedValue(new Error('Not found'));
      expect(await a.exists('key')).toBe(false);
    });
  });

  // ----- list -----
  describe('list', () => {
    it('lists local files', async () => {
      const mtime = new Date('2024-01-01');
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['a.json', 'b.csv']);
      fs.statSync.mockReturnValue({ size: 100, mtime, isFile: () => true });
      const a = new StorageAdapter();
      const result = await a.list();
      expect(result.files).toHaveLength(2);
      expect(result.files[0].key).toBe('a.json');
      expect(result.files[0].size).toBe(100);
      expect(result.files[0].lastModified).toEqual(mtime);
      expect(result.isTruncated).toBe(false);
    });

    it('lists local files with prefix', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['sub.log']);
      fs.statSync.mockReturnValue({ size: 50, mtime: new Date(), isFile: () => true });
      const a = new StorageAdapter();
      const result = await a.list('logs');
      // prefix is sanitized: 'logs' → 'logs'
      expect(result.files).toHaveLength(1);
      expect(result.files[0].key).toBe('logs/sub.log');
    });

    it('returns empty when local dir does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      const a = new StorageAdapter();
      const result = await a.list('nonexistent');
      expect(result.files).toEqual([]);
    });

    it('sets isTruncated when more items than limit', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['1', '2', '3', '4', '5']);
      const a = new StorageAdapter();
      const result = await a.list('', { limit: 3 });
      expect(result.files).toHaveLength(3);
      expect(result.isTruncated).toBe(true);
    });

    it('skips directories in local list', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['subdir']);
      fs.statSync.mockReturnValue({ size: 0, mtime: new Date(), isFile: () => false });
      const a = new StorageAdapter();
      const result = await a.list();
      expect(result.files).toHaveLength(0);
    });

    it('sanitizes path traversal in list prefix, then returns empty', async () => {
      const a = new StorageAdapter();
      // prefix '../../etc' → sanitizeFilename removes '/..' → 'etc'
      // validatePath('etc') within BASE_PATH is safe, dir doesn't exist
      const result = await a.list('../../etc');
      expect(result.files).toEqual([]);
    });

    it('lists S3 objects', async () => {
      const a = new StorageAdapter({ provider: 's3', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.send.mockResolvedValue({
        Contents: [{ Key: 'a', Size: 10, LastModified: new Date() }],
        IsTruncated: false
      });
      const result = await a.list('pre', { limit: 10, marker: 'm' });
      expect(result.files).toHaveLength(1);
      expect(result.files[0].key).toBe('a');
    });

    it('lists OSS objects', async () => {
      const a = new StorageAdapter({ provider: 'oss', bucket: 'ob', accessKeyId: 'k', secretAccessKey: 's' });
      a.client.list.mockResolvedValue({
        objects: [{ name: 'o', size: 5, lastModified: new Date() }],
        isTruncated: false, nextMarker: null
      });
      const result = await a.list('p');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].key).toBe('o');
    });

    it('lists MinIO objects', async () => {
      const a = new StorageAdapter({ provider: 'minio', bucket: 'mb', accessKeyId: 'k', secretAccessKey: 's' });
      async function* testStream() {
        yield { name: 'obj1', size: 20, lastModified: new Date() };
      }
      a.client.listObjects.mockReturnValue(testStream());
      const result = await a.list('p');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].key).toBe('obj1');
    });

    it('limits MinIO results', async () => {
      const a = new StorageAdapter({ provider: 'minio', bucket: 'mb', accessKeyId: 'k', secretAccessKey: 's' });
      async function* manyStream() {
        yield { name: 'a', size: 1, lastModified: new Date() };
        yield { name: 'b', size: 2, lastModified: new Date() };
      }
      a.client.listObjects.mockReturnValue(manyStream());
      const result = await a.list('', { limit: 1 });
      expect(result.files).toHaveLength(1);
      expect(result.files[0].key).toBe('a');
    });
  });

  // ----- getStats -----
  describe('getStats', () => {
    it('returns stats with totals', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['a.bin', 'b.bin']);
      fs.statSync.mockReturnValue({ size: 100, mtime: new Date(), isFile: () => true });
      const a = new StorageAdapter();
      const stats = await a.getStats();
      expect(stats.provider).toBe('local');
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSize).toBe(200);
      expect(stats.bucket).toBe('skill-exports');
    });

    it('returns error on failure', async () => {
      const a = new StorageAdapter();
      a.list = jest.fn().mockRejectedValue(new Error('list failed'));
      const stats = await a.getStats();
      expect(stats.provider).toBe('local');
      expect(stats.error).toBe('list failed');
    });
  });

  // ----- _generateKey -----
  describe('_generateKey', () => {
    it('generates key with timestamp, basename, random and extension', () => {
      const a = new StorageAdapter();
      const key = a._generateKey('my report.csv');
      expect(key).toMatch(/^exports\/\d+_my_report_[a-f0-9]+\.csv$/);
    });

    it('replaces non-alphanumeric chars in basename', () => {
      const a = new StorageAdapter();
      const key = a._generateKey('file@#$%.txt');
      // key format: exports/<timestamp>_file_____<random>.txt
      expect(key).toMatch(/^exports\/\d+_file_____[a-f0-9]+\.txt$/);
    });
  });
});

// ===================================================================
// MultiFormatExporter
// ===================================================================
describe('MultiFormatExporter', () => {
  let exporter;

  beforeEach(() => {
    fs.existsSync.mockReturnValue(true);
    exporter = new MultiFormatExporter();
  });

  describe('constructor', () => {
    it('creates a StorageAdapter instance', () => {
      expect(exporter.storage).toBeInstanceOf(StorageAdapter);
    });

    it('registers all format handlers', () => {
      expect(exporter.getSupportedFormats()).toEqual(['json', 'csv', 'markdown', 'html', 'pdf']);
    });
  });

  describe('export', () => {
    it('exports data to JSON and uploads', async () => {
      const result = await exporter.export({ name: 'test', value: 42 }, { filename: 'report.json' });
      expect(result.format).toBe('json');
      expect(result.contentType).toBe('application/json');
      // key is sanitized: 'exports/report.json' → 'exportsreport.json'
      expect(result.key).toMatch(/^exportsreport\.json$/);
      expect(result.permanentUrl).toBeDefined();
      expect(result.provider).toBe('local');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('exports data to CSV', async () => {
      const data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
      const result = await exporter.export(data, { format: 'csv', filename: 'people.csv' });
      expect(result.contentType).toBe('text/csv');
      expect(result.format).toBe('csv');
    });

    it('exports to Markdown from object', async () => {
      const result = await exporter.export(
        { Title: 'Hello', Description: 'World' },
        { format: 'markdown', filename: 'doc.md' }
      );
      expect(result.contentType).toBe('text/markdown');
    });

    it('exports to HTML', async () => {
      const result = await exporter.export(
        { msg: '<script>alert(1)</script>' },
        { format: 'html', filename: 'page.html' }
      );
      expect(result.contentType).toBe('text/html');
    });

    it('exports to PDF (simplified)', async () => {
      const result = await exporter.export('simple data', { format: 'pdf', filename: 'doc.pdf' });
      expect(result.contentType).toBe('text/html');
    });

    it('throws for unsupported format', async () => {
      await expect(exporter.export('data', { format: 'xml' })).rejects.toThrow('Unsupported format: xml');
    });

    it('auto-generates filename when not provided', async () => {
      const result = await exporter.export({ a: 1 }, { format: 'json' });
      // key is sanitized: 'exports/export_<timestamp>.json' → 'exportsexport_<timestamp>.json'
      expect(result.key).toMatch(/^exportsexport_\d+\.json$/);
    });
  });

  describe('format methods', () => {
    it('_exportJSON serializes data', async () => {
      const result = await exporter._exportJSON({ a: 1, b: [2, 3] }, {});
      expect(result.contentType).toBe('application/json');
      expect(result.extension).toBe('json');
      expect(JSON.parse(result.content)).toEqual({ a: 1, b: [2, 3] });
    });

    it('_exportCSV handles array with headers', async () => {
      const data = [{ col1: 'a', col2: 'b' }, { col1: 'c', col2: 'd' }];
      const result = await exporter._exportCSV(data, {});
      expect(result.content).toBe('col1,col2\na,b\nc,d\n');
    });

    it('_exportCSV escapes commas and quotes', async () => {
      const data = [{ name: 'Doe, John', note: 'He said "hello"' }];
      const result = await exporter._exportCSV(data, {});
      expect(result.content).toContain('"Doe, John"');
      expect(result.content).toContain('"He said ""hello"""');
    });

    it('_exportCSV handles null and undefined', async () => {
      const data = [{ a: null, b: undefined, c: 1 }];
      const result = await exporter._exportCSV(data, {});
      expect(result.content).toBe('a,b,c\n,,1\n');
    });

    it('_exportCSV returns No data for empty array', async () => {
      const result = await exporter._exportCSV([], {});
      expect(result.content).toBe('No data');
    });

    it('_exportCSV returns No data for non-array', async () => {
      const result = await exporter._exportCSV({}, {});
      expect(result.content).toBe('No data');
    });

    it('_exportMarkdown formats object', async () => {
      const result = await exporter._exportMarkdown({ Key: 'Value' }, {});
      expect(result.content).toContain('## Key');
      expect(result.content).toContain('Value');
    });

    it('_exportMarkdown formats array as table', async () => {
      const data = [{ H1: 'A', H2: 1 }];
      const result = await exporter._exportMarkdown(data, {});
      expect(result.content).toContain('| H1 | H2 |');
      expect(result.content).toContain('| --- | --- |');
      expect(result.content).toContain('| A | 1 |');
    });

    it('_exportMarkdown converts scalar to string', async () => {
      const result = await exporter._exportMarkdown(42, {});
      expect(result.content).toBe('42');
    });

    it('_exportHTML escapes XSS in string data', async () => {
      const result = await exporter._exportHTML('<script>alert(1)</script>', {});
      expect(result.content).not.toContain('<script>');
      expect(result.content).toContain('&lt;script&gt;');
    });

    it('_exportHTML escapes XSS in object data', async () => {
      const result = await exporter._exportHTML({ msg: '<script>alert(1)</script>' }, {});
      expect(result.content).toContain('&lt;script&gt;');
    });

    it('_exportPDF wraps data in HTML', async () => {
      const result = await exporter._exportPDF({ data: 'test' }, {});
      expect(result.contentType).toBe('text/html');
      expect(result.extension).toBe('html');
      expect(result.content).toContain('<!DOCTYPE html>');
    });
  });

  describe('getStorageStats', () => {
    it('delegates to storage.getStats', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['f.txt']);
      fs.statSync.mockReturnValue({ size: 10, mtime: new Date(), isFile: () => true });
      const stats = await exporter.getStorageStats();
      expect(stats.provider).toBe('local');
      expect(stats.totalFiles).toBe(1);
    });
  });
});
