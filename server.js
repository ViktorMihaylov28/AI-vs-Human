require("dotenv").config();

const express = require("express");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const winston = require("winston");
const GameDatabase = require("./database");
const { createHealthHandler, createLivenessCheck, createReadinessCheck } = require("./health");
const metrics = require("./metrics");
const { SecurityManager, PerformanceMonitor } = require("./security");

const isProduction = process.env.NODE_ENV === "production";
const USE_HTTPS = process.env.USE_HTTPS === "true";

const PORT = parseInt(process.env.PORT, 10) || 3000;
const QUESTION_TIME_SECONDS = parseInt(process.env.QUESTION_TIME_SECONDS, 10) || 15;
const QUESTIONS_PER_GAME = parseInt(process.env.QUESTIONS_PER_GAME, 10) || 20;

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-min-32-chars!!";
const JWT_EXPIRES_IN = "24h";

const DB_FILE = path.resolve(process.env.DB_FILE || "game_data.db");
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

const security = new SecurityManager({
  maxConnectionsPerIP: 3,
  maxRequestsPerMinute: 60,
  maxAnswersPerSecond: 2,
  maxPlayers: 100,
  autoBanThreshold: 10,
  banDuration: 30 * 60 * 1000
});

const perfMonitor = new PerformanceMonitor();
const LOG_TO_FILE = process.env.LOG_TO_FILE === "true" || isProduction;

const LOG_DIR = path.join(__dirname, "logs");
const ACCESS_LOG_FILE = path.join(LOG_DIR, "access.log");
const ERROR_LOG_FILE = path.join(LOG_DIR, "error.log");
const AUDIT_LOG_FILE = path.join(LOG_DIR, "audit.log");

const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5;
const LOGIN_LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES, 10) || 15;
const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS, 10) || 30;

if (LOG_TO_FILE && !fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      if (stack) {
        return `[${timestamp}] [${level.toUpperCase()}] ${message}\n${stack}`;
      }
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "HH:mm:ss" }),
        winston.format.printf(({ level, message, timestamp }) => {
          return `[${timestamp}] [${level}] ${message}`;
        })
      )
    })
  ]
});

if (LOG_TO_FILE) {
  logger.add(new winston.transports.File({ filename: ERROR_LOG_FILE, level: "error" }));
  logger.add(new winston.transports.File({ filename: path.join(LOG_DIR, "combined.log") }));
}

function logAccess(ip, user, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [INFO] [${ip}]${user ? ` [${user}]` : ""} - ${message}\n`;
  if (LOG_TO_FILE) fs.appendFileSync(ACCESS_LOG_FILE, logLine);
  logger.info(`${user ? `[${user}] ` : ""}${message}`, { ip });
}

function logWarn(ip, message) {
  logger.warn(message, { ip });
}

function logError(ip, message, error) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [ERROR] [${ip}] - ${message}: ${error?.message || error}\n`;
  if (LOG_TO_FILE) fs.appendFileSync(ERROR_LOG_FILE, logLine);
  logger.error(message, { ip, error: error?.message || error });
}

function logAudit(adminUsername, action, details) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [AUDIT] [${adminUsername}] ${action}${details ? `: ${details}` : ""}\n`;
  if (LOG_TO_FILE) fs.appendFileSync(AUDIT_LOG_FILE, logLine);
  logger.info(`[AUDIT] [${adminUsername}] ${action}${details ? `: ${details}` : ""}`);
}

function generateRequestId() {
  return crypto.randomUUID();
}

function validateEnv() {
  const warnings = [];
  if (process.env.JWT_SECRET?.startsWith("change-me")) {
    warnings.push("JWT_SECRET uses default value - change in production");
  }
  if (warnings.length > 0) {
    logger.warn("Environment warnings: " + warnings.join(", "));
  }
  return true;
}

let db;

const app = express();

function createHttpServer() {
  return http.createServer(app);
}

function createHttpsServer() {
  const sslKeyPath = path.resolve(process.env.SSL_KEY_PATH || "key.pem");
  const sslCertPath = path.resolve(process.env.SSL_CERT_PATH || "cert.pem");
  
  if (!fs.existsSync(sslKeyPath) || !fs.existsSync(sslCertPath)) {
    logger.error("SSL certificates not found. Set SSL_KEY_PATH and SSL_CERT_PATH environment variables.");
    process.exit(1);
  }
  
  return https.createServer({
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath)
  }, app);
}

let server = USE_HTTPS ? createHttpsServer() : createHttpServer();

const allowedOriginsStr = process.env.ALLOWED_ORIGINS || "*";
const allowedOrigins = allowedOriginsStr === "*" 
  ? "*" 
  : allowedOriginsStr.split(",").map((o) => o.trim()).filter(Boolean);

const corsOptions = allowedOrigins === "*" 
  ? { origin: true, methods: ["GET", "POST"], credentials: true }
  : { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true };

const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  message: { error: "Твърде много заявки. Моля, опитайте по-късно." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logWarn(req.ip, "Rate limit exceeded");
    res.status(429).json({ error: "Твърде много заявки. Моля, опитайте по-късно." });
  }
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.socket.io"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: allowedOrigins === "*" ? ["'self'", "*"] : ["'self'", ...allowedOrigins],
      upgradeInsecureRequests: isProduction ? [] : []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Request-ID", generateRequestId());
  next();
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    logAccess(req.ip, null, `${req.method} ${req.path} ${res.statusCode} ${(duration * 1000).toFixed(2)}ms`);
  });
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", apiLimiter);
app.use(metrics.metricsMiddleware);

function isLocalhost(req) {
  const ip = req.ip || req.connection.remoteAddress;
  return ip === "127.0.0.1" || 
         ip === "::1" || 
         ip === "::ffff:127.0.0.1" ||
         ip === "localhost";
}

app.use("/admin.html", (req, res, next) => {
  if (!isLocalhost(req)) {
    logger.warn(`Admin panel blocked from external IP: ${req.ip}`);
    return res.status(403).send("<h1>403 - Достъпът е отказан</h1><p>Админ панелът е достъпен само локално.</p>");
  }
  next();
});

app.use("/api/admin/", (req, res, next) => {
  if (!isLocalhost(req)) {
    logger.warn(`Admin API blocked from external IP: ${req.ip}`);
    return res.status(403).json({ error: "Достъпът е отказан" });
  }
  next();
});

function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function esc(str) {
  return escapeHtml(str);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickDifferentPair(array) {
  if (array.length < 2) throw new Error("Need at least 2 items");
  const firstIndex = Math.floor(Math.random() * array.length);
  let secondIndex = Math.floor(Math.random() * array.length);
  while (secondIndex === firstIndex) secondIndex = Math.floor(Math.random() * array.length);
  return [array[firstIndex], array[secondIndex]];
}

function lineNumber(x, y, n) {
  return `<text x="${x}" y="${y}" fill="#6b7280" font-family="Consolas, 'Courier New', monospace" font-size="20" text-anchor="end">${n}</text>`;
}

function codeText(x, y, text, color, size = 26, weight = 600) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Consolas, 'Courier New', monospace" font-size="${size}" font-weight="${weight}" xml:space="preserve">${esc(text)}</text>`;
}

