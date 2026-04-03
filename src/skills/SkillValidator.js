const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class SkillValidator {
  constructor(options = {}) {
    this.maxZipSize = options.maxZipSize || 10 * 1024 * 1024; // 10MB
    this.allowedExtensions = options.allowedExtensions || ['.js', '.py', '.sh', '.md', '.json', '.txt', '.yaml', '.yml'];
    this.maxDependencyCount = options.maxDependencyCount || 20;
    this.requiredMetadataFields = ['name', 'description', 'version', 'author', 'riskLevel'];
    
    this.securityRules = {
      blockedPatterns: [
        // System call patterns
        { pattern: /eval\s*\(/i, severity: 'high', message: 'Code evaluation detected' },
        { pattern: /exec\s*\(/i, severity: 'high', message: 'System execution detected' },
        { pattern: /system\s*\(/i, severity: 'high', message: 'System call detected' },
        { pattern: /subprocess\./i, severity: 'high', message: 'Subprocess execution detected' },
        { pattern: /__import__\s*\(/i, severity: 'high', message: 'Dynamic import detected' },
        { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/i, severity: 'high', message: 'Child process import detected' },
        { pattern: /process\s*\.\s*exit/i, severity: 'high', message: 'Process exit detected' },
        { pattern: /fs\s*\.\s*(writeFileSync|writeFile|unlink|unlinkSync)\s*\(/i, severity: 'medium', message: 'File system write operation detected' },
        { pattern: /rm\s+-rf/i, severity: 'high', message: 'Recursive delete detected' },
        { pattern: /chmod\s+777/i, severity: 'high', message: 'Dangerous permission change detected' },
        { pattern: /os\s*\.\s*(system|popen)\s*\(/i, severity: 'high', message: 'OS system call detected' },
        { pattern: /subprocess\s*\.\s*(Popen|call|run)\s*\(/i, severity: 'high', message: 'Python subprocess execution detected' }
      ],
      highRiskPatterns: [
        // Network patterns
        { pattern: /fetch\s*\(/i, severity: 'medium', message: 'Network fetch detected' },
        { pattern: /http\s*\./i, severity: 'medium', message: 'HTTP request detected' },
        { pattern: /https\s*\./i, severity: 'medium', message: 'HTTPS request detected' },
        { pattern: /axios/i, severity: 'medium', message: 'HTTP client detected' },
        { pattern: /request\s*\(/i, severity: 'medium', message: 'HTTP request detected' },
        { pattern: /urllib/i, severity: 'medium', message: 'URL library usage detected' },
        { pattern: /requests\s*\./i, severity: 'medium', message: 'Python requests library detected' },
        
        // Execution patterns
        { pattern: /execFile/i, severity: 'medium', message: 'File execution detected' },
        { pattern: /spawn/i, severity: 'medium', message: 'Process spawning detected' },
        { pattern: /fork\s*\(/i, severity: 'medium', message: 'Process forking detected' },
        
        // File system patterns
        { pattern: /fs\s*\.\s*(readFileSync|readFile)\s*\(/i, severity: 'low', message: 'File system read operation detected' },
        { pattern: /open\s*\(/i, severity: 'low', message: 'File open operation detected' },
        
        // Dangerous operations
        { pattern: /process\s*\.\s*(kill|exit|abort)/i, severity: 'high', message: 'Process control detected' },
        { pattern: /kill\s+-[SIG]*TERM/i, severity: 'high', message: 'Process termination detected' }
      ],
      suspiciousPatterns: [
        // Obfuscation patterns
        { pattern: /\\x[0-9a-f]{2}/i, severity: 'medium', message: 'Hex encoding detected' },
        { pattern: /atob\s*\(/i, severity: 'medium', message: 'Base64 decoding detected' },
        { pattern: /btoa\s*\(/i, severity: 'low', message: 'Base64 encoding detected' },
        { pattern: /String\.fromCharCode/i, severity: 'low', message: 'Character code conversion detected' },
        
        // Environment access
        { pattern: /process\.env/i, severity: 'low', message: 'Environment variable access detected' },
        { pattern: /os\.environ/i, severity: 'low', message: 'Python environment access detected' }
      ]
    };
    
    // Track security findings
    this.findings = [];
  }

  /**
   * Validate a skill ZIP package
   * @param {Buffer} zipBuffer - ZIP file buffer
   * @param {string} skillName - Expected skill name
   * @returns {Promise<Object>} Validation result
   */
  async validateZipPackage(zipBuffer, skillName) {
    const result = {
      valid: false,
      errors: [],
      warnings: [],
      metadata: null,
      securityScore: 100,
      riskLevel: 'low'
    };

    try {
      // Check ZIP size
      if (zipBuffer.length > this.maxZipSize) {
        result.errors.push(`ZIP file too large: ${zipBuffer.length} bytes (max: ${this.maxZipSize})`);
        return result;
      }

      // Extract and analyze ZIP contents
      const unzip = require('unzipper');
      const extractPath = path.join(process.cwd(), 'uploads', 'temp', `skill-${Date.now()}`);
      
      // Ensure temp directory exists
      if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
      }

      // Extract ZIP
      await unzip.Open.buffer(zipBuffer).then(d => d.extract({ path: extractPath, concurrency: 5 }));
      
      // Validate extracted contents
      const validationResult = await this.validateSkillDirectory(extractPath, skillName);
      
      // Clean up temp directory
      this._cleanupTempDir(extractPath);
      
      return validationResult;
      
    } catch (error) {
      result.errors.push(`Failed to process ZIP: ${error.message}`);
      return result;
    }
  }

  /**
   * Validate a skill directory
   * @param {string} dirPath - Path to skill directory
   * @param {string} expectedName - Expected skill name
   * @returns {Promise<Object>} Validation result
   */
  async validateSkillDirectory(dirPath, expectedName) {
    const result = {
      valid: false,
      errors: [],
      warnings: [],
      metadata: null,
      securityScore: 100,
      riskLevel: 'low',
      files: []
    };

    try {
      // Check if directory exists
      if (!fs.existsSync(dirPath)) {
        result.errors.push(`Directory not found: ${dirPath}`);
        return result;
      }

      // List all files in directory
      const files = this._listFilesRecursive(dirPath);
      result.files = files;

      // Check for required files
      const requiredFiles = this._findRequiredFiles(files, dirPath);
      if (!requiredFiles.skillMd) {
        result.errors.push('Missing required file: skill.md or README.md');
        return result;
      }

      // Parse skill.md
      const skillMdPath = requiredFiles.skillMd;
      const skillContent = fs.readFileSync(skillMdPath, 'utf8');
      const skillData = this._parseSkillMd(skillContent, expectedName);
      
      // Validate required metadata fields
      const metadataValidation = this._validateMetadata(skillData);
      if (!metadataValidation.valid) {
        result.errors.push(...metadataValidation.errors);
        result.warnings.push(...metadataValidation.warnings);
      }
      
      if (!skillData.name) {
        result.errors.push('Skill name not found in skill.md');
        return result;
      }

      // Validate skill name matches expected
      if (expectedName && skillData.name !== expectedName) {
        result.warnings.push(`Skill name mismatch: expected "${expectedName}", got "${skillData.name}"`);
      }
      
      // Validate version format (SemVer)
      if (skillData.version && !this._isValidSemVer(skillData.version)) {
        result.warnings.push(`Invalid version format: "${skillData.version}". Use Semantic Versioning (e.g., 1.0.0)`);
        result.securityScore -= 5;
      }

      // Check for script files
      const scriptFiles = files.filter(f => 
        f.endsWith('.js') || f.endsWith('.py') || f.endsWith('.sh')
      );

      if (scriptFiles.length === 0) {
        result.warnings.push('No script files found in skill package');
      }

      // Validate file extensions
      const invalidFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ext && !this.allowedExtensions.includes(ext);
      });

      if (invalidFiles.length > 0) {
        result.warnings.push(`Potentially unsafe files found: ${invalidFiles.join(', ')}`);
        result.securityScore -= 10;
      }

      // Security analysis
      const securityResult = await this._analyzeSecurity(dirPath, files);
      result.securityScore = securityResult.score;
      result.riskLevel = securityResult.riskLevel;
      result.warnings.push(...securityResult.warnings);

      // Dependency validation
      if (skillData.dependencies && skillData.dependencies.length > 0) {
        if (skillData.dependencies.length > this.maxDependencyCount) {
          result.warnings.push(`Too many dependencies: ${skillData.dependencies.length} (max: ${this.maxDependencyCount})`);
          result.securityScore -= 5;
        }
      }

      // Set metadata
      result.metadata = {
        name: skillData.name,
        description: skillData.description,
        version: skillData.version || '1.0.0',
        riskLevel: skillData.riskLevel || result.riskLevel,
        pure: skillData.pure || false,
        dependencies: skillData.dependencies || [],
        files: files.length,
        scripts: scriptFiles.length
      };

      // Determine if valid
      result.valid = result.errors.length === 0;
      
      return result;
      
    } catch (error) {
      result.errors.push(`Validation failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Validate a Git repository
   * @param {string} repoUrl - Git repository URL
   * @param {string} targetDir - Target directory
   * @returns {Promise<Object>} Validation result
   */
  async validateGitRepository(repoUrl, targetDir) {
    const result = {
      valid: false,
      errors: [],
      warnings: [],
      metadata: null,
      securityScore: 100,
      riskLevel: 'low'
    };

    try {
      // Basic URL validation
      if (!repoUrl.match(/^https?:\/\/.+\.(git|json)$/) && !repoUrl.match(/^git@.+:.+\.git$/)) {
        result.warnings.push('URL does not look like a Git repository');
        result.securityScore -= 5;
      }

      // Check for private repository patterns
      if (repoUrl.includes('private') || repoUrl.includes('internal')) {
        result.warnings.push('Repository may be private - access may be restricted');
      }

      // For now, we'll just validate the URL format
      // In a real implementation, we would clone and validate the repository
      result.valid = true;
      result.metadata = {
        url: repoUrl,
        target: targetDir
      };

      return result;
      
    } catch (error) {
      result.errors.push(`Git validation failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Analyze security of skill files with enhanced scanning
   */
  async _analyzeSecurity(dirPath, files) {
    const result = {
      score: 100,
      riskLevel: 'low',
      warnings: [],
      findings: [],
      summary: {
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        filesScanned: 0,
        suspiciousPatterns: 0
      }
    };

    try {
      // Check each script file for security issues
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        result.summary.filesScanned++;
        
        // Check for blocked patterns (immediate security violations)
        for (const rule of this.securityRules.blockedPatterns) {
          const matches = this._findPatternMatches(content, rule.pattern);
          if (matches.length > 0) {
            for (const match of matches) {
              result.findings.push({
                file,
                line: match.line,
                pattern: rule.pattern.toString(),
                severity: rule.severity,
                message: rule.message,
                snippet: match.snippet
              });
              
              // Apply scoring based on severity
              switch (rule.severity) {
                case 'high':
                  result.score -= 25;
                  result.summary.highRiskCount++;
                  break;
                case 'medium':
                  result.score -= 15;
                  result.summary.mediumRiskCount++;
                  break;
                default:
                  result.score -= 5;
                  result.summary.lowRiskCount++;
              }
            }
          }
        }
        
        // Check for high-risk patterns
        for (const rule of this.securityRules.highRiskPatterns) {
          const matches = this._findPatternMatches(content, rule.pattern);
          if (matches.length > 0) {
            for (const match of matches) {
              result.findings.push({
                file,
                line: match.line,
                pattern: rule.pattern.toString(),
                severity: rule.severity,
                message: rule.message,
                snippet: match.snippet
              });
              
              switch (rule.severity) {
                case 'high':
                  result.score -= 15;
                  result.summary.highRiskCount++;
                  break;
                case 'medium':
                  result.score -= 8;
                  result.summary.mediumRiskCount++;
                  break;
                default:
                  result.score -= 3;
                  result.summary.lowRiskCount++;
              }
            }
          }
        }
        
        // Check for suspicious patterns
        for (const rule of this.securityRules.suspiciousPatterns) {
          const matches = this._findPatternMatches(content, rule.pattern);
          if (matches.length > 0) {
            result.summary.suspiciousPatterns += matches.length;
            for (const match of matches) {
              result.warnings.push({
                file,
                line: match.line,
                message: rule.message,
                snippet: match.snippet
              });
              
              switch (rule.severity) {
                case 'high':
                  result.score -= 10;
                  break;
                case 'medium':
                  result.score -= 5;
                  break;
                default:
                  result.score -= 2;
              }
            }
          }
        }
      }

      // Check for suspicious file permissions (if on Unix)
      if (process.platform !== 'win32') {
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.mode & 0o111) { // Executable bit set
              if (!file.endsWith('.js') && !file.endsWith('.py') && !file.endsWith('.sh')) {
                result.warnings.push({
                  file,
                  message: `Executable bit set on non-script file`,
                  severity: 'medium'
                });
                result.score -= 5;
              }
            }
          } catch (e) {
            // Ignore permission check errors
          }
        }
      }

      // Check for hardcoded credentials or secrets
      const secretPatterns = [
        { pattern: /password\s*[=:]\s*['"][^'"]+['"]/i, message: 'Hardcoded password detected' },
        { pattern: /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/i, message: 'Hardcoded API key detected' },
        { pattern: /secret\s*[=:]\s*['"][^'"]+['"]/i, message: 'Hardcoded secret detected' },
        { pattern: /token\s*[=:]\s*['"][^'"]+['"]/i, message: 'Hardcoded token detected' },
        { pattern: /aws[_-]?access[_-]?key[_-]?id/i, message: 'AWS credentials detected' },
        { pattern: /BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/i, message: 'Private key detected' }
      ];
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        for (const secret of secretPatterns) {
          if (secret.pattern.test(content)) {
            result.findings.push({
              file,
              severity: 'high',
              message: secret.message,
              type: 'credential'
            });
            result.score -= 30;
            result.summary.highRiskCount++;
          }
        }
      }

      // Normalize score
      result.score = Math.max(0, Math.min(100, result.score));
      
      // Update risk level based on score and findings
      if (result.score < 50 || result.summary.highRiskCount > 3) {
        result.riskLevel = 'high';
      } else if (result.score < 80 || result.summary.highRiskCount > 0) {
        result.riskLevel = 'medium';
      } else {
        result.riskLevel = 'low';
      }
      
      // Generate summary message
      result.summary.message = this._generateSecuritySummary(result);

      return result;
      
    } catch (error) {
      result.warnings.push({
        message: `Security analysis failed: ${error.message}`,
        severity: 'high'
      });
      result.score = 0;
      result.riskLevel = 'high';
      return result;
    }
  }

  /**
   * Find pattern matches with line numbers and snippets
   */
  _findPatternMatches(content, pattern) {
    const matches = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineMatches = line.match(pattern);
      if (lineMatches) {
        matches.push({
          line: index + 1,
          snippet: line.trim().substring(0, 100),
          match: lineMatches[0]
        });
      }
    });
    
    return matches;
  }

  /**
   * Generate security summary
   */
  _generateSecuritySummary(result) {
    const { highRiskCount, mediumRiskCount, lowRiskCount, suspiciousPatterns, filesScanned } = result.summary;
    
    if (highRiskCount > 0) {
      return `Critical security issues found: ${highRiskCount} high-risk patterns`;
    } else if (mediumRiskCount > 0) {
      return `Security warnings: ${mediumRiskCount} medium-risk patterns, ${suspiciousPatterns} suspicious patterns`;
    } else if (suspiciousPatterns > 0) {
      return `Minor warnings: ${suspiciousPatterns} suspicious patterns detected`;
    } else {
      return `No significant security issues found in ${filesScanned} files`;
    }
  }

  /**
   * Validate metadata completeness
   */
  _validateMetadata(skillData) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      missingFields: []
    };
    
    // Check required fields
    for (const field of this.requiredMetadataFields) {
      if (!skillData[field] || (typeof skillData[field] === 'string' && skillData[field].trim() === '')) {
        result.missingFields.push(field);
        result.errors.push(`Required field missing: ${field}`);
        result.valid = false;
      }
    }
    
    // Check optional but recommended fields
    const recommendedFields = ['dependencies', 'inputs', 'outputs'];
    for (const field of recommendedFields) {
      if (!skillData[field] || (Array.isArray(skillData[field]) && skillData[field].length === 0)) {
        result.warnings.push(`Recommended field missing or empty: ${field}`);
      }
    }
    
    // Validate risk level
    const validRiskLevels = ['low', 'medium', 'high'];
    if (skillData.riskLevel && !validRiskLevels.includes(skillData.riskLevel)) {
      result.warnings.push(`Invalid risk level: "${skillData.riskLevel}". Use: low, medium, or high`);
    }
    
    // Validate description length
    if (skillData.description && skillData.description.length < 10) {
      result.warnings.push('Description is too short (minimum 10 characters)');
    }
    
    return result;
  }

  /**
   * Validate Semantic Version format
   */
  _isValidSemVer(version) {
    // Basic SemVer validation: major.minor.patch
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
  }

  /**
   * Parse skill.md content
   */
  _parseSkillMd(content, expectedName) {
    const result = {
      name: expectedName,
      description: '',
      version: '1.0.0',
      riskLevel: 'low',
      pure: false,
      dependencies: [],
      inputs: [],
      outputs: []
    };

    try {
      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const data = yaml.load(frontmatter);
        
        if (data) {
          result.name = data.name || expectedName;
          result.description = data.description || '';
          result.version = data.version || '1.0.0';
          result.riskLevel = data.riskLevel || data.risk || 'low';
          result.pure = data.pure === true;
          result.dependencies = data.dependencies || [];
          result.inputs = data.inputs || [];
          result.outputs = data.outputs || [];
        }
      }

      // If no frontmatter, try to extract from content
      if (!result.description) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('# ') || line.startsWith('## ')) {
            // Found a heading, take next few lines as description
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
              const descLine = lines[j].trim();
              if (descLine && !descLine.startsWith('#')) {
                result.description += descLine + ' ';
              } else if (descLine.startsWith('#')) {
                break;
              }
            }
            break;
          }
        }
      }

      return result;
      
    } catch (error) {
      console.warn('Failed to parse skill.md:', error.message);
      return result;
    }
  }

  /**
   * Find required files in skill package
   */
  _findRequiredFiles(files, basePath) {
    const result = {
      skillMd: null,
      scripts: []
    };

    for (const file of files) {
      const fileName = path.basename(file).toLowerCase();
      if (fileName === 'skill.md' || fileName === 'readme.md') {
        if (!result.skillMd || fileName === 'skill.md') {
          result.skillMd = path.join(basePath, file);
        }
      }
      
      if (fileName.endsWith('.js') || fileName.endsWith('.py') || fileName.endsWith('.sh')) {
        result.scripts.push(path.join(basePath, file));
      }
    }

    return result;
  }

  /**
   * List files recursively
   */
  _listFilesRecursive(dirPath, basePath = '') {
    const files = [];
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const relativePath = basePath ? `${basePath}/${item}` : item;
      
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        // Skip hidden directories and node_modules
        if (!item.startsWith('.') && item !== 'node_modules') {
          files.push(...this._listFilesRecursive(itemPath, relativePath));
        }
      } else {
        files.push(relativePath);
      }
    }
    
    return files;
  }

  /**
   * Clean up temporary directory
   */
  _cleanupTempDir(dirPath) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`Failed to clean up temp directory ${dirPath}:`, error.message);
    }
  }

  /**
   * Generate validation report
   */
  generateReport(validationResult) {
    const report = {
      timestamp: new Date().toISOString(),
      valid: validationResult.valid,
      securityScore: validationResult.securityScore,
      riskLevel: validationResult.riskLevel,
      summary: {
        errors: validationResult.errors.length,
        warnings: validationResult.warnings.length,
        files: validationResult.files ? validationResult.files.length : 0
      },
      details: {
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        metadata: validationResult.metadata
      }
    };

    return report;
  }
}

module.exports = { SkillValidator };