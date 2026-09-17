/**
 * SecurityScanExecutor - 确定性安全扫描器（不依赖 LLM）
 * 扫描 src/server 下代码，查找硬编码密钥/危险函数等已知风险模式
 * 供"确定性任务优先"架构使用：用户请求安全审计时系统直接执行，模型只做总结
 */
const fs = require('fs');
const path = require('path');

const SCAN_DIRS = ['src', 'server'];

// 危险模式（只保留低误报的明确模式）
// 诚实：eval 调用无法用正则可靠判断（字符串/注释/Playwright $$eval 均误报），由 eslint no-eval 规则负责
const PATTERNS = [
  {
    type: 'hardcoded-secret',
    label: '硬编码密钥',
    regex: /(?:JWT_SECRET|API_KEY|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|DATABASE_URL|CLIENT_SECRET)\s*=\s*["'][^"'\s]{8,}["']/gi
  },
  {
    type: 'shell-injection',
    label: '命令注入风险（exec+模板变量）',
    regex: /exec(?:Sync)?\s*\(\s*[`"][^`"]*\$\{/g
  }
];

class SecurityScanExecutor {
  /**
   * 执行安全扫描
   * @param {Object} params - { root: 项目根目录, limit: 最大扫描文件数 }
   * @returns {Promise<Object>} { ok, result: { type, findings: [{file,line,type,snippet}] } }
   */
  static async execute(params = {}) {
    const root = params.root || process.cwd();
    const limit = params.limit || 200;
    try {
      const files = [];
      for (const dir of SCAN_DIRS) {
        this._collectFiles(path.join(root, dir), files, limit - files.length);
        if (files.length >= limit) { break; }
      }
      const findings = [];
      for (const file of files) {
        let content;
        try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
        for (const p of PATTERNS) {
          const regex = new RegExp(p.regex.source, p.regex.flags);
          let m;
          while ((m = regex.exec(content)) !== null) {
            const rel = path.relative(root, file).replace(/\\/g, '/');
            const line = content.substring(0, m.index).split('\n').length;
            const lineStart = content.lastIndexOf('\n', m.index) + 1;
            const lineEnd = content.indexOf('\n', m.index);
            const snippet = content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd).trim().slice(0, 120);
            // 去重（同文件同类型同行）
            if (!findings.some((f) => f.file === rel && f.type === p.type && f.line === line)) {
              findings.push({ file: rel, line, type: p.type, label: p.label, snippet });
            }
          }
        }
      }
      findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
      return {
        ok: true,
        result: {
          type: 'security-scan',
          scannedFiles: files.length,
          findings
        }
      };
    } catch (e) {
      return { ok: false, error: `Security scan failed: ${e.message}` };
    }
  }

  static _collectFiles(dir, out, remaining) {
    if (remaining <= 0) { return; }
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (remaining <= 0) { return; }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/node_modules|\.git|\.opencode|uploads|data|logs|dist|build/.test(entry.name)) { continue; }
        if (/^tests?$/i.test(entry.name) && !/server/.test(entry.name)) { continue; }
        this._collectFiles(full, out, remaining);
      } else if (/\.(js|ts)$/.test(entry.name) && !/\.test\./.test(entry.name) && !/\.spec\./.test(entry.name)) {
        out.push(full);
        remaining--;
      }
    }
  }
}

module.exports = { SecurityScanExecutor };