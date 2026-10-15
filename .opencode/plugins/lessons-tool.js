import { tool } from "@opencode-ai/plugin";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * lessons-tool plugin — 把教训库的「检索」暴露为 opencode 一等工具。
 *
 * 背景：教训库一直在「记录」（写 lessons.json），但「应用」（检索教训指导决策）没打通——
 * 干任务时靠 AGENTS.md 提炼，不检索全量教训库，导致大量教训躺在库里不回流。
 * 暴露为工具后，任务开头可查「这类操作犯过什么错」。
 *
 * 注意：不依赖 src/core/LessonLibrary（其 _load 用 process.cwd() 定位 lessons.json，有 cwd 依赖），
 * 直接用 context.directory 读 lessons.json + 复刻 bigram 检索（与 LessonLibrary._tokenize 一致）。
 */

function tokenize(text) {
  const s = String(text || "").toLowerCase();
  const tokens = [];
  (s.match(/[a-z0-9][a-z0-9._-]*/g) || []).forEach((t) => tokens.push(t));
  (s.match(/[\u4e00-\u9fff]+/g) || []).forEach((run) => {
    if (run.length <= 2) {
      if (!tokens.includes(run)) tokens.push(run);
    } else {
      for (let i = 0; i < run.length - 1; i++) {
        const bigram = run.slice(i, i + 2);
        if (!tokens.includes(bigram)) tokens.push(bigram);
      }
    }
  });
  return tokens;
}

export const LessonsToolPlugin = async ({ directory }) => {
  return {
    tool: {
      lessons: tool({
        description:
          "检索教训库。干任务前查「这类操作我犯过什么错」避免重复犯错。query 传关键词（如「验证」「规划」「安全」「cwd」「误报」），返回相关教训（含未应用标记）。",
        args: {
          query: tool.schema.string(),
        },
        async execute(args, context) {
          const query = String(args.query || "").trim();
          if (!query) return "错误：需要 query（检索关键词）";

          const cwd = context.directory || directory;
          let lessons;
          try {
            const raw = JSON.parse(readFileSync(join(cwd, ".opencode", "lessons.json"), "utf8"));
            lessons = raw.lessons || raw;
          } catch (e) {
            return `读取教训库失败: ${e.message}`;
          }
          if (!Array.isArray(lessons) || !lessons.length) return "教训库为空";

          const tokens = tokenize(query);
          const hits = lessons.filter((l) => {
            const text = `${l.title || ""} ${l.problem || ""} ${l.lesson || ""} ${l.context || ""} ${(l.tags || []).join(" ")}`.toLowerCase();
            return tokens.some((t) => t.length >= 2 && text.includes(t));
          });

          if (!hits.length) return `没有匹配「${query}」的教训`;
          return hits.slice(0, 10).map((l, i) => {
            const applied = l._applied ? "" : "（未应用）";
            const head = `${i + 1}. [${l.type || "?"}/${l.priority || "?"}] ${l.lesson || l.problem || ""}${applied}`;
            return l.improvement ? `${head}\n   改进: ${l.improvement}` : head;
          }).join("\n");
        },
      }),
    },
  };
};
