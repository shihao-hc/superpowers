const { spawn: _spawn, spawnSync: _spawnSync, execFile: _execFile } = require('child_process');
const path = require('path');

const ALLOWED_COMMANDS = [
  'node', 'npx', 'npm', 'python', 'python3', 'python2',
  'deno', 'bun', 'tsx', 'uvx',
  'git', 'docker', 'docker-compose',
  'bash', 'sh', 'powershell', 'pwsh',
  'echo', 'cat', 'ls', 'dir', 'which', 'where',
  'curl', 'gh', 'eslint', 'bandit', 'pwd'
];

let allowedCommands = new Set(ALLOWED_COMMANDS);

function configure(commands) {
  allowedCommands = new Set(commands);
}

function validateCommand(command) {
  const base = path.basename(command).replace(/\.(exe|bat|cmd|ps1)$/i, '');
  return allowedCommands.has(base);
}

function validateArgs(args) {
  if (!Array.isArray(args)) {return false;}
  return args.every((a) => typeof a === 'string' && a.length <= 10240 && !a.includes('\0'));
}

function safeSpawn(command, args, options = {}) {
  if (!validateCommand(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }
  if (!validateArgs(args)) {
    throw new Error(`Invalid arguments for: ${command}`);
  }
  if (options.shell) {
    throw new Error('shell mode is disabled for security');
  }
  return _spawn(command, args, { ...options, shell: false });
}

function safeExecFile(command, args, options = {}) {
  if (!validateCommand(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }
  if (!validateArgs(args)) {
    throw new Error(`Invalid arguments for: ${command}`);
  }
  return _execFile(command, args, { ...options, shell: false });
}

function safeExecSync(command, args, options = {}) {
  if (!validateCommand(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }
  if (!validateArgs(args)) {
    throw new Error(`Invalid arguments for: ${command}`);
  }
  const opts = { ...options, shell: false, encoding: options.encoding || 'utf8' };
  const result = _spawnSync(command, args, opts);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 || result.signal) {
    const err = new Error(`Command failed: ${command} ${args.join(' ')}`);
    err.stdout = (result.stdout || '').toString();
    err.stderr = (result.stderr || '').toString();
    err.status = result.status;
    err.signal = result.signal;
    throw err;
  }
  return (result.stdout || '').toString();
}

module.exports = {
  safeSpawn,
  safeExecFile,
  safeExecSync,
  validateCommand,
  configure,
  ALLOWED_COMMANDS
};
