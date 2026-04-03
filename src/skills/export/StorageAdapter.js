/**
 * Cloud Storage Adapter
 * 支持多格式导出到云存储 (S3/OSS/MinIO)
 * 生成永久链接
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 验证路径安全性 - 防止路径遍历攻击
 */
function validatePath(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

/**
 * 清理文件名 - 移除危险字符
 */
function sanitizeFilename(filename) {
  // 移除路径分隔符和特殊字符
  return filename
    .replace(/[\/\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9_\-.]/g, '_')
    .slice(0, 255); // 限制长度
}

/**
 * HTML转义
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

class StorageAdapter {
  constructor(config = {}) {
    this.config = {
      provider: config.provider || 'local', // 'local', 's3', 'oss', 'minio'
      bucket: config.bucket || 'skill-exports',
      region: config.region || 'us-east-1',
      endpoint: config.endpoint || null,
      accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      baseUrl: config.baseUrl || null,
      localPath: config.localPath || path.join(process.cwd(), 'data', 'exports'),
      ...config
    };
    
    this.client = null;
    this._initClient();
  }

  _initClient() {
    switch (this.config.provider) {
      case 's3':
        this._initS3();
        break;
      case 'oss':
        this._initOSS();
        break;
      case 'minio':
        this._initMinIO();
        break;
      case 'local':
      default:
        this._ensureLocalDir();
        break;
    }
  }

  _ensureLocalDir() {
    if (!fs.existsSync(this.config.localPath)) {
      fs.mkdirSync(this.config.localPath, { recursive: true });
    }
  }

  _initS3() {
    try {
      const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      
      this.client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey
        }
      });
      
      this.PutObjectCommand = PutObjectCommand;
      this.GetObjectCommand = GetObjectCommand;
      this.DeleteObjectCommand = DeleteObjectCommand;
      this.HeadObjectCommand = HeadObjectCommand;
      this.getSignedUrl = getSignedUrl;
      
      console.log('S3 client initialized');
    } catch (error) {
      console.warn('Failed to initialize S3 client:', error.message);
      this.config.provider = 'local';
      this._ensureLocalDir();
    }
  }

  _initOSS() {
    try {
      const OSS = require('ali-oss');
      
      this.client = new OSS({
        region: this.config.region,
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        bucket: this.config.bucket,
        endpoint: this.config.endpoint
      });
      
      console.log('OSS client initialized');
    } catch (error) {
      console.warn('Failed to initialize OSS client:', error.message);
      this.config.provider = 'local';
      this._ensureLocalDir();
    }
  }

  _initMinIO() {
    try {
      const MinIO = require('minio');
      
      this.client = new MinIO.Client({
        endPoint: this.config.endpoint || 'localhost',
        port: this.config.port || 9000,
        useSSL: this.config.useSSL || false,
        accessKey: this.config.accessKeyId,
        secretKey: this.config.secretAccessKey
      });
      
      console.log('MinIO client initialized');
    } catch (error) {
      console.warn('Failed to initialize MinIO client:', error.message);
      this.config.provider = 'local';
      this._ensureLocalDir();
    }
  }

  /**
   * 上传文件到云存储
   */
  async upload(file, options = {}) {
    const { 
      key, 
      contentType, 
      metadata = {},
      expiresIn = 365 * 24 * 60 * 60 // 1 year default
    } = options;
    
    const fileKey = key || this._generateKey(file.originalname || 'export');
    
    switch (this.config.provider) {
      case 's3':
        return this._uploadToS3(file, fileKey, contentType, metadata);
      case 'oss':
        return this._uploadToOSS(file, fileKey, contentType, metadata);
      case 'minio':
        return this._uploadToMinIO(file, fileKey, contentType, metadata);
      case 'local':
      default:
        return this._uploadToLocal(file, fileKey);
    }
  }

  async _uploadToS3(file, key, contentType, metadata) {
    const buffer = Buffer.isBuffer(file) ? file : file.buffer;
    
    const command = new this.PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      Metadata: metadata
    });
    
    await this.client.send(command);
    
    const url = this.config.baseUrl 
      ? `${this.config.baseUrl}/${key}`
      : `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
    
    return {
      key,
      url,
      bucket: this.config.bucket,
      provider: 's3',
      size: buffer.length
    };
  }

  async _uploadToOSS(file, key, contentType, metadata) {
    const buffer = Buffer.isBuffer(file) ? file : file.buffer;
    
    const result = await this.client.put(key, buffer, {
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        ...metadata
      }
    });
    
    return {
      key,
      url: result.url,
      bucket: this.config.bucket,
      provider: 'oss',
      size: buffer.length
    };
  }

  async _uploadToMinIO(file, key, contentType, metadata) {
    const buffer = Buffer.isBuffer(file) ? file : file.buffer;
    
    await this.client.putObject(
      this.config.bucket,
      key,
      buffer,
      buffer.length,
      { 'Content-Type': contentType || 'application/octet-stream' }
    );
    
    const url = this.config.endpoint
      ? `${this.config.useSSL ? 'https' : 'http'}://${this.config.endpoint}:${this.config.port || 9000}/${this.config.bucket}/${key}`
      : `/${this.config.bucket}/${key}`;
    
    return {
      key,
      url,
      bucket: this.config.bucket,
      provider: 'minio',
      size: buffer.length
    };
  }

  _uploadToLocal(file, key) {
    const buffer = Buffer.isBuffer(file) ? file : (file.buffer || fs.readFileSync(file.path || file));
    
    // 清理key防止路径遍历
    const sanitizedKey = sanitizeFilename(key);
    const filePath = path.join(this.config.localPath, sanitizedKey);
    
    // 验证路径安全
    if (!validatePath(this.config.localPath, filePath)) {
      throw new Error('Invalid file path: potential path traversal attack');
    }
    
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, buffer);
    
    return {
      key: sanitizedKey,
      url: `/api/skills/export/local/${encodeURIComponent(sanitizedKey)}`,
      path: filePath,
      provider: 'local',
      size: buffer.length
    };
  }

  /**
   * 生成预签名URL（用于临时访问）
   */
  async getSignedURL(key, options = {}) {
    const { expiresIn = 3600 } = options; // 1 hour default
    
    switch (this.config.provider) {
      case 's3':
        return this._getS3SignedURL(key, expiresIn);
      case 'oss':
        return this._getOSSSignedURL(key, expiresIn);
      case 'minio':
        return this._getMinIOSignedURL(key, expiresIn);
      case 'local':
      default:
        return { url: `/api/skills/export/local/${key}` };
    }
  }

  async _getS3SignedURL(key, expiresIn) {
    const command = new this.GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    });
    
    const url = await this.getSignedUrl(this.client, command, { expiresIn });
    
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async _getOSSSignedURL(key, expiresIn) {
    const url = this.client.signatureUrl(key, {
      expires: expiresIn
    });
    
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async _getMinIOSignedURL(key, expiresIn) {
    const url = await this.client.presignedGetObject(this.config.bucket, key, expiresIn);
    
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  /**
   * 删除文件
   */
  async delete(key) {
    switch (this.config.provider) {
      case 's3':
        return this._deleteFromS3(key);
      case 'oss':
        return this._deleteFromOSS(key);
      case 'minio':
        return this._deleteFromMinIO(key);
      case 'local':
      default:
        return this._deleteFromLocal(key);
    }
  }

  async _deleteFromS3(key) {
    const command = new this.DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    });
    
    await this.client.send(command);
    return { deleted: true };
  }

  async _deleteFromOSS(key) {
    await this.client.delete(key);
    return { deleted: true };
  }

  async _deleteFromMinIO(key) {
    await this.client.removeObject(this.config.bucket, key);
    return { deleted: true };
  }

  async _deleteFromLocal(key) {
    // 清理key防止路径遍历
    const sanitizedKey = sanitizeFilename(key);
    const filePath = path.join(this.config.localPath, sanitizedKey);
    
    // 验证路径安全
    if (!validatePath(this.config.localPath, filePath)) {
      throw new Error('Invalid file path: potential path traversal attack');
    }
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { deleted: true };
    }
    return { deleted: false, error: 'File not found' };
  }

  /**
   * 检查文件是否存在
   */
  async exists(key) {
    switch (this.config.provider) {
      case 's3':
        return this._existsInS3(key);
      case 'oss':
        return this._existsInOSS(key);
      case 'minio':
        return this._existsInMinIO(key);
      case 'local':
      default:
        return this._existsInLocal(key);
    }
  }

  async _existsInS3(key) {
    try {
      const command = new this.HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  async _existsInOSS(key) {
    try {
      await this.client.head(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  async _existsInMinIO(key) {
    try {
      await this.client.statObject(this.config.bucket, key);
      return true;
    } catch (error) {
      return false;
    }
  }

  async _existsInLocal(key) {
    // 清理key防止路径遍历
    const sanitizedKey = sanitizeFilename(key);
    const filePath = path.join(this.config.localPath, sanitizedKey);
    
    // 验证路径安全
    if (!validatePath(this.config.localPath, filePath)) {
      return false;
    }
    
    return fs.existsSync(filePath);
  }

  /**
   * 列出文件
   */
  async list(prefix = '', options = {}) {
    const { limit = 100, marker = '' } = options;
    
    switch (this.config.provider) {
      case 's3':
        return this._listS3(prefix, limit, marker);
      case 'oss':
        return this._listOSS(prefix, limit, marker);
      case 'minio':
        return this._listMinIO(prefix, limit);
      case 'local':
      default:
        return this._listLocal(prefix, limit);
    }
  }

  async _listS3(prefix, limit, marker) {
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    
    const command = new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: prefix,
      MaxKeys: limit,
      StartAfter: marker
    });
    
    const response = await this.client.send(command);
    
    return {
      files: (response.Contents || []).map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified
      })),
      isTruncated: response.IsTruncated,
      nextMarker: response.NextContinuationToken
    };
  }

  async _listOSS(prefix, limit, marker) {
    const result = await this.client.list({
      prefix,
      'max-keys': limit,
      marker
    });
    
    return {
      files: (result.objects || []).map(item => ({
        key: item.name,
        size: item.size,
        lastModified: item.lastModified
      })),
      isTruncated: result.isTruncated,
      nextMarker: result.nextMarker
    };
  }

  async _listMinIO(prefix, limit) {
    const stream = this.client.listObjects(this.config.bucket, prefix, true);
    const files = [];
    
    for await (const obj of stream) {
      if (files.length >= limit) break;
      files.push({
        key: obj.name,
        size: obj.size,
        lastModified: obj.lastModified
      });
    }
    
    return { files, isTruncated: false };
  }

  async _listLocal(prefix, limit) {
    // 清理prefix防止路径遍历
    const sanitizedPrefix = prefix ? sanitizeFilename(prefix) : '';
    const dirPath = path.join(this.config.localPath, sanitizedPrefix);
    
    // 验证路径安全
    if (!validatePath(this.config.localPath, dirPath)) {
      throw new Error('Invalid directory path: potential path traversal attack');
    }
    
    if (!fs.existsSync(dirPath)) {
      return { files: [], isTruncated: false };
    }
    
    const items = fs.readdirSync(dirPath);
    const files = [];
    
    for (const item of items.slice(0, limit)) {
      const itemPath = path.join(dirPath, item);
      
      // 验证路径安全
      if (!validatePath(this.config.localPath, itemPath)) {
        continue;
      }
      
      const stats = fs.statSync(itemPath);
      
      if (stats.isFile()) {
        files.push({
          key: path.join(sanitizedPrefix, item).replace(/\\/g, '/'),
          size: stats.size,
          lastModified: stats.mtime
        });
      }
    }
    
    return { files, isTruncated: items.length > limit };
  }

  /**
   * 获取存储统计信息
   */
  async getStats() {
    try {
      const listResult = await this.list('', { limit: 1000 });
      
      let totalSize = 0;
      for (const file of listResult.files) {
        totalSize += file.size || 0;
      }
      
      return {
        provider: this.config.provider,
        bucket: this.config.bucket,
        totalFiles: listResult.files.length,
        totalSize,
        hasMore: listResult.isTruncated
      };
    } catch (error) {
      return {
        provider: this.config.provider,
        error: error.message
      };
    }
  }

  /**
   * 生成唯一的key
   */
  _generateKey(filename) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext).replace(/[^a-zA-Z0-9]/g, '_');
    
    return `exports/${timestamp}_${basename}_${random}${ext}`;
  }
}

