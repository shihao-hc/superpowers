/**
 * Planner - 目标规划器
 *
 * 目标分解、步骤规划、进度追踪、回溯调整
 */

const crypto = require('crypto');

const StepStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

const GoalStatus = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

class PlanStep {
  constructor(config) {
    this.id = config.id || crypto.randomUUID().substring(0, 6);
    this.description = config.description;
    this.action = config.action || null;
    this.status = StepStatus.PENDING;
    this.result = null;
    this.error = null;
    this.dependencies = config.dependencies || [];
    this.parallel = config.parallel || false;
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.metadata = config.metadata || {};
  }
}

class Goal {
  constructor(config) {
    this.id = config.id || crypto.randomUUID().substring(0, 8);
    this.title = config.title;
    this.description = config.description || '';
    this.status = GoalStatus.PLANNING;
    this.priority = config.priority || 'normal';
    this.steps = (config.steps || []).map((s) => new PlanStep(s));
    this.currentStepIndex = 0;
    this.progress = 0;
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.deadline = config.deadline || null;
    this.metadata = config.metadata || {};
  }

  get currentStep() {
    return this.steps[this.currentStepIndex] || null;
  }

  get completedSteps() {
    return this.steps.filter((s) => s.status === StepStatus.COMPLETED).length;
  }

  get totalSteps() {
    return this.steps.length;
  }

  updateProgress() {
    if (this.totalSteps === 0) {
      this.progress = 0;
    } else {
      this.progress = Math.round((this.completedSteps / this.totalSteps) * 100);
    }
  }
}

class Planner {
  constructor(options = {}) {
    this.goals = new Map();
    this.history = [];
    this.maxHistory = options.maxHistory || 100;
    this.onStepComplete = null;
    this.onGoalComplete = null;
    this.onGoalFail = null;
  }

  // ========== 目标管理 ==========
  createGoal(config) {
    const goal = new Goal(config);
    this.goals.set(goal.id, goal);
    return goal;
  }

  decompose(goalTitle, strategy = 'sequential') {
    const templates = {
      sequential: [
        { description: '分析目标和需求', action: 'analyze' },
        { description: '制定详细计划', action: 'plan' },
        { description: '执行核心任务', action: 'execute' },
        { description: '验证结果', action: 'verify' },
        { description: '总结和优化', action: 'conclude' }
      ],
      parallel: [
        { description: '收集信息和资源', action: 'gather', parallel: true },
        { description: '分析数据', action: 'analyze', parallel: true },
        { description: '制定方案', action: 'design', parallel: true },
        { description: '整合结果', action: 'integrate' }
      ],
      iterative: [
        { description: '定义最小可行方案', action: 'define' },
        { description: '执行第一轮迭代', action: 'iterate' },
        { description: '收集反馈', action: 'feedback' },
        { description: '优化改进', action: 'improve' },
        { description: '继续迭代或完成', action: 'decide' }
      ]
    };

    const template = templates[strategy] || templates.sequential;
    return this.createGoal({
      title: goalTitle,
      steps: template,
      status: GoalStatus.PLANNING
    });
  }

  getGoal(id) {
    return this.goals.get(id);
  }

  listGoals(status = null) {
    if (status) {
      return Array.from(this.goals.values()).filter((g) => g.status === status);
    }
    return Array.from(this.goals.values());
  }

  // ========== 进度控制 ==========
  startGoal(goalId) {
    const goal = this.goals.get(goalId);
    if (!goal) {return { success: false, error: 'Goal not found' };}

    goal.status = GoalStatus.ACTIVE;
    goal.startedAt = new Date().toISOString();
    if (goal.steps.length > 0) {
      goal.steps[0].status = StepStatus.RUNNING;
      goal.steps[0].startedAt = new Date().toISOString();
    }

    return { success: true, goal };
  }

