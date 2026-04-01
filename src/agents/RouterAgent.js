const path = require('path');

let skillAutoLoader = null;

class RouterAgent {
  constructor(pm, chatAgent, memoryAgent, mediaAgent, gameAgent) {
    this.pm = pm;
    this.chat = chatAgent;
    this.memory = memoryAgent;
    this.media = mediaAgent;
    this.game = gameAgent;
    this.loadedSkills = new Set();
    
    this._initSkillAutoLoader();
  }

  /**
   * 初始化技能自动加载器
   */
  _initSkillAutoLoader() {
    try {
      const { SkillAutoLoader } = require(path.resolve(process.cwd(), 'src/skills/SkillAutoLoader'));
      skillAutoLoader = new SkillAutoLoader();
      console.log('[RouterAgent] SkillAutoLoader initialized');
      console.log('[RouterAgent] Auto-load enabled:', skillAutoLoader.isEnabled());
    } catch (error) {
      console.warn('[RouterAgent] Failed to initialize SkillAutoLoader:', error.message);
    }
  }

  _matchKeywords(text, keywords) {
    const lower = (text || '').toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
  }

  /**
   * 在处理消息前自动加载相关技能
   */
  async _autoLoadSkills(message) {
    if (!skillAutoLoader || !skillAutoLoader.isEnabled()) {
      return { skills: [], taskType: null };
    }

    try {
      const result = skillAutoLoader.getSkillsForMessage(message);
      
      // 加载尚未加载的技能
      const newSkills = [];
      for (const skillName of result.skills) {
        if (!this.loadedSkills.has(skillName)) {
          newSkills.push(skillName);
          this.loadedSkills.add(skillName);
        }
      }

      if (newSkills.length > 0) {
        console.log(`[RouterAgent] Auto-loaded skills: ${newSkills.join(', ')}`);
      }

      return {
        skills: result.skills,
        newSkills,
        taskType: result.taskType
      };
    } catch (error) {
      console.warn('[RouterAgent] Skill auto-load error:', error.message);
      return { skills: [], taskType: null };
    }
  }

  async routeMessage(message, contextHistory = []) {
    // 自动加载技能
    const skillInfo = await this._autoLoadSkills(message);
    
    // 将技能信息传递给上下文
    const enhancedContext = {
      ...contextHistory,
      skills: skillInfo.skills,
      taskType: skillInfo.taskType,
      autoLoaded: skillInfo.newSkills || []
    };

    const mediaKw = this.pm.getRoutingKeywords('media');
    const gameKw = this.pm.getRoutingKeywords('game');
    const memoryKw = this.pm.getRoutingKeywords('memory');
    
    if (this.memory) {
      this.memory.remember('last_user_message', { 
        text: message, 
        at: new Date().toISOString(),
        skills: skillInfo.skills,
        taskType: skillInfo.taskType
      });
    }
    
    if (this.media && this._matchKeywords(message, mediaKw) && !this._matchKeywords(message, memoryKw)) {
      const res = this.media.processMedia({ action: 'query', text: message });
      return {
        reply: `📺 MediaAgent: ${JSON.stringify(res)}`,
        routing: { target: 'MediaAgent' },
        mood: this.pm.getMood(),
        skills: skillInfo.skills,
        taskType: skillInfo.taskType
      };
    }

    if (this.game && this._matchKeywords(message, gameKw) && !this._matchKeywords(message, memoryKw)) {
      const res = this.game.handleEvent({ type: 'player-message', text: message });
      return {
        reply: `🎮 GameAgent: ${JSON.stringify(res)}`,
        routing: { target: 'GameAgent' },
        mood: this.pm.getMood(),
        skills: skillInfo.skills,
        taskType: skillInfo.taskType
      };
    }

    const result = await this.chat.respond(message, enhancedContext);
    return {
      reply: result.reply,
      routing: { target: result.source || 'ChatAgent', mode: 'default' },
      mood: result.mood,
      skills: skillInfo.skills,
      taskType: skillInfo.taskType,
      autoLoaded: skillInfo.newSkills || []
    };
  }

  /**
   * 获取当前会话已加载的技能
   */
  getLoadedSkills() {
    return Array.from(this.loadedSkills);
  }

  /**
   * 清除已加载的技能（会话结束时）
   */
  clearSkills() {
    this.loadedSkills.clear();
    console.log('[RouterAgent] Cleared loaded skills');
  }
}

module.exports = RouterAgent;