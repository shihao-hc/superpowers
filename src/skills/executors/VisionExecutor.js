/**
 * VisionExecutor - 视觉理解（"眼睛"）
 * 输入图片（base64 或文件路径）→ 本地 Ollama 视觉模型（moondream）→ 图像描述/理解
 *
 * 用法（确定性执行，不经主 LLM）:
 *   VisionExecutor.execute({ image: '<base64>' | '/path/to.png', prompt: '描述这张图' })
 * 返回 { ok, result: { type: 'vision', description } }
 */
const fs = require('fs');
const http = require('http');

const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'moondream';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434', 10);

// 视觉任务 → 提示词策略（"最适合我"：真实使用发现 moondream 对复杂 prompt 敏感——会输出坐标
// 而非描述，故用简单稳定 prompt；结构化由中文适配/后续处理补充）
const TASK_PROMPTS = {
  describe: 'Describe this image in a few sentences.',
  ocr: 'Read and list all the text visible in this image.',
  identify: 'List the main objects visible in this image.',
  webpage: 'Describe this webpage screenshot.'
};

// 中文适配：moondream 等视觉模型以英文输出为主 → 用本地中文模型（qwen2.5:7b）翻译
// （参考项目成熟模式：工具/模型英文逻辑 + 中文感知适配层，如 SmartMemory CJK bigram）
const LANG_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

function isMostlyEnglish(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const total = String(text).replace(/\s/g, '').length;
  return total > 0 && cjk / total < 0.1;
}

async function toChinese(text) {
  const res = await ollamaGenerate(LANG_MODEL, `把下面这段英文翻译成流畅自然的中文，只输出翻译结果，不要任何解释：\n${text}`);
  return (res && res.response ? res.response : text).trim();
}

function ollamaGenerate(model, prompt, images) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, images, stream: false });
    const req = http.request({
      host: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Ollama 响应解析失败')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(new Error('Ollama 视觉推理超时')); });
    req.write(body); req.end();
  });
}

class VisionExecutor {
  /**
   * 执行视觉理解
   * @param {Object} params - { image: base64 或文件路径, prompt: 指令, model: 覆盖默认模型 }
   * @returns {Promise<Object>} { ok, result: { type, description, model } }
   */
  static async execute(params = {}) {
    try {
      let image = params.image;
      if (!image) { return { ok: false, error: '缺少 image（base64 或文件路径）' }; }
      // 支持文件路径
      if (!/^[A-Za-z0-9+/=]+$/.test(image) && fs.existsSync(image)) {
        image = fs.readFileSync(image).toString('base64');
      }
      const prompt = params.prompt || TASK_PROMPTS[params.task || 'describe'] || TASK_PROMPTS.describe;
      const model = params.model || VISION_MODEL;
      // 视觉模型偶发空/异常输出 → 重试（可靠性打磨）
      let res = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await ollamaGenerate(model, prompt, [image]);
        if (res && res.response && res.response.trim().length > 0) { break; }
        if (attempt < 2) { await new Promise((r) => setTimeout(r, 500)); }
      }
      if (!res || !res.response || !res.response.trim()) { return { ok: false, error: '视觉模型无响应（重试后仍空）' }; }
      let description = res.response.trim();
      // 中文适配：视觉模型英文输出 + 请求默认中文 → 用本地中文模型翻译
      const lang = params.lang || 'zh';
      if (lang === 'zh' && isMostlyEnglish(description) && model !== LANG_MODEL) {
        description = await toChinese(description);
      }
      return { ok: true, result: { type: 'vision', task: params.task || 'describe', description, model, lang } };
    } catch (e) {
      return { ok: false, error: `视觉理解失败: ${e.message}` };
    }
  }
}

module.exports = { VisionExecutor };