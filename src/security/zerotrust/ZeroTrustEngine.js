/**
 * Zero Trust Security & Compliance Expansion
 * 零信任安全架构与合规扩展
 */

const crypto = require('crypto');

class ZeroTrustEngine {
  constructor() {
    this.policies = new Map();
    this.trustScores = new Map();
    this.accessLogs = new Map();
    this.riskSignals = new Map();
    
    this._initDefaultPolicies();
  }

  _initDefaultPolicies() {
    // 默认访问策略
    this.policies.set('default', {
      id: 'default',
      name: '默认策略',
      rules: [
        { condition: 'always', action: 'challenge', challengeType: 'mfa' }
      ],
      priority: 0
    });

    // 高风险操作策略
    this.policies.set('high-risk', {
      id: 'high-risk',
      name: '高风险操作',
      rules: [
        { condition: 'action in ["data:delete", "user:delete", "payment:*"]', action: 'block' }
      ],
      priority: 100
    });

    // 信任评估策略
    this.policies.set('trust-based', {
      id: 'trust-based',
      name: '基于信任评估',
      rules: [
        { condition: 'trustScore < 50', action: 'challenge', challengeType: 'mfa' },
        { condition: 'trustScore < 30', action: 'block' },
        { condition: 'trustScore > 80', action: 'allow', factor: 0.8 }
      ],
      priority: 50
    });
  }

  // 评估访问请求
  async evaluateAccess(request) {
    const {
      userId,
      resource,
      action,
      context = {}
    } = request;

    // 1. 收集信任信号
    const signals = await this._collectTrustSignals(request);

    // 2. 计算信任分数
    const trustScore = this._calculateTrustScore(signals);

    // 3. 风险评估
    const riskLevel = this._assessRisk(request, trustScore, signals);

    // 4. 应用策略
    const decision = this._applyPolicies(request, trustScore, riskLevel);

    // 5. 记录访问
    this._logAccess({
      ...request,
      trustScore,
      riskLevel,
      decision,
      signals,
      timestamp: Date.now()
    });

    return {
      allowed: decision.action !== 'block',
      action: decision.action,
      trustScore,
      riskLevel,
      factors: decision.factors,
      nextChallenge: decision.challengeType
    };
  }

  async _collectTrustSignals(request) {
    const signals = {
      // 身份信号
      identityVerified: request.context.identityVerified || false,
      mfaEnabled: request.context.mfaEnabled || false,
      deviceRegistered: request.context.deviceRegistered || false,
      sessionAge: request.context.sessionAge || 0,
      
      // 行为信号
      location: request.context.location || 'unknown',
      ipReputation: await this._checkIPReputation(request.context.ip),
      userAgentTrust: this._evaluateUserAgent(request.context.userAgent),
      unusualTime: this._isUnusualTime(new Date()),
      
      // 历史信号
      failedAttempts: await this._getFailedAttempts(request.userId),
      lastActivity: await this._getLastActivity(request.userId),
      activityPattern: await this._analyzeActivityPattern(request.userId),
      
      // 资源信号
      resourceSensitivity: request.resource?.sensitivity || 'low',
      dataClassification: request.resource?.classification || 'public'
    };

    return signals;
  }

  _calculateTrustScore(signals) {
    let score = 50; // 基础分数

    // 身份验证加分
    if (signals.identityVerified) score += 15;
    if (signals.mfaEnabled) score += 20;
    if (signals.deviceRegistered) score += 10;

    // 行为风险减分
    if (signals.failedAttempts > 3) score -= 30;
    if (signals.failedAttempts > 0) score -= signals.failedAttempts * 5;
    if (signals.ipReputation < 0.5) score -= 25;
    if (signals.unusualTime) score -= 10;

    // 活跃度加分
    if (signals.activityPattern === 'normal') score += 10;
    if (signals.sessionAge > 3600) score += 5;

    // 资源敏感度调整
    if (signals.resourceSensitivity === 'high') score -= 15;
    if (signals.resourceSensitivity === 'critical') score -= 25;

    return Math.max(0, Math.min(100, score));
  }