function renderCodeEditorSvg({ panel, text, lines }) {
  let y = 110, rendered = "";
  for (let i = 0; i < lines.length; i++) {
    rendered += lineNumber(72, y, i + 1);
    rendered += codeText(100, y, lines[i], text);
    y += 42;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
  <rect width="1400" height="900" fill="${panel}"/>${rendered}
</svg>`;
}

function renderHumanSvg(variant) {
  return renderCodeEditorSvg({ panel: "#020713", text: "#8ec5ff", lines: variant.lines });
}

function renderAiSvg(variant) {
  return renderCodeEditorSvg({ panel: "#020713", text: "#8ec5ff", lines: variant.lines });
}

const HUMAN_VARIANTS = [
  { title: "sum.py", lines: ["a = 5", "b = 10", "", "print(a + b)"] },
  { title: "discount.py", lines: ["price = 50", "", "if price > 40:", "    print('expensive')", "else:", "    print('ok')"] },
  { title: "seat_check.js", lines: ["taken = [3, 7, 10]", "", "function free(seat){", "  if(taken.includes(seat)){", "    return false", "  }", "  return true", "}"] },
  { title: "email_check.py", lines: ["def check_email(email):", "    if '@' in email and '.' in email:", "        return True", "    return False"] },
  { title: "hello.py", lines: ["name = 'Maria'", "print('Hello ' + name)"] },
  { title: "trip.py", lines: ["from_city = 'Varna'", "to_city = 'Sofia'", "", "print(from_city + ' -> ' + to_city)"] },
  { title: "even.py", lines: ["n = 8", "", "if n % 2 == 0:", "    print('even')", "else:", "    print('odd')"] },
  { title: "grade.py", lines: ["score = 5.50", "", "if score >= 5.50:", "    print('excellent')", "else:", "    print('ok')"] },
  { title: "cart.js", lines: ["items = [12, 5, 3]", "total = 0", "", "for (let i = 0; i < items.length; i++) {", "  total += items[i]", "}", "", "console.log(total)"] },
  { title: "name_check.py", lines: ["name = 'Ivan'", "", "if len(name) > 2:", "    print('valid')"] },
  { title: "avg.py", lines: ["nums = [4, 6, 8]", "result = sum(nums) / len(nums)", "", "print(result)"] },
  { title: "ticket.py", lines: ["price = 35", "student = True", "", "if student:", "    price = price * 0.7", "", "print(price)"] },
  { title: "contains.js", lines: ["text = 'varna'", "", "if (text.includes('ar')) {", "  console.log('yes')", "}"] },
  { title: "city.py", lines: ["city = 'Plovdiv'", "", "print(city.upper())"] },
  { title: "multiply.py", lines: ["x = 7", "y = 4", "", "print(x * y)"] },
  { title: "filter.js", lines: ["nums = [1, 2, 3, 4, 5]", "evens = nums.filter(n => n % 2 === 0)", "", "console.log(evens)"] },
  { title: "seats.py", lines: ["free = [2, 4, 6, 8]", "", "print(6 in free)"] },
  { title: "course.py", lines: ["hour = '14:15'", "route = 'Varna-Sofia'", "", "print(route + ' ' + hour)"] },
  { title: "total.js", lines: ["prices = [15, 20, 18]", "sum = 0", "", "for (let p of prices) {", "  sum += p", "}", "", "console.log(sum)"] },
  { title: "seat_label.py", lines: ["row = 4", "seat = 'B'", "", "print(str(row) + seat)"] },
  { title: "user.js", lines: ["user = { name: 'Mila', age: 17 }", "", "console.log(user.name)"] },
  { title: "price_ok.py", lines: ["price = 24", "", "if price < 30:", "    print('cheap')"] },
  { title: "letters.py", lines: ["word = 'ticket'", "", "print(len(word))"] },
  { title: "route.js", lines: ["fromCity = 'Burgas'", "toCity = 'Sofia'", "", "console.log(fromCity + ' -> ' + toCity)"] }
];

const AI_VARIANTS = [
  { title: "sumCalculator.ts", lines: ["export function calculateSum(firstNumber:number, secondNumber:number):number{", "  const result = firstNumber + secondNumber;", "  return result;", "}"] },
  { title: "priceCalculator.ts", lines: ["export function calculateDynamicTicketPrice(basePrice:number, isStudent:boolean):number{", "  const studentDiscountMultiplier = 0.70;", "  if(isStudent === true){", "    return Number((basePrice * studentDiscountMultiplier).toFixed(2));", "  }", "  return basePrice;", "}"] },
  { title: "emailValidator.ts", lines: ["export function validateEmailAddress(input:string):boolean{", "  const containsAtSymbol = input.includes('@');", "  const containsDotSymbol = input.includes('.');", "  return containsAtSymbol && containsDotSymbol;", "}"] },
  { title: "seatAvailability.ts", lines: ["export function checkSeatAvailability(seatNumber:number, takenSeats:number[]):boolean{", "  const seatIsTaken = takenSeats.includes(seatNumber);", "  if(seatIsTaken === true){", "    return false;", "  }", "  return true;", "}"] },
  { title: "greetingBuilder.ts", lines: ["export function buildGreetingMessage(personName:string):string{", "  const normalizedName = personName.trim();", "  return 'Hello ' + normalizedName;", "}"] },
  { title: "routeFormatter.ts", lines: ["export function formatRouteLabel(origin:string, destination:string):string{", "  const routeSeparator = ' -> ';", "  return origin + routeSeparator + destination;", "}"] },
  { title: "scoreCheck.ts", lines: ["export function isExcellentScore(currentScore:number):boolean{", "  const minimumExcellentScore = 5.5;", "  return currentScore >= minimumExcellentScore;", "}"] },
  { title: "averageCalculator.ts", lines: ["export function calculateAverageValue(values:number[]):number{", "  const total = values.reduce((acc, item) => acc + item, 0);", "  return total / values.length;", "}"] },
  { title: "cartTotal.ts", lines: ["export function calculateCartTotal(prices:number[]):number{", "  return prices.reduce((accumulator, currentPrice) => {", "    return accumulator + currentPrice;", "  }, 0);", "}"] },
  { title: "labelBuilder.ts", lines: ["export function buildSeatLabel(rowNumber:number, seatLetter:string):string{", "  const normalizedLetter = seatLetter.toUpperCase();", "  return String(rowNumber) + normalizedLetter;", "}"] },
  { title: "courseFormatter.ts", lines: ["export function formatCoursePresentation(routeLabel:string, departureHour:string):string{", "  return routeLabel + ' ' + departureHour;", "}"] },
  { title: "containsChecker.ts", lines: ["export function containsFragment(input:string, fragment:string):boolean{", "  const normalizedInput = input.toLowerCase();", "  const normalizedFragment = fragment.toLowerCase();", "  return normalizedInput.includes(normalizedFragment);", "}"] },
  { title: "cityTransformer.ts", lines: ["export function transformCityNameToUppercase(cityName:string):string{", "  const sanitizedName = cityName.trim();", "  return sanitizedName.toUpperCase();", "}"] },
  { title: "parityChecker.ts", lines: ["export function resolveParityLabel(value:number):string{", "  const isEvenValue = value % 2 === 0;", "  return isEvenValue ? 'even' : 'odd';", "}"] },
  { title: "priceInspector.ts", lines: ["export function getPriceState(price:number):string{", "  const expensiveThreshold = 40;", "  return price > expensiveThreshold ? 'expensive' : 'ok';", "}"] },
  { title: "nameValidator.ts", lines: ["export function isNameValid(name:string):boolean{", "  const normalizedName = name.trim();", "  return normalizedName.length > 2;", "}"] },
  { title: "lengthResolver.ts", lines: ["export function resolveWordLength(word:string):number{", "  const normalizedWord = word.trim();", "  return normalizedWord.length;", "}"] },
  { title: "userReader.ts", lines: ["export function readUserName(user:{name:string; age:number}):string{", "  return user.name;", "}"] },
  { title: "cheapPrice.ts", lines: ["export function isCheapPrice(price:number):boolean{", "  const cheapThreshold = 30;", "  return price < cheapThreshold;", "}"] },
  { title: "multiplyNumbers.ts", lines: ["export function multiplyNumbers(firstValue:number, secondValue:number):number{", "  return firstValue * secondValue;", "}"] },
  { title: "evenFilter.ts", lines: ["export function filterEvenValues(values:number[]):number[]{", "  return values.filter((value) => value % 2 === 0);", "}"] },
  { title: "membershipChecker.ts", lines: ["export function containsSeatValue(values:number[], target:number):boolean{", "  return values.includes(target);", "}"] },
  { title: "routeSummary.ts", lines: ["export function createRouteSummary(startCity:string, endCity:string):string{", "  const arrowToken = ' -> ';", "  return startCity + arrowToken + endCity;", "}"] },
  { title: "pricesReducer.ts", lines: ["export function reducePricesToTotal(prices:number[]):number{", "  return prices.reduce((sum, current) => sum + current, 0);", "}"] }
];

function initDefaultAdmins() {
  const teacherHash = bcrypt.hashSync("teach*123", 10);
  const adminHash = bcrypt.hashSync("admin@123", 10);

  try {
    if (!db.getUserByUsername("teacher")) {
      db.createUser("teacher", teacherHash, "teacher", "Учител");
      logger.info("Created default teacher account");
    }
    if (!db.getUserByUsername("admin")) {
      db.createUser("admin", adminHash, "admin", "Администратор");
      logger.info("Created default admin account");
    }
  } catch (error) {
    logger.error("Error creating default admins:", error);
  }
}

function initDefaultQuestions() {
  const count = db.getAllQuestions().length;
  if (count > 0) return;

  const answerTexts = ["Лявата е от човек, дясната е ИИ", "Дясната е от човек, лявата е ИИ", "И двете са от човек", "И двете са от ИИ"];

  const questions = [];
  for (let i = 0; i < QUESTIONS_PER_GAME; i++) {
    const correct = i % 4;
    let leftKind, rightKind, leftIdx, rightIdx;

    if (correct === 0) {
      const [lh] = pickDifferentPair(HUMAN_VARIANTS);
      const [ri] = pickDifferentPair(AI_VARIANTS);
      leftKind = HUMAN_VARIANTS; rightKind = AI_VARIANTS;
      leftIdx = HUMAN_VARIANTS.indexOf(lh); rightIdx = AI_VARIANTS.indexOf(ri);
    } else if (correct === 1) {
      const [lh] = pickDifferentPair(AI_VARIANTS);
      const [ri] = pickDifferentPair(HUMAN_VARIANTS);
      leftKind = AI_VARIANTS; rightKind = HUMAN_VARIANTS;
      leftIdx = AI_VARIANTS.indexOf(lh); rightIdx = HUMAN_VARIANTS.indexOf(ri);
    } else if (correct === 2) {
      const [lh, ri] = pickDifferentPair(HUMAN_VARIANTS);
      leftKind = HUMAN_VARIANTS; rightKind = HUMAN_VARIANTS;
      leftIdx = HUMAN_VARIANTS.indexOf(lh); rightIdx = HUMAN_VARIANTS.indexOf(ri);
    } else {
      const [lh, ri] = pickDifferentPair(AI_VARIANTS);
      leftKind = AI_VARIANTS; rightKind = AI_VARIANTS;
      leftIdx = AI_VARIANTS.indexOf(lh); rightIdx = AI_VARIANTS.indexOf(ri);
    }

    const leftVariant = leftKind[leftIdx];
    const rightVariant = rightKind[rightIdx];

    questions.push({
      leftCode: leftVariant.lines.join("\n"),
      rightCode: rightVariant.lines.join("\n"),
      leftTitle: leftVariant.title,
      rightTitle: rightVariant.title,
      button0Text: answerTexts[0],
      button1Text: answerTexts[1],
      button2Text: answerTexts[2],
      button3Text: answerTexts[3],
      correct
    });
  }

  db.importQuestions(questions, null);
  logger.info(`Created ${QUESTIONS_PER_GAME} default questions`);
}

function createQuestion(correct, leftKind, rightKind, leftIndex, rightIndex) {
  const leftSource = leftKind === "human" ? HUMAN_VARIANTS : AI_VARIANTS;
  const rightSource = rightKind === "human" ? HUMAN_VARIANTS : AI_VARIANTS;
  const leftVariant = leftSource[leftIndex % leftSource.length];
  const rightVariant = rightSource[rightIndex % rightSource.length];

  return {
    id: crypto.randomUUID(),
    correct,
    leftCode: leftVariant.lines.join("\n"),
    rightCode: rightVariant.lines.join("\n"),
    leftTitle: leftVariant.title,
    rightTitle: rightVariant.title
  };
}

function buildQuestionPool() {
  const dbQuestions = db.getAllQuestions();

  if (dbQuestions.length > 0) {
    return shuffle(dbQuestions.map(q => ({
      id: String(q.id),
      leftCode: q.left_code,
      rightCode: q.right_code,
      leftTitle: q.left_title,
      rightTitle: q.right_title,
      buttonTexts: [q.button0_text, q.button1_text, q.button2_text, q.button3_text],
      correct: q.correct_choice
    })));
  }

  const questions = [];
  for (let i = 0; i < QUESTIONS_PER_GAME; i++) {
    const correct = i % 4;
    if (correct === 0) {
      const [lh] = pickDifferentPair(HUMAN_VARIANTS);
      const [ri] = pickDifferentPair(AI_VARIANTS);
      questions.push(createQuestion(0, "human", "ai", HUMAN_VARIANTS.indexOf(lh), AI_VARIANTS.indexOf(ri)));
    } else if (correct === 1) {
      const [lh] = pickDifferentPair(AI_VARIANTS);
      const [ri] = pickDifferentPair(HUMAN_VARIANTS);
      questions.push(createQuestion(1, "ai", "human", AI_VARIANTS.indexOf(lh), HUMAN_VARIANTS.indexOf(ri)));
    } else if (correct === 2) {
      const [lh, ri] = pickDifferentPair(HUMAN_VARIANTS);
      questions.push(createQuestion(2, "human", "human", HUMAN_VARIANTS.indexOf(lh), HUMAN_VARIANTS.indexOf(ri)));
    } else {
      const [lh, ri] = pickDifferentPair(AI_VARIANTS);
      questions.push(createQuestion(3, "ai", "ai", AI_VARIANTS.indexOf(lh), AI_VARIANTS.indexOf(ri)));
    }
  }
  return shuffle(questions);
}

let currentQuestions = [];

const game = {
  state: "lobby",
  currentQuestionIndex: -1,
  questionEndsAt: 0,
  timerInterval: null,
  currentSessionId: null
};

const playersByToken = new Map();
const ipConnectionCounts = new Map();
const SOCKET_RATE_LIMIT = parseInt(process.env.SOCKET_RATE_LIMIT_MAX, 10) || 50;
const SOCKET_RATE_WINDOW = 60 * 1000;

function checkSocketRateLimit(ip) {
  const now = Date.now();
  const record = ipConnectionCounts.get(ip);
  if (!record) {
    ipConnectionCounts.set(ip, { count: 1, resetAt: now + SOCKET_RATE_WINDOW });
    return true;
  }
  if (now > record.resetAt) {
    ipConnectionCounts.set(ip, { count: 1, resetAt: now + SOCKET_RATE_WINDOW });
    return true;
  }
  if (record.count >= SOCKET_RATE_LIMIT) return false;
  record.count++;
  return true;
}

function currentQuestion() {
  if (game.currentQuestionIndex < 0 || game.currentQuestionIndex >= currentQuestions.length) return null;
  return currentQuestions[game.currentQuestionIndex];
}

function answerText(code) {
  const q = currentQuestion();
  if (q && q.buttonTexts && q.buttonTexts[code]) return q.buttonTexts[code];
  switch (code) {
    case 0: return "Лявата е от човек, дясната е ИИ";
    case 1: return "Дясната е от човек, лявата е ИИ";
    case 2: return "И двете са от човек";
    case 3: return "И двете са от ИИ";
    default: return "";
  }
}

function playerListSorted() {
  return Array.from(playersByToken.values())
    .map((p) => ({
      token: p.token,
      name: p.name,
      score: p.score,
      joinedAt: p.joinedAt,
      answeredCount: Object.keys(p.answers).length,
      correctCount: Object.values(p.answers).filter((a) => a.correct).length,
      streak: p.streak || 0
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.name.localeCompare(b.name, "bg");
    });
}

function answeredStats() {
  const q = currentQuestion();
  if (!q) return { answered: 0, total: playersByToken.size };

  let answered = 0;
  for (const player of playersByToken.values()) {
    if (player.answers[q.id]) answered++;
  }
  return { answered, total: playersByToken.size };
}

function publicState() {
  const q = currentQuestion();
  const stats = answeredStats();

  return {
    state: game.state,
    currentQuestionIndex: game.currentQuestionIndex,
    totalQuestions: currentQuestions.length,
    question: q ? {
      id: q.id,
      leftCode: q.leftCode,
      rightCode: q.rightCode,
      leftTitle: q.leftTitle,
      rightTitle: q.rightTitle,
      correctChoice: q.correct,
      correctText: answerText(q.correct)
    } : null,
    leaderboard: playerListSorted(),
    playersCount: playersByToken.size,
    answeredPlayers: stats.answered,
    totalPlayers: stats.total,
    now: Date.now(),
    questionEndsAt: game.questionEndsAt
  };
}

function privateState(player) {
  const q = currentQuestion();
  const leaderboard = playerListSorted();
  const myRank = leaderboard.findIndex((x) => x.token === player.token) + 1;

  let answeredCurrent = false;
  let revealMessage = "";
  let streak = player.streak || 0;

  if (q && player.answers[q.id]) {
    answeredCurrent = true;
    const ans = player.answers[q.id];
    if (game.state === "reveal" || game.state === "finished") {
      if (ans.choice === null) {
        revealMessage = "Няма изпратен отговор";
      } else if (ans.correct) {
        revealMessage = `Вярно! +${ans.points} точки${ans.timeBonus ? ` (+${ans.timeBonus} бонус)` : ""}`;
      } else {
        revealMessage = "Грешен отговор";
      }
    }
  }

  return {
    score: player.score,
    rank: myRank,
    answeredCurrent,
    revealMessage,
    streak
  };
}

let emitAllScheduled = false;
let lastPublicState = null;

function emitAll() {
  if (emitAllScheduled) return;
  emitAllScheduled = true;
  
  setImmediate(() => {
    const newPublicState = publicState();
    const stateChanged = JSON.stringify(newPublicState) !== JSON.stringify(lastPublicState);
    
    if (stateChanged) {
      io.emit("game:state", newPublicState);
      io.emit("players:update", playerListSorted());
      io.emit("admin:update", newPublicState);
      lastPublicState = newPublicState;
    }
    
    for (const player of playersByToken.values()) {
      if (player.socketId) {
        io.to(player.socketId).emit("player:private", privateState(player));
      }
    }
    
    metrics.updateActivePlayers(playersByToken.size);
    global.playerCount = playersByToken.size;
    emitAllScheduled = false;
  });
}

function clearTimers() {
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }
}

function scoreAnswer(question, choice, msLeft) {
  const correct = choice === question.correct;
  if (!correct) return { correct: false, points: 0, timeBonus: 0 };

  const maxMs = QUESTION_TIME_SECONDS * 1000;
  const speedRatio = Math.max(0, Math.min(1, msLeft / maxMs));
  const basePoints = 500;
  const timeBonus = Math.round(500 * speedRatio);
  const points = basePoints + timeBonus;

  return { correct: true, points, timeBonus };
}

const MAX_PLAYERS_PER_IP = 3;
const ipPlayerCounts = new Map();
const ipLastActivity = new Map();
const answerSpamGuard = new Map();

function getOrCreateIPRecord(ip) {
  if (!ipPlayerCounts.has(ip)) {
    ipPlayerCounts.set(ip, { count: 0, firstConnection: Date.now() });
  }
  return ipPlayerCounts.get(ip);
}

function checkPlayerLimit(ip) {
  const record = getOrCreateIPRecord(ip);
  if (record.count >= MAX_PLAYERS_PER_IP) {
    return false;
  }
  record.count++;
  return true;
}

function removePlayerFromIPCount(ip) {
  const record = ipPlayerCounts.get(ip);
  if (record) {
    record.count = Math.max(0, record.count - 1);
  }
}

function isSpam(ip) {
  const now = Date.now();
  const last = ipLastActivity.get(ip) || 0;
  ipLastActivity.set(ip, now);
  return now - last < 100;
}

const sessionStats = {
  totalConnections: 0,
  totalAnswers: 0,
  totalCorrect: 0,
  sessionStart: Date.now()
};

function moveToReveal() {
  clearTimers();
  game.state = "reveal";
  game.questionEndsAt = 0;

  const q = currentQuestion();
  if (q) {
    for (const player of playersByToken.values()) {
      if (!player.answers[q.id]) {
        player.answers[q.id] = { choice: null, correct: false, points: 0, msLeft: 0, timeBonus: 0 };
      }
    }
  }
  emitAll();
}

function startQuestion(index) {
  clearTimers();

  if (index >= currentQuestions.length) {
    game.state = "finished";
    game.currentQuestionIndex = currentQuestions.length - 1;
    game.questionEndsAt = 0;
    if (game.currentSessionId) {
      db.endGameSession(game.currentSessionId, "finished");
    }
    emitAll();
    return;
  }

  game.state = "question";
  game.currentQuestionIndex = index;
  game.questionEndsAt = Date.now() + QUESTION_TIME_SECONDS * 1000;

  emitAll();

  game.timerInterval = setInterval(() => {
    const remaining = game.questionEndsAt - Date.now();
    io.emit("game:timer", { remainingMs: Math.max(0, remaining), endsAt: game.questionEndsAt });
    if (remaining <= 0) {
      moveToReveal();
    }
  }, 1000);
}

function startGame() {
  clearTimers();

  currentQuestions = buildQuestionPool();
  logger.info(`Loaded ${currentQuestions.length} questions for new game`);
  game.currentSessionId = crypto.randomUUID();
  game.state = "question";
  game.currentQuestionIndex = 0;
  game.questionEndsAt = 0;

  db.createGameSession(game.currentSessionId, currentQuestions.length);
  metrics.recordGameSession();

  for (const p of playersByToken.values()) {
    p.score = 0;
    p.answers = {};
    p.streak = 0;
  }

  startQuestion(0);
}

function nextOrSkip() {
  if (game.state === "question") {
    moveToReveal();
    return;
  }
  if (game.state === "reveal") {
    startQuestion(game.currentQuestionIndex + 1);
  }
}

function resetGame() {
  clearTimers();

  currentQuestions = buildQuestionPool();
  game.state = "lobby";
  game.currentQuestionIndex = -1;
  game.questionEndsAt = 0;
  game.currentSessionId = null;

  for (const p of playersByToken.values()) {
    p.score = 0;
    p.answers = {};
    p.streak = 0;
  }

  emitAll();
}

function forceEndGame() {
  clearTimers();
  game.state = "finished";
  if (game.currentSessionId) {
    db.endGameSession(game.currentSessionId, "finished");
  }
  emitAll();
}

function kickPlayer(token) {
  if (!token) return false;
  const playerToken = String(token);
  const player = playersByToken.get(playerToken);

  if (!player) return false;

  if (player.socketId) {
    const kickedSocket = io.sockets.sockets.get(player.socketId);
    if (kickedSocket) {
      kickedSocket.emit("player:kicked", "Премахнат си от играта от администратор.");
    }
  }

  playersByToken.delete(playerToken);
  emitAll();
  return true;
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Липсва токен" });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Невалиден или изтекъл токен" });
  }

  req.adminUser = decoded;
  next();
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function checkAccountLockout(user) {
  if (!user) return false;
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return true;
  }
  return false;
}

app.post("/api/admin/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Липсва потребителско име или парола" });
  }

  const user = db.getUserByUsername(username);

  if (!user || !["teacher", "admin"].includes(user.role)) {
    logAccess(req.ip, username, "Failed login - user not found");
    return res.status(401).json({ error: "Невалидни данни за вход" });
  }

  if (checkAccountLockout(user)) {
    logAccess(req.ip, username, "Failed login - account locked");
    return res.status(423).json({ error: "Акаунтът е заключен. Опитайте по-късно." });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    db.incrementLoginAttempts(username);
    const attempts = user.login_attempts + 1;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000);
      db.lockAccount(user.id, lockUntil.toISOString());
      logAccess(req.ip, username, `Account locked after ${attempts} failed attempts`);
    }
    logAccess(req.ip, username, "Failed login - invalid password");
    return res.status(401).json({ error: "Невалидни данни за вход" });
  }

  db.resetLoginAttempts(user.id);

  const sessionToken = crypto.randomUUID();
  const newToken = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  db.updateUserLogin(user.id, sessionToken);
  db.logAudit(user.id, "LOGIN", null, null, req.ip);

  logAccess(req.ip, username, "Successful login");
  res.json({ token: newToken, username: user.username, role: user.role });
}));

app.get("/api/admin/verify", authMiddleware, (req, res) => {
  res.json({ username: req.adminUser.username, role: req.adminUser.role });
});

app.get("/api/admin/questions", authMiddleware, (req, res) => {
  const questions = db.getAllQuestions();
  res.json(questions.map(q => ({
    id: String(q.id),
    leftCode: q.left_code,
    rightCode: q.right_code,
    leftTitle: q.left_title,
    rightTitle: q.right_title,
    buttonTexts: [q.button0_text, q.button1_text, q.button2_text, q.button3_text],
    correct: q.correct_choice,
    createdAt: q.created_at,
    difficulty: q.difficulty,
    timesAsked: q.times_asked,
    timesCorrect: q.times_answered_correctly
  })));
});

app.get("/api/admin/questions/search", authMiddleware, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const results = db.searchQuestions(q);
  res.json(results.map(q => ({
    id: String(q.id),
    leftCode: q.left_code,
    rightCode: q.right_code,
    leftTitle: q.left_title,
    rightTitle: q.right_title,
    correct: q.correct_choice
  })));
});

app.post("/api/admin/questions", authMiddleware, (req, res) => {
  const { leftCode, rightCode, leftTitle, rightTitle, buttonTexts, correct, difficulty } = req.body;

  if (!leftCode || !rightCode || typeof correct !== "number") {
    return res.status(400).json({ error: "Липсват задължителни полета" });
  }

  const defaultButtons = ["Лявата е от човек, дясната е ИИ", "Дясната е от човек, лявата е ИИ", "И двете са от човек", "И двете са от ИИ"];
  const buttons = buttonTexts || defaultButtons;

  const result = db.createQuestion({
    leftCode, rightCode,
    leftTitle: leftTitle || "left_code.py",
    rightTitle: rightTitle || "right_code.py",
    button0Text: buttons[0], button1Text: buttons[1], button2Text: buttons[2], button3Text: buttons[3],
    correct, createdBy: req.adminUser.userId, difficulty
  });

  db.logAudit(req.adminUser.userId, "CREATE_QUESTION", null, `Created question ID: ${result.lastInsertRowid}`, req.ip);
  res.json({ id: String(result.lastInsertRowid), success: true });
});

app.put("/api/admin/questions/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  const { leftCode, rightCode, leftTitle, rightTitle, buttonTexts, correct, difficulty } = req.body;

  const question = db.getQuestionById(id);
  if (!question) return res.status(404).json({ error: "Въпросът не е намерен" });

  db.updateQuestion(id, { leftCode, rightCode, leftTitle, rightTitle, buttonTexts, correct, difficulty });
  db.logAudit(req.adminUser.userId, "UPDATE_QUESTION", null, `Updated question ID: ${id}`, req.ip);

  res.json({ success: true });
});

app.delete("/api/admin/questions/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  const question = db.getQuestionById(id);
  if (!question) return res.status(404).json({ error: "Въпросът не е намерен" });

  db.deleteQuestion(id);
  db.logAudit(req.adminUser.userId, "DELETE_QUESTION", null, `Deleted question ID: ${id}`, req.ip);

  res.json({ success: true });
});

app.post("/api/admin/questions/bulk-delete", authMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Липсват ID-та за изтриване" });
  }

  db.bulkDeleteQuestions(ids);
  db.logAudit(req.adminUser.userId, "BULK_DELETE_QUESTIONS", null, `Deleted ${ids.length} questions`, req.ip);

  res.json({ success: true, count: ids.length });
});

app.post("/api/admin/questions/import", authMiddleware, (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: "Невалиден формат" });
  }

  const count = db.importQuestions(questions, req.adminUser.userId);
  db.logAudit(req.adminUser.userId, "IMPORT_QUESTIONS", null, `Imported ${count} questions`, req.ip);

  res.json({ success: true, count });
});

app.get("/api/admin/game/state", authMiddleware, (req, res) => {
  res.json(publicState());
});

app.post("/api/admin/game/start", authMiddleware, (req, res) => {
  startGame();
  db.logAudit(req.adminUser.userId, "START_GAME", null, "Started new game session", req.ip);
  res.json({ success: true });
});

app.post("/api/admin/game/next", authMiddleware, (req, res) => {
  nextOrSkip();
  res.json({ success: true });
});

app.post("/api/admin/game/reset", authMiddleware, (req, res) => {
  resetGame();
  db.logAudit(req.adminUser.userId, "RESET_GAME", null, "Reset game", req.ip);
  res.json({ success: true });
});

app.post("/api/admin/game/end", authMiddleware, (req, res) => {
  forceEndGame();
  db.logAudit(req.adminUser.userId, "FORCE_END_GAME", null, "Force ended game", req.ip);
  res.json({ success: true });
});

app.post("/api/admin/game/kick", authMiddleware, (req, res) => {
  const { playerToken } = req.body;
  if (!playerToken) return res.status(400).json({ error: "Липсва токен на играча" });

  const success = kickPlayer(playerToken);
  if (!success) return res.status(404).json({ error: "Играчът не е намерен" });

  db.logAudit(req.adminUser.userId, "KICK_PLAYER", null, `Kicked player: ${playerToken}`, req.ip);
  res.json({ success: true });
});

app.get("/api/admin/players", authMiddleware, (req, res) => {
  res.json(playerListSorted());
});

app.get("/api/admin/audit-log", authMiddleware, (req, res) => {
  const logs = db.getAuditLog(100);
  res.json(logs);
});

app.get("/api/admin/game-history", authMiddleware, (req, res) => {
  const sessions = db.getRecentGameSessions(50);
  res.json(sessions);
});

app.get("/api/admin/game-history/:id", authMiddleware, (req, res) => {
  const session = db.getGameSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Сесията не е намерена" });
  
  const results = db.getSessionResults(req.params.id);
  res.json({ session, results });
});

app.get("/api/admin/game-history/:id/export", authMiddleware, (req, res) => {
  const csv = db.exportSessionToCSV(req.params.id);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="game_${req.params.id}.csv"`);
  res.send(csv);
});