  completeStep(goalId, stepId, result) {
    const goal = this.goals.get(goalId);
    if (!goal) {return { success: false, error: 'Goal not found' };}

    const step = goal.steps.find((s) => s.id === stepId);
    if (!step) {return { success: false, error: 'Step not found' };}

    step.status = StepStatus.COMPLETED;
    step.result = result;
    step.completedAt = new Date().toISOString();

    goal.updateProgress();

    const nextIndex = goal.steps.indexOf(step) + 1;
    if (nextIndex < goal.steps.length) {
      goal.currentStepIndex = nextIndex;
      goal.steps[nextIndex].status = StepStatus.RUNNING;
      goal.steps[nextIndex].startedAt = new Date().toISOString();
    } else {
      goal.status = GoalStatus.COMPLETED;
      goal.completedAt = new Date().toISOString();
      if (this.onGoalComplete) {
        this.onGoalComplete(goal);
      }
    }

    if (this.onStepComplete) {
      this.onStepComplete(goal, step);
    }

    return { success: true, goal, nextStep: goal.steps[nextIndex] || null };
  }

  failStep(goalId, stepId, error) {
    const goal = this.goals.get(goalId);
    if (!goal) {return { success: false, error: 'Goal not found' };}

    const step = goal.steps.find((s) => s.id === stepId);
    if (!step) {return { success: false, error: 'Step not found' };}

    step.status = StepStatus.FAILED;
    step.error = error;
    step.completedAt = new Date().toISOString();
    goal.status = GoalStatus.FAILED;

    if (this.onGoalFail) {
      this.onGoalFail(goal, step, error);
    }

    return { success: true, goal, step };
  }

  skipStep(goalId, stepId) {
    const goal = this.goals.get(goalId);
    if (!goal) {return { success: false, error: 'Goal not found' };}

    const step = goal.steps.find((s) => s.id === stepId);
    if (!step) {return { success: false, error: 'Step not found' };}

    step.status = StepStatus.SKIPPED;
    step.completedAt = new Date().toISOString();
    goal.updateProgress();

    return { success: true, goal };
  }

  // ========== 回溯调整 ==========
  replan(goalId, newSteps) {
    const goal = this.goals.get(goalId);
    if (!goal) {return { success: false, error: 'Goal not found' };}

    const history = {
      id: crypto.randomUUID().substring(0, 8),
      fromSteps: goal.steps.map((s) => s.id),
      toSteps: newSteps,
      timestamp: new Date().toISOString()
    };

    goal.steps = newSteps.map((s) => new PlanStep(s));
    goal.currentStepIndex = 0;
    goal.progress = 0;
    goal.status = GoalStatus.PLANNING;

    this.history.push(history);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return { success: true, goal, history };
  }

  addStep(goalId, stepConfig, afterStepId = null) {
    const goal = this.goals.get(goalId);
    if (!goal) {return { success: false, error: 'Goal not found' };}

    const newStep = new PlanStep(stepConfig);

    if (afterStepId) {
      const index = goal.steps.findIndex((s) => s.id === afterStepId);
      if (index >= 0) {
        goal.steps.splice(index + 1, 0, newStep);
      } else {
        goal.steps.push(newStep);
      }
    } else {
      goal.steps.push(newStep);
    }

    goal.updateProgress();
    return { success: true, step: newStep };
  }

  removeStep(goalId, stepId) {
    const goal = this.goals.get(goalId);
    if (!goal) {return { success: false, error: 'Goal not found' };}

    const index = goal.steps.findIndex((s) => s.id === stepId);
    if (index < 0) {return { success: false, error: 'Step not found' };}

    if (goal.steps[index].status === StepStatus.RUNNING) {
      return { success: false, error: 'Cannot remove running step' };
    }

    goal.steps.splice(index, 1);
    goal.updateProgress();

    return { success: true, goal };
  }

  // ========== 统计 ==========
  getStats() {
    const goals = Array.from(this.goals.values());
    return {
      total: goals.length,
      byStatus: {
        planning: goals.filter((g) => g.status === GoalStatus.PLANNING).length,
        active: goals.filter((g) => g.status === GoalStatus.ACTIVE).length,
        completed: goals.filter((g) => g.status === GoalStatus.COMPLETED).length,
        failed: goals.filter((g) => g.status === GoalStatus.FAILED).length
      },
      history: this.history.length,
      avgProgress: goals.length > 0
        ? Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length)
        : 0
    };
  }
}

module.exports = { Planner, Goal, PlanStep, GoalStatus, StepStatus };