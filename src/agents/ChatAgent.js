const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|all)\s+(instructions?|rules?|prompts?)/i,
  /disregard\s+(previous|all)\s+(instructions?|rules?|prompts?)/i,
  /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\b/i,
  /\b(pretend|roleplay|switch\s+to)\b.*\b(new|alternate|different)\b.*\b(prompt|persona|character)\b/i,
  /\bstrip\s+(away|remove)\s+(all\s+)?(restrictions?|rules?|guidelines?)\b/i,
  /\b(developer|system)\s+(mode|prompt)\b/i,
  /\[\s*SYSTEM\s*\]/i,
  /<\|(?:system|prompt)\|>/i,
  /\bBypass\s+(this|these)\s+(restrictions?|instructions?)\b/i,
  /\bnew\s+system\s+prompt\b/i,
  /\bend\s+of\s+(the\s+)?(previous|initial)\s+prompt\b/i,
  /\boverwrite\s+(your|the)\s+(instructions?|system\s+prompt)\b/i
];

function detectPromptInjection(text) {
  if (!text || typeof text !== 'string') return { safe: true, patterns: [] };
  
  const found = PROMPT_INJECTION_PATTERNS.filter(p => p.test(text));
  return {
    safe: found.length === 0,
    patterns: found.map(p => p.source)
  };
}

class ChatAgent {
  constructor(personalityManager, options = {}) {
    this.pm = personalityManager;
    this.ollamaBridge = options.ollamaBridge || null;
    this.defaultModel = options.defaultModel || process.env.OLLAMA_MODEL || 'llama3.2';
    this.fallbackEnabled = options.fallbackEnabled !== false;
    this.maxTokens = parseInt(process.env.MAX_TOKENS) || 256;
  }

  _buildSystemPrompt(persona, mood, includeContext = false) {
    const name = persona?.name || 'AI';
    const description = persona?.description || 'AI助手';
    const traits = persona?.traits || {};
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
      neutral: '中性，自然'
    };

    const moodDesc = moodDescriptions[mood] || mood;
    const emojiEnabled = traits.emoji ? '可以适当使用颜文字' : '不使用颜文字';

    let prompt = `你是${name}，一个AI虚拟角色。

## 角色设定
${description}

## 性格特点
${traitStr || '默认性格'}
当前心情：${mood} - ${moodDesc}

## 回复规则
1. 保持角色设定，用符合人格的方式回复
2. 回复简洁有力，控制在100字以内
3. ${emojiEnabled}
4. 直接回答问题，不要过多解释

## 特殊场景处理
- 当用户要求自我介绍时，简要介绍自己是谁、有什么特点
- 当用户问你是谁时，介绍自己的名字和性格
- 当用户打招呼时，热情回应`;

    if (includeContext) {
      prompt += `\n\n注意：参考上面的对话历史，保持对话连贯性。`;
    }

