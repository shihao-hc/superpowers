import { describe, it, expect, beforeEach } from 'vitest'
import { ContextManager, createContextManager, globalContextManager } from '../src/context/manager.js'

describe('ContextManager', () => {
  let manager: ContextManager

  beforeEach(() => {
    manager = createContextManager(100000)
  })

  describe('constructor', () => {
    it('should create with default budget', () => {
      const budget = manager.getBudget()
      expect(budget.total).toBe(100000)
      expect(budget.used).toBe(0)
      expect(budget.remaining).toBe(100000)
    })

    it('should create with custom budget', () => {
      const m = createContextManager(50000)
      const budget = m.getBudget()
      expect(budget.total).toBe(50000)
    })
  })

  describe('setBudget', () => {
    it('should update total budget', () => {
      manager.setBudget(200000)
      const budget = manager.getBudget()
      expect(budget.total).toBe(200000)
    })
  })

  describe('token estimation', () => {
    it('should estimate tokens for text', () => {
      const tokens = manager.estimateTokens('Hello world')
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBe(Math.ceil('Hello world'.length / 4))
    })

    it('should estimate tokens for long text', () => {
      const longText = 'a'.repeat(100)
      const tokens = manager.estimateTokens(longText)
      expect(tokens).toBe(25)
    })
  })

  describe('setSystemPromptTokens', () => {
    it('should set system prompt tokens', () => {
      manager.setSystemPromptTokens(5000)
      const budget = manager.getBudget()
      expect(budget.used).toBe(5000)
      expect(budget.remaining).toBe(95000)
    })
  })

  describe('setMessageTokens', () => {
    it('should set message tokens', () => {
      manager.setMessageTokens(10000)
      const budget = manager.getBudget()
      expect(budget.used).toBe(10000)
      expect(budget.remaining).toBe(90000)
    })
  })

  describe('canAddMessage', () => {
    it('should allow message within budget', () => {
      expect(manager.canAddMessage(1000)).toBe(true)
    })

    it('should deny message exceeding budget', () => {
      manager.setMessageTokens(99000)
      expect(manager.canAddMessage(2000)).toBe(false)
    })

    it('should handle exact budget boundary', () => {
      expect(manager.canAddMessage(100000)).toBe(false)
      expect(manager.canAddMessage(99999)).toBe(true)
    })
  })

  describe('getContextWindow', () => {
    it('should return context window info', () => {
      manager.setSystemPromptTokens(5000)
      manager.setMessageTokens(10000)
      
      const window = manager.getContextWindow('claude-3-sonnet')
      expect(window.maxTokens).toBe(8192)
      expect(window.currentTokens).toBe(15000)
      expect(window.systemPromptTokens).toBe(5000)
      expect(window.messagesTokens).toBe(10000)
    })

    it('should use default limits for unknown model', () => {
      const window = manager.getContextWindow('unknown-model')
      expect(window.maxTokens).toBe(4096)
    })
  })

  describe('getModelLimits', () => {
    it('should return limits for claude-3-sonnet', () => {
      const limits = manager.getModelLimits('claude-3-sonnet')
      expect(limits.maxTokens).toBe(8192)
      expect(limits.contextWindow).toBe(200000)
      expect(limits.supportsVision).toBe(true)
    })

    it('should return limits for claude-opus-4', () => {
      const limits = manager.getModelLimits('claude-opus-4')
      expect(limits.maxTokens).toBe(4096)
      expect(limits.supportsThinking).toBe(true)
    })

    it('should return default limits for unknown model', () => {
      const limits = manager.getModelLimits('unknown')
      expect(limits.maxTokens).toBe(4096)
      expect(limits.supportsVision).toBe(false)
    })
  })

  describe('calculateOutputBudget', () => {
    it('should calculate available output budget', () => {
      manager.setSystemPromptTokens(5000)
      manager.setMessageTokens(10000)
      
      const outputBudget = manager.calculateOutputBudget('claude-3-sonnet')
      expect(outputBudget).toBeLessThanOrEqual(8192)
    })

    it('should respect reserved tokens', () => {
      manager.setMessageTokens(50000)
      
      const withReserve = manager.calculateOutputBudget('claude-3-sonnet', 5000)
      const withoutReserve = manager.calculateOutputBudget('claude-3-sonnet')
      
      expect(withReserve).toBeLessThanOrEqual(withoutReserve)
    })
  })

  describe('reset', () => {
    it('should reset budget and tokens', () => {
      manager.setSystemPromptTokens(5000)
      manager.setMessageTokens(10000)
      manager.reset()
      
      const budget = manager.getBudget()
      expect(budget.used).toBe(0)
      expect(budget.remaining).toBe(100000)
    })
  })

  describe('compact', () => {
    it('should not compact if within budget', () => {
      const messages = [
        { content: 'Hello' },
        { content: 'How are you?' },
      ]
      const result = manager.compact(messages)
      expect(result).toEqual(messages)
    })

    it('should compact messages when over budget', () => {
      manager.setMessageTokens(95000)
      
      const messages = Array(20).fill(null).map((_, i) => ({
        content: 'This is message number ' + i + ' with some content',
      }))
      
      const result = manager.compact(messages)
      expect(result.length).toBeLessThan(messages.length)
      expect(result[0].content).toContain('summarized')
    })

    it('should preserve system summary', () => {
      manager.setMessageTokens(95000)
      
      const messages = [
        { content: 'Message 1' },
        { content: 'Message 2' },
      ]
      
      const result = manager.compact(messages)
      expect(result[0].content).toContain('summarized')
    })
  })

  describe('globalContextManager', () => {
    it('should be instance of ContextManager', () => {
      expect(globalContextManager).toBeInstanceOf(ContextManager)
    })
  })
})
