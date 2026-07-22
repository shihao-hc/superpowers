const { Planner, Goal, PlanStep, GoalStatus, StepStatus } = require('../../src/core/Planner');

describe('Planner', () => {
  let planner;

  beforeEach(() => {
    planner = new Planner();
  });

  describe('PlanStep', () => {
    it('creates step with defaults', () => {
      const s = new PlanStep({ description: 'test' });
      expect(s.description).toBe('test');
      expect(s.status).toBe(StepStatus.PENDING);
      expect(s.dependencies).toEqual([]);
      expect(s.parallel).toBe(false);
    });

    it('accepts custom config', () => {
      const s = new PlanStep({ description: 'test', action: 'run', parallel: true, dependencies: ['a'] });
      expect(s.action).toBe('run');
      expect(s.parallel).toBe(true);
      expect(s.dependencies).toEqual(['a']);
    });
  });

  describe('Goal', () => {
    it('creates goal with defaults', () => {
      const g = new Goal({ title: 'test goal' });
      expect(g.title).toBe('test goal');
      expect(g.status).toBe(GoalStatus.PLANNING);
      expect(g.priority).toBe('normal');
      expect(g.steps).toEqual([]);
      expect(g.progress).toBe(0);
    });

    it('creates goal with steps', () => {
      const g = new Goal({ title: 'test', steps: [{ description: 'step1' }, { description: 'step2' }] });
      expect(g.steps).toHaveLength(2);
    });

    it('currentStep returns first step', () => {
      const g = new Goal({ title: 'test', steps: [{ description: 's1' }] });
      expect(g.currentStep.description).toBe('s1');
    });

    it('currentStep returns null when no steps', () => {
      const g = new Goal({ title: 'test' });
      expect(g.currentStep).toBeNull();
    });

    it('totalSteps returns count', () => {
      const g = new Goal({ title: 'test', steps: [{ description: 's1' }, { description: 's2' }] });
      expect(g.totalSteps).toBe(2);
    });

    it('updateProgress is 0 when there are no steps', () => {
      const g = new Goal({ title: 'empty' });
      g.updateProgress();
      expect(g.progress).toBe(0);
    });

    it('updateProgress calculates percentage', () => {
      const g = new Goal({ title: 'test', steps: [{ description: 's1' }, { description: 's2' }] });
      g.steps[0].status = StepStatus.COMPLETED;
      g.updateProgress();
      expect(g.progress).toBe(50);
    });
  });

  describe('createGoal', () => {
    it('creates and stores a goal', () => {
      const goal = planner.createGoal({ title: 'my goal' });
      expect(goal.id).toBeDefined();
      expect(planner.getGoal(goal.id)).toBe(goal);
    });
  });

  describe('decompose', () => {
    it('creates sequential plan by default', () => {
      const goal = planner.decompose('build feature');
      expect(goal.steps).toHaveLength(5);
      expect(goal.steps[0].action).toBe('analyze');
    });

    it('creates parallel plan', () => {
      const goal = planner.decompose('research', 'parallel');
      expect(goal.steps).toHaveLength(4);
      expect(goal.steps[0].parallel).toBe(true);
    });

    it('creates iterative plan', () => {
      const goal = planner.decompose('refine', 'iterative');
      expect(goal.steps).toHaveLength(5);
      expect(goal.steps[0].action).toBe('define');
    });

    it('falls back to sequential for unknown strategy', () => {
      const goal = planner.decompose('test', 'unknown');
      expect(goal.steps).toHaveLength(5);
      expect(goal.steps[0].action).toBe('analyze');
    });
  });

  describe('listGoals', () => {
    it('lists all goals', () => {
      planner.createGoal({ title: 'g1' });
      planner.createGoal({ title: 'g2' });
      expect(planner.listGoals()).toHaveLength(2);
    });

    it('filters by status', () => {
      const g = planner.createGoal({ title: 'g1' });
      g.status = GoalStatus.COMPLETED;
      planner.createGoal({ title: 'g2' });
      expect(planner.listGoals(GoalStatus.COMPLETED)).toHaveLength(1);
    });
  });

  describe('startGoal', () => {
    it('starts a goal and sets first step running', () => {
      const g = planner.decompose('test');
      const result = planner.startGoal(g.id);
      expect(result.success).toBe(true);
      expect(result.goal.status).toBe(GoalStatus.ACTIVE);
      expect(result.goal.steps[0].status).toBe(StepStatus.RUNNING);
    });

    it('returns error for missing goal', () => {
      expect(planner.startGoal('ghost').success).toBe(false);
    });

    it('starts goal without steps successfully', () => {
      const g = planner.createGoal({ title: 'empty' });
      const result = planner.startGoal(g.id);
      expect(result.success).toBe(true);
      expect(result.goal.status).toBe(GoalStatus.ACTIVE);
    });
  });

  describe('completeStep', () => {
    it('completes a step and advances to next', () => {
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      const step = g.steps[0];
      const result = planner.completeStep(g.id, step.id, 'done');
      expect(result.success).toBe(true);
      expect(step.status).toBe(StepStatus.COMPLETED);
      expect(g.steps[1].status).toBe(StepStatus.RUNNING);
    });

    it('marks goal complete on last step', () => {
      const g = planner.createGoal({ title: 'test', steps: [{ description: 'only' }] });
      planner.startGoal(g.id);
      planner.completeStep(g.id, g.steps[0].id, 'done');
      expect(g.status).toBe(GoalStatus.COMPLETED);
    });

    it('fires onStepComplete callback', () => {
      const callback = jest.fn();
      planner.onStepComplete = callback;
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      planner.completeStep(g.id, g.steps[0].id, 'ok');
      expect(callback).toHaveBeenCalled();
    });

    it('fires onGoalComplete on last step', () => {
      const callback = jest.fn();
      planner.onGoalComplete = callback;
      const g = planner.createGoal({ title: 'test', steps: [{ description: 'only' }] });
      planner.startGoal(g.id);
      planner.completeStep(g.id, g.steps[0].id, 'done');
      expect(callback).toHaveBeenCalledWith(g);
    });

    it('returns error for missing goal', () => {
      expect(planner.completeStep('ghost', 's1', 'ok').success).toBe(false);
    });

    it('returns error for missing step', () => {
      const g = planner.createGoal({ title: 'test' });
      expect(planner.completeStep(g.id, 'ghost', 'ok').success).toBe(false);
    });
  });

  describe('failStep', () => {
    it('marks step and goal as failed', () => {
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      const result = planner.failStep(g.id, g.steps[0].id, 'error occurred');
      expect(result.success).toBe(true);
      expect(g.steps[0].status).toBe(StepStatus.FAILED);
      expect(g.status).toBe(GoalStatus.FAILED);
    });

    it('fires onGoalFail callback', () => {
      const callback = jest.fn();
      planner.onGoalFail = callback;
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      planner.failStep(g.id, g.steps[0].id, 'boom');
      expect(callback).toHaveBeenCalled();
    });

    it('returns error for missing goal', () => {
      expect(planner.failStep('ghost', 's1', 'err').success).toBe(false);
    });

    it('returns error for missing step', () => {
      const g = planner.decompose('test');
      expect(planner.failStep(g.id, 'ghost', 'err').success).toBe(false);
    });
  });

  describe('skipStep', () => {
    it('skips a step', () => {
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      const result = planner.skipStep(g.id, g.steps[1].id);
      expect(result.success).toBe(true);
      expect(g.steps[1].status).toBe(StepStatus.SKIPPED);
    });

    it('returns error for missing goal', () => {
      expect(planner.skipStep('ghost', 's1').success).toBe(false);
    });

    it('returns error for missing step', () => {
      const g = planner.decompose('test');
      expect(planner.skipStep(g.id, 'ghost').success).toBe(false);
    });
  });

  describe('replan', () => {
    it('replaces steps and resets progress', () => {
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      const result = planner.replan(g.id, [{ description: 'new step' }]);
      expect(result.success).toBe(true);
      expect(g.steps).toHaveLength(1);
      expect(g.currentStepIndex).toBe(0);
      expect(g.progress).toBe(0);
      expect(g.status).toBe(GoalStatus.PLANNING);
    });

    it('adds to history', () => {
      const g = planner.decompose('test');
      planner.replan(g.id, [{ description: 'new' }]);
      expect(planner.history).toHaveLength(1);
    });

    it('caps history at maxHistory', () => {
      const g = planner.decompose('test');
      planner.maxHistory = 2;
      planner.replan(g.id, [{ description: 'a' }]);
      planner.replan(g.id, [{ description: 'b' }]);
      planner.replan(g.id, [{ description: 'c' }]);
      expect(planner.history).toHaveLength(2);
    });

    it('returns error for missing goal', () => {
      expect(planner.replan('ghost', []).success).toBe(false);
    });
  });

  describe('addStep', () => {
    it('appends step to goal', () => {
      const g = planner.decompose('test');
      const result = planner.addStep(g.id, { description: 'extra' });
      expect(result.success).toBe(true);
      expect(g.steps).toHaveLength(6);
    });

    it('inserts step after given step ID', () => {
      const g = planner.decompose('test');
      const result = planner.addStep(g.id, { description: 'inserted' }, g.steps[0].id);
      expect(result.success).toBe(true);
      expect(g.steps[1].description).toBe('inserted');
    });

    it('falls back to append if afterStepId not found', () => {
      const g = planner.decompose('test');
      planner.addStep(g.id, { description: 'fallback' }, 'nonexistent');
      expect(g.steps[g.steps.length - 1].description).toBe('fallback');
    });

    it('returns error for missing goal', () => {
      expect(planner.addStep('ghost', { description: 'x' }).success).toBe(false);
    });
  });

  describe('removeStep', () => {
    it('removes a step', () => {
      const g = planner.decompose('test');
      const result = planner.removeStep(g.id, g.steps[0].id);
      expect(result.success).toBe(true);
      expect(g.steps).toHaveLength(4);
    });

    it('blocks removal of running step', () => {
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      expect(planner.removeStep(g.id, g.steps[0].id).success).toBe(false);
    });

    it('returns error for missing step', () => {
      const g = planner.createGoal({ title: 'test' });
      expect(planner.removeStep(g.id, 'ghost').success).toBe(false);
    });

    it('returns error for missing goal', () => {
      expect(planner.removeStep('ghost', 's1').success).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns zero for empty planner', () => {
      const stats = planner.getStats();
      expect(stats.total).toBe(0);
      expect(stats.avgProgress).toBe(0);
    });

    it('categorizes by status', () => {
      const g = planner.decompose('test');
      planner.startGoal(g.id);
      const stats = planner.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byStatus.active).toBe(1);
    });
  });
});