app.get("/api/admin/stats", authMiddleware, (req, res) => {
  const stats = db.getStats();
  const topPlayers = db.getTopPlayers(10);
  res.json({ ...stats, topPlayers });
});

app.get("/api/admin/session", authMiddleware, (req, res) => {
  res.json({
    ...sessionStats,
    activePlayers: playersByToken.size,
    gameState: game.state,
    currentQuestion: game.currentQuestionIndex,
    uptime: Math.floor((Date.now() - sessionStats.sessionStart) / 1000),
    accuracy: sessionStats.totalAnswers > 0 
      ? Math.round((sessionStats.totalCorrect / sessionStats.totalAnswers) * 100) 
      : 0
  });
});

app.get("/api/admin/security", authMiddleware, (req, res) => {
  res.json({
    security: security.getStats(),
    performance: perfMonitor.getStats()
  });
});

app.get("/api/admin/connections", authMiddleware, (req, res) => {
  const ipList = [];
  for (const [ip, record] of ipPlayerCounts.entries()) {
    ipList.push({
      ip,
      connections: record.count,
      firstConnection: new Date(record.firstConnection).toISOString()
    });
  }
  res.json({
    ips: ipList.sort((a, b) => b.connections - a.connections),
    totalIPs: ipList.length,
    totalConnections: sessionStats.totalConnections
  });
});

