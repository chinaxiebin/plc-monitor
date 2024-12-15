module.exports = {
  apps: [
    {
      name: 'plc-monitor',
      script: 'npm',
      args: 'run preview',
      cwd: '/home/devbox/project',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PORT: 3000
      }
    }
  ]
}