/**
 * 多格式导出器
 */
class MultiFormatExporter {
  constructor(storageConfig = {}) {
    this.storage = new StorageAdapter(storageConfig);
    this.formats = {
      json: this._exportJSON.bind(this),
      csv: this._exportCSV.bind(this),
      markdown: this._exportMarkdown.bind(this),
      html: this._exportHTML.bind(this),
      pdf: this._exportPDF.bind(this)
    };
  }

  /**
   * 导出数据到指定格式并上传到云存储
   */
  async export(data, options = {}) {
    const { format = 'json', filename, metadata = {} } = options;
    
    const exportFn = this.formats[format.toLowerCase()];
    if (!exportFn) {
      throw new Error(`Unsupported format: ${format}`);
    }
    
    const { content, contentType, extension } = await exportFn(data, options);
    const finalFilename = filename || `export_${Date.now()}.${extension}`;
    
    const result = await this.storage.upload(
      Buffer.from(content),
      {
        key: `exports/${finalFilename}`,
        contentType,
        metadata: {
          ...metadata,
          exportedAt: new Date().toISOString(),
          format
        }
      }
    );
    
    // 获取永久链接
    const permanentUrl = await this.storage.getSignedURL(result.key, {
      expiresIn: 365 * 24 * 60 * 60 // 1 year
    });
    
    return {
      ...result,
      permanentUrl: permanentUrl.url,
      expiresAt: permanentUrl.expiresAt,
      format,
      contentType
    };
  }

