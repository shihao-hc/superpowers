const { Ollama } = require('ollama');

const MAX_INPUT_LENGTH = 10000;
const MAX_MESSAGE_HISTORY = 20;

class OllamaBridge {
  constructor(options = {}) {
    this.host = options.host || process.env.OLLAMA_HOST || 'http://localhost';
    this.port = options.port || process.env.OLLAMA_PORT || '11434';
    this.defaultModel = options.model || process.env.OLLAMA_MODEL || 'llama3.2';
    this.client = new Ollama({ host: `${this.host}:${this.port}` });
    this.connected = false;
    
    this.maxTokens = parseInt(process.env.MAX_TOKENS) || 256;
    this.defaultTemperature = parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.8;
  }

  async checkConnection() {
    try {
      await this.client.list();
      this.connected = true;
      return true;
    } catch (e) {
      this.connected = false;
      return false;
    }
  }

  async listModels() {
    try {
      const response = await this.client.list();
      return response.models || [];
    } catch (e) {
      return [];
    }
  }

  async chat(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens || this.maxTokens;
    const stream = options.stream || false;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages array');
    }

    const sanitizedMessages = messages.map(m => ({
      role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user',
      content: String(m.content || '').substring(0, MAX_INPUT_LENGTH)
    })).slice(-MAX_MESSAGE_HISTORY);

    try {
      const response = await this.client.chat({
        model,
        messages: sanitizedMessages,
        options: { temperature, num_predict: maxTokens },
        stream
      });

      if (stream) {
        return response;
      }

      return {
        ok: true,
        text: response.message?.content?.trim() || '',
        model,
        done: true,
        evalCount: response.eval_count,
        promptEvalCount: response.prompt_eval_count
      };
    } catch (error) {
      throw error;
    }
  }

  async infer(input, context = {}) {
    const { name = 'AI', mood = 'neutral', traits = {}, model: customModel, messages: providedMessages } = context;
    const systemPrompt = this._buildSystemPrompt(name, mood, traits);

    let messages;
    if (providedMessages && providedMessages.length > 0) {
      messages = providedMessages;
      if (messages[0].role !== 'system') {
        messages.unshift({ role: 'system', content: systemPrompt });
      }
    } else {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(input).substring(0, MAX_INPUT_LENGTH) }
      ];
    }

    try {
      const result = await this.chat(messages, { 
        model: customModel || this.defaultModel 
      });
      return {
        ok: true,
        text: result.text,
        model: result.model,
        mood,
        tokens: result.evalCount
      };
    } catch (error) {
      console.error('Ollama inference error:', error.message);
      return {
        ok: false,
        text: `AI 回复失败: ${error.message}`,
        error: error.message
      };
    }
  }

  _buildSystemPrompt(name, mood, traits) {
    const traitStr = Object.entries(traits)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');

    const moodDescriptions = {
      happy: '开心、活泼、语气轻快、喜欢用颜文字',
      curious: '好奇、喜欢探索、经常提问',
      calm: '平静、沉稳、说话简洁专业',
      excited: '兴奋、激动、感叹号较多',
      playful: '调皮、幽默、爱开玩笑',
      shy: '害羞、腼腆、语气轻柔',
      proud: '自豪、骄傲、自信',
      neutral: '中性、自然'
    };

    const moodDesc = moodDescriptions[mood] || mood;

    return `你是一个AI虚拟角色，名字是${name}。

## 性格设定
- ${traitStr}
- 当前心情：${mood} - ${moodDesc}

## 回复规则
1. 保持角色设定，用符合人格的方式回复
2. 回复简洁有力，不要太长（控制在50字以内）
3. 可以适当使用颜文字增加活力
4. 直接回答问题，不要过多解释`;
  }

  async analyzeImage(imageBase64, prompt, options = {}) {
    const model = options.model || 'llava';
    const temperature = options.temperature ?? 0.3;

    if (!imageBase64) {
      throw new Error('Image data required');
    }

    const cleanBase64 = typeof imageBase64 === 'string' && imageBase64.startsWith('data:')
      ? imageBase64.split(',')[1]
      : imageBase64;

    if (!/^[A-Za-z0-9+/=\s]+$/.test(cleanBase64)) {
      throw new Error('Invalid base64 format');
    }

    const maxBase64Size = 14 * 1024 * 1024;
    if (cleanBase64.length > maxBase64Size) {
      throw new Error('Image too large (max 10MB)');
    }

    try {
      const response = await this.client.generate({
        model,
        prompt: prompt || '请详细描述这张图片的内容',
        images: [cleanBase64],
        stream: false,
        options: { temperature }
      });

      return {
        ok: true,
        description: response.response,
        model: response.model,
        totalDuration: response.total_duration,
        evalCount: response.eval_count
      };
    } catch (error) {
      console.error('Ollama vision error:', error.message);
      return {
        ok: false,
        error: error.message,
        description: '图片分析失败: ' + error.message
      };
    }
  }

  async chatWithImage(messages, imageBase64, options = {}) {
    const model = options.model || 'llava';
    const temperature = options.temperature ?? this.defaultTemperature;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages array');
    }

    const imageMessages = messages.map((m, i) => {
      if (i === messages.length - 1 && m.role === 'user' && imageBase64) {
        return {
          role: m.role,
          content: String(m.content || '').substring(0, MAX_INPUT_LENGTH),
          images: [imageBase64]
        };
      }
      return {
        role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user',
        content: String(m.content || '').substring(0, MAX_INPUT_LENGTH)
      };
    }).slice(-MAX_MESSAGE_HISTORY);

    try {
      const response = await this.client.chat({
        model,
        messages: imageMessages,
        options: { temperature }
      });

      return {
        ok: true,
        text: response.message?.content?.trim() || '',
        model,
        evalCount: response.eval_count
      };
    } catch (error) {
      throw error;
    }
  }

  async listVisionModels() {
    try {
      const models = await this.listModels();
      const visionKeywords = ['llava', 'vision', 'bakllava', 'moondream', 'minicpm'];
      return models.filter(m => 
        visionKeywords.some(kw => m.name.toLowerCase().includes(kw))
      );
    } catch (e) {
      return [];
    }
  }
}

module.exports = { OllamaBridge };
