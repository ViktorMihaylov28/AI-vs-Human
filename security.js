class SecurityManager {
  constructor(options = {}) {
    this.maxConnectionsPerIP = options.maxConnectionsPerIP || 3;
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || 60;
    this.maxAnswersPerSecond = options.maxAnswersPerSecond || 2;
    this.maxPlayers = options.maxPlayers || 100;
    this.autoBanThreshold = options.autoBanThreshold || 10;
    this.banDuration = options.banDuration || 30 * 60 * 1000;
    
    this.ipConnections = new Map();
    this.ipRequests = new Map();
    this.ipAnswers = new Map();
    this.ipViolations = new Map();
    this.ipWarnings = new Map();
    
    this.blockedPatterns = [
      /<script/i,
      /javascript:/i,
      /onerror=/i,
      /onclick=/i,
      /\.\.\//i,
      /eval\s*\(/i,
      /document\.cookie/i
    ];
    
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }
  
  cleanup() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const fiveMinutesAgo = now - 300000;
    
    for (const [ip, data] of this.ipRequests.entries()) {
      if (data.timestamps.every(t => t < fiveMinutesAgo)) {
        this.ipRequests.delete(ip);
      }
    }
    
    for (const [ip, data] of this.ipAnswers.entries()) {
      if (data.timestamps.every(t => t < fiveMinutesAgo)) {
        this.ipAnswers.delete(ip);
      }
    }
    
    for (const [ip, data] of this.ipConnections.entries()) {
      if (data.lastActivity < fiveMinutesAgo) {
        this.ipConnections.delete(ip);
      }
    }
  }
  
  checkIPConnection(ip) {
    if (!this.ipConnections.has(ip)) {
      this.ipConnections.set(ip, { count: 0, firstConnection: Date.now(), lastActivity: Date.now() });
    }
    
    const data = this.ipConnections.get(ip);
    data.lastActivity = Date.now();
    
    if (data.count >= this.maxConnectionsPerIP) {
      return { allowed: false, reason: "Прекалено много връзки от това устройство", code: "TOO_MANY_CONNECTIONS" };
    }
    
    data.count++;
    return { allowed: true };
  }
  
  releaseIPConnection(ip) {
    const data = this.ipConnections.get(ip);
    if (data) {
      data.count = Math.max(0, data.count - 1);
    }
  }
  
  checkRequestRate(ip) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    if (!this.ipRequests.has(ip)) {
      this.ipRequests.set(ip, { timestamps: [] });
    }
    
    const data = this.ipRequests.get(ip);
    data.timestamps = data.timestamps.filter(t => t > oneMinuteAgo);
    data.timestamps.push(now);
    
    if (data.timestamps.length > this.maxRequestsPerMinute) {
      this.recordViolation(ip, "REQUEST_FLOOD");
      return { allowed: false, reason: "Твърде много заявки", code: "RATE_LIMIT" };
    }
    
    return { allowed: true };
  }
  
  checkAnswerRate(ip) {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    if (!this.ipAnswers.has(ip)) {
      this.ipAnswers.set(ip, { timestamps: [] });
    }
    
    const data = this.ipAnswers.get(ip);
    data.timestamps = data.timestamps.filter(t => t > oneSecondAgo);
    data.timestamps.push(now);
    
    if (data.timestamps.length > this.maxAnswersPerSecond) {
      return { allowed: false, reason: "Твърде бързи отговори", code: "ANSWER_FLOOD" };
    }
    
    return { allowed: true };
  }
  
  recordViolation(ip, type) {
    if (!this.ipViolations.has(ip)) {
      this.ipViolations.set(ip, { count: 0, types: [], firstViolation: Date.now() });
    }
    
    const data = this.ipViolations.get(ip);
    data.count++;
    data.types.push({ type, time: Date.now() });
    
    if (data.count >= this.autoBanThreshold) {
      return { shouldBan: true, reason: "Автоматична забрана заради много нарушения" };
    }
    
    return { shouldBan: false, violations: data.count };
  }
  
  getWarningLevel(ip) {
    const violations = this.ipViolations.get(ip);
    if (!violations) return 0;
    
    if (violations.count >= 8) return 3;
    if (violations.count >= 5) return 2;
    if (violations.count >= 2) return 1;
    return 0;
  }
  
  validateInput(input, fieldName = "input") {
    if (typeof input !== "string") {
      return { valid: false, reason: `${fieldName} трябва да е текст` };
    }
    
    const trimmed = input.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, reason: `${fieldName} не може да е празно` };
    }
    
    if (trimmed.length > 100) {
      return { valid: false, reason: `${fieldName} е прекалено дълго` };
    }
    
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(trimmed)) {
        return { valid: false, reason: `${fieldName} съдържа забранени символи` };
      }
    }
    
    return { valid: true, value: trimmed };
  }
  
  getStats() {
    return {
      activeIPs: this.ipConnections.size,
      ipsWithViolations: this.ipViolations.size,
      totalConnectionsToday: Array.from(this.ipConnections.values()).reduce((sum, d) => sum + d.count, 0)
    };
  }
  
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: { total: 0, errors: 0, byEndpoint: {} },
      sockets: { connected: 0, total: 0, disconnected: 0 },
      game: { questionsAnswered: 0, correctAnswers: 0, gamesStarted: 0 },
      performance: { avgResponseTime: 0, responseTimes: [] }
    };
    
    this.startTime = Date.now();
  }
  
  recordRequest(endpoint, durationMs, isError = false) {
    this.metrics.requests.total++;
    if (isError) this.metrics.requests.errors++;
    
    if (!this.metrics.requests.byEndpoint[endpoint]) {
      this.metrics.requests.byEndpoint[endpoint] = { total: 0, errors: 0, avgTime: 0 };
    }
    
    const ep = this.metrics.requests.byEndpoint[endpoint];
    ep.total++;
    if (isError) ep.errors++;
  }
  
  recordSocketEvent(type) {
    if (type === "connect") {
      this.metrics.sockets.connected++;
      this.metrics.sockets.total++;
    } else if (type === "disconnect") {
      this.metrics.sockets.connected = Math.max(0, this.metrics.sockets.connected - 1);
      this.metrics.sockets.disconnected++;
    }
  }
  
  recordGameEvent(type, data = {}) {
    if (type === "answer") {
      this.metrics.game.questionsAnswered++;
      if (data.correct) this.metrics.game.correctAnswers++;
    } else if (type === "start") {
      this.metrics.game.gamesStarted++;
    }
  }
  
  recordResponseTime(endpoint, ms) {
    this.metrics.performance.responseTimes.push({ endpoint, ms, time: Date.now() });
    
    if (this.metrics.performance.responseTimes.length > 1000) {
      this.metrics.performance.responseTimes = this.metrics.performance.responseTimes.slice(-500);
    }
    
    const endpointTimes = this.metrics.performance.responseTimes
      .filter(r => r.endpoint === endpoint)
      .map(r => r.ms);
    
    if (endpointTimes.length > 0) {
      const avg = endpointTimes.reduce((a, b) => a + b, 0) / endpointTimes.length;
      if (this.metrics.requests.byEndpoint[endpoint]) {
        this.metrics.requests.byEndpoint[endpoint].avgTime = Math.round(avg);
      }
    }
  }
  
  getStats() {
    const uptime = Date.now() - this.startTime;
    const recentTimes = this.metrics.performance.responseTimes.slice(-100);
    
    let avgResponse = 0;
    if (recentTimes.length > 0) {
      avgResponse = Math.round(recentTimes.reduce((sum, r) => sum + r.ms, 0) / recentTimes.length);
    }
    
    return {
      uptime: Math.floor(uptime / 1000),
      uptimeFormatted: this.formatUptime(uptime),
      requests: this.metrics.requests,
      sockets: this.metrics.sockets,
      game: {
        ...this.metrics.game,
        accuracy: this.metrics.game.questionsAnswered > 0
          ? Math.round((this.metrics.game.correctAnswers / this.metrics.game.questionsAnswered) * 100)
          : 0
      },
      performance: {
        avgResponseTime: avgResponse,
        totalMetrics: this.metrics.performance.responseTimes.length
      },
      memory: this.getMemoryUsage()
    };
  }
  
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}ч ${minutes % 60}м`;
    if (minutes > 0) return `${minutes}м ${seconds % 60}с`;
    return `${seconds}с`;
  }
  
  getMemoryUsage() {
    const used = process.memoryUsage();
    return {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024) + " MB",
      heapTotal: Math.round(used.heapTotal / 1024 / 1024) + " MB",
      rss: Math.round(used.rss / 1024 / 1024) + " MB",
      external: Math.round(used.external / 1024 / 1024) + " MB"
    };
  }
}

module.exports = { SecurityManager, PerformanceMonitor };
