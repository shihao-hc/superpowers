module.exports = {
  id: 'SSRF',
  severity: 'MEDIUM',
  cwe: 'CWE-918',
  description: '用户可控 URL 传入 fetch/request，可能导致 SSRF',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:fetch|axios|request|got|superagent)\s*\(/.test(line)) {
        if (/\$\{|['"`]\s*\+/.test(line) && /req\.|\.query|\.params|\.body|\.url|input|callbackUrl|redirectUrl|returnUrl/i.test(line)) {
          if (/api\.|BASE_URL|baseURL|API_ENDPOINT|ALLOWED_DOMAIN|\.env\./i.test(line)) continue;
          report('MEDIUM', 'SSRF', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '用户可控 URL 传入 fetch/request，可能导致 SSRF');
        }
      }
    }
  },
  suggest: '对用户提供的 URL 进行白名单验证：解析 URL 并检查 hostname 是否在允许的域名列表内；禁止直接使用用户输入作为请求目标；使用 URL 解析库提取并校验 hostname 部分。考虑使用 URL allowlist 和协议限制。',
  references: ['CWE-918'],
  since: '2026-06-28',
};
