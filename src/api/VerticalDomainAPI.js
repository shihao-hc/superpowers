/**
 * Vertical Domain API
 * REST API endpoints for vertical domain markets
 */

const { VerticalDomainMarket } = require('../skills/market/VerticalDomainMarket');
const { SkillMonitoringSystem } = require('../skills/monitoring/SkillMonitoringSystem');

let domainMarket = null;
let monitoringSystem = null;

function getDomainMarket() {
  if (!domainMarket) {
    domainMarket = new VerticalDomainMarket();
  }
  return domainMarket;
}

function getMonitoringSystem() {
  if (!monitoringSystem) {
    monitoringSystem = new SkillMonitoringSystem();
  }
  return monitoringSystem;
}

/**
 * Register API routes
 */
function registerRoutes(app) {
  // ========== Vertical Domain Routes ==========

  // Get all domains
  app.get('/api/vertical-domains', (req, res) => {
    try {
      const market = getDomainMarket();
      const domains = market.getDomains();
      res.json(domains);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get domain by ID
  app.get('/api/vertical-domains/:domainId', (req, res) => {
    try {
      const market = getDomainMarket();
      const domain = market.getDomain(req.params.domainId);
      
      if (!domain) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      res.json(domain);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get domain skills
  app.get('/api/vertical-domains/:domainId/skills', (req, res) => {
    try {
      const market = getDomainMarket();
      const { category, search, sort, limit } = req.query;
      
      const skills = market.getDomainSkills(req.params.domainId, {
        category,
        search,
        sort: sort || 'rating',
        limit: parseInt(limit) || 50
      });

      res.json(skills);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get domain templates
  app.get('/api/vertical-domains/:domainId/templates', (req, res) => {
    try {
      const market = getDomainMarket();
      const templates = market.getDomainTemplates(req.params.domainId);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get skill by ID
  app.get('/api/vertical-domains/skills/:skillId', (req, res) => {
    try {
      const market = getDomainMarket();
      const skill = market.getSkill(req.params.skillId);
      
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      res.json(skill);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get template by ID
  app.get('/api/vertical-domains/templates/:templateId', (req, res) => {
    try {
      const market = getDomainMarket();
      const template = market.getTemplate(req.params.templateId);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json(template);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Search skills across domains
  app.get('/api/vertical-domains/search', (req, res) => {
    try {
      const market = getDomainMarket();
      const { q, domains, limit } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      const results = market.search(q, {
        domains: domains ? domains.split(',') : null,
        limit: parseInt(limit) || 20
      });

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get domain compliance info
  app.get('/api/vertical-domains/:domainId/compliance', (req, res) => {
    try {
      const market = getDomainMarket();
      const compliance = market.getComplianceInfo(req.params.domainId);
      
      if (!compliance) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      res.json(compliance);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get domain stats
  app.get('/api/vertical-domains/:domainId/stats', (req, res) => {
    try {
      const market = getDomainMarket();
      const stats = market.getDomainStats(req.params.domainId);
      
      if (!stats) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== Monitoring Routes ==========

  // Get dashboard summary
  app.get('/api/monitoring/dashboard', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const summary = monitoring.getDashboardSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get skill metrics
  app.get('/api/monitoring/skills/:skillName/metrics', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const metrics = monitoring.getSkillMetrics(req.params.skillName);
      
      if (!metrics) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all skills metrics
  app.get('/api/monitoring/skills', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const { domain, sortBy } = req.query;
      
      const metrics = monitoring.getAllSkillsMetrics({
        domain,
        sortBy: sortBy || 'totalCalls'
      });

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get retention metrics
  app.get('/api/monitoring/retention', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const { window } = req.query;
      
      const retention = monitoring.getRetentionMetrics({
        window: window || 'weekly'
      });

      res.json(retention);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get user engagement
  app.get('/api/monitoring/engagement', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const { limit, sortBy } = req.query;
      
      const engagement = monitoring.getUserEngagementMetrics({
        limit: parseInt(limit) || 50,
        sortBy: sortBy || 'lastSeen'
      });

      res.json(engagement);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get alerts
  app.get('/api/monitoring/alerts', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const { severity, skill, limit } = req.query;
      
      const alerts = monitoring.getAlerts({
        severity,
        skill,
        limit: parseInt(limit) || 20
      });

      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Dismiss alert
  app.delete('/api/monitoring/alerts/:index', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const success = monitoring.dismissAlert(parseInt(req.params.index));
      
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get improvement recommendations
  app.get('/api/monitoring/recommendations', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const recommendations = monitoring.generateImprovementRecommendations();
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Prometheus metrics export
  app.get('/api/monitoring/prometheus', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const metrics = monitoring.exportPrometheusMetrics();
      
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  // Record skill call (for internal use)
  app.post('/api/monitoring/record', (req, res) => {
    try {
      const monitoring = getMonitoringSystem();
      const { skillName, success, duration, userId, sessionId, domain, error } = req.body;
      
      if (!skillName) {
        return res.status(400).json({ error: 'skillName is required' });
      }

      const metrics = monitoring.recordSkillCall(skillName, {
        success,
        duration,
        userId,
        sessionId,
        domain,
        error
      });

      res.json({ success: true, metrics });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { registerRoutes, getDomainMarket, getMonitoringSystem };