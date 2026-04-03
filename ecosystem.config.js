module.exports = {
  apps: [
    {
      name: 'ultrawork',
      script: 'server/staticServer.js',
      cwd: '.',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        API_KEY: process.env.API_KEY,
        REDIS_URL: 'redis://localhost:6379',
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
        TRUST_PROXY: 'true'
      },
      error_file: '.opencode/logs/error.log',
      out_file: '.opencode/logs/out.log',
      log_file: '.opencode/logs/combined.log',
      time: true,
      merge_logs: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      wait_ready: true,
      instance_var: 'INSTANCE_ID',
      node_args: '--max-old-space-size=2048',
      exp_backoff_restart_delay: 100,
      max_restarts: 15,
      min_uptime: '5s',
      combine_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      cron_restart: '0 4 * * *',
      increment_var: 'PORT'
    },
    {
      name: 'ultrawork-discord',
      script: 'bot-discord.js',
      cwd: '.',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: '.opencode/logs/discord-error.log',
      out_file: '.opencode/logs/discord-out.log',
      time: true,
      max_restarts: 10
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:user/ultrawork.git',
      path: '/var/www/ultrawork',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