app.get("/api/admin/bans", authMiddleware, (req, res) => {
  const bans = db.getAllBans(req.query.includeExpired === "true");
  res.json(bans);
});

app.post("/api/admin/bans", authMiddleware, (req, res) => {
  const { userId, reason, expiresAt } = req.body;
  if (!userId) return res.status(400).json({ error: "Липсва потребител" });

  db.createBan(userId, req.adminUser.userId, reason, expiresAt);
  db.logAudit(req.adminUser.userId, "BAN_PLAYER", userId, reason, req.ip);
  res.json({ success: true });
});

app.delete("/api/admin/bans/:userId", authMiddleware, (req, res) => {
  db.removeBan(parseInt(req.params.userId));
  db.logAudit(req.adminUser.userId, "UNBAN_PLAYER", parseInt(req.params.userId), null, req.ip);
  res.json({ success: true });
});

app.get("/api/admin/blocked-ips", authMiddleware, (req, res) => {
  const ips = db.db.prepare("SELECT * FROM blocked_ips ORDER BY blocked_at DESC").all();
  res.json(ips);
});

app.post("/api/admin/blocked-ips", authMiddleware, (req, res) => {
  const { ipAddress, reason, expiresAt } = req.body;
  if (!ipAddress) return res.status(400).json({ error: "Липсва IP адрес" });

  db.blockIP(ipAddress, req.adminUser.userId, reason, expiresAt);
  db.logAudit(req.adminUser.userId, "BLOCK_IP", null, `Blocked IP: ${ipAddress}`, req.ip);
  res.json({ success: true });
});

