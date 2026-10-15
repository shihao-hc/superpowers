import { tool } from "@opencode-ai/plugin";
import { execSync } from "node:child_process";

/**
 * reverse-tool plugin — 把专属逆向工具 reverse.js 暴露为 opencode 一等工具。
 *
 * 背景：reverse.js（REA 逆向工程）藏在 scripts/ 里，靠 AGENTS.md 的「场景→工具映射」
 * 提醒使用——提醒会失效（真实教训：验证工具时只跑了 --help 没跑真实目标）。
 * 暴露为一等工具后，它的 description 会注入工具列表，AI 在决策时自然可见可调用，
 * 而不是藏在脚本目录里靠 recall。
 */
export const ReverseToolPlugin = async ({ directory }) => {
  return {
    tool: {
      reverse: tool({
        description:
          "逆向分析代码/网页/系统结构（专属 REA 工具）。理解陌生代码时先用它看结构——函数/圈复杂度/依赖图/调用图/循环依赖/死代码候选/危险模式(eval/命令注入/硬编码密钥)，替代徒手逐行 read/grep。target 传：文件或目录路径（代码逆向）、http(s) URL（网页逆向）、或 '--system'（系统进程/端口状态）。",
        args: {
          target: tool.schema.string(),
        },
        async execute(args, context) {
          const target = String(args.target || "").trim();
          if (!target) return "错误：需要 target 参数（文件/目录路径、URL、或 '--system'）";
          const isSystem = target === "--system";
          const isWeb = /^https?:\/\//i.test(target);
          const flag = isSystem ? "--system" : isWeb ? "--web" : "";
          const cwd = context.directory || directory;
          const cmd = `node scripts/reverse.js ${JSON.stringify(target)} ${flag}`.trim();
          try {
            return execSync(cmd, {
              cwd,
              encoding: "utf8",
              timeout: 120000,
              maxBuffer: 10 * 1024 * 1024,
            });
          } catch (e) {
            const err = e || {};
            return `reverse 执行失败: ${err.message || e}${
              err.stdout ? "\n--- stdout ---\n" + err.stdout : ""
            }${err.stderr ? "\n--- stderr ---\n" + err.stderr : ""}`;
          }
        },
      }),
    },
  };
};
