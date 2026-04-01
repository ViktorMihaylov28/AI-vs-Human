const client = require("prom-client");
const os = require("os");

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const socketConnectionsTotal = new client.Counter({
  name: "socket_connections_total",
  help: "Total number of Socket.io connections",
  registers: [register]
});

const socketDisconnectionsTotal = new client.Counter({
  name: "socket_disconnections_total",
  help: "Total number of Socket.io disconnections",
  registers: [register]
});

const activeConnections = new client.Gauge({
  name: "socket_active_connections",
  help: "Number of active Socket.io connections",
  registers: [register]
});

const gameSessionsTotal = new client.Counter({
  name: "game_sessions_total",
  help: "Total number of game sessions started",
  registers: [register]
});

const questionsAnsweredTotal = new client.Counter({
  name: "questions_answered_total",
  help: "Total number of questions answered by players",
  registers: [register]
});

const correctAnswersTotal = new client.Counter({
  name: "correct_answers_total",
  help: "Total number of correct answers",
  registers: [register]
});

const playerScoreHistogram = new client.Histogram({
  name: "player_final_score",
  help: "Distribution of player final scores",
  buckets: [0, 100, 500, 1000, 2000, 3000, 5000, 10000],
  registers: [register]
});

const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

const activePlayers = new client.Gauge({
  name: "game_active_players",
  help: "Number of active players in current game",
  registers: [register]
});

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  
  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const path = req.route ? req.route.path : req.path;
    
    httpRequestsTotal.inc({ 
      method: req.method, 
      path: path || "unknown",
      status: res.statusCode 
    });
    
    httpRequestDuration.observe(
      { method: req.method, path: path || "unknown", status: res.statusCode },
      duration
    );
  });
  
  next();
}

function createMetricsHandler() {
  return async function metrics(req, res) {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      res.status(500).end(error.message);
    }
  };
}

function recordSocketConnection() {
  socketConnectionsTotal.inc();
  activeConnections.inc();
}

function recordSocketDisconnection() {
  socketDisconnectionsTotal.inc();
  activeConnections.dec();
}

function recordGameSession() {
  gameSessionsTotal.inc();
}

function recordAnswer(isCorrect) {
  questionsAnsweredTotal.inc();
  if (isCorrect) {
    correctAnswersTotal.inc();
  }
}

function recordPlayerScore(score) {
  playerScoreHistogram.observe(score);
}

function recordDbQuery(operation, durationSeconds) {
  dbQueryDuration.observe({ operation }, durationSeconds);
}

function updateActivePlayers(count) {
  activePlayers.set(count);
}

function getMetricsSummary() {
  return {
    requests: {
      total: httpRequestsTotal,
      duration: httpRequestDuration
    },
    sockets: {
      connections: socketConnectionsTotal,
      disconnections: socketDisconnectionsTotal,
      active: activeConnections
    },
    games: {
      sessions: gameSessionsTotal,
      questionsAnswered: questionsAnsweredTotal,
      correctAnswers: correctAnswersTotal
    },
    db: {
      queryDuration: dbQueryDuration
    }
  };
}

module.exports = {
  register,
  metricsMiddleware,
  createMetricsHandler,
  recordSocketConnection,
  recordSocketDisconnection,
  recordGameSession,
  recordAnswer,
  recordPlayerScore,
  recordDbQuery,
  updateActivePlayers,
  getMetricsSummary,
  httpRequestsTotal,
  httpRequestDuration,
  socketConnectionsTotal,
  socketDisconnectionsTotal,
  activeConnections,
  gameSessionsTotal,
  questionsAnsweredTotal,
  correctAnswersTotal,
  playerScoreHistogram,
  dbQueryDuration,
  activePlayers
};
