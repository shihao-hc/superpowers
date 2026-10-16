/**
 * pinCwd.js — 入口处把工作目录钉到项目根（治「cwd 依赖」类根因）
 *
 * 背景：src/ 有 100+ 处用 `process.cwd()` 派生路径（教训库/记忆/executor 输出/evolution 等）。
 * 长驻进程若被以**非项目根 cwd** 启动（任务计划 Start In=N/A、手动从别处启动），这些路径会写错位置
 * ——同类根因曾致保活链全断（keepalive 从 System32 启动）。逐个改 100+ 处不现实，且会与大量
 * "chdir 到临时目录做隔离"的测试冲突（反而扩大风险）。
 *
 * 治本且轻量：在**长驻入口最顶部**一次性 `process.chdir(项目根)`，下游全部 `process.cwd()` 随之正确。
 * 仅固定长驻进程（server），不改变模块本身语义（被当库以其他 cwd 使用时不受影响）。
 *
 * 用法（入口最顶部，**早于任何依赖 cwd 的 require**）：
 *   require('../src/utils/pinCwd').pinCwd();
 */
const path = require('path');

// src/utils -> 项目根（锚定 __dirname，不受 cwd 影响）
const ROOT = path.join(__dirname, '..', '..');

/**
 * 把当前进程的工作目录钉到项目根（幂等）。
 * @param {string} [target] 目标目录，默认项目根
 * @returns {{ok:boolean, root:string, error?:string}}
 */
function pinCwd(target = ROOT) {
  try {
    if (process.cwd() !== target) { process.chdir(target); }
    return { ok: true, root: target };
  } catch (e) {
    return { ok: false, root: target, error: e.message };
  }
}

module.exports = { pinCwd, ROOT };
