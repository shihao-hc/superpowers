/**
 * DependencyScanner - 依赖安全扫描服务
 * 检测已知漏洞、不安全版本和恶意依赖
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DependencyScanner {
  constructor() {
    // 已知的漏洞数据库 (简化版)
    this.knownVulnerabilities = {
      'event-stream': { versions: ['<3.3.4'], severity: 'critical', cve: 'CVE-2018-3728' },
      'flatmap-stream': { versions: ['*'], severity: 'critical', cve: 'CVE-2018-3727' },
      'minimist': { versions: ['<1.2.2'], severity: 'high', cve: 'CVE-2021-44906' },
      'lodash': { versions: ['<4.17.21'], severity: 'medium', cve: 'CVE-2021-23337' },
      'axios': { versions: ['<0.21.1'], severity: 'high', cve: 'CVE-2020-28168' },
      'moment': { versions: ['<2.29.2'], severity: 'medium', cve: 'CVE-2022-24785' },
      'json5': { versions: ['<1.0.2'], severity: 'high', cve: 'CVE-2022-46175' },
      'qs': { versions: ['<6.9.7'], severity: 'medium', cve: 'CVE-2022-24999' },
      'node-fetch': { versions: ['<2.6.7'], severity: 'high', cve: 'CVE-2022-0235' },
      'tar': { versions: ['<6.1.11'], severity: 'high', cve: 'CVE-2021-37701' }
    };
    
    // 可疑包名模式
    this.suspiciousPatterns = [
      /^_-/,
      /-alpha$/,
      /^temp-/,
      /^\d+\.\d+\.\d+$/,
      /fake/,
      /mock/,
      /test/,
      /debug/,
      /\+/,
      /@.*\/.*\.\./
    ];
    
    // 建议升级的包
    this.updateRecommendations = {
      'express': { current: '^5.0.0', recommended: '^5.2.1' },
      'socket.io': { current: '^4.0.0', recommended: '^4.8.3' },
      'helmet': { current: '^8.0.0', recommended: '^8.1.0' },
      'jsonwebtoken': { current: '^9.0.0', recommended: '^9.0.3' },
      'bcrypt': { current: '^6.0.0', recommended: '^6.0.0' }
    };
  }
  
  // 扫描项目依赖
  async scan() {
    const results = {
      timestamp: new Date().toISOString(),
      packageJson: null,
      vulnerabilities: [],
      suspicious: [],
      outdated: [],
      recommendations: [],
      score: 10,
      issues: []
    };
    
    try {
      // 读取 package.json
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      results.packageJson = packageJson;
      
      // 检查直接依赖
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // 检查漏洞
      for (const [name, version] of Object.entries(dependencies)) {
        const vuln = this.knownVulnerabilities[name];
        if (vuln && this.isVersionAffected(version, vuln.versions)) {
          results.vulnerabilities.push({
            package: name,
            version,
            severity: vuln.severity,
            cve: vuln.cve
          });
          results.issues.push(`${name}@${version} has known vulnerability`);
        }
        
        // 检查可疑包
        if (this.isSuspicious(name)) {
          results.suspicious.push({ name, version });
          results.issues.push(`Suspicious package: ${name}`);
        }
        
        // 检查过时版本
        const rec = this.updateRecommendations[name];
        if (rec && this.isOutdated(version, rec.current)) {
          results.outdated.push({
            package: name,
            current: version,
            recommended: rec.recommended
          });
        }
      }
      
      // 计算安全分数
      results.score = this.calculateScore(results);
      
    } catch (error) {
      results.error = error.message;
    }
    
    return results;
  }
  
  // 检查版本是否受影响
  isVersionAffected(version, affectedVersions) {
    const cleanVersion = version.replace(/[\^~>=<]/g, '');
    
    for (const pattern of affectedVersions) {
      if (pattern === '*') return true;
      
      if (pattern.startsWith('<')) {
        const target = pattern.substring(1);
        if (this.compareVersions(cleanVersion, target) < 0) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // 版本比较
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }
  
  // 检查可疑包
  isSuspicious(name) {
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(name)) {
        return true;
      }
    }
    return false;
  }
  
  // 检查是否过时
  isOutdated(current, recommended) {
    const currentClean = current.replace(/[\^~]/g, '');
    const recClean = recommended.replace(/[\^~]/g, '');
    return this.compareVersions(currentClean, recClean) < 0;
  }
  
  // 计算安全分数
  calculateScore(results) {
    let score = 10;
    
    // 严重漏洞 -3 分
    const critical = results.vulnerabilities.filter(v => v.severity === 'critical').length;
    score -= critical * 3;
    
    // 高危漏洞 -2 分
    const high = results.vulnerabilities.filter(v => v.severity === 'high').length;
    score -= high * 2;
    
    // 中危漏洞 -1 分
    const medium = results.vulnerabilities.filter(v => v.severity === 'medium').length;
    score -= medium * 0.5;
    
    // 可疑包 -1 分
    score -= results.suspicious.length * 1;
    
    // 过时包 -0.5 分
    score -= results.outdated.length * 0.5;
    
    return Math.max(0, Math.min(10, score));
  }
  
  // 生成安全报告
  generateReport(results) {
    let report = '# Dependency Security Report\n\n';
    report += `**Generated**: ${results.timestamp}\n\n`;
    report += `**Security Score**: ${results.score}/10\n\n`;
    
    if (results.vulnerabilities.length > 0) {
      report += '## Vulnerabilities\n\n';
      for (const v of results.vulnerabilities) {
        report += `- \`${v.package}@${v.version}\` [${v.severity}] ${v.cve || ''}\n`;
      }
      report += '\n';
    }
    
    if (results.suspicious.length > 0) {
      report += '## Suspicious Packages\n\n';
      for (const s of results.suspicious) {
        report += `- \`${s.name}@${s.version}\`\n`;
      }
      report += '\n';
    }
    
    if (results.outdated.length > 0) {
      report += '## Outdated Packages\n\n';
      for (const o of results.outdated) {
        report += `- \`${o.package}\`: ${o.current} → ${o.recommended}\n`;
      }
      report += '\n';
    }
    
    return report;
  }
}

const scanner = new DependencyScanner();

module.exports = { DependencyScanner, scanner };