const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const winston = require("winston");

const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

class GameDatabase {
  constructor(dbFile) {
    this.dbFile = dbFile;
    this.db = null;
  }

  initialize() {
    this.db = new Database(this.dbFile);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("temp_store = MEMORY");
    this.db.pragma("mmap_size = 268435456");
    
    this.createTables();
    this.createIndexes();
    
    return this;
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('player', 'teacher', 'admin')),
        display_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active INTEGER DEFAULT 1,
        session_token TEXT UNIQUE,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME
      );

      CREATE TABLE IF NOT EXISTS player_stats (
        user_id INTEGER PRIMARY KEY,
        total_games_played INTEGER DEFAULT 0,
        total_correct_answers INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_type TEXT DEFAULT 'code',
        question_text TEXT,
        left_code TEXT,
        right_code TEXT,
        left_title TEXT,
        right_title TEXT,
        button0_text TEXT,
        button1_text TEXT,
        button2_text TEXT,
        button3_text TEXT,
        correct_choice INTEGER,
        question_options TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        difficulty INTEGER DEFAULT 1,
        times_asked INTEGER DEFAULT 0,
        times_answered_correctly INTEGER DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        total_questions INTEGER,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'finished', 'cancelled'))
      );

      CREATE TABLE IF NOT EXISTS game_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        answer_choice INTEGER,
        is_correct INTEGER,
        points_awarded INTEGER DEFAULT 0,
        answer_time_ms INTEGER,
        answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES game_sessions(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (question_id) REFERENCES questions(id)
      );

      CREATE TABLE IF NOT EXISTS player_bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        banned_by INTEGER NOT NULL,
        reason TEXT,
        banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (banned_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_user_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        FOREIGN KEY (admin_id) REFERENCES users(id),
        FOREIGN KEY (target_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS proctoring_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES game_sessions(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS blocked_ips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT UNIQUE NOT NULL,
        blocked_by INTEGER NOT NULL,
        reason TEXT,
        blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (blocked_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS request_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        ip_address TEXT,
        method TEXT,
        path TEXT,
        status_code INTEGER,
        response_time_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  createIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_game_results_session ON game_results(session_id);
      CREATE INDEX IF NOT EXISTS idx_game_results_user ON game_results(user_id);
      CREATE INDEX IF NOT EXISTS idx_game_results_question ON game_results(question_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
      CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(is_active);
      CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_player_bans_user ON player_bans(user_id);
      CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip_address);
      CREATE INDEX IF NOT EXISTS idx_request_log_request_id ON request_log(request_id);
    `);
  }

  migrate() {
    const migrations = [
      { table: 'users', col: 'login_attempts', sql: 'ALTER TABLE users ADD COLUMN login_attempts INTEGER DEFAULT 0' },
      { table: 'users', col: 'locked_until', sql: 'ALTER TABLE users ADD COLUMN locked_until DATETIME' },
      { table: 'questions', col: 'difficulty', sql: 'ALTER TABLE questions ADD COLUMN difficulty INTEGER DEFAULT 1' },
      { table: 'questions', col: 'times_asked', sql: 'ALTER TABLE questions ADD COLUMN times_asked INTEGER DEFAULT 0' },
      { table: 'questions', col: 'times_answered_correctly', sql: 'ALTER TABLE questions ADD COLUMN times_answered_correctly INTEGER DEFAULT 0' },
      { table: 'questions', col: 'points', sql: 'ALTER TABLE questions ADD COLUMN points INTEGER DEFAULT 100' },
      { table: 'questions', col: 'question_type', sql: 'ALTER TABLE questions ADD COLUMN question_type TEXT DEFAULT "code"' },
      { table: 'questions', col: 'question_text', sql: 'ALTER TABLE questions ADD COLUMN question_text TEXT' },
      { table: 'questions', col: 'question_options', sql: 'ALTER TABLE questions ADD COLUMN question_options TEXT' },
      { table: 'player_stats', col: 'current_streak', sql: 'ALTER TABLE player_stats ADD COLUMN current_streak INTEGER DEFAULT 0' },
      { table: 'player_stats', col: 'best_streak', sql: 'ALTER TABLE player_stats ADD COLUMN best_streak INTEGER DEFAULT 0' },
      { table: 'audit_log', col: 'ip_address', sql: 'ALTER TABLE audit_log ADD COLUMN ip_address TEXT' }
    ];

    for (const m of migrations) {
      try {
        this.db.exec(m.sql);
        logger.info(`Migration: Added column ${m.col} to ${m.table}`);
      } catch (error) {
        if (!error.message.includes('duplicate column name')) {
          logger.info(`Migration: Column ${m.col} already exists or error: ${error.message}`);
        }
      }
    }

    this.fixQuestionsConstraints();
  }

  fixQuestionsConstraints() {
    try {
      const cols = this.db.prepare("PRAGMA table_info(questions)").all();
      const hasNotNullCode = cols.some(c => c.name === 'left_code' && c.notnull === 1);
      
      if (hasNotNullCode) {
        logger.info("Fixing questions table: removing NOT NULL constraints");
        
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS questions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_type TEXT DEFAULT 'code',
            question_text TEXT,
            left_code TEXT,
            right_code TEXT,
            left_title TEXT,
            right_title TEXT,
            button0_text TEXT,
            button1_text TEXT,
            button2_text TEXT,
            button3_text TEXT,
            correct_choice INTEGER,
            question_options TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            difficulty INTEGER DEFAULT 1,
            times_asked INTEGER DEFAULT 0,
            times_answered_correctly INTEGER DEFAULT 0,
            FOREIGN KEY (created_by) REFERENCES users(id)
          );
          
          INSERT INTO questions_new SELECT * FROM questions;
          
          DROP TABLE questions;
          
          ALTER TABLE questions_new RENAME TO questions;
        `);
        
        logger.info("Questions table constraints fixed successfully");
      }
    } catch (error) {
      logger.info(`Fix questions table error (may be already fixed): ${error.message}`);
    }
  }

  createUser(username, passwordHash, role, displayName) {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(username, passwordHash, role, displayName);
    
    if (role === "player") {
      this.db.prepare(`INSERT INTO player_stats (user_id) VALUES (?)`).run(result.lastInsertRowid);
    }
    
    return { lastInsertRowid: result.lastInsertRowid, id: result.lastInsertRowid };
  }

  createUser(data) {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(data.username, data.passwordHash, data.role, data.displayName);
    return { lastInsertRowid: result.lastInsertRowid, id: result.lastInsertRowid };
  }

  getUserByUsername(username) {
    return this.db.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(username);
  }

  getUserById(id) {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }

  updateUserLogin(userId, sessionToken) {
    this.db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP, session_token = ? WHERE id = ?")
      .run(sessionToken, userId);
  }

  incrementLoginAttempts(username) {
    this.db.prepare("UPDATE users SET login_attempts = login_attempts + 1 WHERE username = ?").run(username);
  }

  resetLoginAttempts(userId) {
    this.db.prepare("UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?").run(userId);
  }

  lockAccount(userId, until) {
    this.db.prepare("UPDATE users SET locked_until = ? WHERE id = ?").run(until, userId);
  }

  isAccountLocked(userId) {
    const user = this.db.prepare("SELECT locked_until FROM users WHERE id = ?").get(userId);
    if (!user || !user.locked_until) return false;
    return new Date(user.locked_until) > new Date();
  }

  getAllQuestions(activeOnly = true, userId = null) {
    let query;
    if (userId) {
      query = activeOnly 
        ? "SELECT * FROM questions WHERE is_active = 1 AND created_by = ? ORDER BY id"
        : "SELECT * FROM questions WHERE created_by = ? ORDER BY id";
      return this.db.prepare(query).all(userId);
    }
    query = activeOnly 
      ? "SELECT * FROM questions WHERE is_active = 1 ORDER BY id"
      : "SELECT * FROM questions ORDER BY id";
    return this.db.prepare(query).all();
  }

  getQuestionById(id) {
    return this.db.prepare("SELECT * FROM questions WHERE id = ?").get(id);
  }

  createQuestion(data) {
    const stmt = this.db.prepare(`
      INSERT INTO questions (question_type, question_text, left_code, right_code, left_title, right_title, 
        button0_text, button1_text, button2_text, button3_text, correct_choice, question_options, created_by, difficulty, points)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const questionOptions = data.questionOptions ? JSON.stringify(data.questionOptions) : null;
    return stmt.run(
      data.questionType || "code",
      data.questionText || null,
      data.leftCode || null,
      data.rightCode || null,
      data.leftTitle || null,
      data.rightTitle || null,
      data.button0Text || null,
      data.button1Text || null,
      data.button2Text || null,
      data.button3Text || null,
      data.correct ?? null,
      questionOptions,
      data.createdBy,
      data.difficulty || 1,
      data.points || 100
    );
  }

  updateQuestion(id, data) {
    const question = this.getQuestionById(id);
    if (!question) return null;

    const questionOptions = data.questionOptions ? JSON.stringify(data.questionOptions) : data.questionOptions;
    
    const stmt = this.db.prepare(`
      UPDATE questions SET 
        question_type = ?, question_text = ?,
        left_code = ?, right_code = ?, left_title = ?, right_title = ?,
        button0_text = ?, button1_text = ?, button2_text = ?, button3_text = ?,
        correct_choice = ?, question_options = ?,
        difficulty = ?, points = ?
      WHERE id = ?
    `);
    stmt.run(
      data.questionType ?? question.question_type,
      data.questionText ?? question.question_text,
      data.leftCode ?? question.left_code,
      data.rightCode ?? question.right_code,
      data.leftTitle ?? question.left_title,
      data.rightTitle ?? question.right_title,
      data.button0Text ?? question.button0_text,
      data.button1Text ?? question.button1_text,
      data.button2Text ?? question.button2_text,
      data.button3Text ?? question.button3_text,
      data.correct ?? question.correct_choice,
      questionOptions ?? question.question_options,
      data.difficulty ?? question.difficulty,
      data.points ?? question.points,
      id
    );
    return true;
  }

  deleteQuestion(id) {
    this.db.prepare("UPDATE questions SET is_active = 0 WHERE id = ?").run(id);
  }

  bulkDeleteQuestions(ids) {
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(`UPDATE questions SET is_active = 0 WHERE id IN (${placeholders})`).run(...ids);
  }

  importQuestions(questions, createdBy) {
    const stmt = this.db.prepare(`
      INSERT INTO questions (left_code, right_code, left_title, right_title,
        button0_text, button1_text, button2_text, button3_text, correct_choice, created_by, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((qs) => {
      for (const q of qs) {
        stmt.run(
          q.leftCode, q.rightCode, q.leftTitle || "left_code.py", q.rightTitle || "right_code.py",
          q.button0Text || "Лявата е от човек, дясната е ИИ",
          q.button1Text || "Дясната е от човек, лявата е ИИ",
          q.button2Text || "И двете са от човек",
          q.button3Text || "И двете са от ИИ",
          q.correct, createdBy, q.difficulty || 1
        );
      }
    });

    insertMany(questions);
    return questions.length;
  }

  searchQuestions(query, searchIn = ["left_code", "right_code", "left_title", "right_title"]) {
    const conditions = searchIn.map(col => `${col} LIKE ?`).join(" OR ");
    const params = searchIn.map(() => `%${query}%`);
    return this.db.prepare(`SELECT * FROM questions WHERE is_active = 1 AND (${conditions})`).all(...params);
  }

  createGameSession(sessionId, totalQuestions) {
    this.db.prepare("INSERT INTO game_sessions (id, total_questions, status) VALUES (?, ?, 'active')")
      .run(sessionId, totalQuestions);
  }

  endGameSession(sessionId, status = "finished") {
    this.db.prepare("UPDATE game_sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(status, sessionId);
  }

  getGameSession(id) {
    return this.db.prepare("SELECT * FROM game_sessions WHERE id = ?").get(id);
  }

  getRecentGameSessions(limit = 50) {
    return this.db.prepare("SELECT * FROM game_sessions ORDER BY started_at DESC LIMIT ?").all(limit);
  }

  saveGameResult(sessionId, userId, questionId, answerChoice, isCorrect, points, answerTimeMs) {
    this.db.prepare(`
      INSERT INTO game_results (session_id, user_id, question_id, answer_choice, is_correct, points_awarded, answer_time_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, userId, questionId, answerChoice, isCorrect ? 1 : 0, points, answerTimeMs);

    if (isCorrect) {
      this.db.prepare("UPDATE questions SET times_answered_correctly = times_answered_correctly + 1 WHERE id = ?").run(questionId);
    }
    this.db.prepare("UPDATE questions SET times_asked = times_asked + 1 WHERE id = ?").run(questionId);
  }

  saveProctoringEvent(sessionId, userId, eventType, eventData) {
    try {
      this.db.prepare(`
        INSERT INTO proctoring_events (session_id, user_id, event_type, event_data)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, userId, eventType, eventData);
    } catch (err) {
      console.error("Error saving proctoring event:", err);
    }
  }

  getSessionResults(sessionId) {
    return this.db.prepare(`
      SELECT gr.*, u.username, u.display_name
      FROM game_results gr
      JOIN users u ON gr.user_id = u.id
      WHERE gr.session_id = ?
      ORDER BY gr.answered_at
    `).all(sessionId);
  }

  exportSessionToCSV(sessionId) {
    const results = this.getSessionResults(sessionId);
    const session = this.getGameSession(sessionId);
    
    let csv = "Играч,Въпрос ID,Отговор,Верен,Точки,Време (ms),Дата\n";
    
    for (const r of results) {
      csv += `"${r.display_name}",${r.question_id},${r.answer_choice},${r.is_correct ? "Да" : "Не"},${r.points_awarded},${r.answer_time_ms},"${r.answered_at}"\n`;
    }
    
    return csv;
  }

  updatePlayerStats(userId, isCorrect, points, isGameWinner = false) {
    this.db.prepare(`
      UPDATE player_stats SET
        total_games_played = total_games_played + 1,
        total_correct_answers = total_correct_answers + ?,
        total_points = total_points + ?,
        games_won = games_won + ?,
        current_streak = CASE WHEN ? = 1 THEN current_streak + 1 ELSE 0 END,
        best_streak = CASE WHEN ? = 1 AND current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END
      WHERE user_id = ?
    `).run(isCorrect ? 1 : 0, points, isGameWinner ? 1 : 0, isCorrect ? 1 : 0, isCorrect ? 1 : 0, userId);
  }

  getPlayerStats(userId) {
    return this.db.prepare("SELECT * FROM player_stats WHERE user_id = ?").get(userId);
  }

  getTopPlayers(limit = 10) {
    return this.db.prepare(`
      SELECT u.username, u.display_name, ps.*
      FROM player_stats ps
      JOIN users u ON ps.user_id = u.id
      ORDER BY ps.total_points DESC
      LIMIT ?
    `).all(limit);
  }

  createBan(userId, bannedBy, reason, expiresAt = null) {
    return this.db.prepare(`
      INSERT INTO player_bans (user_id, banned_by, reason, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, bannedBy, reason, expiresAt);
  }

  removeBan(userId) {
    this.db.prepare("DELETE FROM player_bans WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP").run(userId);
  }

  getActiveBan(userId) {
    return this.db.prepare(`
      SELECT pb.*, u.username as banned_user, u2.username as banned_by_admin
      FROM player_bans pb
      JOIN users u ON pb.user_id = u.id
      JOIN users u2 ON pb.banned_by = u2.id
      WHERE pb.user_id = ? AND (pb.expires_at IS NULL OR pb.expires_at > CURRENT_TIMESTAMP)
    `).get(userId);
  }

  getAllBans(includeExpired = false) {
    const query = includeExpired
      ? `SELECT pb.*, u.username as banned_user, u2.username as banned_by_admin
         FROM player_bans pb
         JOIN users u ON pb.user_id = u.id
         JOIN users u2 ON pb.banned_by = u2.id
         ORDER BY pb.banned_at DESC`
      : `SELECT pb.*, u.username as banned_user, u2.username as banned_by_admin
         FROM player_bans pb
         JOIN users u ON pb.user_id = u.id
         JOIN users u2 ON pb.banned_by = u2.id
         WHERE pb.expires_at IS NULL OR pb.expires_at > CURRENT_TIMESTAMP
         ORDER BY pb.banned_at DESC`;
    return this.db.prepare(query).all();
  }

  cleanupExpiredBans() {
    this.db.prepare("DELETE FROM player_bans WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP").run();
  }

  blockIP(ipAddress, blockedBy, reason, expiresAt = null) {
    this.db.prepare(`
      INSERT OR REPLACE INTO blocked_ips (ip_address, blocked_by, reason, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(ipAddress, blockedBy, reason, expiresAt);
  }

  unblockIP(ipAddress) {
    this.db.prepare("DELETE FROM blocked_ips WHERE ip_address = ?").run(ipAddress);
  }

  isIPBlocked(ipAddress) {
    const block = this.db.prepare(`
      SELECT * FROM blocked_ips 
      WHERE ip_address = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `).get(ipAddress);
    return block;
  }

  cleanupExpiredIPs() {
    this.db.prepare("DELETE FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP").run();
  }

  logAudit(adminId, action, targetUserId = null, details = null, ipAddress = null) {
    this.db.prepare(`
      INSERT INTO audit_log (admin_id, action, target_user_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(adminId, action, targetUserId, details, ipAddress);
  }

  getAuditLog(limit = 100) {
    return this.db.prepare(`
      SELECT al.*, u.username as admin_username
      FROM audit_log al
      JOIN users u ON al.admin_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  cleanupOldResults(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    
    const result = this.db.prepare(`
      DELETE FROM game_results 
      WHERE session_id IN (
        SELECT id FROM game_sessions 
        WHERE ended_at IS NOT NULL AND ended_at < ?
      )
    `).run(cutoff.toISOString());
    
    return result.changes;
  }

  getStats() {
    const totalPlayers = this.db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'player'").get().cnt;
    const totalQuestions = this.db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE is_active = 1").get().cnt;
    const totalGames = this.db.prepare("SELECT COUNT(*) as cnt FROM game_sessions WHERE status = 'finished'").get().cnt;
    const activeBans = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM player_bans 
      WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP
    `).get().cnt;
    
    return { totalPlayers, totalQuestions, totalGames, activeBans };
  }

  logRequest(requestId, ipAddress, method, path, statusCode, responseTimeMs) {
    this.db.prepare(`
      INSERT INTO request_log (request_id, ip_address, method, path, status_code, response_time_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(requestId, ipAddress, method, path, statusCode, responseTimeMs);
  }

  backup(backupPath) {
    return this.db.backup(backupPath);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  healthCheck() {
    try {
      this.db.prepare("SELECT 1").get();
      return { healthy: true, message: "Database connection OK" };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
}

module.exports = GameDatabase;
