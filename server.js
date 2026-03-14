const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const QUESTION_TIME_SECONDS = 15;
let GAME_PIN = generatePin();

app.use(express.static(path.join(__dirname, "public")));

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function esc(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function codeText(x, y, text, color, size = 22, weight = 500) {
  return `
    <text x="${x}" y="${y}" fill="${color}" font-family="Consolas, 'Courier New', monospace" font-size="${size}" font-weight="${weight}">
      ${esc(text)}
    </text>
  `;
}

function lineNumber(x, y, n) {
  return `
    <text x="${x}" y="${y}" fill="#6b7280" font-family="Consolas, 'Courier New', monospace" font-size="18" text-anchor="end">
      ${n}
    </text>
  `;
}

function renderCodeEditorSvg({
  title,
  badge,
  badgeColor,
  bg,
  panel,
  topbar,
  border,
  text,
  muted,
  keyword,
  string,
  func,
  number,
  comment,
  accent,
  lines,
  footer
}) {
  let y = 150;
  let rendered = "";

  lines.forEach((line, idx) => {
    rendered += lineNumber(62, y, idx + 1);

    let color = text;
    const trimmed = line.trim();

    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("FROM") ||
      trimmed.startsWith("WHERE") ||
      trimmed.startsWith("ORDER BY")
    ) {
      color = comment;
    } else if (
      line.includes("function ") ||
      line.includes("const ") ||
      line.includes("let ") ||
      line.includes("return ") ||
      line.includes("public ") ||
      line.includes("private ") ||
      line.includes("using ") ||
      line.includes("class ") ||
      line.includes("def ") ||
      line.includes("export ")
    ) {
      color = keyword;
    } else if (
      line.includes('"') ||
      line.includes("'") ||
      line.includes("`")
    ) {
      color = string;
    } else if (
      line.includes("35") ||
      line.includes("0.7") ||
      line.includes("1000") ||
      line.includes("50")
    ) {
      color = number;
    } else if (
      line.includes("BuildTicket") ||
      line.includes("calculatePrice") ||
      line.includes("renderSeatMap") ||
      line.includes("generateBookingUI")
    ) {
      color = func;
    }

    rendered += codeText(84, y, line, color);
    y += 34;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="${bg}"/>
  <rect x="24" y="24" width="1152" height="752" rx="24" fill="${panel}" stroke="${border}" stroke-width="2"/>
  <rect x="24" y="24" width="1152" height="62" rx="24" fill="${topbar}"/>
  <circle cx="56" cy="55" r="8" fill="#ef4444"/>
  <circle cx="82" cy="55" r="8" fill="#f59e0b"/>
  <circle cx="108" cy="55" r="8" fill="#22c55e"/>

  <rect x="150" y="38" width="260" height="34" rx="10" fill="rgba(255,255,255,0.06)"/>
  <text x="170" y="61" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700">${esc(title)}</text>

  <rect x="940" y="36" width="180" height="34" rx="12" fill="rgba(255,255,255,0.06)" stroke="${accent}"/>
  <text x="965" y="59" fill="${badgeColor}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700">${esc(badge)}</text>

  <rect x="24" y="86" width="54" height="690" fill="rgba(255,255,255,0.03)"/>
  <rect x="78" y="86" width="1098" height="690" fill="${panel}"/>

  <g opacity="0.10">
    <line x1="78" y1="120" x2="1176" y2="120" stroke="${accent}"/>
    <line x1="78" y1="220" x2="1176" y2="220" stroke="${accent}"/>
    <line x1="78" y1="320" x2="1176" y2="320" stroke="${accent}"/>
    <line x1="78" y1="420" x2="1176" y2="420" stroke="${accent}"/>
    <line x1="78" y1="520" x2="1176" y2="520" stroke="${accent}"/>
    <line x1="78" y1="620" x2="1176" y2="620" stroke="${accent}"/>
  </g>

  ${rendered}

  
</svg>`;
}

const HUMAN_VARIANTS = [
  {
    title: "ticket_price.py",
    footer: "",
    lines: [
      "price = 35",
      "",
      "student = True",
      "",
      "if student:",
      "    price = price * 0.7",
      "",
      "print(price)"
    ]
  },
  {
    title: "email_check.py",
    footer: "",
    lines: [
      "def check_email(email):",
      "    if '@' in email and '.' in email:",
      "        return True",
      "    return False"
    ]
  },
  {
    title: "sum.py",
    footer: "",
    lines: [
      "a = 5",
      "b = 10",
      "",
      "print(a + b)"
    ]
  },
  {
    title: "seat_check.js",
    footer: "",
    lines: [
      "taken = [3, 7, 10]",
      "",
      "function free(seat){",
      "  if(taken.includes(seat)){",
      "    return false",
      "  }",
      "  return true",
      "}"
    ]
  },
  {
    title: "discount.py",
    footer: "",
    lines: [
      "price = 50",
      "",
      "if price > 40:",
      "    print('expensive')",
      "else:",
      "    print('ok')"
    ]
  },
  {
    title: "name_check.py",
    footer: "",
    lines: [
      "name = 'Ivan'",
      "",
      "if len(name) > 2:",
      "    print('valid')"
    ]
  },
  {
    title: "trip_print.py",
    footer: "",
    lines: [
      "from_city = 'Varna'",
      "to_city = 'Sofia'",
      "",
      "print(from_city + ' -> ' + to_city)"
    ]
  },
  {
    title: "even.py",
    footer: "",
    lines: [
      "n = 8",
      "",
      "if n % 2 == 0:",
      "    print('even')",
      "else:",
      "    print('odd')"
    ]
  },
  {
    title: "seat_message.js",
    footer: "",
    lines: [
      "seat = 12",
      "",
      "if(seat == 12){",
      "  console.log('selected')",
      "}"
    ]
  },
  {
    title: "hello.py",
    footer: "",
    lines: [
      "name = 'Maria'",
      "print('Hello ' + name)"
    ]
  }
];

const AI_VARIANTS = [
{
title: "price_calculator.ts",
footer: "AI generated",
lines: [
"export function calculateDynamicTicketPrice(basePrice:number, isStudent:boolean){",
"    const studentDiscountMultiplier = 0.70;",
"",
"    if(isStudent === true){",
"        return Number((basePrice * studentDiscountMultiplier).toFixed(2));",
"    }",
"",
"    return basePrice;",
"}"
]
},

{
title: "email_validator.ts",
footer: "AI generated",
lines: [
"export function validateEmailAddress(input:string):boolean{",
"    const containsAtSymbol = input.includes('@');",
"    const containsDotSymbol = input.includes('.');",
"",
"    return containsAtSymbol && containsDotSymbol;",
"}"
]
},

{
title: "seatAvailability.ts",
footer: "AI generated",
lines: [
"export function checkSeatAvailability(seatNumber:number, takenSeats:number[]):boolean{",
"    const seatIsTaken = takenSeats.includes(seatNumber);",
"",
"    if(seatIsTaken === true){",
"        return false;",
"    }",
"",
"    return true;",
"}"
]
},

{
title: "sumCalculator.ts",
footer: "AI generated",
lines: [
"export function calculateSum(firstNumber:number, secondNumber:number):number{",
"    const result = firstNumber + secondNumber;",
"",
"    return result;",
"}"
]
}
];

function humanSvg(index, side) {
  const variant = HUMAN_VARIANTS[index % HUMAN_VARIANTS.length];
  return renderCodeEditorSvg({
    title: variant.title,
    badge: "",
    badgeColor: "#34d399",
    bg: "#0b1220",
    panel: "#111827",
    topbar: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    text: "#e5e7eb",
    muted: "#9ca3af",
    keyword: "#60a5fa",
    string: "#fbbf24",
    func: "#f472b6",
    number: "#fb7185",
    comment: "#9ca3af",
    accent: "#34d399",
    lines: variant.lines,
    footer: variant.footer
  });
}

function aiSvg(index, side) {
  const variant = AI_VARIANTS[index % AI_VARIANTS.length];
  return renderCodeEditorSvg({
    title: variant.title,
    badge: "",
    badgeColor: "#22d3ee",
    bg: "#061126",
    panel: "#0b1732",
    topbar: "rgba(255,255,255,0.04)",
    border: "rgba(34,211,238,0.18)",
    text: "#e0f2fe",
    muted: "#93c5fd",
    keyword: "#38bdf8",
    string: "#fbbf24",
    func: "#c084fc",
    number: "#fb7185",
    comment: "#7dd3fc",
    accent: "#22d3ee",
    lines: variant.lines,
    footer: variant.footer
  });
}

app.get("/generated/:kind/:variant/:side.svg", (req, res) => {
  const { kind, variant, side } = req.params;
  const n = Number(variant) || 0;

  let svg = "";
  if (kind === "human") {
    svg = humanSvg(n, side);
  } else {
    svg = aiSvg(n, side);
  }

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.send(svg);
});

function buildQuestionPool() {
  const pool = [];
  const answerTypes = [0, 1, 2, 3];

  for (let i = 0; i < 20; i++) {
    const correct = answerTypes[i % 4];
    let leftKind = "human";
    let rightKind = "ai";

    if (correct === 0) {
      leftKind = "human";
      rightKind = "ai";
    } else if (correct === 1) {
      leftKind = "ai";
      rightKind = "human";
    } else if (correct === 2) {
      leftKind = "human";
      rightKind = "human";
    } else if (correct === 3) {
      leftKind = "ai";
      rightKind = "ai";
    }

    const leftVariant = i * 2;
    const rightVariant = i * 2 + 1;

    pool.push({
      id: i + 1,
      left: `/generated/${leftKind}/${leftVariant}/left.svg`,
      right: `/generated/${rightKind}/${rightVariant}/right.svg`,
      correct
    });
  }

  return pool;
}

let questionPool = buildQuestionPool();
let currentQuestions = shuffle(questionPool);

const game = {
  pin: GAME_PIN,
  state: "lobby",
  currentQuestionIndex: -1,
  questionEndsAt: 0,
  timerInterval: null
};

const playersByToken = new Map();

function currentQuestion() {
  if (game.currentQuestionIndex < 0 || game.currentQuestionIndex >= currentQuestions.length) {
    return null;
  }
  return currentQuestions[game.currentQuestionIndex];
}

function answerText(code) {
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
    .map((p) => {
      const answeredCount = Object.keys(p.answers).length;
      const correctCount = Object.values(p.answers).filter((a) => a.correct).length;
      return {
        token: p.token,
        name: p.name,
        score: p.score,
        joinedAt: p.joinedAt,
        answeredCount,
        correctCount
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.name.localeCompare(b.name, "bg");
    });
}

function answeredStats() {
  const q = currentQuestion();
  if (!q) {
    return { answered: 0, unanswered: playersByToken.size };
  }

  let answered = 0;
  for (const player of playersByToken.values()) {
    if (player.answers[q.id]) answered++;
  }

  return {
    answered,
    unanswered: Math.max(0, playersByToken.size - answered)
  };
}

function publicState() {
  const q = currentQuestion();
  const stats = answeredStats();

  return {
    pin: game.pin,
    state: game.state,
    currentQuestionIndex: game.currentQuestionIndex,
    totalQuestions: currentQuestions.length,
    question: q
      ? {
          id: q.id,
          left: q.left,
          right: q.right,
          correctText: answerText(q.correct)
        }
      : null,
    leaderboard: playerListSorted(),
    playersCount: playersByToken.size,
    answeredPlayers: stats.answered,
    unansweredPlayers: stats.unanswered,
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

  if (q && player.answers[q.id]) {
    answeredCurrent = true;
    const ans = player.answers[q.id];

    if (game.state === "reveal" || game.state === "finished") {
      if (ans.choice === null) {
        revealMessage = "❌ Няма изпратен отговор";
      } else if (ans.correct) {
        revealMessage = `✅ Вярно! +${ans.points} точки`;
      } else {
        revealMessage = "❌ Грешен отговор";
      }
    }
  }

  return {
    score: player.score,
    rank: myRank,
    answeredCurrent,
    revealMessage
  };
}

function emitAll() {
  io.emit("game:state", publicState());
  io.emit("players:update", playerListSorted());

  for (const player of playersByToken.values()) {
    if (player.socketId) {
      io.to(player.socketId).emit("player:private", privateState(player));
    }
  }
}

function clearTimers() {
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
  }
}

function scoreAnswer(question, choice, msLeft) {
  const correct = choice === question.correct;
  if (!correct) return { correct: false, points: 0 };

  const maxMs = QUESTION_TIME_SECONDS * 1000;
  const speedRatio = Math.max(0, Math.min(1, msLeft / maxMs));
  const points = Math.round(500 + 500 * speedRatio);

  return { correct: true, points };
}

function startQuestion(index) {
  clearTimers();

  if (index >= currentQuestions.length) {
    game.state = "finished";
    game.currentQuestionIndex = currentQuestions.length - 1;
    game.questionEndsAt = 0;
    emitAll();
    return;
  }

  game.state = "question";
  game.currentQuestionIndex = index;
  game.questionEndsAt = Date.now() + QUESTION_TIME_SECONDS * 1000;

  emitAll();

  game.timerInterval = setInterval(() => {
    const remaining = game.questionEndsAt - Date.now();

    io.emit("game:timer", {
      state: "question",
      remainingMs: Math.max(0, remaining),
      endsAt: game.questionEndsAt
    });

    if (remaining <= 0) {
      clearTimers();
      game.state = "reveal";
      game.questionEndsAt = 0;

      const q = currentQuestion();
      if (q) {
        for (const player of playersByToken.values()) {
          if (!player.answers[q.id]) {
            player.answers[q.id] = {
              choice: null,
              correct: false,
              points: 0,
              msLeft: 0
            };
          }
        }
      }

      emitAll();
    }
  }, 200);
}

function startGame() {
  clearTimers();

  GAME_PIN = generatePin();
  game.pin = GAME_PIN;
  currentQuestions = shuffle(buildQuestionPool());

  game.state = "question";
  game.currentQuestionIndex = 0;
  game.questionEndsAt = 0;

  for (const p of playersByToken.values()) {
    p.score = 0;
    p.answers = {};
  }

  startQuestion(0);
}

function nextOrSkip() {
  if (game.state === "question") {
    clearTimers();

    const q = currentQuestion();
    if (q) {
      for (const player of playersByToken.values()) {
        if (!player.answers[q.id]) {
          player.answers[q.id] = {
            choice: null,
            correct: false,
            points: 0,
            msLeft: 0
          };
        }
      }
    }

    game.state = "reveal";
    game.questionEndsAt = 0;
    emitAll();
    return;
  }

  if (game.state === "reveal") {
    startQuestion(game.currentQuestionIndex + 1);
  }
}

function resetGame() {
  clearTimers();

  GAME_PIN = generatePin();
  game.pin = GAME_PIN;
  currentQuestions = shuffle(buildQuestionPool());

  game.state = "lobby";
  game.currentQuestionIndex = -1;
  game.questionEndsAt = 0;

  for (const p of playersByToken.values()) {
    p.score = 0;
    p.answers = {};
  }

  emitAll();
}

app.get("/api/pin", (req, res) => {
  res.json({ pin: GAME_PIN });
});

io.on("connection", (socket) => {
  socket.on("player:join", ({ token, name, pin }) => {
    if (String(pin || "").trim() !== game.pin) {
      socket.emit("player:error", "Невалиден Game PIN.");
      return;
    }

    let playerToken = token && String(token).trim();
    if (!playerToken) playerToken = crypto.randomUUID();

    let player = playersByToken.get(playerToken);

    if (!player) {
      player = {
        token: playerToken,
        name: String(name || "").trim().slice(0, 30) || "Играч",
        score: 0,
        socketId: socket.id,
        joinedAt: new Date().toISOString(),
        answers: {}
      };
      playersByToken.set(playerToken, player);
    } else {
      player.socketId = socket.id;
      if (name && String(name).trim()) {
        player.name = String(name).trim().slice(0, 30);
      }
    }

    socket.data.playerToken = playerToken;

    socket.emit("player:joined", {
      token: player.token,
      name: player.name,
      pin: game.pin
    });

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

    socket.emit("player:joined", {
      token: player.token,
      name: player.name,
      pin: game.pin
    });

    socket.emit("game:state", publicState());
    socket.emit("players:update", playerListSorted());
    socket.emit("player:private", privateState(player));
  });

  socket.on("player:answer", ({ choice }) => {
    const token = socket.data.playerToken;
    if (!token) return;

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
      msLeft
    };

    player.score += result.points;

    socket.emit("player:answer:ack", {
      correct: result.correct,
      points: result.points
    });

    emitAll();
  });

  socket.on("host:start", () => {
    startGame();
  });

  socket.on("host:next", () => {
    nextOrSkip();
  });

  socket.on("host:reset", () => {
    resetGame();
  });

  socket.on("host:kickPlayer", ({ token }) => {
    if (!token) return;
    playersByToken.delete(String(token));
    emitAll();
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("AI or Human quiz is running");
  console.log("Players: http://localhost:" + PORT);
  console.log("Host:    http://localhost:" + PORT + "/host.html");
  console.log("PIN:     " + GAME_PIN);
  console.log("");
});