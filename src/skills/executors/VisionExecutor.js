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

// 视觉任务 → 提示词策略（"最适合我"：不同任务不同 prompt，提取可操作信息而非泛泛描述）
const TASK_PROMPTS = {
  describe: '描述这张图片的内容，包括主要元素和布局。',
  ocr: '提取这张图片中的所有文字，原样逐行输出。',
  identify: '识别这张图片中的主要物体/元素/图标，逐个列出并说明位置。',
  webpage: '这是一张网页截图。请提取：页面标题、导航/主要内容、按钮和链接文字、整体布局，尽量结构化。'
};

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
      const res = await ollamaGenerate(model, prompt, [image]);
      if (!res || !res.response) { return { ok: false, error: '视觉模型无响应' }; }
      return { ok: true, result: { type: 'vision', task: params.task || 'describe', description: res.response.trim(), model } };
    } catch (e) {
      return { ok: false, error: `视觉理解失败: ${e.message}` };
    }
  }
}

module.exports = { VisionExecutor };