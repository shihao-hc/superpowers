#!/usr/bin/env node
/**
 * mcp-handeye-server.js — 手眼 MCP Server（借鉴 REA：通过 MCP 标准让任何 agent 调用手眼）
 *
 * 轻量实现（stdio + JSON-RPC 2.0，无额外依赖）。任何 MCP 客户端可调用：
 *   - browse_understand：打开网页并中文理解
 *   - extract_structured：打开网页精确提取结构化内容（标题/链接/表单）
 *
 * 用法（作为 MCP server 配置到客户端）:
 *   command: node, args: ["scripts/mcp-handeye-server.js"]
 */
const readline = require('readline');

const TOOLS = [
  {
    name: 'browse_understand',
    description: '打开一个网页并用中文理解它（DOM 事实 + 文本模型总结，准确稳定）',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: '网页 URL（http/https）' } }, required: ['url'] }
  },
  {
    name: 'extract_structured',
    description: '打开网页并精确提取结构化内容（标题/标题元素/链接/表单/图片/正文，零模型依赖）',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: '网页 URL' } }, required: ['url'] }
  }
];

async function callTool(name, args) {
  const { BrowserAgent } = require('../src/agent/BrowserAgent');
  const agent = new BrowserAgent({ headless: true });
  try {
    await agent.init();
    const g = await agent.goto(args.url);
    if (!g.success) { return `打开失败: ${g.error}`; }
    if (name === 'browse_understand') {
      const r = await agent.understand('webpage');
      return r.ok ? r.result.description : `理解失败: ${r.error}`;
    }
    if (name === 'extract_structured') {
      const r = await agent.extractStructured();
      if (!r.success) { return `提取失败: ${r.error}`; }
      const d = r.data;
      return `标题: ${d.title}\nURL: ${d.url}\n正文长度: ${d.textLength}\n标题元素: ${(d.headings || []).slice(0, 5).join(' / ')}\n链接(${(d.links || []).length}): ${(d.links || []).slice(0, 10).map((l) => l.text).join('、')}\n表单: ${(d.inputs || []).length}个`;
    }
    return `未知工具: ${name}`;
  } finally {
    try { await agent.close(); } catch (e) { /* ignore */ }
  }
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}
function respondError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) { return; }
  let req;
  try { req = JSON.parse(line); } catch (e) { return; }
  const { id, method, params } = req;
  try {
    if (method === 'initialize') {
      respond(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'handeye', version: '1.0.0' } });
    } else if (method === 'notifications/initialized') {
      // 通知，无需响应
    } else if (method === 'tools/list') {
      respond(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const text = await callTool(params.name, params.arguments || {});
      respond(id, { content: [{ type: 'text', text }] });
    } else {
      respondError(id, -32601, `未知方法: ${method}`);
    }
  } catch (e) {
    respondError(id, -32603, `内部错误: ${e.message}`);
  }
});