  _assessRisk(request, trustScore, signals) {
    const risks = [];

    // 检查各种风险信号
    if (trustScore < 50) {
      risks.push({ type: 'low_trust', score: 30 });
    }
    if (signals.failedAttempts > 3) {
      risks.push({ type: 'brute_force', score: 50 });
    }
    if (signals.ipReputation < 0.3) {
      risks.push({ type: 'malicious_ip', score: 60 });
    }
    if (signals.location === 'new') {
      risks.push({ type: 'new_location', score: 20 });
    }
    if (request.action.includes('delete')) {
      risks.push({ type: 'destructive_action', score: 25 });
    }
    if (signals.dataClassification === 'pii') {
      risks.push({ type: 'sensitive_data', score: 20 });
    }

    const maxRiskScore = risks.length > 0 
      ? Math.max(...risks.map(r => r.score))
      : 0;

    if (maxRiskScore >= 60) return 'high';
    if (maxRiskScore >= 30) return 'medium';
    return 'low';
  }

  _applyPolicies(request, trustScore, riskLevel) {
    const applicablePolicies = [];

    for (const policy of this.policies.values()) {
      for (const rule of policy.rules) {
        if (this._evaluateCondition(rule.condition, request, trustScore, riskLevel)) {
          applicablePolicies.push({
            policy: policy.id,
            action: rule.action,
            challengeType: rule.challengeType,
            priority: policy.priority
          });
        }
      }
    }

    // 按优先级排序
    applicablePolicies.sort((a, b) => b.priority - a.priority);

    // 执行最高优先级策略
    const decision = applicablePolicies[0] || { action: 'allow' };

    return {
      action: decision.action || 'allow',
      challengeType: decision.challengeType,
      factors: applicablePolicies.map(p => p.policy),
      policy: applicablePolicies[0]?.policy
    };
  }

  _evaluateCondition(condition, request, trustScore, riskLevel) {
    if (condition === 'always') return true;

    // 解析条件表达式
    if (condition.includes('trustScore')) {
      const match = condition.match(/trustScore\s*([<>=]+)\s*(\d+)/);
      if (match) {
        const op = match[1];
        const value = parseInt(match[2]);
        switch (op) {
          case '<': return trustScore < value;
          case '>': return trustScore > value;
          case '<=': return trustScore <= value;
          case '>=': return trustScore >= value;
          case '==': return trustScore === value;
        }
      }
    }

    if (condition.includes('action')) {
      const match = condition.match(/action\s*(?:in)?\s*\[\s*"([^"]+)"\s*\]/);
      if (match) {
        const actions = match[1].split(',').map(a => a.trim());
        return actions.some(a => request.action.includes(a));
      }
    }

    return false;
  }

  async _checkIPReputation(ip) {
    // 简化实现
    const knownMalicious = ['192.0.2.0', '198.51.100.0'];
    if (knownMalicious.includes(ip)) return 0;
    
    // 检查是否是VPN/代理
    const vpnRanges = ['10.0.0.0/8', '172.16.0.0/12'];
    // 简化判断
    return ip.startsWith('10.') ? 0.7 : 0.9;
  }

  _evaluateUserAgent(ua) {
    if (!ua) return 0.5;
    const knownBots = ['bot', 'crawler', 'spider'];
    if (knownBots.some(b => ua.toLowerCase().includes(b))) return 0.3;
    return 0.8;
  }

  _isUnusualTime(date) {
    const hour = date.getHours();
    return hour < 6 || hour > 22;
  }

  async _getFailedAttempts(userId) {
    const logs = this.accessLogs.get(userId) || [];
    const recentFailures = logs.filter(l => 
      l.decision.action === 'block' && 
      l.timestamp > Date.now() - 15 * 60 * 1000
    );
    return recentFailures.length;
  }

  async _getLastActivity(userId) {
    const logs = this.accessLogs.get(userId) || [];
    return logs.length > 0 ? logs[logs.length - 1].timestamp : null;
  }

  async _analyzeActivityPattern(userId) {
    // 简化实现
    return 'normal';
  }

