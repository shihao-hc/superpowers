module.exports = {
  id: 'WEAK_TLS',
  severity: 'HIGH',
  cwe: 'CWE-295',
  description: 'TLS 证书验证被禁用（rejectUnauthorized: false 或 NODE_TLS_REJECT_UNAUTHORIZED=0）',
  enabled: true,
  patterns: [
    /rejectUnauthorized\s*[:=]\s*(?:false|null|0)/,
    /NODE_TLS_REJECT_UNAUTHORIZED\s*[:=]\s*['"`]?0['"`]?/,
  ],
  excludePatterns: [],
  references: ['CWE-295'],
  since: '2026-06-28',
};
