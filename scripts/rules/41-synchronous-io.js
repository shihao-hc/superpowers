module.exports = {
  id: 'SYNCHRONOUS_IO',
  severity: 'LOW',
  cwe: 'CWE-1104',
  description: '在主应用代码中使用同步文件系统调用会影响性能',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    if (/scripts|test|config|build|tools/.test(relativePath)) return;
    // 根目录文件均为一次性工具/诊断/迁移脚本，同步 IO 是合理用法
    if (!/[/\\]/.test(relativePath)) return;
    // 已知诊断/评估/生成脚本（位于 src/ 等子目录但仍是工具性质）
    if (/learnEval|brain-full-check|OpenAPIGenerator|render-graphs|\.debug\./.test(relativePath)) return;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bfs\.(readFileSync|writeFileSync|existsSync|mkdirSync|readdirSync|unlinkSync|rmSync|cpSync|renameSync)\s*\(/.test(line)) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        report('LOW', 'SYNCHRONOUS_IO', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '同步文件系统调用可能阻塞事件循环，考虑使用异步 API');
        break;
      }
    }
  },
  suggest: '将 fs.readFileSync/writeFileSync 等同步调用替换为 fs.promises 的对应异步版本（readFile/writeFile），并在调用处加 await。',
  references: ['CWE-1104'],
  since: '2026-06-28',
};
