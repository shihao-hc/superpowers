module.exports = {
  id: 'MISSING_BODY_LIMIT',
  severity: 'LOW',
  cwe: 'CWE-770',
  description: 'express.json/urlencoded 未显式设置 limit，建议根据业务显式配置',
  enabled: true,
  patterns: [
    /(?:express\.json|express\.urlencoded|bodyParser\.json)\s*\(/
  ],
  excludePatterns: [
    /limit\s*[:=]/,
  ],
  references: ['CWE-770'],
  since: '2026-06-28',
};
