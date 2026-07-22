jest.mock('../../src/core/Emotion', () => {
  return jest.fn().mockImplementation(() => ({
    perceive: jest.fn().mockReturnValue({ current: 'curious', intensity: 0.5 }),
    getEmotionState: jest.fn().mockReturnValue({ current: 'curious', intensity: 0.5 }),
    express: jest.fn().mockReturnValue({ preface: 'test' }),
    diagnose: jest.fn().mockReturnValue({ health: 'good' })
  }));
});

jest.mock('../../src/core/Values', () => {
  return jest.fn().mockImplementation(() => ({
    getSummary: jest.fn().mockReturnValue(['value1']),
    decide: jest.fn().mockReturnValue({ decision: 'option1' }),
    explain: jest.fn().mockReturnValue('value1 explanation'),
    diagnose: jest.fn().mockReturnValue({ health: 'good' })
  }));
});

describe('Personality', () => {
  let Personality;
  let brain;

  beforeAll(() => {
    Personality = require('../../src/core/Personality');
  });

  beforeEach(() => {
    brain = { mock: true };
  });

  describe('constructor', () => {
    it('initializes with default styles', () => {
      const p = new Personality(brain);
      expect(p.styles).toHaveProperty('direct');
      expect(p.styles).toHaveProperty('explanatory');
      expect(p.styles).toHaveProperty('exploratory');
      expect(p.styles).toHaveProperty('technical');
    });

    it('sets default style to exploratory', () => {
      const p = new Personality(brain);
      expect(p.currentStyle).toBe('exploratory');
    });

    it('has 6 default traits', () => {
      const p = new Personality(brain);
      expect(Object.keys(p.traits)).toHaveLength(6);
      expect(p.traits.curious).toBe(0.9);
    });

    it('has catchphrases', () => {
      const p = new Personality(brain);
      expect(p.catchphrases.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('process', () => {
    it('returns emotion, style and traits', () => {
      const p = new Personality(brain);
      const result = p.process('hello');
      expect(result.emotion).toBeDefined();
      expect(result.style).toBeDefined();
      expect(result.traits).toBeDefined();
    });

    it('calls emotion.perceive', () => {
      const p = new Personality(brain);
      p.process('test');
      expect(p.emotion.perceive).toHaveBeenCalledWith('test');
    });
  });

  describe('respond', () => {
    it('returns response with preface and content', () => {
      const p = new Personality(brain);
      const result = p.respond('hello world');
      expect(result.preface).toBeDefined();
      expect(result.content).toBe('hello world');
      expect(result.style).toBe('exploratory');
    });

    it('includes emotion.express when addExtras is set', () => {
      const p = new Personality(brain);
      const result = p.respond('test', { addExtras: true });
      expect(p.emotion.express).toHaveBeenCalledWith('test');
      expect(result.preface).toBe('test');
    });
  });

  describe('_generatePreface', () => {
    it('returns a string for any emotion state', () => {
      const p = new Personality(brain);
      const states = ['curious', 'focused', 'hopeful', 'playful', 'careful', 'creative', 'analytical', 'unknown'];
      states.forEach((s) => {
        const preface = p._generatePreface({ current: s });
        expect(typeof preface).toBe('string');
        expect(preface.length).toBeGreaterThan(0);
      });
    });
  });

  describe('_adjustStyle', () => {
    it('sets explanatory for how/why questions', () => {
      const p = new Personality(brain);
      p._adjustStyle('how do I fix this');
      expect(p.currentStyle).toBe('explanatory');
    });

    it('sets direct for do/implement requests', () => {
      const p = new Personality(brain);
      p._adjustStyle('do this now');
      expect(p.currentStyle).toBe('direct');
    });

    it('sets technical for long input', () => {
      const p = new Personality(brain);
      p._adjustStyle('a'.repeat(101));
      expect(p.currentStyle).toBe('technical');
    });

    it('sets exploratory for think/want', () => {
      const p = new Personality(brain);
      p._adjustStyle('我想 something');
      expect(p.currentStyle).toBe('exploratory');
    });
  });

  describe('setTrait', () => {
    it('updates existing trait', () => {
      const p = new Personality(brain);
      const result = p.setTrait('curious', 0.5);
      expect(result.success).toBe(true);
      expect(p.traits.curious).toBe(0.5);
    });

    it('clamps trait value between 0 and 1', () => {
      const p = new Personality(brain);
      p.setTrait('curious', 5);
      expect(p.traits.curious).toBe(1);
      p.setTrait('curious', -1);
      expect(p.traits.curious).toBe(0);
    });

    it('returns error for unknown trait', () => {
      const p = new Personality(brain);
      const result = p.setTrait('nonexistent', 0.5);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('setStyle', () => {
    it('sets valid style', () => {
      const p = new Personality(brain);
      const result = p.setStyle('technical');
      expect(result.success).toBe(true);
      expect(p.currentStyle).toBe('technical');
    });

    it('returns error for unknown style', () => {
      const p = new Personality(brain);
      const result = p.setStyle('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('getPersonality', () => {
    it('returns complete personality state', () => {
      const p = new Personality(brain);
      const state = p.getPersonality();
      expect(state.emotion).toBeDefined();
      expect(state.values).toEqual(['value1']);
      expect(state.style).toBeDefined();
      expect(state.traits).toBeDefined();
    });
  });

  describe('decide', () => {
    it('delegates to values.decide', () => {
      const p = new Personality(brain);
      const result = p.decide({ options: ['a', 'b'] });
      expect(result).toEqual({ decision: 'option1' });
      expect(p.values.decide).toHaveBeenCalledWith({ options: ['a', 'b'] });
    });
  });

  describe('explainValue', () => {
    it('delegates to values.explain', () => {
      const p = new Personality(brain);
      const result = p.explainValue('test');
      expect(result).toBe('value1 explanation');
      expect(p.values.explain).toHaveBeenCalledWith('test');
    });
  });

  describe('diagnose', () => {
    it('returns health info', () => {
      const p = new Personality(brain);
      const result = p.diagnose();
      expect(result.health).toBe('complete');
      expect(result.emotion).toBeDefined();
      expect(result.values).toBeDefined();
      expect(result.style).toBeDefined();
    });
  });
});
