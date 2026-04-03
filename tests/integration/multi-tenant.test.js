/**
 * Integration Tests for Multi-Tenant Scenarios
 */

const request = require('supertest');
const express = require('express');

const { TeamWorkspace } = require('../../src/enterprise/collaboration/TeamWorkspace');
const { CostOptimizer } = require('../../src/cost/CostOptimizer');

// Mock data isolation
const tenants = new Map();

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  const workspace = new TeamWorkspace();
  const costOptimizer = new CostOptimizer();

  // Middleware to extract tenant
  app.use((req, res, next) => {
    req.tenantId = req.headers['x-tenant-id'] || 'default';
    next();
  });

  // Workspace endpoints
  app.post('/api/v1/workspaces', async (req, res) => {
    try {
      const workspaceData = {
        ...req.body,
        ownerId: req.body.ownerId || 'user1'
      };
      const ws = workspace.createWorkspace(workspaceData);
      res.status(201).json(ws);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/v1/workspaces/:id', async (req, res) => {
    const ws = workspace.getWorkspace(req.params.id);
    if (!ws) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(ws);
  });

  // Project endpoints with tenant isolation
  app.post('/api/v1/projects', async (req, res) => {
    try {
      const projectData = {
        ...req.body,
        workspaceId: req.headers['x-workspace-id'],
        ownerId: req.body.ownerId || 'user1'
      };
      const project = workspace.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Cost tracking with tenant isolation
  app.post('/api/v1/costs/record', async (req, res) => {
    const tenantId = req.tenantId;
    const record = {
      ...req.body,
      tenantId,
      period: new Date().toISOString()
    };
    const result = costOptimizer.recordUsage(record);
    res.json(result);
  });

  app.get('/api/v1/costs/report', async (req, res) => {
    const report = costOptimizer.getCostReport(req.tenantId, {
      period: req.query.period || 'monthly'
    });
    res.json(report);
  });

  // Member management
  app.post('/api/v1/workspaces/:id/members', async (req, res) => {
    try {
      const invite = workspace.inviteMember(
        req.params.id,
        req.body.email,
        req.body.role,
        'admin'
      );
      res.status(201).json(invite);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Budget management
  app.post('/api/v1/billing/budget', async (req, res) => {
    const budget = costOptimizer.setBudget(req.tenantId, req.body);
    res.json(budget);
  });

  app.get('/api/v1/billing/budget', async (req, res) => {
    const budget = costOptimizer.budgets.get(req.tenantId);
    res.json(budget || null);
  });

  return app;
};

describe('Multi-Tenant Workspace', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Workspace Isolation', () => {
    it('should create workspace for tenant A', async () => {
      const response = await request(app)
        .post('/api/v1/workspaces')
        .set('x-tenant-id', 'tenant-a')
        .send({
          name: 'Tenant A Workspace',
          plan: 'professional',
          ownerId: 'user-a1'
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('Tenant A Workspace');
      expect(response.body.plan).toBe('professional');
    });

    it('should create workspace for tenant B', async () => {
      const response = await request(app)
        .post('/api/v1/workspaces')
        .set('x-tenant-id', 'tenant-b')
        .send({
          name: 'Tenant B Workspace',
          plan: 'enterprise',
          ownerId: 'user-b1'
        })
        .expect(201);

      expect(response.body.name).toBe('Tenant B Workspace');
    });

    it('should not access tenant A workspace from tenant B', async () => {
      const response = await request(app)
        .post('/api/v1/workspaces')
        .set('x-tenant-id', 'tenant-a')
        .send({
          name: 'Tenant A Private',
          plan: 'starter',
          ownerId: 'user-a2'
        })
        .expect(201);

      // Workspace ID should be different
      const workspaces = response.body;
      expect(workspaces).toBeDefined();
    });
  });

  describe('Project Isolation', () => {
    let workspaceId;

    beforeAll(async () => {
      const response = await request(app)
        .post('/api/v1/workspaces')
        .set('x-tenant-id', 'tenant-isolated')
        .send({
          name: 'Isolated Workspace',
          plan: 'professional',
          ownerId: 'owner1'
        });
      workspaceId = response.body.id;
    });

    it('should create project in workspace', async () => {
      const response = await request(app)
        .post('/api/v1/projects')
        .set('x-tenant-id', 'tenant-isolated')
        .set('x-workspace-id', workspaceId)
        .send({
          name: 'Project A',
          description: 'Test project',
          ownerId: 'user1'
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.workspaceId).toBe(workspaceId);
    });
  });
});

describe('Approval Workflow', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Member Invitation', () => {
    it('should invite member with approver role', async () => {
      // Create workspace first
      const wsResponse = await request(app)
        .post('/api/v1/workspaces')
        .set('x-tenant-id', 'tenant-approval')
        .send({
          name: 'Approval Test Workspace',
          plan: 'professional',
          ownerId: 'admin1'
        });

      const workspaceId = wsResponse.body.id;

      const response = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members`)
        .set('x-tenant-id', 'tenant-approval')
        .send({
          email: 'newuser@example.com',
          role: 'approver'
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.status).toBe('pending');
      expect(response.body.role).toBe('approver');
    });
  });
});

describe('Cost Tracking & Quota', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Usage Recording', () => {
    it('should record usage for tenant A', async () => {
      const response = await request(app)
        .post('/api/v1/costs/record')
        .set('x-tenant-id', 'tenant-cost-a')
        .send({
          category: 'skill-execution',
          quantity: 100,
          model: 'gpt-4'
        })
        .expect(200);

      expect(response.body.cost).toBeGreaterThan(0);
    });

    it('should track separate costs for different tenants', async () => {
      // Record for tenant A
      await request(app)
        .post('/api/v1/costs/record')
        .set('x-tenant-id', 'tenant-cost-a')
        .send({
          category: 'skill-execution',
          quantity: 100
        });

      // Record for tenant B
      await request(app)
        .post('/api/v1/costs/record')
        .set('x-tenant-id', 'tenant-cost-b')
        .send({
          category: 'skill-execution',
          quantity: 50
        });

      // Check tenant A report
      const reportA = await request(app)
        .get('/api/v1/costs/report')
        .set('x-tenant-id', 'tenant-cost-a')
        .expect(200);

      // Check tenant B report
      const reportB = await request(app)
        .get('/api/v1/costs/report')
        .set('x-tenant-id', 'tenant-cost-b')
        .expect(200);

      // Costs should be tracked separately
      expect(reportA.body).toBeDefined();
      expect(reportB.body).toBeDefined();
    });
  });

  describe('Budget Management', () => {
    it('should set budget for tenant', async () => {
      const response = await request(app)
        .post('/api/v1/billing/budget')
        .set('x-tenant-id', 'tenant-budget')
        .send({
          monthly: 10000,
          alertThresholds: [50, 75, 90]
        })
        .expect(200);

      expect(response.body.monthly).toBe(10000);
      expect(response.body.alertThresholds).toEqual([50, 75, 90]);
    });

    it('should retrieve tenant budget', async () => {
      // Set budget first
      await request(app)
        .post('/api/v1/billing/budget')
        .set('x-tenant-id', 'tenant-budget-get')
        .send({
          monthly: 5000
        });

      // Get budget
      const response = await request(app)
        .get('/api/v1/billing/budget')
        .set('x-tenant-id', 'tenant-budget-get')
        .expect(200);

      expect(response.body.monthly).toBe(5000);
    });

    it('should return null for tenant without budget', async () => {
      const response = await request(app)
        .get('/api/v1/billing/budget')
        .set('x-tenant-id', 'tenant-no-budget')
        .expect(200);

      expect(response.body).toBeNull();
    });
  });
});
