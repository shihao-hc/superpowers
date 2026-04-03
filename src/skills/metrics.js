/**
 * Skills Prometheus 指标端点
 * 追踪技能使用、下载、执行等指标
 */

function createSkillMetricsHandler(skillManager, marketplace, skillMetrics) {
  return (req, res) => {
    const lines = [];
    const timestamp = new Date().toISOString();
    
    // Get skills stats
    const skills = skillManager.getAllSkills() || [];
    const totalSkills = skills.length;
    const enabledSkills = skills.filter(s => s.enabled !== false).length;
    const highRiskSkills = skills.filter(s => s.riskLevel === 'high').length;
    const pureSkills = skills.filter(s => s.pure === true).length;
    
    // Basic skill counts
    lines.push('# HELP skills_total Total number of skills');
    lines.push('# TYPE skills_total gauge');
    lines.push(`skills_total ${totalSkills}`);
    
    lines.push('');
    lines.push('# HELP skills_enabled Number of enabled skills');
    lines.push('# TYPE skills_enabled gauge');
    lines.push(`skills_enabled ${enabledSkills}`);
    
    lines.push('');
    lines.push('# HELP skills_high_risk Number of high-risk skills');
    lines.push('# TYPE skills_high_risk gauge');
    lines.push(`skills_high_risk ${highRiskSkills}`);
    
    lines.push('');
    lines.push('# HELP skills_pure Functions Number of pure function skills');
    lines.push('# TYPE skills_pure_functions gauge');
    lines.push(`skills_pure_functions ${pureSkills}`);
    
    // Marketplace stats if available
    if (marketplace) {
      try {
        const marketplaceStats = marketplace.getMarketplaceStats();
        
        lines.push('');
        lines.push('# HELP marketplace_skills_total Total skills in marketplace');
        lines.push('# TYPE marketplace_skills_total gauge');
        lines.push(`marketplace_skills_total ${marketplaceStats.totalSkills || 0}`);
        
        lines.push('');
        lines.push('# HELP marketplace_published_skills Published skills');
        lines.push('# TYPE marketplace_published_skills gauge');
        lines.push(`marketplace_published_skills ${marketplaceStats.publishedSkills || 0}`);
        
        lines.push('');
        lines.push('# HELP marketplace_total_downloads Total skill downloads');
        lines.push('# TYPE marketplace_total_downloads counter');
        lines.push(`marketplace_total_downloads ${marketplaceStats.totalDownloads || 0}`);
        
        lines.push('');
        lines.push('# HELP marketplace_average_rating Average skill rating');
        lines.push('# TYPE marketplace_average_rating gauge');
        lines.push(`marketplace_average_rating ${marketplaceStats.averageRating || 0}`);
        
        // Per-category stats
        const categories = marketplace.getCategories() || [];
        if (categories.length > 0) {
          lines.push('');
          lines.push('# HELP marketplace_skills_by_category Skills count by category');
          lines.push('# TYPE marketplace_skills_by_category gauge');
          
          for (const category of categories) {
            const safeCategory = category.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
            lines.push(`marketplace_skills_by_category{category="${safeCategory}"} ${category.count}`);
          }
        }
      } catch (error) {
        console.warn('Failed to get marketplace stats for metrics:', error.message);
      }
    }
    
    // Skill types breakdown
    const skillTypes = {};
    skills.forEach(skill => {
      const type = skill.type || 'unknown';
      skillTypes[type] = (skillTypes[type] || 0) + 1;
    });
    
    if (Object.keys(skillTypes).length > 0) {
      lines.push('');
      lines.push('# HELP skills_by_type Skills count by type');
      lines.push('# TYPE skills_by_type gauge');
      
      for (const [type, count] of Object.entries(skillTypes)) {
        const safeType = type.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        lines.push(`skills_by_type{type="${safeType}"} ${count}`);
      }
    }
    
    // Risk level distribution
    const riskLevels = { low: 0, medium: 0, high: 0 };
    skills.forEach(skill => {
      const level = skill.riskLevel || 'low';
      riskLevels[level] = (riskLevels[level] || 0) + 1;
    });
    
    lines.push('');
    lines.push('# HELP skills_risk_distribution Skills risk level distribution');
    lines.push('# TYPE skills_risk_distribution gauge');
    lines.push(`skills_risk_distribution{level="low"} ${riskLevels.low}`);
    lines.push(`skills_risk_distribution{level="medium"} ${riskLevels.medium}`);
    lines.push(`skills_risk_distribution{level="high"} ${riskLevels.high}`);
    
    // Timestamp
    lines.push('');
    lines.push('# HELP skills_metrics_timestamp Metrics collection timestamp');
    lines.push('# TYPE skills_metrics_timestamp gauge');
    lines.push(`skills_metrics_timestamp ${Math.floor(Date.now() / 1000)}`);
    
    // Execution metrics if SkillMetrics is available
    if (skillMetrics) {
      const execMetrics = skillMetrics.getMetricsForPrometheus();
      
      lines.push('');
      lines.push('# HELP skills_executions_total Total number of skill executions');
      lines.push('# TYPE skills_executions_total counter');
      lines.push(`skills_executions_total ${execMetrics.executions.total}`);
      
      lines.push('');
      lines.push('# HELP skills_executions_successful Total successful executions');
      lines.push('# TYPE skills_executions_successful counter');
      lines.push(`skills_executions_successful ${execMetrics.executions.successful}`);
      
      lines.push('');
      lines.push('# HELP skills_executions_failed Total failed executions');
      lines.push('# TYPE skills_executions_failed counter');
      lines.push(`skills_executions_failed ${execMetrics.executions.failed}`);
      
      lines.push('');
      lines.push('# HELP skills_execution_duration_ms Average execution duration in milliseconds');
      lines.push('# TYPE skills_execution_duration_ms gauge');
      lines.push(`skills_execution_duration_ms ${execMetrics.executions.averageTime}`);
      
      lines.push('');
      lines.push('# HELP skills_downloads_total Total skill downloads');
      lines.push('# TYPE skills_downloads_total counter');
      lines.push(`skills_downloads_total ${execMetrics.downloads.total}`);
      
      lines.push('');
      lines.push('# HELP skills_views_total Total skill views');
      lines.push('# TYPE skills_views_total counter');
      lines.push(`skills_views_total ${execMetrics.views.total}`);
      
      lines.push('');
      lines.push('# HELP skills_errors_total Total skill errors');
      lines.push('# TYPE skills_errors_total counter');
      lines.push(`skills_errors_total ${execMetrics.errors.total}`);
      
      // Per-skill metrics
      if (Object.keys(execMetrics.executions.bySkill).length > 0) {
        lines.push('');
        lines.push('# HELP skill_executions_by_skill Executions per skill');
        lines.push('# TYPE skill_executions_by_skill counter');
        
        for (const [skill, count] of Object.entries(execMetrics.executions.bySkill)) {
          const safeSkill = skill.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
          lines.push(`skill_executions_by_skill{skill="${safeSkill}"} ${count}`);
        }
      }
      
      if (Object.keys(execMetrics.downloads.bySkill).length > 0) {
        lines.push('');
        lines.push('# HELP skill_downloads_by_skill Downloads per skill');
        lines.push('# TYPE skill_downloads_by_skill counter');
        
        for (const [skill, count] of Object.entries(execMetrics.downloads.bySkill)) {
          const safeSkill = skill.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
          lines.push(`skill_downloads_by_skill{skill="${safeSkill}"} ${count}`);
        }
      }
      
      // Performance metrics
      lines.push('');
      lines.push('# HELP skills_cache_hits_total Cache hits');
      lines.push('# TYPE skills_cache_hits_total counter');
      lines.push(`skills_cache_hits_total ${execMetrics.performance.cacheHits}`);
      
      lines.push('');
      lines.push('# HELP skills_cache_misses_total Cache misses');
      lines.push('# TYPE skills_cache_misses_total counter');
      lines.push(`skills_cache_misses_total ${execMetrics.performance.cacheMisses}`);
      
      lines.push('');
      lines.push('# HELP skills_docker_executions_total Docker executions');
      lines.push('# TYPE skills_docker_executions_total counter');
      lines.push(`skills_docker_executions_total ${execMetrics.performance.dockerExecutions}`);
      
      lines.push('');
      lines.push('# HELP skills_local_executions_total Local executions');
      lines.push('# TYPE skills_local_executions_total counter');
      lines.push(`skills_local_executions_total ${execMetrics.performance.localExecutions}`);
    }
    
    // Set content type for Prometheus
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n'));
  };
}

module.exports = { createSkillMetricsHandler };
