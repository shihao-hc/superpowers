/**
 * Integration test runner
 * Starts server, generates JWT, runs integration/penetration tests, stops server
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 3001;
const JWT_SECRET = 'test-secret-for-integration-only-32chars';
const BASE_URL = `http://localhost:${PORT}`;
const TEST_FILES = [
  'tests/integration/mcp-client.test.js',
  'tests/integration/skill-renderer.test.js',
  'tests/integration/vertical-domains.test.js',
  'tests/security/penetration.test.js',
];

// Generate a JWT token valid for both server authMiddleware and MCP router
function generateToken() {
  try {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ username: 'integration-test', role: 'admin' }, JWT_SECRET, {
      expiresIn: '1h',
      issuer: 'ultrawork-ai',
    });
  } catch {
    return 'test-token-fallback';
  }
}

const TEST_AUTH_TOKEN = generateToken();

let serverProcess;

function startServer() {
  return new Promise((resolve, reject) => {
    const serverDir = path.resolve(__dirname, '..');
    serverProcess = spawn('node', ['server/index.js'], {
      cwd: serverDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(PORT),
        JWT_SECRET,
        MASK_SALT: 'integration-test-salt',
        TEST_BASE_URL: BASE_URL,
        LOG_LEVEL: 'error',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', () => {});
    serverProcess.stderr.on('data', () => {});

    serverProcess.on('error', reject);
    serverProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Server exited with code ${code}`));
    });

    pollHealth(resolve, reject, 0);
  });
}

function pollHealth(resolve, reject, attempt) {
  if (attempt >= 30) {
    return reject(new Error('Server failed to start within 15s'));
  }
  http.get(`${BASE_URL}/api/health`, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve());
  }).on('error', () => {
    setTimeout(() => pollHealth(resolve, reject, attempt + 1), 500);
  });
}

function runJest() {
  return new Promise((resolve, reject) => {
    const jestBin = require.resolve('jest/bin/jest');
    const jestProcess = spawn(process.execPath, [jestBin, '--no-coverage', ...TEST_FILES], {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_BASE_URL: BASE_URL,
        TEST_AUTH_TOKEN,
      },
    });
    jestProcess.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Jest exited with code ${code}`));
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();
    serverProcess.on('exit', () => resolve());
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serverProcess) serverProcess.kill('SIGKILL');
      resolve();
    }, 5000);
  });
}

async function main() {
  try {
    console.log(`Starting server on port ${PORT}...`);
    await startServer();
    console.log('Server ready, running integration tests...');
    await runJest();
    console.log('All integration tests passed.');
    process.exit(0);
  } catch (error) {
    console.error(`FAILED: ${error.message}`);
    process.exit(1);
  } finally {
    await stopServer();
  }
}

main();