  _logAccess(access) {
    const userLogs = this.accessLogs.get(access.userId) || [];
    userLogs.push(access);
    
    // 保持最近1000条记录
    if (userLogs.length > 1000) {
      userLogs.splice(0, userLogs.length - 1000);
    }
    
    this.accessLogs.set(access.userId, userLogs);
  }

  // 添加自定义策略
  addPolicy(policy) {
    this.policies.set(policy.id, {
      ...policy,
      createdAt: Date.now()
    });
  }

  // 获取访问历史
  getAccessHistory(userId, options = {}) {
    const logs = this.accessLogs.get(userId) || [];
    
    let filtered = logs;
    if (options.since) {
      filtered = filtered.filter(l => l.timestamp >= options.since);
    }
    if (options.until) {
      filtered = filtered.filter(l => l.timestamp <= options.until);
    }
    if (options.riskLevel) {
      filtered = filtered.filter(l => l.riskLevel === options.riskLevel);
    }

    return filtered.slice(-100);
  }
}

class ComplianceEngine {
  constructor() {
    this.frameworks = new Map();
    this.controls = new Map();
    this.assessments = new Map();
    this.findings = new Map();
    
    this._initFrameworks();
  }

  _initFrameworks() {
    // SOC 2
    this.frameworks.set('soc2', {
      id: 'soc2',
      name: 'SOC 2 Type II',
      description: 'Service Organization Control 2',
      controls: [
        { id: 'CC1.1', name: 'Control Environment', category: 'common' },
        { id: 'CC2.1', name: 'Communication', category: 'common' },
        { id: 'CC3.1', name: 'Risk Assessment', category: 'common' },
        { id: 'CC5.1', name: 'Control Activities', category: 'common' },
        { id: 'CC6.1', name: 'Logical Access', category: 'security' },
        { id: 'CC7.1', name: 'System Operations', category: 'availability' },
        { id: 'CC8.1', name: 'Change Management', category: 'availability' },
        { id: 'A1.1', name: 'Availability', category: 'availability' }
      ]
    });

    // ISO 27001
    this.frameworks.set('iso27001', {
      id: 'iso27001',
      name: 'ISO/IEC 27001',
      description: 'Information Security Management',
      controls: [
        { id: 'A.5.1', name: 'Policies for information security', category: 'organizational' },
        { id: 'A.6.1', name: 'Internal organization', category: 'organizational' },
        { id: 'A.7.2', name: 'During employment', category: 'human-resources' },
        { id: 'A.8.1', name: 'Asset responsibility', category: 'asset-management' },
        { id: 'A.9.1', name: 'Access control', category: 'access-control' },
        { id: 'A.10.1', name: 'Cryptography', category: 'cryptography' },
        { id: 'A.12.3', name: 'Backup', category: 'operations-security' },
        { id: 'A.18.1', name: 'Compliance', category: 'compliance' }
      ]
    });

    // PCI DSS
    this.frameworks.set('pcidss', {
      id: 'pcidss',
      name: 'PCI DSS 4.0',
      description: 'Payment Card Industry Data Security Standard',
      controls: [
        { id: '1.1', name: 'Firewall Configuration', category: 'network' },
        { id: '2.1', name: 'Vendor Defaults', category: 'configuration' },
        { id: '3.1', name: 'Cardholder Data Protection', category: 'data' },
        { id: '4.1', name: 'Transmission Security', category: 'network' },
        { id: '5.1', name: 'Malware Protection', category: 'endpoint' },
        { id: '6.1', name: 'System Security', category: 'vulnerability' },
        { id: '7.1', name: 'Access Control', category: 'access' },
        { id: '8.1', name: 'Authentication', category: 'identity' }
      ]
    });
  }

