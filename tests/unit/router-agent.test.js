'use strict';

jest.mock('../../src/skills/SkillAutoLoader', () => {
  const mockInstance = {
    isEnabled: jest.fn().mockReturnValue(true),
    getSkillsForMessage: jest.fn().mockReturnValue({ skills: ['mock-skill'], taskType: 'general' })
  };
  return {
    SkillAutoLoader: jest.fn(() => mockInstance),
    mockInstance
  };
});

const RouterAgent = require('../../src/agents/RouterAgent');

describe('RouterAgent', () => {
  let router;
  let pmMock;
  let chatMock;
  let memoryMock;
  let mediaMock;
  let gameMock;

  beforeEach(() => {
    pmMock = {
      getMood: jest.fn().mockReturnValue('happy'),
      getRoutingKeywords: jest.fn().mockImplementation((type) => {
        if (type === 'media') return ['video', 'music', 'play'];
        if (type === 'game') return ['game', 'play'];
        if (type === 'memory') return ['remember', 'recall'];
        return [];
      })
    };

    chatMock = {
      respond: jest.fn().mockResolvedValue({ reply: 'Chat says hi', source: 'ChatAgent', mood: 'neutral' })
    };

    memoryMock = {
      remember: jest.fn()
    };

    mediaMock = {
      processMedia: jest.fn().mockReturnValue({ media: 'processed' })
    };

    gameMock = {
      handleEvent: jest.fn().mockReturnValue({ game: 'processed' })
    };

    router = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock);
  });

  describe('constructor', () => {
    it('should store agent references', () => {
      expect(router.pm).toBe(pmMock);
      expect(router.chat).toBe(chatMock);
      expect(router.memory).toBe(memoryMock);
      expect(router.media).toBe(mediaMock);
      expect(router.game).toBe(gameMock);
    });

    it('should initialize loadedSkills as empty Set', () => {
      expect(router.loadedSkills).toBeInstanceOf(Set);
      expect(router.loadedSkills.size).toBe(0);
    });

    it('should accept optional hooksManager and suggestionPipeline', () => {
      const hooks = { preAgent: jest.fn(), postAgent: jest.fn() };
      const pipeline = { execute: jest.fn() };
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock, {
        hooksManager: hooks,
        suggestionPipeline: pipeline
      });
      expect(r.hooksManager).toBe(hooks);
      expect(r.suggestionPipeline).toBe(pipeline);
    });
  });

  describe('_matchKeywords', () => {
    it('should return true when text contains keyword', () => {
      expect(router._matchKeywords('play music now', ['music', 'video'])).toBe(true);
    });

    it('should return false when text lacks keywords', () => {
      expect(router._matchKeywords('hello world', ['music', 'video'])).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(router._matchKeywords('PLAY MUSIC', ['play', 'music'])).toBe(true);
    });

    it('should return false for empty text', () => {
      expect(router._matchKeywords('', ['music'])).toBe(false);
    });

    it('should return false for null text', () => {
      expect(router._matchKeywords(null, ['music'])).toBe(false);
    });

    it('should match partial word content', () => {
      expect(router._matchKeywords('remember this', ['remember'])).toBe(true);
    });
  });

  describe('routeMessage', () => {
    it('should route to chat when no keywords match', async () => {
      const result = await router.routeMessage('hello');
      expect(result.routing.target).toBe('ChatAgent');
      expect(result.reply).toBe('Chat says hi');
      expect(result.mood).toBe('neutral');
    });

    it('should route to media agent when media keyword matches', async () => {
      const result = await router.routeMessage('play some music');
      expect(result.routing.target).toBe('MediaAgent');
      expect(result.reply).toContain('MediaAgent');
      expect(mediaMock.processMedia).toHaveBeenCalledWith({
        action: 'query',
        text: 'play some music'
      });
    });

    it('should route to game agent when game keyword matches', async () => {
      const result = await router.routeMessage('start a game');
      expect(result.routing.target).toBe('GameAgent');
      expect(result.reply).toContain('GameAgent');
      expect(gameMock.handleEvent).toHaveBeenCalledWith({
        type: 'player-message',
        text: 'start a game'
      });
    });

    it('should not route to media when memory keyword also matches', async () => {
      await router.routeMessage('remember to play music');
      expect(chatMock.respond).toHaveBeenCalled();
      expect(mediaMock.processMedia).not.toHaveBeenCalled();
    });

    it('should not route to game when memory keyword also matches', async () => {
      await router.routeMessage('remember that game');
      expect(chatMock.respond).toHaveBeenCalled();
      expect(gameMock.handleEvent).not.toHaveBeenCalled();
    });

    it('should call memory.remember with message info', async () => {
      await router.routeMessage('hello');
      expect(memoryMock.remember).toHaveBeenCalledWith('last_user_message', {
        text: 'hello',
        at: expect.any(String),
        skills: ['mock-skill'],
        taskType: 'general',
        suggestions: []
      });
    });

    it('should include skills and taskType in result', async () => {
      const result = await router.routeMessage('hello');
      expect(result.skills).toEqual(['mock-skill']);
      expect(result.taskType).toBe('general');
    });

    it('should block message when hooksManager disallows', async () => {
      const hooks = {
        preAgent: jest.fn().mockResolvedValue({ allowed: false, message: 'Not allowed' }),
        postAgent: jest.fn().mockResolvedValue()
      };
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock, { hooksManager: hooks });
      const result = await r.routeMessage('bad message');
      expect(result.blocked).toBe(true);
      expect(result.reply).toBe('Not allowed');
      expect(result.routing.target).toBe('hook-blocked');
    });

    it('should use modified message when hook modifies it', async () => {
      const hooks = {
        preAgent: jest.fn().mockResolvedValue({ allowed: true, modified: 'modified message' }),
        postAgent: jest.fn().mockResolvedValue()
      };
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock, { hooksManager: hooks });
      await r.routeMessage('original');
      expect(chatMock.respond).toHaveBeenCalledWith('modified message', expect.any(Object));
    });

    it('should execute suggestion pipeline and pass suggestions', async () => {
      const pipeline = {
        execute: jest.fn().mockResolvedValue({ suggestions: ['try x', 'try y'] })
      };
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock, { suggestionPipeline: pipeline });
      const result = await r.routeMessage('hello');
      expect(result.suggestions).toEqual(['try x', 'try y']);
    });

    it('should handle suggestion pipeline error gracefully', async () => {
      const pipeline = {
        execute: jest.fn().mockRejectedValue(new Error('Pipeline failed'))
      };
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock, { suggestionPipeline: pipeline });
      const result = await r.routeMessage('hello');
      expect(result.suggestions).toEqual([]);
    });

    it('should handle hooksManager.postAgent failure gracefully', async () => {
      const hooks = {
        preAgent: jest.fn().mockResolvedValue({ allowed: true }),
        postAgent: jest.fn().mockRejectedValue(new Error('Post failed'))
      };
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock, { hooksManager: hooks });
      await expect(r.routeMessage('hello')).resolves.toBeDefined();
    });

    it('should return mood from agent response', async () => {
      const result = await router.routeMessage('hello');
      expect(result.mood).toBe('neutral');
    });
  });

  describe('getLoadedSkills', () => {
    it('should return empty array initially', () => {
      expect(router.getLoadedSkills()).toEqual([]);
    });

    it('should return loaded skills', () => {
      router.loadedSkills.add('skill-a');
      router.loadedSkills.add('skill-b');
      const skills = router.getLoadedSkills();
      expect(skills).toContain('skill-a');
      expect(skills).toContain('skill-b');
    });
  });

  describe('clearSkills', () => {
    it('should clear all loaded skills', () => {
      router.loadedSkills.add('skill-a');
      router.clearSkills();
      expect(router.loadedSkills.size).toBe(0);
    });
  });

  describe('additional branch coverage', () => {
    it('should handle SkillAutoLoader init failure gracefully', () => {
      const { SkillAutoLoader } = require('../../src/skills/SkillAutoLoader');
      SkillAutoLoader.mockImplementationOnce(() => { throw new Error('fail'); });
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock);
      expect(r.pm).toBe(pmMock);
    });

    it('should return empty skills when auto-loader is disabled', async () => {
      const { mockInstance } = require('../../src/skills/SkillAutoLoader');
      mockInstance.isEnabled.mockReturnValueOnce(false);
      const result = await router.routeMessage('hello');
      expect(result.skills).toEqual([]);
      expect(result.taskType).toBeNull();
      expect(result.autoLoaded).toEqual([]);
    });

    it('should handle skill auto-load error gracefully', async () => {
      const { mockInstance } = require('../../src/skills/SkillAutoLoader');
      mockInstance.getSkillsForMessage.mockImplementationOnce(() => { throw new Error('load fail'); });
      const result = await router.routeMessage('hello');
      expect(result.skills).toEqual([]);
      expect(result.taskType).toBeNull();
      expect(result.autoLoaded).toEqual([]);
    });

    it('should not add duplicate skills to loadedSkills', async () => {
      await router.routeMessage('first');
      expect(router.loadedSkills.has('mock-skill')).toBe(true);
      expect(router.loadedSkills.size).toBe(1);
      await router.routeMessage('second');
      expect(router.loadedSkills.size).toBe(1);
    });

    it('should work without memory agent', async () => {
      const r = new RouterAgent(pmMock, chatMock, null, mediaMock, gameMock);
      const result = await r.routeMessage('hello');
      expect(result.routing.target).toBe('ChatAgent');
    });

    it('should route to chat when media agent is null despite media keywords', async () => {
      const r = new RouterAgent(pmMock, chatMock, memoryMock, null, gameMock);
      const result = await r.routeMessage('watch video');
      expect(result.routing.target).toBe('ChatAgent');
    });

    it('should route to chat when game agent is null despite game keywords', async () => {
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, null);
      const result = await r.routeMessage('start a game');
      expect(result.routing.target).toBe('ChatAgent');
    });

    it('should handle suggestion result without suggestions field', async () => {
      const pipeline = {
        execute: jest.fn().mockResolvedValue({})
      };
      const r = new RouterAgent(pmMock, chatMock, memoryMock, mediaMock, gameMock, { suggestionPipeline: pipeline });
      const result = await r.routeMessage('hello');
      expect(result.suggestions).toEqual([]);
    });

    it('should use fallback reply and neutral mood when hook blocks without message and pm is null', async () => {
      const hooks = {
        preAgent: jest.fn().mockResolvedValue({ allowed: false }),
        postAgent: jest.fn()
      };
      const r = new RouterAgent(null, chatMock, memoryMock, mediaMock, gameMock, { hooksManager: hooks });
      const result = await r.routeMessage('bad');
      expect(result.reply).toBe('[Blocked by hook]');
      expect(result.mood).toBe('neutral');
    });

    it('should default to ChatAgent when chat result has no source field', async () => {
      const chatNoSource = {
        respond: jest.fn().mockResolvedValue({ reply: 'ok', mood: 'happy' })
      };
      const r = new RouterAgent(pmMock, chatNoSource, memoryMock, mediaMock, gameMock);
      const result = await r.routeMessage('hello');
      expect(result.routing.target).toBe('ChatAgent');
    });
  });
});
