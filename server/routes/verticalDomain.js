const express = require('express');
const router = express.Router();
const { VerticalDomainMarket } = require('../../src/skills/market/VerticalDomainMarket');
const { VerticalSolutions } = require('../../src/agent/VerticalSolutions');

let domainMarket = null;
let solutionsManager = null;
const { authMiddleware, memoryLimiter } = require('../middleware');

function getDomainMarket() {
  if (!domainMarket) { domainMarket = new VerticalDomainMarket(); }
  return domainMarket;
}

function getSolutionsManager() {
  if (!solutionsManager) { solutionsManager = new VerticalSolutions(); }
  return solutionsManager;
}

function isValidDomainId(id) {
  if (!id || typeof id !== 'string') { return false; }
  if (['__proto__', 'constructor', 'prototype'].includes(id)) { return false; }
  if (id.includes('..') || id.includes('/') || id.includes('\\')) { return false; }
  if (id.length > 100) { return false; }
  if (/[\n\r\t]/.test(id) || id.includes('\x00') || id.includes('\u0000')) { return false; }
  return true;
}

function isValidSolutionId(id) {
  if (!id || typeof id !== 'string') { return false; }
  if (/<[^>]*>/.test(id)) { return false; }
  if (/['";]|(--)|(\bOR\b)|(\bDROP\b)|(\bUNION\b)/i.test(id)) { return false; }
  if (id.includes('..') || id.includes('/') || id.includes('\\')) { return false; }
  if (/[\n\r\t]/.test(id) || id.includes('\x00') || id.includes('\u0000')) { return false; }
  if (id.length > 200) { return false; }
  return true;
}

function sanitizeQuery(q) {
  if (!q || typeof q !== 'string') { return ''; }
  q = q.replace(/<[^>]*>/g, '');
  return q.substring(0, 200);
}

// ========== Routes (concrete before parameterized) ==========

router.get('/', (req, res) => {
  const market = getDomainMarket();
  const domains = market.getDomains();
  res.json(domains);
});

router.get('/solutions/popular', (req, res) => {
  const all = getSolutionsManager().getAllSolutions();
  const popular = {
    hot: all.slice(0, 3),
    highAutomation: all.filter((s) => s.config?.autoBuy || s.config?.autoSchedule || s.config?.autoEscalate),
    newlyAdded: all.slice(-3).reverse()
  };
  res.json(popular);
});

router.get('/solutions/search', (req, res) => {
  const q = sanitizeQuery(req.query.q || '');
  const all = getSolutionsManager().getAllSolutions();
  if (!q) { return res.json([]); }
  const lower = q.toLowerCase();
  const results = all.filter((s) =>
    s.name.toLowerCase().includes(lower) ||
    s.description.toLowerCase().includes(lower) ||
    s.industry.toLowerCase().includes(lower)
  );
  res.json(results);
});

router.get('/solutions/:solutionId/recommendations', (req, res) => {
  if (!isValidSolutionId(req.params.solutionId)) {
    return res.status(400).json({ error: 'Invalid solution ID' });
  }
  const solution = getSolutionsManager().getSolution(req.params.solutionId);
  if (!solution) { return res.status(404).json({ error: 'Solution not found' }); }
  const all = getSolutionsManager().getAllSolutions();
  const recommendations = all.filter((s) => s.id !== solution.id && s.industry === solution.industry);
  res.json(recommendations);
});

router.get('/:domainId', (req, res) => {
  if (!isValidDomainId(req.params.domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }
  const domain = getDomainMarket().getDomain(req.params.domainId);
  if (!domain) { return res.status(404).json({ error: 'Domain not found' }); }
  res.json(domain);
});

router.get('/:domainId/skills', (req, res) => {
  if (!isValidDomainId(req.params.domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }
  const skills = getDomainMarket().getDomainSkills(req.params.domainId, req.query);
  res.json(skills);
});

router.get('/:domainId/solutions', (req, res) => {
  if (!isValidDomainId(req.params.domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }
  const solutions = getSolutionsManager().getSolutionsByIndustry(req.params.domainId);
  res.json(solutions);
});

router.post('/:domainId/solutions/:solutionId/install', memoryLimiter, authMiddleware, async (req, res) => {
  if (!isValidDomainId(req.params.domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }
  if (!isValidSolutionId(req.params.solutionId)) {
    return res.status(400).json({ error: 'Invalid solution ID' });
  }
  try {
    const deployment = await getSolutionsManager().deploy(req.params.solutionId);
    res.json({ id: deployment.id, status: deployment.status });
  } catch (error) {
    res.status(404).json({ error: 'Deployment failed' });
  }
});

router.post('/:domainId/solutions/:solutionId/demo-data', memoryLimiter, authMiddleware, async (req, res) => {
  if (!isValidDomainId(req.params.domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }
  if (!isValidSolutionId(req.params.solutionId)) {
    return res.status(400).json({ error: 'Invalid solution ID' });
  }
  const solution = getSolutionsManager().getSolution(req.params.solutionId);
  if (!solution) { return res.status(404).json({ error: 'Solution not found' }); }
  res.json({
    id: req.params.solutionId,
    demoData: {
      name: solution.name,
      workflows: solution.workflows || [],
      agents: solution.agents || [],
      sampleConfig: solution.config || {}
    }
  });
});

module.exports = router;
