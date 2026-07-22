module.exports = {
  id: 'DEBUG_MODE_PRODUCTION',
  severity: 'MEDIUM',
  cwe: 'CWE-489',
  description: '代码中启用了 debug/development 模式，可能在生产环境泄露敏感信息',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/app\.set\s*\(\s*['"]env['"]\s*,\s*['"]development['"]/.test(line)) {
        report('MEDIUM', 'DEBUG_MODE_PRODUCTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '应用设置为 development 模式');
      }
      if (/\bdebug\s*[=:]\s*true\b/.test(line)) {
        if (/^\s*(?:\/\/|\*)/.test(line)) continue;
        if (!/debug\s*[=:]\s*true\s*[,;})\]]/.test(line)) continue;
        report('LOW', 'DEBUG_MODE_PRODUCTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'debug 模式已启用');
      }
    }
  },
  suggest: '移除或通过环境变量控制 debug 模式：app.set("env", process.env.NODE_ENV || "production")。确保 debug: true 仅在生产环境配置中被覆盖。使用 debug 库（npm debug）替代硬编码调试标志，通过环境变量 DEBUG=* 动态控制。',
  references: ['CWE-489'],
  since: '2026-06-29',
};
