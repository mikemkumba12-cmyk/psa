module.exports = {
  apps: [
    {
      name: 'pinaco-smart-advisor',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
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
