const { VerticalSolutions } = require('../../src/agent/VerticalSolutions');

describe('VerticalSolutions', () => {
  let vs;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    vs = new VerticalSolutions();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should register 8 default solutions', () => {
      const all = vs.getAllSolutions();
      expect(all).toHaveLength(8);
    });

    it('should initialize empty active deployments', () => {
      expect(vs.activeDeployments.size).toBe(0);
    });

    it('should accept custom callbacks', () => {
      const onDeploy = jest.fn();
      const onError = jest.fn();
      const custom = new VerticalSolutions({ onDeploy, onError });

      expect(custom.onDeploy).toBe(onDeploy);
      expect(custom.onError).toBe(onError);
    });
  });

  describe('registerSolution', () => {
    it('should register a new solution', () => {
      vs.registerSolution('custom_solution', {
        name: 'Custom',
        industry: 'tech',
        icon: '🔧',
        description: 'Custom solution',
        agents: ['agent_a', 'agent_b'],
        workflows: [{ step: 'do', agent: 'agent_a', task: 'do stuff' }],
        config: { key: 'val' }
      });

      const sol = vs.getSolution('custom_solution');
      expect(sol.name).toBe('Custom');
      expect(sol.industry).toBe('tech');
      expect(sol.icon).toBe('🔧');
      expect(sol.description).toBe('Custom solution');
      expect(sol.agents).toEqual(['agent_a', 'agent_b']);
      expect(sol.workflows).toEqual([{ step: 'do', agent: 'agent_a', task: 'do stuff' }]);
      expect(sol.config).toEqual({ key: 'val' });
      expect(sol.status).toBe('available');
      expect(sol.createdAt).toBeGreaterThan(0);
    });
  });

  describe('getSolution', () => {
    it('should return undefined for non-existent solution', () => {
      expect(vs.getSolution('nope')).toBeUndefined();
    });

    it('should return solution by id', () => {
      const sol = vs.getSolution('finance_monitor');
      expect(sol).toBeDefined();
      expect(sol.name).toBe('金融监控');
    });
  });

  describe('getAllSolutions', () => {
    it('should return all registered solutions', () => {
      const all = vs.getAllSolutions();
      expect(all.length).toBe(8);
      const names = all.map((s) => s.name);
      expect(names).toContain('金融监控');
      expect(names).toContain('电商自动化');
      expect(names).toContain('智能客服');
    });
  });

  describe('getSolutionsByIndustry', () => {
    it('should filter solutions by industry', () => {
      const finance = vs.getSolutionsByIndustry('finance');
      expect(finance).toHaveLength(1);
      expect(finance[0].id).toBe('finance_monitor');
    });

    it('should return empty array for unknown industry', () => {
      expect(vs.getSolutionsByIndustry('gaming')).toEqual([]);
    });

    it('should handle multiple solutions in same industry', () => {
      vs.registerSolution('finance_extra', {
        name: 'Finance Extra',
        industry: 'finance',
        icon: '💰',
        description: 'Extra',
        agents: [],
        workflows: [],
        config: {}
      });
      expect(vs.getSolutionsByIndustry('finance')).toHaveLength(2);
    });
  });

  describe('deploy', () => {
    it('should throw for non-existent solution', async () => {
      await expect(vs.deploy('nope')).rejects.toThrow('Solution not found');
    });

    it('should deploy a solution and set agents ready', async () => {
      const deployment = await vs.deploy('finance_monitor');

      expect(deployment.id).toMatch(/^deploy_finance_monitor_/);
      expect(deployment.solutionId).toBe('finance_monitor');
      expect(deployment.solutionName).toBe('金融监控');
      expect(deployment.status).toBe('running');
      expect(deployment.agents).toHaveLength(4);

      for (const agent of deployment.agents) {
        expect(agent.status).toBe('ready');
        expect(agent.initializedAt).toBeGreaterThan(0);
      }
    });

    it('should merge deployment config with solution config', async () => {
      const deployment = await vs.deploy('finance_monitor', {
        updateInterval: '1 m',
        customField: 'test'
      });

      expect(deployment.config.updateInterval).toBe('1 m');
      expect(deployment.config.customField).toBe('test');
      expect(deployment.config.alertThreshold).toBe(0.05);
    });

    it('should call onDeploy callback', async () => {
      const onDeploy = jest.fn();
      const customVs = new VerticalSolutions({ onDeploy });

      const deployment = await customVs.deploy('finance_monitor');

      expect(onDeploy).toHaveBeenCalledWith(deployment);
    });

    it('should store deployment in activeDeployments', async () => {
      const deployment = await vs.deploy('finance_monitor');
      expect(vs.getDeployment(deployment.id)).toBe(deployment);
    });
  });

  describe('stop', () => {
    it('should return false for non-existent deployment', async () => {
      const result = await vs.stop('ghost');
      expect(result).toBe(false);
    });

    it('should stop a running deployment', async () => {
      const deployment = await vs.deploy('finance_monitor');
      const result = await vs.stop(deployment.id);

      expect(result).toBe(true);

      const stopped = vs.getDeployment(deployment.id);
      expect(stopped.status).toBe('stopped');
      expect(stopped.stoppedAt).toBeGreaterThan(0);

      for (const agent of stopped.agents) {
        expect(agent.status).toBe('stopped');
      }
    });
  });

  describe('getDeployment', () => {
    it('should return undefined for non-existent deployment', () => {
      expect(vs.getDeployment('nope')).toBeUndefined();
    });
  });

  describe('getAllDeployments', () => {
    it('should return all active deployments', async () => {
      await vs.deploy('finance_monitor');
      await vs.deploy('ecommerce_auto');

      expect(vs.getAllDeployments()).toHaveLength(2);
    });
  });

  describe('getRunningDeployments', () => {
    it('should return only running deployments', async () => {
      const d1 = await vs.deploy('finance_monitor');
      const d2 = await vs.deploy('ecommerce_auto');

      await vs.stop(d1.id);

      const running = vs.getRunningDeployments();
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe(d2.id);
    });
  });

  describe('getStats', () => {
    it('should return zeros when nothing deployed', () => {
      const stats = vs.getStats();
      expect(stats.solutions.total).toBe(8);
      expect(stats.deployments.total).toBe(0);
      expect(stats.deployments.running).toBe(0);
      expect(stats.deployments.stopped).toBe(0);
    });

    it('should reflect deployments count', async () => {
      const d1 = await vs.deploy('finance_monitor');
      await vs.deploy('ecommerce_auto');

      await vs.stop(d1.id);

      const stats = vs.getStats();
      expect(stats.deployments.total).toBe(2);
      expect(stats.deployments.running).toBe(1);
      expect(stats.deployments.stopped).toBe(1);
    });

    it('should group solutions by industry', () => {
      const stats = vs.getStats();
      expect(stats.solutions.byIndustry).toEqual({
        finance: 1,
        ecommerce: 1,
        service: 1,
        hr: 1,
        marketing: 1,
        logistics: 1,
        legal: 1,
        healthcare: 1
      });
    });
  });

  describe('destroy', () => {
    it('should stop all active deployments and clear maps', async () => {
      await vs.deploy('finance_monitor');
      await vs.deploy('ecommerce_auto');

      vs.destroy();

      expect(vs.solutions.size).toBe(0);
      expect(vs.activeDeployments.size).toBe(0);
    });
  });
});