app.delete("/api/admin/blocked-ips/:ip", authMiddleware, (req, res) => {
  db.unblockIP(req.params.ip);
  db.logAudit(req.adminUser.userId, "UNBLOCK_IP", null, `Unblocked IP: ${req.params.ip}`, req.ip);
  res.json({ success: true });
});

app.get("/generated/:kind/:id/:side.svg", (req, res) => {
  const { kind, id } = req.params;
  const numericId = Number(id) || 0;
  let svg = "";
  if (kind === "human") {
    const variant = HUMAN_VARIANTS[numericId % HUMAN_VARIANTS.length];
    svg = renderHumanSvg(variant);
  } else {
    const variant = AI_VARIANTS[numericId % AI_VARIANTS.length];
    svg = renderAiSvg(variant);
  }
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.send(svg);
});

app.get("/health", createHealthHandler());
app.get("/health/live", createLivenessCheck());
app.get("/health/ready", createReadinessCheck());
app.get("/metrics", metrics.createMetricsHandler());

app.use((req, res) => {
  res.status(404).json({ error: "Страницата не е намерена" });
});

app.use((err, req, res, next) => {
  logError(req.ip, "Unhandled error", err);
  res.status(500).json({ error: "Вътрешна грешка на сървъра" });
});

io.on("connection", (socket) => {
  const clientIp = socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() 
    || socket.handshake.headers["x-real-ip"] 
    || socket.handshake.address;

  sessionStats.totalConnections++;
  perfMonitor.recordSocketEvent("connect");

  const blockedCheck = db.isIPBlocked(clientIp);
  if (blockedCheck) {
    socket.emit("error", { message: "Достъпът е отказан" });
    socket.disconnect(true);
    return;
  }

  const connCheck = security.checkIPConnection(clientIp);
  if (!connCheck.allowed) {
    logger.warn(`Connection denied for ${clientIp}: ${connCheck.reason}`);
    socket.emit("error", { message: connCheck.reason });
    socket.disconnect(true);
    return;
  }

  const rateCheck = security.checkRequestRate(clientIp);
  if (!rateCheck.allowed) {
    logger.warn(`Rate limit for ${clientIp}: ${rateCheck.reason}`);
    socket.emit("error", { message: rateCheck.reason });
    socket.disconnect(true);
    return;
  }

  metrics.recordSocketConnection();
  logger.info(`New socket connection from ${clientIp} (Total: ${playersByToken.size + 1})`);

  socket.on("player:join", ({ token, name }) => {
    if (isSpam(clientIp)) {
      logger.warn(`Spam detected from IP: ${clientIp}`);
      return;
    }

    if (playersByToken.size >= 100) {
      socket.emit("error", { message: "Сървърът е пълен. Опитайте по-късно." });
      return;
    }

    let playerToken = token && String(token).trim();
    if (!playerToken) playerToken = crypto.randomUUID();

    let player = playersByToken.get(playerToken);

    if (!player) {
      const cleanName = String(name || "").trim().slice(0, 30) || "Играч";
      if (!/^[\w\u0400-\u04FF\s]+$/.test(cleanName)) {
        socket.emit("player:error", "Невалидно име! Използвай само букви и цифри.");
        return;
      }

      player = {
        token: playerToken,
        name: cleanName,
        score: 0,
        socketId: socket.id,
        joinedAt: new Date().toISOString(),
        answers: {},
        userId: null,
        streak: 0,
        ip: clientIp,
        answersCount: 0
      };

      playersByToken.set(playerToken, player);
      logAccess(clientIp, null, `Player joined: ${player.name}`);
    } else {
      player.socketId = socket.id;
      if (name && String(name).trim()) {
        player.name = String(name).trim().slice(0, 30);
      }
      if (game.state !== "lobby") {
        player.score = 0;
        player.answers = {};
        player.streak = 0;
        player.answersCount = 0;
      }
    }

    socket.data.playerToken = playerToken;

    socket.emit("player:joined", { token: player.token, name: player.name });
    socket.emit("game:state", publicState());
    socket.emit("players:update", playerListSorted());
    socket.emit("player:private", privateState(player));

    emitAll();
  });

  socket.on("player:reconnect", ({ token }) => {
    if (!token) return;
    const player = playersByToken.get(String(token));
    if (!player) {
      socket.emit("player:error", "Играчът не е намерен.");
      return;
    }

    player.socketId = socket.id;
    socket.data.playerToken = player.token;

    socket.emit("player:joined", { token: player.token, name: player.name });
    socket.emit("game:state", publicState());
    socket.emit("players:update", playerListSorted());
    socket.emit("player:private", privateState(player));
  });

  socket.on("player:answer", ({ choice }) => {
    const token = socket.data.playerToken;
    if (!token) return;

    if (typeof choice !== "number" || choice < 0 || choice > 3) return;

    const playerIp = socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() 
      || socket.handshake.headers["x-real-ip"] 
      || socket.handshake.address;
    
    const answerCheck = security.checkAnswerRate(playerIp);
    if (!answerCheck.allowed) {
      security.recordViolation(playerIp, "ANSWER_FLOOD");
      socket.emit("error", { message: answerCheck.reason });
      return;
    }

    const player = playersByToken.get(token);
    const q = currentQuestion();

    if (!player || !q) return;
    if (game.state !== "question") return;
    if (player.answers[q.id]) return;

    const msLeft = Math.max(0, game.questionEndsAt - Date.now());
    const result = scoreAnswer(q, choice, msLeft);

    player.answers[q.id] = {
      choice,
      correct: result.correct,
      points: result.points,
      msLeft,
      timeBonus: result.timeBonus
    };

    player.score += result.points;
    player.answersCount++;
    if (result.correct) {
      player.streak = (player.streak || 0) + 1;
      sessionStats.totalCorrect++;
    } else {
      player.streak = 0;
    }

    sessionStats.totalAnswers++;
    perfMonitor.recordGameEvent("answer", { correct: result.correct });

    if (player.userId && game.currentSessionId) {
      db.saveGameResult(game.currentSessionId, player.userId, parseInt(q.id), choice, result.correct, result.points, msLeft);
    }

    metrics.recordAnswer(result.correct);

    socket.emit("player:answer:ack", { success: true, waiting: true });
    emitAll();
  });

  socket.on("player:exitFullscreen", () => {
    const token = socket.data.playerToken;
    if (!token) return;

    const player = playersByToken.get(token);
    if (!player) return;

    if (game.state === "question" || game.state === "reveal") {
      player.disqualified = true;
      player.score = 0;
      const q = currentQuestion();
      if (q) {
        player.answers[q.id] = { choice: -1, correct: false, points: 0, msLeft: 0, timeBonus: 0, disqualified: true };
      }
      
      socket.emit("player:disqualified", { reason: "Напуснахте fullscreen по време на играта." });
      socket.emit("player:kicked", "Бяхте дисквалифициран заради напускане на fullscreen.");
      
      logAccess(clientIp, null, `Player ${player.name} disqualified for exiting fullscreen`);
      emitAll();
    }
  });

  socket.on("disconnect", () => {
    metrics.recordSocketDisconnection();
    const playerToken = socket.data.playerToken;
    if (playerToken) {
      const player = playersByToken.get(playerToken);
      if (player) {
        player.socketId = null;
        if (player.ip) {
          removePlayerFromIPCount(player.ip);
        }
      }
    }
    logger.info(`Socket disconnected from ${clientIp} (Active: ${playersByToken.size})`);
  });
});

