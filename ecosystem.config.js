// PM2 process file for running the API directly on a server (without Docker).
// One instance: the rate limiter and background jobs are in-process. Scaling to
// several instances first needs a shared rate-limit store (see SYSTEM_ARCHITECTURE.md).
module.exports = {
  apps: [
    {
      name: 'pinnacle-api',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        SERVE_FRONTEND: 'true',
      },
      watch: false,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      error_file: './logs/pm2-err.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
