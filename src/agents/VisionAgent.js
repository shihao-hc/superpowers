class VisionAgent {
  constructor(options = {}) {
    this.ollamaEndpoint = this._validateEndpoint(options.ollamaEndpoint || 'http://localhost:11434');
    this.defaultModel = options.defaultModel || 'llava';
    this.maxImageSize = options.maxImageSize || 1024;
    this.timeout = options.timeout || 60000;
    this.memoryAgent = options.memoryAgent || null;
  }

  _validateEndpoint(endpoint) {
    try {
      const url = new URL(endpoint);
      const allowedHosts = ['localhost', '127.0.0.1', '::1'];
      if (!allowedHosts.includes(url.hostname)) {
        console.warn('[VisionAgent] Non-localhost endpoint:', endpoint);
      }
      return endpoint.replace(/\/$/, '');
    } catch (error) {
      return 'http://localhost:11434';
    }
  }

  async analyze(imageData, prompt, context = {}) {
    const startTime = Date.now();
    const personality = context.personality || 'AI';
    const mood = context.mood || 'neutral';

    try {
      const base64Image = this._extractBase64(imageData);

      const visionPrompt = this._buildPrompt(prompt, personality, mood);

      const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.defaultModel,
          prompt: visionPrompt,
          images: [base64Image],
          stream: false
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Vision API error: ${response.status}`);
      }

      const result = await response.json();

      if (this.memoryAgent) {
        await this.memoryAgent.remember('vision_interaction', {
          prompt,
          result: result.response,
          model: result.model,
          duration: Date.now() - startTime
        });
      }

      return {
        ok: true,
        description: result.response,
        model: result.model,
        totalDuration: result.total_duration,
        evalCount: result.eval_count,
        mood: this._inferMoodFromDescription(result.response)
      };

    } catch (error) {
      console.error('[VisionAgent] Error:', error.message);
      return {
        ok: false,
        error: error.message,
        description: '抱歉，我暂时无法分析图片。',
        mood: 'neutral'
      };
    }
  }

  async analyzeScreenshot(screenshotBase64, task, context = {}) {
    const gamePrompt = task || '当前画面中有什么？我面临什么危险？应该怎么做？';
    return this.analyze(screenshotBase64, gamePrompt, context);
  }

  async chatWithImage(imageData, messages, context = {}) {
    const startTime = Date.now();

    try {
      const base64Image = this._extractBase64(imageData);

      const chatMessages = messages.map((m, i) => {
        if (i === messages.length - 1 && m.role === 'user') {
          return {
            role: 'user',
            content: m.content,
            images: [base64Image]
          };
        }
        return {
          role: m.role,
          content: m.content
        };
      });

      const response = await fetch(`${this.ollamaEndpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: chatMessages,
          stream: false
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Vision chat error: ${response.status}`);
      }

      const result = await response.json();

      return {
        ok: true,
        text: result.message?.content || '',
        model: result.model,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        ok: false,
        error: error.message,
        text: '图片对话失败: ' + error.message
      };
    }
  }

  _buildPrompt(prompt, personality, mood) {
    const moodDescriptions = {
      happy: '开心、活泼',
      sad: '忧伤、低落',
      excited: '兴奋、激动',
      curious: '好奇、探索',
      calm: '平静、沉稳',
      worried: '担心、忧虑',
      playful: '调皮、幽默',
      neutral: '中性、自然'
    };

    const moodDesc = moodDescriptions[mood] || '自然';

    return `你是${personality}，当前心情${moodDesc}。

请用你的风格描述这张图片，保持角色设定。

用户问题: ${prompt || '请描述这张图片'}

回复要求:
1. 简洁有力，控制在100字以内
2. 符合你的性格和心情
3. 如果图片中有明显内容，详细描述
4. 可以适当表达你的感受`;
  }

  _extractBase64(imageData) {
    if (typeof imageData === 'string') {
      if (imageData.startsWith('data:')) {
        return imageData.split(',')[1];
      }
      return imageData;
    }
    throw new Error('Invalid image format');
  }

  _inferMoodFromDescription(description) {
    const text = description.toLowerCase();

    const moodPatterns = {
      happy: ['漂亮', '美丽', '开心', '快乐', '可爱', '😊', '🎉', 'amazing', 'beautiful'],
      excited: ['哇', '天哪', '厉害', 'amazing', 'incredible', 'wow'],
      curious: ['有趣', '奇怪', '是什么', 'interesting', 'what'],
      worried: ['危险', '可怕', '担心', 'dangerous', 'scary'],
      calm: ['宁静', '平和', '安静', 'peaceful', 'calm'],
      sad: ['悲伤', '难过', '孤独', 'sad', 'lonely']
    };

    for (const [mood, patterns] of Object.entries(moodPatterns)) {
      if (patterns.some(p => text.includes(p))) {
        return mood;
      }
    }

    return 'neutral';
  }

  async listAvailableModels() {
    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json();
      const visionKeywords = ['llava', 'vision', 'bakllava', 'moondream', 'minicpm', 'glm'];

      return (data.models || []).filter(m =>
        visionKeywords.some(kw => m.name.toLowerCase().includes(kw))
      );
    } catch (error) {
      return [];
    }
  }

  isSupported() {
    return {
      camera: typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia,
      screen: typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia,
      ollama: true
    };
  }
}

module.exports = { VisionAgent };
