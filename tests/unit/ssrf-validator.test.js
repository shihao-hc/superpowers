const { validateURL } = require('../../src/utils/SSRFValidator');

function validateUrl(url, opts) {
  const result = validateURL(url, opts);
  return result.allowed;
}

describe('SSRFValidator', () => {
  const allowed = [
    ['https://api.example.com/v1/data', 'public HTTPS'],
    ['http://example.com', 'public HTTP'],
    ['https://8.8.8.8/dns', 'public IP HTTPS'],
    ['https://cdn.example.com:443/path', 'HTTPS with port'],
  ];

  const blockedMetadata = [
    ['http://169.254.169.254/latest/meta-data/', 'AWS metadata IP'],
    ['https://169.254.169.254/latest/', 'AWS metadata HTTPS'],
    ['http://100.100.100.200/metadata', 'Aliyun metadata IP'],
    ['http://metadata.google.internal/computeMetadata/v1/', 'GCP metadata hostname'],
  ];

  const blockedPrivate = [
    ['http://10.0.0.1/admin', '10.x private'],
    ['http://172.16.0.1/config', '172.16 private'],
    ['http://172.31.255.255/test', '172.31 private'],
    ['http://192.168.1.1/dashboard', '192.168 private'],
    ['http://127.0.0.1/health', 'localhost'],
    ['http://127.127.127.127/test', '127.x loopback'],
    ['http://0.0.0.0/test', 'all zeros'],
    ['http://[::1]/health', 'IPv6 loopback'],
    ['http://[::ffff:127.0.0.1]/test', 'IPv4 mapped IPv6 loopback'],
  ];

  const blockedInvalid = [
    ['ftp://files.example.com/data', 'FTP not allowed'],
    ['file:///etc/passwd', 'file protocol'],
    ['gopher://internal:8080/redirect', 'gopher protocol'],
    ['', 'empty string'],
    ['not-a-url', 'not a URL'],
  ];

  test.each(allowed)('allows %s (%s)', (url) => {
    expect(validateUrl(url)).toBe(true);
  });

  test.each(blockedMetadata)('blocks metadata %s (%s)', (url) => {
    expect(validateUrl(url)).toBe(false);
  });

  const blockedMetadataMore = [
    ['http://169.254.170.2/creds', 'AWS ECS task metadata endpoint'],
    ['http://169.254.169.253/x', '169.254.169.253'],
    ['http://169.254.100.5/x', '169.254.0.0/16 link-local (cloud metadata whole range)'],
    ['http://100.64.0.1/x', 'CGNAT 100.64.0.0/10'],
    ['http://100.127.255.254/x', 'CGNAT upper bound'],
    ['http://[fc00::1]/x', 'IPv6 ULA fc00::/7'],
    ['http://[fd12:3456::1]/x', 'IPv6 ULA fd00::/7'],
    ['http://[::ffff:169.254.169.254]/x', 'IPv4-mapped metadata'],
    ['http://[::ffff:100.64.0.1]/x', 'IPv4-mapped CGNAT'],
  ];
  test.each(blockedMetadataMore)('blocks metadata/link-local %s (%s)', (url) => {
    expect(validateUrl(url)).toBe(false);
  });

  test.each(blockedPrivate)('blocks private IP %s (%s)', (url) => {
    expect(validateUrl(url)).toBe(false);
  });

  test.each(blockedInvalid)('blocks invalid protocol %s (%s)', (url) => {
    expect(validateUrl(url)).toBe(false);
  });

  test('allows private IP with allowPrivate option', () => {
    expect(validateUrl('http://192.168.1.1/test', { allowPrivate: true })).toBe(true);
  });

  test('allows loopback with allowLoopback option', () => {
    expect(validateUrl('http://127.0.0.1/health', { allowLoopback: true })).toBe(true);
  });

  test('blocks loopback even with allowPrivate but not allowLoopback', () => {
    expect(validateUrl('http://127.0.0.1/health', { allowPrivate: true })).toBe(false);
  });

  test('blocks metadata even with allowPrivate and allowLoopback', () => {
    expect(validateUrl('http://169.254.169.254/latest/', { allowPrivate: true, allowLoopback: true })).toBe(false);
  });

  test('blocks metadata.google.internal even with allowLoopback', () => {
    expect(validateUrl('http://metadata.google.internal/compute/', { allowLoopback: true })).toBe(false);
  });

  test('blocks localhost hostname without allowLoopback', () => {
    expect(validateUrl('http://localhost/service')).toBe(false);
  });
});