function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  clearTimers();
  io.disconnectSockets(true);
  if (db) db.close();
  if (security) security.destroy();
  global.gameDb = null;
  global.io = null;
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

if (require.main === module) {
  validateEnv();
  db = new GameDatabase(DB_FILE).initialize();
  db.migrate();
  global.gameDb = db;
  global.io = io;
  initDefaultAdmins();
  initDefaultQuestions();
  
  setInterval(() => {
    db.cleanupExpiredBans();
    db.cleanupExpiredIPs();
  }, 60 * 60 * 1000);

  setInterval(() => {
    const deleted = db.cleanupOldResults(DATA_RETENTION_DAYS);
    if (deleted > 0) logger.info(`Cleaned up ${deleted} old game results`);
  }, 24 * 60 * 60 * 1000);

  currentQuestions = buildQuestionPool();

  server.listen(PORT, "0.0.0.0", () => {
    const os = require("os");
    const protocol = USE_HTTPS ? "https" : "http";
    
    function getLocalIP() {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === "IPv4" && !net.internal) {
            return net.address;
          }
        }
      }
      return "localhost";
    }
    
    const localIP = getLocalIP();
    
    logger.info("");
    logger.info("=".repeat(50));
    logger.info("AI или Човек? - Quiz Server Started");
    logger.info("=".repeat(50));
    logger.info(`Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
    logger.info(`Protocol: ${protocol.toUpperCase()}`);
    logger.info(`Port: ${PORT}`);
    logger.info(`Database: ${DB_FILE}`);
    logger.info(`Questions: ${currentQuestions.length}`);
    logger.info("");
    logger.info("ACCESS URLs:");
    logger.info(`  Local:     ${protocol}://localhost:${PORT}`);
    logger.info(`  Network:   ${protocol}://${localIP}:${PORT}`);
    logger.info("");
    logger.info(`Admin:      ${protocol}://${localIP}:${PORT}/admin.html`);
    logger.info("=".repeat(50));
    logger.info("");
  });
}

module.exports = { app, io, server, db };
