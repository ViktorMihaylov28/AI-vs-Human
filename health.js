const os = require("os");

function createHealthHandler() {
  const startTime = Date.now();

  return function healthCheck(req, res) {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    
    const checks = {
      status: heapUsedMB < 400 ? "ok" : "warning",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      hostname: os.hostname(),
      platform: os.platform(),
      players: global.playerCount || 0,
      memory: {
        heapUsed: heapUsedMB + " MB",
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + " MB",
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + " MB"
      },
      loadAverage: os.loadavg()
    };

    if (heapUsedMB >= 500) {
      checks.status = "critical";
    }

    res.json(checks);
  };
}

function createLivenessCheck() {
  return function liveness(req, res) {
    res.json({ status: "alive", timestamp: new Date().toISOString() });
  };
}

function createReadinessCheck() {
  return function readiness(req, res) {
    try {
      if (global.gameDb) {
        const dbHealth = global.gameDb.healthCheck();
        if (!dbHealth.healthy) {
          return res.status(503).json({ 
            status: "not ready", 
            reason: "Database not available" 
          });
        }
      } else {
        return res.status(503).json({ 
          status: "not ready", 
          reason: "Database not initialized" 
        });
      }
    } catch (error) {
      return res.status(503).json({ 
        status: "not ready", 
        reason: error.message 
      });
    }

    res.json({ status: "ready", timestamp: new Date().toISOString() });
  };
}

module.exports = {
  createHealthHandler,
  createLivenessCheck,
  createReadinessCheck
};