  async _exportJSON(data, options) {
    const content = JSON.stringify(data, null, 2);
    return {
      content,
      contentType: 'application/json',
      extension: 'json'
    };
  }

  async _exportCSV(data, options) {
    let csv = '';
    
    if (Array.isArray(data) && data.length > 0) {
      // 表头
      const headers = Object.keys(data[0]);
      csv += headers.join(',') + '\n';
      
      // 数据行
      for (const row of data) {
        const values = headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value);
        });
        csv += values.join(',') + '\n';
      }
    } else {
      csv = 'No data';
    }
    
    return {
      content: csv,
      contentType: 'text/csv',
      extension: 'csv'
    };
  }

  async _exportMarkdown(data, options) {
    let md = '';
    
    if (typeof data === 'object' && !Array.isArray(data)) {
      // 对象转Markdown
      for (const [key, value] of Object.entries(data)) {
        md += `## ${key}\n\n`;
        md += typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        md += '\n\n';
      }
    } else if (Array.isArray(data) && data.length > 0) {
      // 数组转Markdown表格
      const headers = Object.keys(data[0]);
      md += '| ' + headers.join(' | ') + ' |\n';
      md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
      
      for (const row of data) {
        md += '| ' + headers.map(h => row[h] || '').join(' | ') + ' |\n';
      }
    } else {
      md = String(data);
    }
    
    return {
      content: md,
      contentType: 'text/markdown',
      extension: 'md'
    };
  }

  async _exportHTML(data, options) {
    let html = '';
    
    if (typeof data === 'object') {
      // 转义JSON数据中的HTML特殊字符
      const escapedJson = escapeHtml(JSON.stringify(data, null, 2));
      
      html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; script-src 'none';">
  <title>Data Export</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .json { background: #f5f5f5; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Data Export</h1>
  <pre class="json">${escapedJson}</pre>
</body>
</html>`;
    } else {
      html = `<html><body><pre>${escapeHtml(String(data))}</pre></body></html>`;
    }
    
    return {
      content: html,
      contentType: 'text/html',
      extension: 'html'
    };
  }

  async _exportPDF(data, options) {
    // 注意：实际的PDF生成需要使用puppeteer或pdf-lib等库
    // 这里返回一个简单的实现
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>Data Export</h1>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>`;
    
    return {
      content: html,
      contentType: 'text/html',
      extension: 'html' // 简化处理，实际应生成PDF
    };
  }

  /**
   * 获取支持的格式
   */
  getSupportedFormats() {
    return Object.keys(this.formats);
  }

  /**
   * 获取存储统计
   */
  async getStorageStats() {
    return this.storage.getStats();
  }
}

module.exports = { StorageAdapter, MultiFormatExporter };
