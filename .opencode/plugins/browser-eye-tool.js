import { tool } from "@opencode-ai/plugin";
import { execSync } from "node:child_process";

/**
 * browser-eye-tool plugin — 把「手眼」工具 browser-eye.js 暴露为 opencode 一等工具。
 *
 * 背景同 reverse-tool：browser-eye.js 藏在 scripts/ 里靠 AGENTS.md 映射提醒使用。
 * 暴露为一等工具后，description 注入工具列表，AI 在「看网页/图/检查站点」时自然可见可调用。
 */
export const BrowserEyeToolPlugin = async ({ directory }) => {
  return {
    tool: {
      browser_eye: tool({
        description:
          "打开网页或本地图片并用「手眼」理解。需要看网页/图/检查站点时用它（DOM 精确提取 + 视觉/中文理解），替代徒手 webfetch 或盲猜。target 传 http(s) URL 或本地图片路径（自动识别）。action 可选：extract=DOM结构化提取（精确零模型）、text=页面全文、ocr=文字提取、describe=描述、identify=识别；不填则默认中文理解页面。",
        args: {
          target: tool.schema.string(),
          action: tool.schema.string(),
        },
        async execute(args, context) {
          const target = String(args.target || "").trim();
          const action = String(args.action || "").trim().toLowerCase();
          if (!target) return "错误：需要 target（http(s) URL 或本地图片路径）";

          const isImage = !/^https?:\/\//i.test(target);
          const base = isImage ? `--image=${target}` : target;
          const flags = [];
          if (action === "extract") flags.push("--extract");
          else if (action === "text") flags.push("--text");
          else if (["ocr", "describe", "identify", "webpage"].includes(action)) flags.push(`--task=${action}`);

          const cwd = context.directory || directory;
          const cmd = `node scripts/browser-eye.js ${JSON.stringify(base)} ${flags.join(" ")}`.trim();
          try {
            return execSync(cmd, {
              cwd,
              encoding: "utf8",
              timeout: 180000,
              maxBuffer: 20 * 1024 * 1024,
            });
          } catch (e) {
            const err = e || {};
            return `browser_eye 执行失败: ${err.message || e}${
              err.stdout ? "\n--- stdout ---\n" + err.stdout : ""
            }${err.stderr ? "\n--- stderr ---\n" + err.stderr : ""}`;
          }
        },
      }),
    },
  };
};
