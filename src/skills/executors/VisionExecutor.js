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
      const prompt = params.prompt || '描述这张图片的内容。';
      const model = params.model || VISION_MODEL;
      const res = await ollamaGenerate(model, prompt, [image]);
      if (!res || !res.response) { return { ok: false, error: '视觉模型无响应' }; }
      return { ok: true, result: { type: 'vision', description: res.response.trim(), model } };
    } catch (e) {
      return { ok: false, error: `视觉理解失败: ${e.message}` };
    }
  }
}

module.exports = { VisionExecutor };