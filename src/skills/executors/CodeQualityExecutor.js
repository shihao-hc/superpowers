/**
 * CodeQualityExecutor - 确定性代码质量检查（不依赖 LLM）
 * 用项目已装的 eslint 扫描 src/server，报告错误/警告统计
 * 供"确定性任务优先"架构使用：用户请求代码检查时系统直接执行
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TARGET_DIRS = ['src', 'server'];

class CodeQualityExecutor {
  /**
   * 执行代码质量检查
   * @param {Object} params - { root: 项目根目录 }
   * @returns {Promise<Object>} { ok, result: { type, scannedFiles, errors, warnings, issues } }
   */
  static async execute(params = {}) {
    const root = params.root || process.cwd();
    try {
      const eslintBin = process.platform === 'win32'
        ? path.join(root, 'node_modules', '.bin', 'eslint.cmd')
        : path.join(root, 'node_modules', '.bin', 'eslint');
      if (!fs.existsSync(eslintBin)) {
        return { ok: false, error: 'eslint not installed in this project' };
      }
      const targets = TARGET_DIRS.map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));
      if (targets.length === 0) {
        return { ok: true, result: { type: 'code-quality', scannedFiles: 0, errors: 0, warnings: 0, issues: [] } };
      }
      let data;
      try {
        const out = execFileSync('cmd.exe', ['/c', eslintBin, ...targets, '--format', 'json', '--max-warnings', '9999'], {
          cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']
        });
        data = JSON.parse(out);
      } catch (e) {
        // eslint 检出问题时退出码非 0，但 --format json 输出在 stdout
        const out = e.stdout || '';
        try { data = JSON.parse(out); } catch { return { ok: false, error: `eslint failed: ${e.message}` }; }
      }
      let errors = 0;
      let warnings = 0;
      const issues = [];
      for (const f of data || []) {
        const e = f.errorCount || 0;
        const w = f.warningCount || 0;
        errors += e;
        warnings += w;
        if (e + w > 0) {
          issues.push({ file: path.relative(root, f.filePath).replace(/\\/g, '/'), errors: e, warnings: w });
        }
      }
      issues.sort((a, b) => (b.errors + b.warnings) - (a.errors + a.warnings));
      return {
        ok: true,
        result: { type: 'code-quality', scannedFiles: (data || []).length, errors, warnings, issues: issues.slice(0, 20) }
      };
    } catch (e) {
      return { ok: false, error: `Code quality check failed: ${e.message}` };
    }
  }
}

module.exports = { CodeQualityExecutor };