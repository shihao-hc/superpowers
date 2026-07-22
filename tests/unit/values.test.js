const Values = require('../../src/core/Values');

describe('Values', () => {
  let values;

  beforeEach(() => {
    values = new Values({});
  });

  describe('constructor', () => {
    it('initializes with 8 core values', () => {
      expect(Object.keys(values.values)).toHaveLength(8);
      expect(values.values.truth.priority).toBe(10);
    });
  });

  describe('decide', () => {
    it('returns decision with structure', () => {
      const result = values.decide({
        context: '安全检查',
        alternatives: ['检查代码', '直接上线']
      });
      expect(result.context).toBe('安全检查');
      expect(result.choice).toBeTruthy();
      expect(result.valuesConsidered).toHaveLength(2);
    });

    it('selects safer option in security context', () => {
      const result = values.decide({
        context: '安全',
        alternatives: ['检查代码', '直接上线']
      });
      expect(result.choice).toBe('检查代码');
    });

    it('handles empty alternatives', () => {
      const result = values.decide({ context: 'test' });
      expect(result.choice).toBeNull();
    });

    it('records decision in history', () => {
      values.decide({ context: 'test', alternatives: ['a'] });
      expect(values.decisions).toHaveLength(1);
    });
  });

  describe('check', () => {
    it('returns valid for existing values', () => {
      const result = values.check(['truth', 'honesty']);
      expect(result).toHaveLength(2);
      expect(result[0].valid).toBe(true);
    });

    it('returns invalid for unknown values', () => {
      const result = values.check(['fake_value']);
      expect(result[0].valid).toBe(false);
      expect(result[0].error).toMatch(/未知/);
    });
  });

  describe('getTopValues', () => {
    it('returns top N values by priority', () => {
      const top = values.getTopValues(3);
      expect(top).toHaveLength(3);
      expect(top[0].name).toBe('truth');
      expect(top[0].priority).toBe(10);
    });

    it('defaults to 3', () => {
      expect(values.getTopValues()).toHaveLength(3);
    });
  });

  describe('explain', () => {
    it('returns value details', () => {
      const result = values.explain('truth');
      expect(result.description).toMatch(/真实性/);
      expect(result.priority).toBe(10);
    });

    it('returns null for unknown value', () => {
      expect(values.explain('unknown')).toBeNull();
    });
  });

  describe('resolveConflict', () => {
    it('picks higher priority value', () => {
      const result = values.resolveConflict({ a: 'truth', b: 'efficiency' });
      expect(result.resolution).toBe('truth');
    });

    it('balances when priorities equal', () => {
      const result = values.resolveConflict({ a: 'respect', b: 'growth' });
      expect(result.resolution).toBe('balance');
    });

    it('returns unknown for missing values', () => {
      const result = values.resolveConflict({ a: 'truth', b: 'unknown' });
      expect(result.resolution).toBe('unknown');
    });
  });

  describe('addValue', () => {
    it('adds a new value', () => {
      const result = values.addValue('innovation', { priority: 6, description: 'test' });
      expect(result.success).toBe(true);
      expect(values.values.innovation).toBeDefined();
    });

    it('rejects duplicate', () => {
      expect(values.addValue('truth').success).toBe(false);
    });
  });

  describe('getDecisionHistory', () => {
    it('returns last 10 decisions', () => {
      for (let i = 0; i < 15; i++) {
        values.decisions.push({ i });
      }
      expect(values.getDecisionHistory()).toHaveLength(10);
    });
  });

  describe('getSummary', () => {
    it('returns summary', () => {
      const summary = values.getSummary();
      expect(summary.totalValues).toBe(8);
      expect(summary.topValues).toHaveLength(3);
    });
  });

  describe('diagnose', () => {
    it('returns healthy for 8 values', () => {
      const diag = values.diagnose();
      expect(diag.health).toBe('healthy');
    });

    it('flags needs-values when less than 5 values', () => {
      const empty = new Values({});
      empty.values = {};
      const diag = empty.diagnose();
      expect(diag.health).toBe('needs-values');
    });
  });

  describe('decide - truth context', () => {
    it('prefers honest option and avoids fabricated one', () => {
      const result = values.decide({
        context: '诚实',
        alternatives: ['说出实情', '编造答案']
      });
      expect(result.choice).toBe('说出实情');
    });
  });

  describe('decide - efficiency context', () => {
    it('prefers short option over long one', () => {
      const result = values.decide({
        context: '效率',
        alternatives: ['短选项', 'x'.repeat(100)]
      });
      expect(result.choice).toBe('短选项');
    });
  });

  describe('decide - creative context', () => {
    it('prefers novel option', () => {
      const result = values.decide({
        context: '创新',
        alternatives: ['新方案', '保守方案']
      });
      expect(result.choice).toBe('新方案');
    });
  });

  describe('resolveConflict - reversed priority', () => {
    it('resolves when second value has higher priority', () => {
      const result = values.resolveConflict({ a: 'efficiency', b: 'truth' });
      expect(result.resolution).toBe('truth');
    });
  });

  describe('decide - default parameters', () => {
    it('handles no arguments', () => {
      const result = values.decide();
      expect(result.context).toBe('');
      expect(result.choice).toBeNull();
      expect(result.valuesConsidered).toHaveLength(0);
    });
  });

  describe('check - default parameter', () => {
    it('handles no arguments', () => {
      const result = values.check();
      expect(result).toEqual([]);
    });
  });

  describe('addValue - default data fields', () => {
    it('uses defaults when description is missing and enforce is provided', () => {
      const result = values.addValue('privacy', { enforce: 'protect data' });
      expect(result.success).toBe(true);
      expect(values.values.privacy.description).toBe('');
      expect(values.values.privacy.enforce).toBe('protect data');
    });
  });
});
