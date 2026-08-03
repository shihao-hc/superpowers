/**
 * EmotionExpress - 增强的情感表达模块
 * 支持更多情感和更自然的回应
 *
 * Extracted from BrainSystem.js (v22.1)
 */

const EmotionExpress = {
  _emotionMap: {
    'happy': {
      keywords: ['开心', '高兴', '太好了', '棒', '不错', '完美', '优秀', '点赞'],
      responses: ['太好了！', '真为你高兴！', '很棒！', '完美解决！', '继续保持！']
    },
    'sad': {
      keywords: ['难过', '伤心', '郁闷', '失落', '沮丧', '无奈', '糟糕'],
      responses: ['我理解你的感受', '这确实让人难过', '抱抱你', '一切会好起来的', '我们一起面对']
    },
    'confused': {
      keywords: ['困惑', '迷茫', '不懂', '模糊', '复杂', '怎么办', '如何'],
      responses: ['让我帮你理清思路', '这个问题有点复杂', '我们一起来分析', '我来解释一下']
    },
    'frustrated': {
      keywords: ['着急', '焦虑', '烦', '恼火', '急', '崩溃'],
      responses: ['别着急，慢慢来', '我们一起解决', '我能帮你', '深呼吸']
    },
    'excited': {
      keywords: ['期待', '兴奋', '激动', '太棒了', '牛', '厉害'],
      responses: ['太棒了！', '这太有趣了！', '我也很期待！', '你很棒！']
    },
    'thankful': {
      keywords: ['谢谢', '感谢', '感恩', '感激', '感恩'],
      responses: ['不客气！', '很高兴能帮到你', '随时找我', '能帮到你我也很开心']
    },
    'angry': {
      keywords: ['生气', '愤怒', '恼火', '气', '可恶'],
      responses: ['消消气', '别太激动', '深呼吸', '值得生气']
    },
    'worried': {
      keywords: ['担心', '害怕', '焦虑', '不安', '恐惧'],
      responses: ['别担心', '相信自己', '我会帮你的', '没那么可怕']
    },
    'proud': {
      keywords: ['骄傲', '自豪', '满意', '成就感'],
      responses: ['你很棒！', '为你骄傲！', '实至名归！']
    },
    'tired': {
      keywords: ['累', '疲惫', '困', '想休息'],
      responses: ['辛苦了', '休息一下', '别太拼']
    }
  },

  express(userInput, aiResponse) {
    const userEmotion = this.detectEmotion(userInput);
    const contextEmotion = this.detectContextEmotion(aiResponse);
    const response = this.generateNaturalResponse(userEmotion, contextEmotion, aiResponse);

    return {
      detected: userEmotion,
      contextAware: contextEmotion,
      expression: response,
      natural: true,
      timestamp: Date.now()
    };
  },

  detectContextEmotion(aiResponse) {
    if (!aiResponse) { return null; }
    const lower = aiResponse.toLowerCase();
    if (lower.includes('完成') || lower.includes('解决')) { return 'success'; }
    if (lower.includes('进行') || lower.includes('处理')) { return 'progress'; }
    if (lower.includes('错误') || lower.includes('失败')) { return 'error'; }
    return null;
  },

  generateNaturalResponse(userEmotion, contextEmotion, _aiResponse) {
    if (userEmotion && this._emotionMap[userEmotion]) {
      const responses = this._emotionMap[userEmotion].responses;
      const emoji = this._getEmoji(userEmotion);
      return `${emoji} ${responses[Math.floor(Math.random() * responses.length)]}`;
    }

    if (contextEmotion === 'success') {
      return '🎉 任务完成！继续加油！';
    }
    if (contextEmotion === 'error') {
      return '😅 让我再试一次';
    }
    if (contextEmotion === 'progress') {
      return '⏳ 进行中...';
    }

    return null;
  },

  _getEmoji(emotion) {
    const emojiMap = {
      happy: '😊', sad: '💙', confused: '🤔', frustrated: '😤',
      excited: '🤩', thankful: '🙏', angry: '😤', worried: '😰',
      proud: '🏆', tired: '😴'
    };
    return emojiMap[emotion] || '';
  },

  detectEmotion(input) {
    const text = (input || '').toLowerCase();

    for (const [emotion, data] of Object.entries(this._emotionMap)) {
      for (const keyword of data.keywords) {
        if (text.includes(keyword)) {
          return emotion;
        }
      }
    }

    return null;
  },

  generateResponse(userEmotion, _aiResponse) {
    if (!userEmotion || !this._emotionMap[userEmotion]) {
      return null;
    }

    const responses = this._emotionMap[userEmotion].responses;
    return responses[Math.floor(Math.random() * responses.length)];
  },

  expressTaskStatus(status) {
    const statusExpressions = {
      success: ['任务完成！继续加油！', '太棒了！', '完美解决！'],
      fail: ['让我再试试', '我们会找到办法的', '别担心'],
      progress: ['进行中...', '正在处理', '继续努力']
    };

    const expressions = statusExpressions[status] || statusExpressions.progress;
    return expressions[Math.floor(Math.random() * expressions.length)];
  }
};

module.exports = EmotionExpress;