  // 运行合规评估
  async runAssessment(frameworkId, scope) {
    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework not found: ${frameworkId}`);
    }

    const assessment = {
      id: `assess_${crypto.randomBytes(8).toString('hex')}`,
      framework: frameworkId,
      scope,
      status: 'in_progress',
      startedAt: Date.now(),
      controls: []
    };

    for (const control of framework.controls) {
      const result = await this._assessControl(control, scope);
      assessment.controls.push(result);
    }

    assessment.completedAt = Date.now();
    assessment.status = 'completed';
    assessment.summary = this._generateSummary(assessment.controls);

    this.assessments.set(assessment.id, assessment);
    return assessment;
  }

  async _assessControl(control, scope) {
    const findings = [];
    let status = 'compliant';

    // 运行自动检查
    const checks = this._getControlChecks(control.id);
    for (const check of checks) {
      const result = await this._runCheck(check, scope);
      if (!result.passed) {
        findings.push(result);
        status = 'non_compliant';
      }
    }

    return {
      controlId: control.id,
      controlName: control.name,
      category: control.category,
      status,
      findings,
      checkedAt: Date.now()
    };
  }

  _getControlChecks(controlId) {
    // 定义检查规则
    const checks = {
      'CC6.1': [
        { id: 'access-review', name: '定期访问审查', frequency: 'quarterly' },
        { id: 'mfa-enforcement', name: 'MFA强制执行', frequency: 'continuous' },
        { id: 'session-timeout', name: '会话超时配置', frequency: 'continuous' }
      ],
      'CC7.1': [
        { id: 'monitoring', name: '系统监控', frequency: 'continuous' },
        { id: 'incident-response', name: '事件响应流程', frequency: 'monthly' },
        { id: 'logging', name: '日志记录', frequency: 'continuous' }
      ],
      'A.9.1': [
        { id: 'least-privilege', name: '最小权限原则', frequency: 'quarterly' },
        { id: 'access-review', name: '访问审查', frequency: 'quarterly' },
        { id: 'privileged-access', name: '特权访问管理', frequency: 'monthly' }
      ]
    };

    return checks[controlId] || [];
  }

  async _runCheck(check, scope) {
    // 模拟检查执行
    return {
      checkId: check.id,
      checkName: check.name,
      passed: Math.random() > 0.2, // 80% 通过率模拟
      evidence: {
        description: `检查 ${check.name} 在范围 ${scope} 内的合规性`,
        evidenceType: 'automated'
      },
      checkedAt: Date.now()
    };
  }

  _generateSummary(controls) {
    const compliant = controls.filter(c => c.status === 'compliant').length;
    const nonCompliant = controls.filter(c => c.status === 'non_compliant').length;
    const total = controls.length;

    return {
      totalControls: total,
      compliant,
      nonCompliant,
      complianceRate: total > 0 ? Math.round(compliant / total * 100) : 0,
      criticalFindings: controls.reduce((sum, c) => 
        sum + c.findings.filter(f => f.severity === 'critical').length, 0),
      highFindings: controls.reduce((sum, c) => 
        sum + c.findings.filter(f => f.severity === 'high').length, 0)
    };
  }

  // 获取合规报告
  generateReport(assessmentId, format = 'json') {
    const assessment = this.assessments.get(assessmentId);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    if (format === 'json') {
      return assessment;
    }

    if (format === 'pdf') {
      return {
        format: 'pdf',
        data: this._generatePDFContent(assessment)
      };
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  // 获取待整改项
  getRemediationItems(frameworkId) {
    const items = [];
    
    for (const assessment of this.assessments.values()) {
      if (assessment.framework !== frameworkId) continue;
      
      for (const control of assessment.controls) {
        for (const finding of control.findings) {
          items.push({
            controlId: control.controlId,
            finding: finding.checkName,
            severity: finding.severity || 'medium',
            status: 'open',
            createdAt: finding.checkedAt
          });
        }
      }
    }

    return items.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
}

class ThreatDetector {
  constructor() {
    this.threats = new Map();
    this.iocs = new Map();
    this.detectionRules = new Map();
    
    this._initDetectionRules();
  }

  _initDetectionRules() {
    const rules = [
      {
        id: 'brute-force',
        name: '暴力破解检测',
        type: 'authentication',
        severity: 'high',
        conditions: [
          { field: 'eventType', operator: 'equals', value: 'auth.failed' },
          { field: 'count', operator: 'greater_than', value: 5, window: '5m' }
        ],
        action: 'alert'
      },
      {
        id: 'anomalous-access',
        name: '异常访问检测',
        type: 'access',
        severity: 'medium',
        conditions: [
          { field: 'newLocation', operator: 'equals', value: true },
          { field: 'unusualTime', operator: 'equals', value: true }
        ],
        action: 'challenge'
      },
      {
        id: 'data-exfiltration',
        name: '数据外泄检测',
        type: 'data',
        severity: 'critical',
        conditions: [
          { field: 'dataVolume', operator: 'greater_than', value: 1000000 },
          { field: 'downloadRate', operator: 'greater_than', value: 100, window: '1h' }
        ],
        action: 'block'
      },
      {
        id: 'privilege-escalation',
        name: '权限提升检测',
        type: 'authorization',
        severity: 'critical',
        conditions: [
          { field: 'roleChanged', operator: 'equals', value: true },
          { field: 'newRole', operator: 'in', value: ['admin', 'owner'] }
        ],
        action: 'alert'
      },
      {
        id: 'api-abuse',
        name: 'API滥用检测',
        type: 'api',
        severity: 'medium',
        conditions: [
          { field: 'rateLimitExceeded', operator: 'equals', value: true },
          { field: 'errorRate', operator: 'greater_than', value: 0.5, window: '10m' }
        ],
        action: 'throttle'
      }
    ];

    for (const rule of rules) {
      this.detectionRules.set(rule.id, rule);
    }
  }

  // 分析事件
  analyzeEvent(event) {
    const alerts = [];

    for (const [ruleId, rule] of this.detectionRules.entries()) {
      if (this._matchRule(event, rule)) {
        const alert = this._createAlert(rule, event);
        alerts.push(alert);
        this._takeAction(alert);
      }
    }

    return alerts;
  }

  _matchRule(event, rule) {
    for (const condition of rule.conditions) {
      const eventValue = this._getFieldValue(event, condition.field);
      
      if (eventValue === undefined) continue;

      switch (condition.operator) {
        case 'equals':
          if (eventValue !== condition.value) return false;
          break;
        case 'greater_than':
          if (typeof eventValue !== 'number' || eventValue <= condition.value) return false;
          break;
        case 'in':
          if (!condition.value.includes(eventValue)) return false;
          break;
      }
    }

    return true;
  }

  _getFieldValue(event, field) {
    const parts = field.split('.');
    let value = event;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return value;
  }

  _createAlert(rule, event) {
    return {
      id: `alert_${crypto.randomBytes(8).toString('hex')}`,
      ruleId: rule.id,
      ruleName: rule.name,
      type: rule.type,
      severity: rule.severity,
      event,
      status: 'new',
      createdAt: Date.now()
    };
  }

  _takeAction(alert) {
    const rule = this.detectionRules.get(alert.ruleId);
    
    switch (rule.action) {
      case 'block':
        alert.action = 'blocked';
        break;
      case 'alert':
        alert.action = 'alerted';
        break;
      case 'challenge':
        alert.action = 'challenged';
        break;
      case 'throttle':
        alert.action = 'throttled';
        break;
    }

    this.threats.set(alert.id, alert);
  }

  // 获取威胁情报
  getThreatIntel() {
    const iocs = Array.from(this.iocs.values());
    const recentThreats = Array.from(this.threats.values())
      .filter(t => t.createdAt > Date.now() - 24 * 60 * 60 * 1000);

    return {
      iocCount: iocs.length,
      recentThreats: recentThreats.length,
      bySeverity: {
        critical: recentThreats.filter(t => t.severity === 'critical').length,
        high: recentThreats.filter(t => t.severity === 'high').length,
        medium: recentThreats.filter(t => t.severity === 'medium').length
      },
      byType: this._countByType(recentThreats)
    };
  }

  _countByType(items) {
    const counts = {};
    for (const item of items) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
    return counts;
  }
}

module.exports = { ZeroTrustEngine, ComplianceEngine, ThreatDetector };
