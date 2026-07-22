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
  suggest: '移除 rejectUnauthorized: false 的设置，确保 TLS 证书验证始终启用。对于自签名证书，应将 CA 证书添加到信任存储而非禁用验证。移除 NODE_TLS_REJECT_UNAUTHORIZED=0 的环境变量设置。',
  references: ['CWE-295'],
  since: '2026-06-28',
};
