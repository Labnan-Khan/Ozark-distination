const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  apps: [
    {
      name: 'property-rental-api',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: nodeEnv },
      out_file: './logs/api-out.log',
      error_file: './logs/api-error.log',
      merge_logs: true,
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 5000
    },
    {
      name: 'property-rental-worker',
      script: 'src/infrastructure/jobs/worker.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: nodeEnv },
      out_file: './logs/worker-out.log',
      error_file: './logs/worker-error.log',
      merge_logs: true,
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000
    },
    {
      name: 'property-rental-scheduler',
      script: 'src/infrastructure/jobs/scheduler.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: nodeEnv },
      out_file: './logs/scheduler-out.log',
      error_file: './logs/scheduler-error.log',
      merge_logs: true,
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000
    }
  ]
};