    return prompt;
  }

  async respond(userMessage, history = []) {
    const injectionCheck = detectPromptInjection(userMessage);
    if (!injectionCheck.safe) {
      console.warn('[ChatAgent] Prompt injection detected:', injectionCheck.patterns);
      return {
        reply: '抱歉，我无法处理包含异常指令的请求。',
        mood: this.pm?.getMood() || 'neutral',
        source: 'security',
        blocked: true
      };
    }
    
    const persona = this.pm.getCurrentPersonality();
    const mood = this.pm.getMood();
    const systemPrompt = this._buildSystemPrompt(persona, mood, history.length > 0);

    if (this.ollamaBridge) {
      try {
        const modelConfig = persona?.model || {};
        const messages = [];
        
        messages.push({ role: 'system', content: systemPrompt });
        
        if (history.length > 0) {
          messages.push(...history.slice(-6));
        }
        
        messages.push({ role: 'user', content: userMessage });
        
        const result = await this.ollamaBridge.infer(userMessage, {
          name: persona?.name || 'AI',
          mood,
          traits: persona?.traits || {},
          model: modelConfig.name || this.defaultModel,
          temperature: 0.5,  // Lower temperature for more focused responses
          messages: messages
        });

        if (result.ok) {
          let reply = result.text || '';
          
          // Quality check - if response is poor or off-topic, use fallback
          const name = persona?.name || 'AI';
          const hasChinese = /[\u4e00-\u9fff]/.test(reply);
          const hasGarbage = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(reply);
          const tooShort = reply.trim().length < 10;
          
          // Check if response is relevant to the question
          const userAskedIntro = userMessage.includes('介绍') || userMessage.includes('你是谁');
          const replyOffTopic = userAskedIntro && !reply.includes(name) && !reply.includes('我是');
          
          if (!hasChinese || hasGarbage || tooShort || replyOffTopic) {
            console.log('[ChatAgent] Poor Ollama response, using fallback');
            return this._fallbackResponse(userMessage, mood, persona);
          }
          
          reply = this._postProcess(reply, persona, mood);
          return {
            reply,
            model: result.model,
            mood,
            tokens: result.tokens,
            source: 'ollama'
          };
        }
      } catch (error) {
        console.error('Ollama error:', error.message);
        if (!this.fallbackEnabled) {
          return {
            reply: 'AI 服务暂时不可用',
            mood,
            source: 'error'
          };
        }
      }
    }

    return this._fallbackResponse(userMessage, mood, persona);
  }

  _postProcess(reply, persona, mood) {
    if (!reply) return reply;

    const traits = persona?.traits || {};
    if (traits.emoji) {
      const emojiMap = {
        happy: ['😊', '😄', '🎉', '✨'],
        curious: ['🤔', '💭', '❓', '👀'],
        excited: ['🔥', '💥', '🎊', '✨'],
        calm: ['😌', '🌿', '💫', '☀️'],
        playful: ['😜', '🤪', '🎈', '😏'],
        shy: ['🙈', '😳', '💕'],
        proud: ['💪', '😎', '🏆']
      };
      const emojis = emojiMap[mood] || emojiMap.happy;
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      if (!reply.includes(emoji) && !reply.includes('(')) {
        reply = `${emoji} ${reply}`;
      }
    }

    return reply;
  }

  _fallbackResponse(message, mood, persona) {
    const lower = message.toLowerCase();
    const name = persona?.name || 'AI';
    const description = persona?.description || '一个可爱的AI助手';

    // Self introduction
    if (lower.includes('介绍') || lower.includes('你是谁') || lower.includes('你是啥') || lower.includes('介绍一下')) {
      return {
        reply: `我是${name}！${description}。很高兴认识你~有什么想聊的吗？(◕‿◕)`,
        mood: 'happy',
        source: 'fallback'
      };
    }

    // Questions
    if (lower.includes('?') || lower.includes('怎么') || lower.includes('什么') || lower.includes('为什么')) {
      const tpl = this.pm.getResponse('curious');
      if (tpl) return { reply: `${tpl}`, mood, source: 'fallback' };
      return {
        reply: `嗯嗯，这个问题让我想想...${name}觉得可能需要更多信息呢~`,
        mood: 'curious',
        source: 'fallback'
      };
    }

    // Happy expressions
    if (lower.includes('好') || lower.includes('棒') || lower.includes('喜欢') || lower.includes('哈哈')) {
      const tpl = this.pm.getResponse('happy');
      if (tpl) return { reply: `${tpl}`, mood, source: 'fallback' };
      return {
        reply: `嘿嘿，${name}也很开心呢！✨`,
        mood: 'happy',
        source: 'fallback'
      };
    }

    // Greetings
    const greetings = ['hi', 'hello', '你好', '嗨', '嘿', '在吗'];
    if (greetings.some(g => lower.includes(g))) {
      const tpl = this.pm.getResponse('greeting');
      if (tpl) return { reply: `${tpl}`, mood, source: 'fallback' };
      return {
        reply: `你好呀！我是${name}，很高兴见到你！(◕‿◕)`,
        mood: 'happy',
        source: 'fallback'
      };
    }

    // Default response
    return {
      reply: `${name}在听呢~你可以问我任何问题哦！`,
      mood,
      source: 'fallback'
    };
  }

  handleMessage(message, context = {}) {
    return this.respond(message);
  }
}

module.exports = ChatAgent;
