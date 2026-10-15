/**
 * backup-core.js — 核心数据备份（"留后手"——关键数据的容错）
 *
 * 备份"我"的运行时积累（代码有 git 兜底，数据没有——损坏 = 丢失全部积累）：
 *   教训库 / 记忆 / 会话 / 成长轨迹 / 待审核教训
 * 保留最近 7 份（backup/core-<timestamp>/）。
 *
 * 用法: node scripts/backup-core.js   （手动或 monitor 每日自动）
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, 'backup');
const KEEP = 7;

const CORE_FILES = [
  '.opencode/lessons.json',
  '.opencode/pending-lessons.json',
  '.opencode/evolution/memory.json',
  '.opencode/evolution/growth.json',
  '.opencode/evolution/actions.json',
  'data/conversations.json'
];

function log(msg) {
  console.log(`[backup] ${msg}`);
  try { fs.appendFileSync(path.join(ROOT, 'logs', 'backup.log'), `${new Date().toISOString()} ${msg}\n`); } catch (e) { /* ignore */ }
}

function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const dest = path.join(BACKUP_DIR, `core-${ts}`);
  fs.mkdirSync(dest, { recursive: true });

  let copied = 0;
  for (const rel of CORE_FILES) {
    const src = path.join(ROOT, rel);
    if (fs.existsSync(src)) {
      const target = path.join(dest, rel.replace(/[\\/]/g, '__'));
      fs.copyFileSync(src, target);
      copied++;
    }
  }

  // 清理旧备份（保留最近 KEEP 份）
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((d) => d.startsWith('core-'))
    .sort();
  while (backups.length > KEEP) {
    fs.rmSync(path.join(BACKUP_DIR, backups.shift()), { recursive: true, force: true });
  }

  log(`备份 ${copied}/${CORE_FILES.length} 个核心文件 → ${path.basename(dest)}（共 ${backups.length + (copied ? 1 : 0)} 份备份）`);
}

main();