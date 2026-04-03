const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DockerPythonExecutor {
  constructor(options = {}) {
    this.dockerImage = options.dockerImage || 'skill-python:latest';
    this.baseVolumePath = options.baseVolumePath || path.join(process.cwd(), 'uploads', 'skills');
    this.containerTimeout = options.containerTimeout || 30000; // 30 seconds
    this.maxContainers = options.maxContainers || 5;
    this.activeContainers = new Map();
    this.containerPool = [];
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      containerReuseCount: 0
    };
  }

  /**
   * Execute a Python script in a Docker container
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async execute(options) {
    const {
      skillName,
      scriptPath,
      inputs = {},
      requirements = [],
      timeout = this.containerTimeout,
      env = {}
    } = options;

    if (!skillName || !scriptPath) {
      throw new Error('skillName and scriptPath are required');
    }

    const startTime = Date.now();
    this.metrics.totalExecutions++;

    try {
      // Prepare script directory
      const scriptDir = path.dirname(scriptPath);
      const scriptName = path.basename(scriptPath);
      
      // Create a temporary directory for container execution
      const executionId = crypto.randomBytes(8).toString('hex');
      const containerWorkDir = `/tmp/skill-execution-${executionId}`;
      
      // Build container run command
      const containerName = `skill-${skillName}-${executionId}`;
      
      // Prepare volume mounts
      const volumeMounts = [
        `-v "${scriptDir}:${containerWorkDir}/script:ro"`,
        `-v "${this.baseVolumePath}/${skillName}:/home/skilluser/output"`
      ];
      
      // Prepare environment variables
      const envArgs = [];
      for (const [key, value] of Object.entries(env)) {
        envArgs.push(`-e "${key}=${value}"`);
      }
      envArgs.push(`-e "SKILL_NAME=${skillName}"`);
      envArgs.push(`-e "EXECUTION_ID=${executionId}"`);
      envArgs.push(`-e "INPUT_DATA=${JSON.stringify(inputs)}"`);
      
      // Prepare command
      const command = [
        'docker', 'run',
        '--rm',
        '--name', containerName,
        ...volumeMounts,
        ...envArgs,
        '--memory=256m',
        '--cpus=0.5',
        '--network=none', // Disable network for security
        this.dockerImage,
        'python', `/home/skilluser/app/script/${scriptName}`
      ];
      
      // Execute in container
      const result = await this._executeInContainer(command, containerName, timeout);
      
      // Update metrics
      const executionTime = Date.now() - startTime;
      this.metrics.successfulExecutions++;
      this.metrics.averageExecutionTime = 
        (this.metrics.averageExecutionTime * (this.metrics.successfulExecutions - 1) + executionTime) / 
        this.metrics.successfulExecutions;
      
      return {
        success: true,
        skillName,
        executionId,
        containerName,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        executionTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this.metrics.failedExecutions++;
      return {
        success: false,
        skillName,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute a Python script with pip install in a Docker container
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeWithDependencies(options) {
    const {
      skillName,
      scriptPath,
      inputs = {},
      requirements = [],
      timeout = this.containerTimeout * 2, // Double timeout for pip install
      env = {}
    } = options;

    if (!skillName || !scriptPath) {
      throw new Error('skillName and scriptPath are required');
    }

    const startTime = Date.now();
    this.metrics.totalExecutions++;

    try {
      // Create a custom Docker image with dependencies
      const imageTag = `skill-${skillName}-${crypto.randomBytes(4).toString('hex')}`;
      
      // Build Dockerfile with dependencies
      const dockerfileContent = `
FROM ${this.dockerImage}

USER root
RUN pip install --no-cache-dir ${requirements.join(' ')}
USER skilluser

WORKDIR /home/skilluser/app
`;
      
      const tempDir = path.join(this.baseVolumePath, skillName, '.docker');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      fs.writeFileSync(dockerfilePath, dockerfileContent);
      
      // Build the image
      await this._buildDockerImage(dockerfilePath, imageTag);
      
      // Execute with the custom image
      const result = await this.execute({
        skillName,
        scriptPath,
        inputs,
        requirements: [], // Already installed in image
        timeout,
        env
      });
      
      // Clean up the image
      this._removeDockerImage(imageTag).catch(() => {});
      
      return result;
      
    } catch (error) {
      this.metrics.failedExecutions++;
      return {
        success: false,
        skillName,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute a Python script with pre-installed dependencies using a cached image
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeWithCachedImage(options) {
    const {
      skillName,
      scriptPath,
      inputs = {},
      imageTag = this.dockerImage,
      timeout = this.containerTimeout,
      env = {}
    } = options;

    return this.execute({
      skillName,
      scriptPath,
      inputs,
      timeout,
      env
    });
  }

  /**
   * Build a Docker image
   * @param {string} dockerfilePath - Path to Dockerfile
   * @param {string} tag - Image tag
   * @returns {Promise<void>}
   */
  async _buildDockerImage(dockerfilePath, tag) {
    return new Promise((resolve, reject) => {
      const buildDir = path.dirname(dockerfilePath);
      const command = ['docker', 'build', '-t', tag, '-f', dockerfilePath, buildDir];
      
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
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Docker build failed: ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * Remove a Docker image
   * @param {string} tag - Image tag
   * @returns {Promise<void>}
   */
  async _removeDockerImage(tag) {
    return new Promise((resolve) => {
      const command = ['docker', 'rmi', '-f', tag];
      const child = spawn(command[0], command.slice(1), {
        stdio: 'ignore'
      });
      
      child.on('close', () => resolve());
      child.on('error', () => resolve()); // Ignore errors on cleanup
    });
  }

  /**
   * Execute command in container
   * @param {Array} command - Docker command
   * @param {string} containerName - Container name
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Object>} Execution result
   */
  async _executeInContainer(command, containerName, timeout) {
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
          reject(error);
        }
      });
      
      child.on('close', (code) => {
        if (!killed) {
          if (code === 0) {
            resolve({
              stdout,
              stderr,
              exitCode: code
            });
          } else {
            reject(new Error(`Container execution failed with code ${code}: ${stderr}`));
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
        
        reject(new Error(`Container execution timeout after ${timeout}ms`));
      }, timeout);
      
      child.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Get execution metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeContainers: this.activeContainers.size,
      containerPoolSize: this.containerPool.length
    };
  }

  /**
   * Clean up all containers
   */
  async cleanup() {
    // Kill all active containers
    for (const [containerName, child] of this.activeContainers.entries()) {
      child.kill();
      await this._removeContainer(containerName);
    }
    
    this.activeContainers.clear();
    this.containerPool = [];
  }

  /**
   * Remove a Docker container
   * @param {string} containerName - Container name
   * @returns {Promise<void>}
   */
  async _removeContainer(containerName) {
    return new Promise((resolve) => {
      const command = ['docker', 'rm', '-f', containerName];
      const child = spawn(command[0], command.slice(1), {
        stdio: 'ignore'
      });
      
      child.on('close', () => resolve());
      child.on('error', () => resolve()); // Ignore errors on cleanup
    });
  }

  /**
   * Check if Docker is available
   * @returns {Promise<boolean>}
   */
  static async checkDockerAvailable() {
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

  /**
   * Build the base Python skill image
   * @returns {Promise<boolean>}
   */
  async buildBaseImage() {
    const dockerfilePath = path.join(__dirname, '..', '..', '..', 'docker', 'skill-python', 'Dockerfile');
    
    if (!fs.existsSync(dockerfilePath)) {
      console.warn('Base Dockerfile not found:', dockerfilePath);
      return false;
    }
    
    try {
      await this._buildDockerImage(dockerfilePath, this.dockerImage);
      console.log(`Base image ${this.dockerImage} built successfully`);
      return true;
    } catch (error) {
      console.error('Failed to build base image:', error.message);
      return false;
    }
  }
}

module.exports = { DockerPythonExecutor };