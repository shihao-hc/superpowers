const path = require('path');

function sanitizeFilename(filename) {
  if (typeof filename !== 'string') {return '';}
  return filename
    .replace(/[/\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 255);
}

function strictId(id) {
  if (typeof id !== 'string') {return '';}
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

function ensureInDirectory(targetPath, allowedDir) {
  const resolved = path.resolve(targetPath);
  const allowed = path.resolve(allowedDir);
  if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

module.exports = { sanitizeFilename, strictId, ensureInDirectory };
