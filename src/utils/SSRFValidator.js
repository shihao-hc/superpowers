const { URL } = require('url');
const net = require('net');

const BLOCKED_HOSTS = [
  '169.254.169.254',
  '100.100.100.200',
  'metadata.google.internal',
  'metadata.google.internal.'
];

const PRIVATE_IP_RANGES = [
  // IPv4 dotted
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  // IPv6 native
  /^::1$/,
  /^0:0:0:0:0:0:0:1$/,
  /^::$/,
  /^fe80:/i,
  // IPv4-mapped IPv6 (dotted, e.g. ::ffff:127.0.0.1)
  /^::ffff:127\./i,
  /^::ffff:10\./i,
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:0\./i,
  // IPv4-mapped IPv6 (hex, Node URL parser compresses, e.g. ::ffff:7f00:1)
  /^::ffff:7f00:/i,
  /^::ffff:a00:/i,
  /^::ffff:ac1[0-9a-f]:/i,
  /^::ffff:c0a8:/i,
  /^::ffff:0:/i
];

function isLoopback(hostname) {
  return /^127\./.test(hostname) ||
    hostname === '::1' ||
    hostname === '0:0:0:0:0:0:0:1' ||
    hostname === '::' ||
    /^::ffff:127\./i.test(hostname) ||
    /^::ffff:7f00:/i.test(hostname);
}

function isPrivateIP(hostname) {
  return PRIVATE_IP_RANGES.some((r) => r.test(hostname));
}

function isBlockedHost(hostname) {
  return BLOCKED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

function validateURL(urlString, options = {}) {
  const allowPrivate = options.allowPrivate || false;
  const allowLoopback = options.allowLoopback || false;

  if (!urlString || typeof urlString !== 'string') {
    return { allowed: false, reason: 'URL is required' };
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { allowed: false, reason: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { allowed: false, reason: 'Only HTTP/HTTPS protocols allowed' };
  }

  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (isBlockedHost(hostname)) {
    return { allowed: false, reason: 'Access to metadata service blocked' };
  }

  if (net.isIP(hostname)) {
    const loopback = isLoopback(hostname);
    if (loopback) {
      if (!allowLoopback) {
        return { allowed: false, reason: 'Access to loopback address blocked' };
      }
    } else if (!allowPrivate && isPrivateIP(hostname)) {
      return { allowed: false, reason: 'Access to private IP range blocked' };
    }
  } else {
    const isLocalhost = hostname === 'localhost' || hostname === 'localhost.' || hostname.endsWith('.local') || hostname.endsWith('.local.');
    if (isLocalhost && !allowLoopback) {
      return { allowed: false, reason: 'Access to localhost blocked' };
    }
  }

  return { allowed: true, sanitizedUrl: urlString };
}

module.exports = { validateURL, isPrivateIP, isBlockedHost, isLoopback, PRIVATE_IP_RANGES, BLOCKED_HOSTS };
