const { AutoPriceAdjuster } = require('../../src/industry/ecommerce/AutoPriceAdjuster');

describe('AutoPriceAdjuster', () => {
  let adjuster;

  beforeEach(() => {
    adjuster = new AutoPriceAdjuster();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(adjuster.rules).toBeInstanceOf(Map);
      expect(adjuster.executions).toEqual([]);
      expect(adjuster.maxExecutions).toBe(500);
      expect(adjuster.autoExecute).toBe(false);
      expect(typeof adjuster.onAdjust).toBe('function');
      expect(typeof adjuster.onNotify).toBe('function');
      expect(typeof adjuster.onError).toBe('function');
    });

    it('should accept custom options', () => {
      const onAdjust = jest.fn();
      const custom = new AutoPriceAdjuster({ maxExecutions: 100, autoExecute: true, onAdjust });
      expect(custom.maxExecutions).toBe(100);
      expect(custom.autoExecute).toBe(true);
      expect(custom.onAdjust).toBe(onAdjust);
    });
  });

  describe('addRule', () => {
    it('should add a rule and return it with an id', () => {
      const rule = adjuster.addRule({
        name: 'Test Rule',
        productId: 'prod_1',
        conditionType: 'price_below',
        conditionValue: 50,
        actionType: 'set_price',
        actionValue: 45,
        minPrice: 10,
        maxPrice: 100
      });
      expect(rule.id).toMatch(/^rule_/);
      expect(rule.name).toBe('Test Rule');
      expect(rule.productId).toBe('prod_1');
      expect(rule.condition.type).toBe('price_below');
      expect(rule.condition.value).toBe(50);
      expect(rule.action.type).toBe('set_price');
      expect(rule.action.value).toBe(45);
      expect(rule.limits.minPrice).toBe(10);
      expect(rule.limits.maxPrice).toBe(100);
      expect(rule.enabled).toBe(true);
      expect(rule.triggerCount).toBe(0);
      expect(adjuster.rules.size).toBe(1);
    });

    it('should set default limits when not provided', () => {
      const rule = adjuster.addRule({ name: 'Default Limits' });
      expect(rule.limits.minPrice).toBe(0);
      expect(rule.limits.maxPrice).toBe(Infinity);
      expect(rule.limits.maxAdjustment).toBe(20);
    });

    it('should allow disabled rule', () => {
      const rule = adjuster.addRule({ name: 'Disabled', enabled: false });
      expect(rule.enabled).toBe(false);
    });
  });

  describe('removeRule', () => {
    it('should remove an existing rule', () => {
      const rule = adjuster.addRule({ name: 'To Remove' });
      expect(adjuster.removeRule(rule.id)).toBe(true);
      expect(adjuster.rules.size).toBe(0);
    });

    it('should return false for non-existent rule', () => {
      expect(adjuster.removeRule('nonexistent')).toBe(false);
    });
  });

  describe('evaluate', () => {
    beforeEach(() => {
      adjuster.addRule({
        name: 'Below 50',
        productId: 'prod_1',
        conditionType: 'price_below',
        conditionValue: 50,
        actionType: 'set_price',
        actionValue: 45
      });
    });

    it('should trigger when price is below threshold', async () => {
      const result = await adjuster.evaluate('prod_1', 40);
      expect(result).toHaveLength(1);
      expect(result[0].currentPrice).toBe(40);
      expect(result[0].newPrice).toBe(45);
      expect(result[0].reason).toContain('低于阈值');
    });

    it('should not trigger when price is above threshold', async () => {
      const result = await adjuster.evaluate('prod_1', 60);
      expect(result).toHaveLength(0);
    });

    it('should skip disabled rules', async () => {
      const adjusterWithLimit = new AutoPriceAdjuster();
      adjusterWithLimit.addRule({
        name: 'Below 50',
        productId: 'prod_1',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'set_price',
        actionValue: 45,
        maxAdjustment: 500
      });
      adjusterWithLimit.addRule({ name: 'Disabled', enabled: false, conditionValue: 0, conditionType: 'price_below' });
      const result = await adjusterWithLimit.evaluate('prod_1', 40);
      expect(result).toHaveLength(1);
    });

    it('should respect productId filter', async () => {
      const result = await adjuster.evaluate('prod_2', 40);
      expect(result).toHaveLength(0);
    });

    it('should handle competitor_lower condition', async () => {
      adjuster.addRule({
        name: 'Competitor Lower',
        productId: 'prod_2',
        conditionType: 'competitor_lower',
        actionType: 'match_competitor'
      });
      const result = await adjuster.evaluate('prod_2', 100, 80);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(80);
    });

    it('should handle competitor_higher condition', async () => {
      adjuster.addRule({
        name: 'Competitor Higher',
        productId: 'prod_2',
        conditionType: 'competitor_higher',
        actionType: 'match_competitor'
      });
      const result = await adjuster.evaluate('prod_2', 100, 120);
      expect(result).toHaveLength(1);
    });

    it('should handle competitor_diff condition', async () => {
      adjuster.addRule({
        name: 'Diff',
        productId: 'prod_2',
        conditionType: 'competitor_diff',
        conditionValue: 10,
        actionType: 'set_price',
        actionValue: 95
      });
      const result = await adjuster.evaluate('prod_2', 100, 80);
      expect(result).toHaveLength(1);
    });

    it('should enforce maxAdjustment limit', async () => {
      adjuster.addRule({
        name: 'Small adjustment',
        productId: 'prod_3',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'set_price',
        actionValue: 1,
        maxAdjustment: 5
      });
      const result = await adjuster.evaluate('prod_3', 90);
      expect(result).toHaveLength(0);
    });

    it('should enforce minPrice/maxPrice limits', async () => {
      adjuster.addRule({
        name: 'Min/Max',
        productId: 'prod_4',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'set_price',
        actionValue: 5,
        minPrice: 10,
        maxPrice: 50
      });
      const result = await adjuster.evaluate('prod_4', 90);
      expect(result).toHaveLength(0);
    });

    it('should handle price_above condition', async () => {
      adjuster.addRule({
        name: 'Above 100',
        productId: 'prod_5',
        conditionType: 'price_above',
        conditionValue: 100,
        actionType: 'percentage_change',
        actionPercentage: -10
      });
      const result = await adjuster.evaluate('prod_5', 150);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(135);
    });

    it('should handle fixed_change action', async () => {
      adjuster.addRule({
        name: 'Fixed Change',
        productId: 'prod_6',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'fixed_change',
        actionValue: 5
      });
      const result = await adjuster.evaluate('prod_6', 80);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(85);
    });

    it('should handle undercut_competitor action', async () => {
      adjuster.addRule({
        name: 'Undercut',
        productId: 'prod_7',
        conditionType: 'competitor_lower',
        actionType: 'undercut_competitor',
        actionPercentage: 5
      });
      const result = await adjuster.evaluate('prod_7', 100, 90);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(85.5);
    });
  });

  describe('execute', () => {
    it('should create an execution record', async () => {
      adjuster.addRule({ name: 'Test', productId: 'prod_1' });
      const rule = adjuster.rules.values().next().value;
      const execution = await adjuster.execute('prod_1', 45, rule.id, 'Test reason');
      expect(execution.id).toMatch(/^exec_/);
      expect(execution.productId).toBe('prod_1');
      expect(execution.newPrice).toBe(45);
      expect(execution.status).toBe('pending');
    });

    it('should set status to executed when autoExecute is true', async () => {
      const auto = new AutoPriceAdjuster({ autoExecute: true });
      auto.addRule({ name: 'Test', productId: 'prod_1' });
      const rule = auto.rules.values().next().value;
      const execution = await auto.execute('prod_1', 45, rule.id, 'Auto');
      expect(execution.status).toBe('executed');
    });

    it('should update rule triggerCount', async () => {
      adjuster.addRule({ name: 'Test', productId: 'prod_1' });
      const rule = adjuster.rules.values().next().value;
      await adjuster.execute('prod_1', 45, rule.id, 'Test');
      expect(rule.triggerCount).toBe(1);
      expect(rule.lastTriggered).toBeTruthy();
    });

    it('should call onAdjust and onNotify callbacks', async () => {
      const onAdjust = jest.fn();
      const onNotify = jest.fn();
      const adj = new AutoPriceAdjuster({ onAdjust, onNotify });
      adj.addRule({ name: 'Test', productId: 'prod_1' });
      const rule = adj.rules.values().next().value;
      await adj.execute('prod_1', 45, rule.id, 'Test');
      expect(onAdjust).toHaveBeenCalledTimes(1);
      expect(onNotify).toHaveBeenCalledTimes(1);
    });

    it('should trim execution history when exceeding max', async () => {
      const adj = new AutoPriceAdjuster({ maxExecutions: 2 });
      adj.addRule({ name: 'Test' });
      const rule = adj.rules.values().next().value;
      await adj.execute('prod_1', 1, rule.id, '1');
      await adj.execute('prod_1', 2, rule.id, '2');
      await adj.execute('prod_1', 3, rule.id, '3');
      expect(adj.executions).toHaveLength(2);
    });
  });

  describe('approveExecution', () => {
    it('should approve a pending execution', async () => {
      adjuster.addRule({ name: 'Test' });
      const rule = adjuster.rules.values().next().value;
      const execution = await adjuster.execute('prod_1', 45, rule.id, 'Test');
      const result = await adjuster.approveExecution(execution.id);
      expect(result).toBe(true);
      expect(execution.status).toBe('approved');
      expect(execution.approvedAt).toBeTruthy();
    });

    it('should return false for non-existent execution', async () => {
      const result = await adjuster.approveExecution('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('rejectExecution', () => {
    it('should reject a pending execution with reason', async () => {
      adjuster.addRule({ name: 'Test' });
      const rule = adjuster.rules.values().next().value;
      const execution = await adjuster.execute('prod_1', 45, rule.id, 'Test');
      const result = await adjuster.rejectExecution(execution.id, 'Price too low');
      expect(result).toBe(true);
      expect(execution.status).toBe('rejected');
      expect(execution.rejectReason).toBe('Price too low');
    });

    it('should return false for non-existent execution', async () => {
      const result = await adjuster.rejectExecution('nonexistent', 'Nope');
      expect(result).toBe(false);
    });
  });

  describe('getRule', () => {
    it('should return a rule by id', () => {
      const rule = adjuster.addRule({ name: 'Get Test' });
      expect(adjuster.getRule(rule.id)).toBe(rule);
    });

    it('should return undefined for non-existent rule', () => {
      expect(adjuster.getRule('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllRules', () => {
    it('should return all rules', () => {
      adjuster.addRule({ name: 'Rule 1' });
      adjuster.addRule({ name: 'Rule 2' });
      const rules = adjuster.getAllRules();
      expect(rules).toHaveLength(2);
    });
  });

  describe('getActiveRules', () => {
    it('should return only enabled rules', () => {
      adjuster.addRule({ name: 'Active 1' });
      adjuster.addRule({ name: 'Inactive', enabled: false });
      const active = adjuster.getActiveRules();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Active 1');
    });
  });

  describe('getPendingExecutions', () => {
    it('should return pending executions', async () => {
      adjuster.addRule({ name: 'Test' });
      const rule = adjuster.rules.values().next().value;
      await adjuster.execute('prod_1', 45, rule.id, 'Test');
      const pending = adjuster.getPendingExecutions();
      expect(pending).toHaveLength(1);
    });
  });

  describe('getExecutionHistory', () => {
    it('should return recent executions', async () => {
      adjuster.addRule({ name: 'Test' });
      const rule = adjuster.rules.values().next().value;
      await adjuster.execute('prod_1', 45, rule.id, 'Test');
      const history = adjuster.getExecutionHistory();
      expect(history).toHaveLength(1);
    });

    it('should respect limit', async () => {
      adjuster.addRule({ name: 'Test' });
      const rule = adjuster.rules.values().next().value;
      for (let i = 0; i < 5; i++) {
        await adjuster.execute('prod_1', i, rule.id, `Test ${i}`);
      }
      expect(adjuster.getExecutionHistory(2)).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return accurate stats', async () => {
      adjuster.addRule({ name: 'Active 1' });
      adjuster.addRule({ name: 'Inactive', enabled: false });
      const rule = adjuster.rules.values().next().value;
      const exec = await adjuster.execute('prod_1', 45, rule.id, 'Test');
      await adjuster.approveExecution(exec.id);
      await adjuster.execute('prod_1', 50, rule.id, 'Test 2');
      const stats = adjuster.getStats();
      expect(stats.rules.total).toBe(2);
      expect(stats.rules.enabled).toBe(1);
      expect(stats.executions.total).toBe(2);
      expect(stats.executions.approved).toBe(1);
      expect(stats.executions.pending).toBe(1);
    });
  });

  describe('destroy', () => {
    it('should clear all rules and executions', () => {
      adjuster.addRule({ name: 'Rule 1' });
      adjuster.destroy();
      expect(adjuster.rules.size).toBe(0);
      expect(adjuster.executions).toHaveLength(0);
    });
  });

  describe('edge case branches', () => {
    it('should handle undercut_competitor without competitorPrice', async () => {
      adjuster.addRule({
        name: 'Undercut no comp',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'undercut_competitor',
      });
      const result = await adjuster.evaluate('prod_1', 50, null);
      expect(result).toHaveLength(0);
    });

    it('should handle unknown action type in _calculateNewPrice', async () => {
      adjuster.addRule({
        name: 'Unknown action',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'unknown_action',
      });
      const result = await adjuster.evaluate('prod_1', 50);
      expect(result).toHaveLength(0);
    });

    it('should not trigger competitor conditions when competitorPrice is null', async () => {
      adjuster.addRule({ name: 'Lower no comp', conditionType: 'competitor_lower', actionType: 'set_price', actionValue: 50 });
      adjuster.addRule({ name: 'Higher no comp', conditionType: 'competitor_higher', actionType: 'set_price', actionValue: 50 });
      adjuster.addRule({ name: 'Diff no comp', conditionType: 'competitor_diff', conditionValue: 10, actionType: 'set_price', actionValue: 50 });
      const result = await adjuster.evaluate('prod_1', 100, null);
      expect(result).toHaveLength(0);
    });

    it('should handle execute with non-existent rule id', async () => {
      const execution = await adjuster.execute('prod_1', 45, 'nonexistent_rule', 'Test');
      expect(execution.ruleId).toBe('nonexistent_rule');
      expect(execution.status).toBe('pending');
    });

    it('should fall back to currentPrice for match_competitor when competitorPrice is falsy', async () => {
      adjuster.addRule({
        name: 'Match no comp',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'match_competitor',
      });
      const result = await adjuster.evaluate('prod_1', 50, null);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(50);
    });

    it('should not trigger competitor_diff when difference is below threshold', async () => {
      adjuster.addRule({
        name: 'Diff small',
        conditionType: 'competitor_diff',
        conditionValue: 50,
        actionType: 'set_price',
        actionValue: 95,
      });
      const result = await adjuster.evaluate('prod_1', 100, 110);
      expect(result).toHaveLength(0);
    });

    it('should use custom onError callback', () => {
      const onError = jest.fn();
      const adj = new AutoPriceAdjuster({ onError });
      expect(adj.onError).toBe(onError);
    });

    it('should cover _getReason default for unknown condition type', () => {
      const rule = adjuster.addRule({
        name: 'Unknown condition',
        conditionType: 'price_below',
        conditionValue: 0,
        actionType: 'set_price',
        actionValue: 1,
      });
      rule.condition.type = 'unknown_type';
      const reason = adjuster._getReason(rule, 50, null);
      expect(reason).toBe('条件触发');
    });

    it('should default undercut percentage to 1% when not provided', async () => {
      adjuster.addRule({
        name: 'Undercut default pct',
        conditionType: 'competitor_lower',
        actionType: 'undercut_competitor',
      });
      const result = await adjuster.evaluate('prod_1', 100, 90);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(89.1);
    });

    it('should default percentage_change to 0% when no actionPercentage', async () => {
      adjuster.addRule({
        name: 'Pct no pct',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'percentage_change',
      });
      const result = await adjuster.evaluate('prod_1', 80);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(80);
    });

    it('should default fixed_change to 0 when no actionValue', async () => {
      adjuster.addRule({
        name: 'Fixed no val',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'fixed_change',
      });
      const result = await adjuster.evaluate('prod_1', 80);
      expect(result).toHaveLength(1);
      expect(result[0].newPrice).toBe(80);
    });

    it('should enforce maxPrice limit', async () => {
      adjuster.addRule({
        name: 'Above max',
        conditionType: 'price_below',
        conditionValue: 100,
        actionType: 'set_price',
        actionValue: 60,
        minPrice: 0,
        maxPrice: 50,
      });
      const result = await adjuster.evaluate('prod_1', 80);
      expect(result).toHaveLength(0);
    });
  });
});
