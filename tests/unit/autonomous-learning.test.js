const AutonomousLearning = require('../../src/core/AutonomousLearning');

describe('AutonomousLearning', () => {
  let al;

  beforeEach(() => {
    al = new AutonomousLearning();
  });

  describe('constructor', () => {
    test('initializes with empty state', () => {
      const status = al.getStatus();
      expect(status.historyCount).toBe(0);
      expect(status.gapsFound).toBe(0);
      expect(status.patternsDiscovered).toBe(0);
      expect(status.improvementsTracked).toBe(0);
      expect(status.totalInteractions).toBe(0);
      expect(status.learningsApplied).toBe(0);
    });

    test('accepts custom maxHistory', () => {
      const custom = new AutonomousLearning({ maxHistory: 5 });
      for (let i = 0; i < 10; i++) {
        custom._recordInteraction({ intent: `test_${i}` });
      }
      expect(custom._learningHistory.length).toBe(5);
    });
  });

  describe('_recordInteraction', () => {
    test('records interaction with timestamp and id', () => {
      al._recordInteraction({ intent: 'test', confidence: 0.9 });
      expect(al._learningHistory.length).toBe(1);
      expect(al._learningHistory[0].intent).toBe('test');
      expect(al._learningHistory[0].confidence).toBe(0.9);
      expect(al._learningHistory[0].timestamp).toBeDefined();
      expect(al._learningHistory[0]._id).toMatch(/^interact_/);
    });

    test('increments totalInteractions', () => {
      al._recordInteraction({ intent: 'a' });
      al._recordInteraction({ intent: 'b' });
      expect(al._stats.totalInteractions).toBe(2);
    });

    test('trims history to maxHistory', () => {
      const small = new AutonomousLearning({ maxHistory: 3 });
      for (let i = 0; i < 5; i++) {
        small._recordInteraction({ intent: `i${i}` });
      }
      expect(small._learningHistory.length).toBe(3);
      expect(small._learningHistory[0].intent).toBe('i2');
    });
  });

  describe('_discoverGaps', () => {
    test('detects low confidence gap', () => {
      const gaps = al._discoverGaps({ confidence: 0.5, intent: 'test' });
      expect(gaps.length).toBeGreaterThanOrEqual(1);
      const lowConf = gaps.find((g) => g.type === 'low_confidence');
      expect(lowConf).toBeDefined();
      expect(lowConf.urgency).toBe('high');
      expect(lowConf.confidence).toBe(0.5);
    });

    test('detects critical confidence gap', () => {
      const gaps = al._discoverGaps({ confidence: 0.2, intent: 'test' });
      const lowConf = gaps.find((g) => g.type === 'low_confidence');
      expect(lowConf.urgency).toBe('critical');
    });

    test('no gap when confidence >= 0.7', () => {
      const gaps = al._discoverGaps({ confidence: 0.8, intent: 'test' });
      const lowConf = gaps.find((g) => g.type === 'low_confidence');
      expect(lowConf).toBeUndefined();
    });

    test('detects error gap', () => {
      const gaps = al._discoverGaps({ error: 'timeout' });
      const errGap = gaps.find((g) => g.type === 'error');
      expect(errGap).toBeDefined();
      expect(errGap.urgency).toBe('high');
    });

    test('detects new intent gap', () => {
      al._recordInteraction({ intent: 'greet' });
      const gaps = al._discoverGaps({ intent: 'greet' });
      // First time intent is seen, no gap yet (count === 2 means it's not new anymore)
      const newIntent = gaps.find((g) => g.type === 'new_intent');
      // On first interaction with this intent, history has 1 entry, so this is the first encounter
      // But _recordInteraction already added it, so intentHistory.length will be 1 (just recorded)
      // Actually _discoverGaps runs AFTER _recordInteraction in learn(), so history has 1 entry
      // But we call _discoverGaps directly here with just 1 interaction, so it IS the first
      expect(newIntent).toBeDefined();
    });

    test('no new intent gap for repeated intents', () => {
      al._recordInteraction({ intent: 'greet' });
      al._recordInteraction({ intent: 'greet' });
      const gaps = al._discoverGaps({ intent: 'greet' });
      const newIntent = gaps.find((g) => g.type === 'new_intent');
      expect(newIntent).toBeUndefined();
    });

    test('detects periodic review gap at every 10 interactions', () => {
      for (let i = 0; i < 10; i++) {
        al._recordInteraction({ intent: 'test' });
      }
      // After 10 _recordInteraction calls, _learningHistory.length === 10 → 10 % 10 === 0
      const gaps = al._discoverGaps({ intent: 'test' });
      const periodic = gaps.find((g) => g.type === 'periodic_review');
      expect(periodic).toBeDefined();
      expect(periodic.urgency).toBe('low');
    });

    test('no periodic gap at non-10 intervals', () => {
      for (let i = 0; i < 5; i++) {
        al._recordInteraction({ intent: 'test' });
      }
      const gaps = al._discoverGaps({ intent: 'test' });
      const periodic = gaps.find((g) => g.type === 'periodic_review');
      expect(periodic).toBeUndefined();
    });

    test('detects repeated errors (3+ in last hour)', () => {
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        al._learningHistory.push({
          error: `err_${i}`,
          timestamp: now - 1000 * i
        });
      }
      const gaps = al._discoverGaps({ intent: 'test' });
      const repeated = gaps.find((g) => g.type === 'repeated_error');
      expect(repeated).toBeDefined();
      expect(repeated.urgency).toBe('critical');
    });
  });

  describe('_acquireKnowledge', () => {
    test('generates knowledge tasks for each gap type', () => {
      const gaps = [
        { type: 'low_confidence', area: 'test', urgency: 'high', confidence: 0.5 },
        { type: 'error', area: 'api', urgency: 'high' },
        { type: 'repeated_error', area: 'error_handling', urgency: 'critical' },
        { type: 'new_intent', area: 'deploy', urgency: 'medium' },
        { type: 'periodic_review', area: 'system', urgency: 'low' }
      ];
      const knowledge = al._acquireKnowledge(gaps);
      expect(knowledge.length).toBe(5);
      expect(knowledge.map((k) => k.action)).toContain('deep_research');
      expect(knowledge.map((k) => k.action)).toContain('error_analysis');
      expect(knowledge.map((k) => k.action)).toContain('systematic_fix');
      expect(knowledge.map((k) => k.action)).toContain('intent_learning');
      expect(knowledge.map((k) => k.action)).toContain('knowledge_review');
    });

    test('each knowledge task has steps', () => {
      const knowledge = al._acquireKnowledge([
        { type: 'low_confidence', area: 'test', urgency: 'high' }
      ]);
      expect(knowledge[0].steps).toBeDefined();
      expect(Array.isArray(knowledge[0].steps)).toBe(true);
      expect(knowledge[0].steps.length).toBeGreaterThan(0);
    });

    test('returns empty for no gaps', () => {
      expect(al._acquireKnowledge([])).toEqual([]);
    });
  });

  describe('_discoverPatterns', () => {
    test('returns empty for less than 3 interactions', () => {
      al._recordInteraction({ intent: 'a' });
      al._recordInteraction({ intent: 'a' });
      expect(al._discoverPatterns()).toEqual([]);
    });

    test('detects repeated_intent pattern', () => {
      for (let i = 0; i < 5; i++) {
        al._recordInteraction({ intent: 'code_review' });
      }
      const patterns = al._discoverPatterns();
      const repeated = patterns.find((p) => p.type === 'repeated_intent');
      expect(repeated).toBeDefined();
      expect(repeated.intent).toBe('code_review');
      expect(repeated.count).toBe(5);
      expect(repeated.confidence).toBe(0.5);
    });

    test('repeated_intent only triggers for count >= 3', () => {
      for (let i = 0; i < 2; i++) {
        al._recordInteraction({ intent: 'test' });
      }
      al._recordInteraction({ intent: 'other' });
      const patterns = al._discoverPatterns();
      const repeated = patterns.find((p) => p.type === 'repeated_intent');
      expect(repeated).toBeUndefined();
    });

    test('detects peak_usage pattern', () => {
      const now = Date.now();
      for (let i = 0; i < 6; i++) {
        al._learningHistory.push({
          intent: 'test',
          timestamp: now - i * 1000
        });
      }
      const patterns = al._discoverPatterns();
      const peak = patterns.find((p) => p.type === 'peak_usage');
      expect(peak).toBeDefined();
      expect(peak.hours.length).toBeGreaterThan(0);
    });

    test('detects error_cluster pattern', () => {
      for (let i = 0; i < 3; i++) {
        al._learningHistory.push({
          intent: 'deploy',
          error: 'timeout',
          timestamp: Date.now() - i * 1000
        });
      }
      al._recordInteraction({ intent: 'ok' });
      const patterns = al._discoverPatterns();
      const cluster = patterns.find((p) => p.type === 'error_cluster');
      expect(cluster).toBeDefined();
      expect(cluster.intent).toBe('deploy');
      expect(cluster.errorCount).toBe(3);
    });

    test('detects confidence_degradation pattern', () => {
      const now = Date.now();
      // First 5 interactions: high confidence
      for (let i = 0; i < 5; i++) {
        al._learningHistory.push({
          intent: 'test',
          confidence: 0.9,
          timestamp: now - (10 - i) * 1000
        });
      }
      // Last 5 interactions: low confidence
      for (let i = 0; i < 5; i++) {
        al._learningHistory.push({
          intent: 'test',
          confidence: 0.5,
          timestamp: now - (4 - i) * 1000
        });
      }
      const patterns = al._discoverPatterns();
      const degrade = patterns.find((p) => p.type === 'confidence_degradation');
      expect(degrade).toBeDefined();
      expect(degrade.delta).toBeLessThan(0);
    });

    test('deduplicates patterns', () => {
      for (let i = 0; i < 5; i++) {
        al._recordInteraction({ intent: 'test' });
      }
      const patterns = al._discoverPatterns();
      const repeated = patterns.filter((p) => p.type === 'repeated_intent');
      expect(repeated.length).toBe(1);
    });

    test('sorts peak usage hours and includes multiple', () => {
      const h12 = new Date('2026-01-01T12:00:00').getTime();
      const h13 = h12 + 3600000;
      const h14 = h12 + 7200000;
      for (let i = 0; i < 6; i++) al._learningHistory.push({ intent: 'a', timestamp: h12 });
      for (let i = 0; i < 5; i++) al._learningHistory.push({ intent: 'b', timestamp: h13 });
      al._learningHistory.push({ intent: 'c', timestamp: h14 });
      const patterns = al._discoverPatterns();
      const peak = patterns.find((p) => p.type === 'peak_usage');
      expect(peak).toBeDefined();
      expect(peak.hours.length).toBeGreaterThan(1);
    });

    test('error_cluster only triggers for count >= 2', () => {
      for (let i = 0; i < 3; i++) {
        al._learningHistory.push({ intent: `err${i}`, error: 'x', timestamp: Date.now() - i * 1000 });
      }
      const patterns = al._discoverPatterns();
      const cluster = patterns.find((p) => p.type === 'error_cluster');
      expect(cluster).toBeUndefined();
    });

    test('does not degrade when recent confidence is stable', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        al._learningHistory.push({ intent: 'test', confidence: 0.8, timestamp: now - (10 - i) * 1000 });
      }
      const patterns = al._discoverPatterns();
      const degrade = patterns.find((p) => p.type === 'confidence_degradation');
      expect(degrade).toBeUndefined();
    });

    test('handles exactly 5 recent confidences without previous slice', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        al._learningHistory.push({ intent: 'test', confidence: 0.9, timestamp: now - i * 1000 });
      }
      const patterns = al._discoverPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('_activeLearn', () => {
    test('generates learnings from patterns', () => {
      const patterns = [
        { type: 'repeated_intent', intent: 'code', count: 5 },
        { type: 'error_cluster', intent: 'deploy', errorCount: 3 }
      ];
      const learnings = al._activeLearn(patterns, []);
      expect(learnings.length).toBe(2);
      expect(learnings[0].topic).toBe('code');
      expect(learnings[0].action).toBe('deep_dive');
      expect(learnings[1].topic).toBe('deploy');
      expect(learnings[1].action).toBe('error_prevention');
    });

    test('generates learnings from knowledge', () => {
      const knowledge = [
        { area: 'api', action: 'error_analysis', method: 'case_study' }
      ];
      const learnings = al._activeLearn([], knowledge);
      expect(learnings.length).toBe(1);
      expect(learnings[0].topic).toBe('api');
    });

    test('handles confidence_degradation pattern', () => {
      const patterns = [
        { type: 'confidence_degradation', previousAvg: 0.9, recentAvg: 0.5, delta: -0.4 }
      ];
      const learnings = al._activeLearn(patterns, []);
      expect(learnings.length).toBe(1);
      expect(learnings[0].action).toBe('quality_review');
    });

    test('handles peak_usage pattern', () => {
      const patterns = [
        { type: 'peak_usage', hours: [{ hour: 14, count: 10 }] }
      ];
      const learnings = al._activeLearn(patterns, []);
      expect(learnings.length).toBe(1);
      expect(learnings[0].action).toBe('capacity_planning');
    });

    test('adds learning records to history', () => {
      al._activeLearn(
        [{ type: 'repeated_intent', intent: 'test', count: 3 }],
        []
      );
      expect(al._learningHistory.length).toBeGreaterThan(0);
      const records = al._learningHistory.filter((h) => h._type === 'learning_record');
      expect(records.length).toBe(1);
    });
  });

  describe('_improve', () => {
    test('creates improvement records', () => {
      const learning = [
        { topic: 'code', action: 'deep_dive', method: 'study', expectedOutcome: 'better' }
      ];
      const improvements = al._improve(learning);
      expect(improvements.length).toBe(1);
      expect(improvements[0].area).toBe('code');
      expect(improvements[0].status).toBe('planned');
    });

    test('reinforces existing improvements', () => {
      const learning = [
        { topic: 'code', action: 'deep_dive', method: 'study', expectedOutcome: 'better' }
      ];
      al._improve(learning);
      const improved = al._improve(learning);
      expect(improved[0].status).toBe('reinforced');
      expect(improved[0].reinforcedAt).toBeDefined();
    });

    test('tracks improvements in getStatus', () => {
      al._improve([{ topic: 'a', action: 'x', method: 'y', expectedOutcome: 'z' }]);
      al._improve([{ topic: 'b', action: 'y', method: 'z', expectedOutcome: 'w' }]);
      const status = al.getStatus();
      expect(status.improvementsTracked).toBe(2);
      expect(status.improvementsByStatus.planned).toBe(2);
      expect(status.learningsApplied).toBe(2);
    });
  });

  describe('learn (full cycle)', () => {
    test('returns complete result with all fields', () => {
      const result = al.learn({ intent: 'test', confidence: 0.9 });
      expect(result).toHaveProperty('gaps');
      expect(result).toHaveProperty('knowledge');
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('learning');
      expect(result).toHaveProperty('improvements');
      expect(result).toHaveProperty('timestamp');
    });

    test('processes low confidence interaction', () => {
      const result = al.learn({ intent: 'unknown_task', confidence: 0.3 });
      expect(result.gaps.length).toBeGreaterThanOrEqual(1);
      expect(result.knowledge.length).toBeGreaterThanOrEqual(1);
    });

    test('processes error interaction', () => {
      const result = al.learn({ intent: 'deploy', error: 'connection refused' });
      const errGap = result.gaps.find((g) => g.type === 'error');
      expect(errGap).toBeDefined();
    });

    test('accumulates history over multiple calls', () => {
      al.learn({ intent: 'a', confidence: 0.9 });
      al.learn({ intent: 'b', confidence: 0.8 });
      al.learn({ intent: 'c', confidence: 0.7 });
      expect(al._learningHistory.length).toBeGreaterThanOrEqual(3);
    });

    test('learn with no arguments uses empty interaction', () => {
      const result = al.learn();
      expect(result).toHaveProperty('gaps');
      expect(result).toHaveProperty('patterns');
    });

    test('low confidence without intent defaults area to unknown', () => {
      const result = al.learn({ confidence: 0.5 });
      expect(result.gaps.some((g) => g.area === 'unknown')).toBe(true);
    });
  });

  describe('getRecommendations', () => {
    test('returns empty when no gaps or improvements', () => {
      expect(al.getRecommendations()).toEqual([]);
    });

    test('returns urgent gap resolutions first', () => {
      al._knowledgeGaps = [
        { type: 'error', area: 'api', urgency: 'high', suggestion: 'fix it' },
        { type: 'periodic_review', area: 'system', urgency: 'low', suggestion: 'review' }
      ];
      const recs = al.getRecommendations();
      expect(recs.length).toBe(1);
      expect(recs[0].type).toBe('gap_resolution');
      expect(recs[0].priority).toBe(1);
    });

    test('returns critical gaps with highest priority', () => {
      al._knowledgeGaps = [
        { type: 'repeated_error', area: 'x', urgency: 'critical', suggestion: 'fix now' }
      ];
      const recs = al.getRecommendations();
      expect(recs[0].priority).toBe(0);
    });

    test('includes unreinforced learning applications', () => {
      al._improvements = [
        { area: 'test', action: 'deep_dive', status: 'planned', expectedOutcome: 'improved' }
      ];
      const recs = al.getRecommendations();
      expect(recs.length).toBe(1);
      expect(recs[0].type).toBe('learning_application');
    });

    test('sorts recommendations by priority', () => {
      al._knowledgeGaps = [
        { type: 'repeated_error', area: 'a', urgency: 'critical', suggestion: 'x' },
        { type: 'error', area: 'b', urgency: 'high', suggestion: 'y' },
        { type: 'periodic_review', area: 'c', urgency: 'low', suggestion: 'z' }
      ];
      al._improvements = [
        { area: 'd', action: 'deep_dive', status: 'planned', expectedOutcome: 'w' }
      ];
      const recs = al.getRecommendations();
      expect(recs.length).toBeGreaterThan(1);
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i - 1].priority).toBeLessThanOrEqual(recs[i].priority);
      }
    });
  });

  describe('getHistory', () => {
    test('returns recent history', () => {
      for (let i = 0; i < 10; i++) {
        al._learningHistory.push({ intent: `i${i}`, timestamp: Date.now() });
      }
      const hist = al.getHistory(3);
      expect(hist.length).toBe(3);
      expect(hist[0].intent).toBe('i7');
    });

    test('defaults to 50', () => {
      for (let i = 0; i < 60; i++) {
        al._learningHistory.push({ intent: `i${i}` });
      }
      expect(al.getHistory().length).toBe(50);
    });
  });

  describe('getPatterns / getImprovements', () => {
    test('returns copies of internal state', () => {
      al._discoveredPatterns = [{ type: 'test' }];
      al._improvements = [{ area: 'test' }];
      const p = al.getPatterns();
      const i = al.getImprovements();
      expect(p).toEqual([{ type: 'test' }]);
      expect(i).toEqual([{ area: 'test' }]);
      // Mutating returned array shouldn't affect internal state
      p.push({ type: 'mutated' });
      expect(al.getPatterns().length).toBe(1);
    });
  });

  describe('clearHistory', () => {
    test('resets all state', () => {
      al.learn({ intent: 'test', confidence: 0.5 });
      al.clearHistory();
      const status = al.getStatus();
      expect(status.historyCount).toBe(0);
      expect(status.gapsFound).toBe(0);
      expect(status.patternsDiscovered).toBe(0);
      expect(status.improvementsTracked).toBe(0);
      expect(status.totalInteractions).toBe(0);
    });
  });

  describe('persistence', () => {
    const os = require('os');
    const path = require('path');

    test('saves and loads from file', () => {
      const file = path.join(os.tmpdir(), `al_test_${Date.now()}.json`);
      const saved = new AutonomousLearning({ persistenceFile: file });
      saved.learn({ intent: 'persist_test', confidence: 0.6 });
      saved.learn({ intent: 'persist_test', confidence: 0.4 });
      saved.learn({ intent: 'persist_test', confidence: 0.3 });

      const loaded = new AutonomousLearning({ persistenceFile: file });
      expect(loaded._learningHistory.length).toBeGreaterThanOrEqual(3);
      expect(loaded._stats.totalInteractions).toBeGreaterThanOrEqual(3);

      try { require('fs').unlinkSync(file); } catch (e) { /* ignore */ }
    });

    test('handles invalid file gracefully', () => {
      const bad = new AutonomousLearning({ persistenceFile: '/nonexistent/path/file.json' });
      expect(bad._learningHistory).toEqual([]);
    });

    test('handles corrupted file gracefully', () => {
      const file = path.join(os.tmpdir(), `al_corrupt_${Date.now()}.json`);
      require('fs').writeFileSync(file, 'not json!!!');
      const loaded = new AutonomousLearning({ persistenceFile: file });
      expect(loaded._learningHistory).toEqual([]);
      try { require('fs').unlinkSync(file); } catch (e) { /* ignore */ }
    });

    test('uses empty defaults when data lacks fields', () => {
      const file = path.join(os.tmpdir(), `al_sparse_${Date.now()}.json`);
      require('fs').writeFileSync(file, JSON.stringify({ other: 'x' }));
      const loaded = new AutonomousLearning({ persistenceFile: file });
      expect(loaded._learningHistory).toEqual([]);
      expect(loaded._knowledgeGaps).toEqual([]);
      expect(loaded._discoveredPatterns).toEqual([]);
      expect(loaded._improvements).toEqual([]);
      try { require('fs').unlinkSync(file); } catch (e) { /* ignore */ }
    });

    test('creates directory when missing on save', () => {
      const dir = path.join(os.tmpdir(), `al_mkdir_${Date.now()}`);
      const file = path.join(dir, 'sub', 'file.json');
      const saved = new AutonomousLearning({ persistenceFile: file });
      saved.learn({ intent: 'x', confidence: 0.5 });
      expect(require('fs').existsSync(file)).toBe(true);
      try { require('fs').rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    });
  });
});
