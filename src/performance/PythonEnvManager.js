const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PythonEnvManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'uploads', 'venvs');
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    this.mockMode = options.mockMode === true;
    
    // Docker configuration
    this.dockerEnabled = options.dockerEnabled !== false; // Default to true
    this.dockerImage = options.dockerImage || 'skill-python:latest';
    this.dockerTimeout = options.dockerTimeout || 30000;
    this.dockerAvailable = false; // Will be checked asynchronously
    
    // Caching for pure functions
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0
    };
    
    // Metrics
    this.metrics = {
      totalExecutions: 0,
      dockerExecutions: 0,
      localExecutions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageExecutionTime: 0
    };
    
    // Check Docker availability asynchronously
    this._checkDockerAvailability().then(available => {
      this.dockerAvailable = available;
      if (available) {
        console.log('Docker is available for Python skill execution');
      } else {
        console.log('Docker not available, using local Python environments');
      }
    }).catch(() => {
      this.dockerAvailable = false;
    });
  }

  async _checkDockerAvailability() {
    return new Promise((resolve) => {
      const child = spawn('docker', ['--version'], {
        stdio: 'ignore'
      });
      
      child.on('close', (code) => {
        resolve(code === 0);
      });
      
      child.on('error', () => {
        resolve(false);
      });
    });
  }

  _envPath(skillName) {
    return path.join(this.baseDir, skillName);
  }

  async ensureEnvironment(skillName, requirements = []) {
    const envDir = this._envPath(skillName);
    if (this.mockMode) {
      // In mock mode, just ensure directory exists and return a synthetic env path
      if (!fs.existsSync(envDir)) fs.mkdirSync(envDir, { recursive: true });
      return envDir;
    }
    
    // Create virtual environment if it doesn't exist
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
      // Create virtual environment using system Python
      await this._run(['python', '-m', 'venv', envDir], { cwd: process.cwd(), silent: true });
    }
    
    // Install dependencies if provided
    if (requirements.length > 0) {
      const pip = this._pipPath(envDir);
      if (pip) {
        await this._run([pip, 'install', ...requirements], { cwd: envDir, silent: true });
      }
    }
    
    return envDir;
  }

  _pipPath(envDir) {
    const bin = process.platform === 'win32' ? path.join(envDir, 'Scripts', 'pip.exe') : path.join(envDir, 'bin', 'pip');
    return fs.existsSync(bin) ? bin : null;
  }

  _run(commandArray, options = {}) {
    const isArray = Array.isArray(commandArray);
    const cmd = isArray ? commandArray[0] : commandArray;
    const args = isArray ? commandArray.slice(1) : [];
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: 'ignore', ...options });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve(); else reject(new Error(`Command failed: ${cmd} ${args.join(' ')}`));
      });
    });
  }

  /**
   * Generate cache key for pure function execution - 使用SHA-256替代MD5
   */
  _getCacheKey(skillName, scriptPath, inputJson) {
    const inputString = JSON.stringify(inputJson || {});
    const hash = crypto.createHash('sha256')
      .update(`${skillName}:${scriptPath}:${inputString}`)
      .digest('hex');
    return hash;
  }

  /**
   * Get cached result if available
   */
  _getCachedResult(cacheKey) {
    if (!this.cacheEnabled) return null;
    
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      this.cacheStats.misses++;
      this.metrics.cacheMisses++;
      return null;
    }
    
    // Check if cache entry has expired (1 hour TTL)
    if (Date.now() - cached.timestamp > 3600000) {
      this.cache.delete(cacheKey);
      this.cacheStats.evictions++;
      this.cacheStats.misses++;
      this.metrics.cacheMisses++;
      return null;
    }
    
    this.cacheStats.hits++;
    this.metrics.cacheHits++;
    return cached.result;
  }

  /**
   * Store result in cache
   */
  _setCachedResult(cacheKey, result) {
    if (!this.cacheEnabled) return;
    
    // Clean up cache if it's getting too large
    if (this.cache.size > 1000) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));
      toRemove.forEach(([key]) => this.cache.delete(key));
      this.cacheStats.evictions += toRemove.length;
    }
    
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    this.cacheStats.size = this.cache.size;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      ...this.cacheStats,
      hitRate: this.cacheStats.hits + this.cacheStats.misses > 0 
        ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Get execution metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheStats: this.getCacheStats(),
      dockerAvailable: this.dockerAvailable
    };
  }

  async runPythonScript(skillName, scriptPath, inputJson, options = {}) {
    const { 
      requirements = [], 
      isPure = false,
      forceDocker = false,
      forceLocal = false
    } = options;
    
    const startTime = Date.now();
    this.metrics.totalExecutions++;
    
    // Check cache for pure functions
    if (isPure && this.cacheEnabled) {
      const cacheKey = this._getCacheKey(skillName, scriptPath, inputJson);
      const cachedResult = this._getCachedResult(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }
    }
    
    let result;
    let usedDocker = false;
    
    // Decide whether to use Docker or local execution
    const useDocker = this.dockerEnabled && 
                     this.dockerAvailable && 
                     !forceLocal && 
                     (forceDocker || this._shouldUseDocker(skillName, requirements));
    
    try {
      if (useDocker) {
        result = await this._runInDocker(skillName, scriptPath, inputJson, requirements);
        usedDocker = true;
        this.metrics.dockerExecutions++;
      } else {
        result = await this._runLocal(skillName, scriptPath, inputJson, requirements);
        this.metrics.localExecutions++;
      }
    } catch (error) {
      // If Docker fails, try local execution as fallback
      if (useDocker && !forceLocal) {
        console.warn(`Docker execution failed for ${skillName}, falling back to local: ${error.message}`);
        result = await this._runLocal(skillName, scriptPath, inputJson, requirements);
        this.metrics.localExecutions++;
      } else {
        throw error;
      }
    }
    
    // Cache result for pure functions
    if (isPure && this.cacheEnabled) {
      const cacheKey = this._getCacheKey(skillName, scriptPath, inputJson);
      this._setCachedResult(cacheKey, result);
    }
    
    // Update metrics
    const executionTime = Date.now() - startTime;
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + executionTime) / 
      this.metrics.totalExecutions;
    
    return {
      ...result,
      executionMetadata: {
        usedDocker,
        executionTime,
        cached: false,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Determine if Docker should be used for this skill
   */
  _shouldUseDocker(skillName, requirements) {
    // Use Docker for skills with complex dependencies
    // or high-risk operations
    const highRiskSkills = ['file-system', 'network', 'system'];
    const complexDependencies = requirements.length > 3;
    
    return highRiskSkills.some(risk => skillName.toLowerCase().includes(risk)) || 
           complexDependencies;
  }

  /**
   * Run Python script locally
   */
  async _runLocal(skillName, scriptPath, inputJson, requirements = []) {
    const envDir = await this.ensureEnvironment(skillName, requirements);
    const python = process.platform === 'win32' 
      ? path.join(envDir, 'Scripts', 'python.exe') 
      : path.join(envDir, 'bin', 'python');
    
    if (this.mockMode) {
      return { ok: true, message: 'mock-run', data: inputJson };
    }
    
    if (!fs.existsSync(python)) {
      throw new Error('Python interpreter not found in env: ' + envDir);
    }

    const input = JSON.stringify(inputJson || {});
    return new Promise((resolve, reject) => {
      const child = spawn(python, [scriptPath], { 
        stdio: ['pipe', 'pipe', 'pipe'], 
        env: process.env 
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          try { 
            resolve(JSON.parse(stdout)); 
          } catch { 
            resolve({ output: stdout, error: stderr }); 
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });
      
      // Send input if supported by the script (stdin)
      if (input) child.stdin.write(input);
      child.stdin.end();
    });
  }

  /**
   * Run Python script in Docker container
   */
  async _runInDocker(skillName, scriptPath, inputJson, requirements = []) {
    const executionId = crypto.randomBytes(8).toString('hex');
    const containerName = `skill-${skillName}-${executionId}`;
    const containerWorkDir = `/tmp/skill-execution-${executionId}`;
    
    // Prepare script directory
    const scriptDir = path.dirname(scriptPath);
    const scriptName = path.basename(scriptPath);
    
    // Create temporary directory for container execution
    const tempDir = path.join(this.baseDir, skillName, '.docker', executionId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Copy script to temp directory
    const tempScriptPath = path.join(tempDir, scriptName);
    fs.copyFileSync(scriptPath, tempScriptPath);
    
    // Create requirements file if needed
    if (requirements.length > 0) {
      const requirementsPath = path.join(tempDir, 'requirements.txt');
      fs.writeFileSync(requirementsPath, requirements.join('\n'));
    }
    
    // Build Docker command
    const command = [
      'docker', 'run',
      '--rm',
      '--name', containerName,
      `-v "${tempDir}:${containerWorkDir}"`,
      '-e', `SKILL_NAME=${skillName}`,
      '-e', `EXECUTION_ID=${executionId}`,
      '-e', `INPUT_DATA=${JSON.stringify(inputJson || {})}`,
      '--memory=256m',
      '--cpus=0.5',
      '--network=none', // Disable network for security
      this.dockerImage,
      'python', `${containerWorkDir}/${scriptName}`
    ];
    
    return new Promise((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      let killed = false;
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('error', (error) => {
        if (!killed) {
          // Clean up temp directory
          this._cleanupTempDir(tempDir);
          reject(error);
        }
      });
      
      child.on('close', (code) => {
        // Clean up temp directory
        this._cleanupTempDir(tempDir);
        
        if (!killed) {
          if (code === 0) {
            try {
              resolve(JSON.parse(stdout));
            } catch {
              resolve({ output: stdout, error: stderr });
            }
          } else {
            reject(new Error(`Docker execution failed with code ${code}: ${stderr}`));
          }
        }
      });
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill();
        
        // Force remove container
        spawn('docker', ['rm', '-f', containerName], {
          stdio: 'ignore'
        });
        
        // Clean up temp directory
        this._cleanupTempDir(tempDir);
        
        reject(new Error(`Docker execution timeout after ${this.dockerTimeout}ms`));
      }, this.dockerTimeout);
      
      child.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
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
   * Build Docker image for skill
   */
  async buildDockerImage(skillName, requirements = []) {
    if (!this.dockerAvailable) {
      throw new Error('Docker is not available');
    }
    
    const dockerfilePath = path.join(__dirname, '..', '..', 'docker', 'skill-python', 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      throw new Error('Dockerfile not found at: ' + dockerfilePath);
    }
    
    const imageTag = `skill-${skillName}:latest`;
    
    // Create temporary Dockerfile with requirements
    const tempDir = path.join(this.baseDir, skillName, '.docker-build');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempDockerfilePath = path.join(tempDir, 'Dockerfile');
    let dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    
    // Add requirements installation if provided
    if (requirements.length > 0) {
      const requirementsSection = `
USER root
RUN pip install --no-cache-dir ${requirements.join(' ')}
USER skilluser
`;
      dockerfileContent = dockerfileContent.replace(
        '# Copy requirements if they exist',
        requirementsSection
      );
    }
    
    fs.writeFileSync(tempDockerfilePath, dockerfileContent);
    
    // Build the image
    return new Promise((resolve, reject) => {
      const command = ['docker', 'build', '-t', imageTag, '-f', tempDockerfilePath, tempDir];
      const child = spawn(command[0], command.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('error', reject);
      
      child.on('close', (code) => {
        // Clean up temp directory
        this._cleanupTempDir(tempDir);
        
        if (code === 0) {
          resolve({
            success: true,
            imageTag,
            message: `Docker image ${imageTag} built successfully`
          });
        } else {
          reject(new Error(`Docker build failed: ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * Check if a skill environment exists
   */
  hasEnvironment(skillName) {
    const envDir = this._envPath(skillName);
    return fs.existsSync(envDir);
  }

  /**
   * Remove a skill environment
   */
  async removeEnvironment(skillName) {
    const envDir = this._envPath(skillName);
    if (fs.existsSync(envDir)) {
      fs.rmSync(envDir, { recursive: true, force: true });
    }
    
    // Also remove Docker images for this skill
    if (this.dockerAvailable) {
      const imageTag = `skill-${skillName}:latest`;
      await new Promise((resolve) => {
        const child = spawn('docker', ['rmi', '-f', imageTag], {
          stdio: 'ignore'
        });
        child.on('close', () => resolve());
        child.on('error', () => resolve());
      });
    }
    
    // Remove from cache
    for (const [key] of this.cache.entries()) {
      if (key.includes(skillName)) {
        this.cache.delete(key);
      }
    }
    this.cacheStats.size = this.cache.size;
  }
}

module.exports = { PythonEnvManager };
