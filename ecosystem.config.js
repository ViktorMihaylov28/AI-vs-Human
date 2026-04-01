module.exports = {
  apps: [
    {
      name: "ai-human-quiz",
      script: "./server.js",
      
      instances: 1,
      exec_mode: "fork",
      
      env: {
        NODE_ENV: "development",
        PORT: 3000,
        USE_HTTPS: "false",
        LOG_LEVEL: "debug",
        LOG_TO_FILE: "false"
      },
      
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        USE_HTTPS: "false",
        LOG_LEVEL: "info",
        LOG_TO_FILE: "true"
      },
      
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      
      autorestart: true,
      watch: false,
      
      max_memory_restart: "500M",
      
      kill_timeout: 5000,
      
      restart_delay: 1000,
      
      max_restarts: 10,
      min_uptime: "10s",
      
      listen_timeout: 3000,
      
      shutdown_with_message: true
    }
  ],
  
  deploy: {
    production: {
      user: "node",
      host: "your-server.com",
      port: 22,
      ref: "origin/main",
      repo: "git@github.com:yourusername/ai-or-human.git",
      path: "/var/www/ai-human-quiz",
      "pre-deploy-local": "",
      "post-deploy": "npm install && npm run build && pm2 reload ecosystem.config.js --env production",
      "pre-setup": ""
    },
    staging: {
      user: "node",
      host: "staging.your-server.com",
      port: 22,
      ref: "origin/develop",
      repo: "git@github.com:yourusername/ai-or-human.git",
      path: "/var/www/ai-human-staging",
      "pre-deploy-local": "",
      "post-deploy": "npm install && npm run build && pm2 reload ecosystem.config.js --env production",
      "pre-setup": ""
    }
  }
};
