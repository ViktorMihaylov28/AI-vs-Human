const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const QUESTION_TIME_SECONDS = 15;
const QUESTIONS_PER_GAME = 20;

app.use(express.static(path.join(__dirname, "public")));

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function pickDifferentPair(array) {
  if (array.length < 2) {
    throw new Error("Need at least 2 items to pick a different pair.");
  }

  const firstIndex = Math.floor(Math.random() * array.length);
  let secondIndex = Math.floor(Math.random() * array.length);

  while (secondIndex === firstIndex) {
    secondIndex = Math.floor(Math.random() * array.length);
  }

  return [array[firstIndex], array[secondIndex]];
}

function esc(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function codeText(x, y, text, color, size = 26, weight = 600) {
  return `
    <text
      x="${x}"
      y="${y}"
      fill="${color}"
      font-family="Consolas, 'Courier New', monospace"
      font-size="${size}"
      font-weight="${weight}"
      xml:space="preserve"
    >
      ${esc(text)}
    </text>
  `;
}

function lineNumber(x, y, n) {
  return `
    <text
      x="${x}"
      y="${y}"
      fill="#6b7280"
      font-family="Consolas, 'Courier New', monospace"
      font-size="20"
      text-anchor="end"
    >
      ${n}
    </text>
  `;
}

function renderCodeEditorSvg({
  title,
  bg,
  panel,
  topbar,
  border,
  text,
  accent,
  lines
}) {
  let y = 110;
  let rendered = "";

  for (let i = 0; i < lines.length; i++) {
    rendered += lineNumber(72, y, i + 1);
    rendered += codeText(100, y, lines[i], text);
    y += 42;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
  <rect width="1400" height="900" fill="${panel}"/>

  ${rendered}
</svg>`;
}

/**
 * Всички кодове са в един цвят.
 * Не ползваме различно оцветяване на keywords / strings / numbers.
 */

const HUMAN_VARIANTS = [
  {
    title: "sum.py",
    lines: [
      "a = 5",
      "b = 10",
      "",
      "print(a + b)"
    ]
  },
  {
    title: "discount.py",
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
    title: "seat_check.js",
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
    title: "email_check.py",
    lines: [
      "def check_email(email):",
      "    if '@' in email and '.' in email:",
      "        return True",
      "    return False"
    ]
  },
  {
    title: "hello.py",
    lines: [
      "name = 'Maria'",
      "print('Hello ' + name)"
    ]
  },
  {
    title: "trip.py",
    lines: [
      "from_city = 'Varna'",
      "to_city = 'Sofia'",
      "",
      "print(from_city + ' -> ' + to_city)"
    ]
  },
  {
    title: "even.py",
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
    title: "grade.py",
    lines: [
      "score = 5.50",
      "",
      "if score >= 5.50:",
      "    print('excellent')",
      "else:",
      "    print('ok')"
    ]
  },
  {
    title: "cart.js",
    lines: [
      "items = [12, 5, 3]",
      "total = 0",
      "",
      "for (let i = 0; i < items.length; i++) {",
      "  total += items[i]",
      "}",
      "",
      "console.log(total)"
    ]
  },
  {
    title: "name_check.py",
    lines: [
      "name = 'Ivan'",
      "",
      "if len(name) > 2:",
      "    print('valid')"
    ]
  },
  {
    title: "avg.py",
    lines: [
      "nums = [4, 6, 8]",
      "result = sum(nums) / len(nums)",
      "",
      "print(result)"
    ]
  },
  {
    title: "ticket.py",
    lines: [
      "price = 35",
      "student = True",
      "",
      "if student:",
      "    price = price * 0.7",
      "",
      "print(price)"
    ]
  },
  {
    title: "contains.js",
    lines: [
      "text = 'varna'",
      "",
      "if (text.includes('ar')) {",
      "  console.log('yes')",
      "}"
    ]
  },
  {
    title: "city.py",
    lines: [
      "city = 'Plovdiv'",
      "",
      "print(city.upper())"
    ]
  },
  {
    title: "multiply.py",
    lines: [
      "x = 7",
      "y = 4",
      "",
      "print(x * y)"
    ]
  },
  {
    title: "filter.js",
    lines: [
      "nums = [1, 2, 3, 4, 5]",
      "evens = nums.filter(n => n % 2 === 0)",
      "",
      "console.log(evens)"
    ]
  },
  {
    title: "seats.py",
    lines: [
      "free = [2, 4, 6, 8]",
      "",
      "print(6 in free)"
    ]
  },
  {
    title: "course.py",
    lines: [
      "hour = '14:15'",
      "route = 'Varna-Sofia'",
      "",
      "print(route + ' ' + hour)"
    ]
  },
  {
    title: "total.js",
    lines: [
      "prices = [15, 20, 18]",
      "sum = 0",
      "",
      "for (let p of prices) {",
      "  sum += p",
      "}",
      "",
      "console.log(sum)"
    ]
  },
  {
    title: "seat_label.py",
    lines: [
      "row = 4",
      "seat = 'B'",
      "",
      "print(str(row) + seat)"
    ]
  },
  {
    title: "user.js",
    lines: [
      "user = { name: 'Mila', age: 17 }",
      "",
      "console.log(user.name)"
    ]
  },
  {
    title: "price_ok.py",
    lines: [
      "price = 24",
      "",
      "if price < 30:",
      "    print('cheap')"
    ]
  },
  {
    title: "letters.py",
    lines: [
      "word = 'ticket'",
      "",
      "print(len(word))"
    ]
  },
  {
    title: "route.js",
    lines: [
      "fromCity = 'Burgas'",
      "toCity = 'Sofia'",
      "",
      "console.log(fromCity + ' -> ' + toCity)"
    ]
  }
];

const AI_VARIANTS = [
  {
    title: "sumCalculator.ts",
    lines: [
      "export function calculateSum(firstNumber:number, secondNumber:number):number{",
      "  const result = firstNumber + secondNumber;",
      "  return result;",
      "}"
    ]
  },
  {
    title: "priceCalculator.ts",
    lines: [
      "export function calculateDynamicTicketPrice(basePrice:number, isStudent:boolean):number{",
      "  const studentDiscountMultiplier = 0.70;",
      "  if(isStudent === true){",
      "    return Number((basePrice * studentDiscountMultiplier).toFixed(2));",
      "  }",
      "  return basePrice;",
      "}"
    ]
  },
  {
    title: "emailValidator.ts",
    lines: [
      "export function validateEmailAddress(input:string):boolean{",
      "  const containsAtSymbol = input.includes('@');",
      "  const containsDotSymbol = input.includes('.');",
      "  return containsAtSymbol && containsDotSymbol;",
      "}"
    ]
  },
  {
    title: "seatAvailability.ts",
    lines: [
      "export function checkSeatAvailability(seatNumber:number, takenSeats:number[]):boolean{",
      "  const seatIsTaken = takenSeats.includes(seatNumber);",
      "  if(seatIsTaken === true){",
      "    return false;",
      "  }",
      "  return true;",
      "}"
    ]
  },
  {
    title: "greetingBuilder.ts",
    lines: [
      "export function buildGreetingMessage(personName:string):string{",
      "  const normalizedName = personName.trim();",
      "  return 'Hello ' + normalizedName;",
      "}"
    ]
  },
  {
    title: "routeFormatter.ts",
    lines: [
      "export function formatRouteLabel(origin:string, destination:string):string{",
      "  const routeSeparator = ' -> ';",
      "  return origin + routeSeparator + destination;",
      "}"
    ]
  },
  {
    title: "scoreCheck.ts",
    lines: [
      "export function isExcellentScore(currentScore:number):boolean{",
      "  const minimumExcellentScore = 5.5;",
      "  return currentScore >= minimumExcellentScore;",
      "}"
    ]
  },
  {
    title: "averageCalculator.ts",
    lines: [
      "export function calculateAverageValue(values:number[]):number{",
      "  const total = values.reduce((acc, item) => acc + item, 0);",
      "  return total / values.length;",
      "}"
    ]
  },
  {
    title: "cartTotal.ts",
    lines: [
      "export function calculateCartTotal(prices:number[]):number{",
      "  return prices.reduce((accumulator, currentPrice) => {",
      "    return accumulator + currentPrice;",
      "  }, 0);",
      "}"
    ]
  },
  {
    title: "labelBuilder.ts",
    lines: [
      "export function buildSeatLabel(rowNumber:number, seatLetter:string):string{",
      "  const normalizedLetter = seatLetter.toUpperCase();",
      "  return String(rowNumber) + normalizedLetter;",
      "}"
    ]
  },
  {
    title: "courseFormatter.ts",
    lines: [
      "export function formatCoursePresentation(routeLabel:string, departureHour:string):string{",
      "  return routeLabel + ' ' + departureHour;",
      "}"
    ]
  },
  {
    title: "containsChecker.ts",
    lines: [
      "export function containsFragment(input:string, fragment:string):boolean{",
      "  const normalizedInput = input.toLowerCase();",
      "  const normalizedFragment = fragment.toLowerCase();",
      "  return normalizedInput.includes(normalizedFragment);",
      "}"
    ]
  },
  {
    title: "cityTransformer.ts",
    lines: [
      "export function transformCityNameToUppercase(cityName:string):string{",
      "  const sanitizedName = cityName.trim();",
      "  return sanitizedName.toUpperCase();",
      "}"
    ]
  },
  {
    title: "parityChecker.ts",
    lines: [
      "export function resolveParityLabel(value:number):string{",
      "  const isEvenValue = value % 2 === 0;",
      "  return isEvenValue ? 'even' : 'odd';",
      "}"
    ]
  },
  {
    title: "priceInspector.ts",
    lines: [
      "export function getPriceState(price:number):string{",
      "  const expensiveThreshold = 40;",
      "  return price > expensiveThreshold ? 'expensive' : 'ok';",
      "}"
    ]
  },
  {
    title: "nameValidator.ts",
    lines: [
      "export function isNameValid(name:string):boolean{",
      "  const normalizedName = name.trim();",
      "  return normalizedName.length > 2;",
      "}"
    ]
  },
  {
    title: "lengthResolver.ts",
    lines: [
      "export function resolveWordLength(word:string):number{",
      "  const normalizedWord = word.trim();",
      "  return normalizedWord.length;",
      "}"
    ]
  },
  {
    title: "userReader.ts",
    lines: [
      "export function readUserName(user:{name:string; age:number}):string{",
      "  return user.name;",
      "}"
    ]
  },
  {
    title: "cheapPrice.ts",
    lines: [
      "export function isCheapPrice(price:number):boolean{",
      "  const cheapThreshold = 30;",
      "  return price < cheapThreshold;",
      "}"
    ]
  },
  {
    title: "multiplyNumbers.ts",
    lines: [
      "export function multiplyNumbers(firstValue:number, secondValue:number):number{",
      "  return firstValue * secondValue;",
      "}"
    ]
  },
  {
    title: "evenFilter.ts",
    lines: [
      "export function filterEvenValues(values:number[]):number[]{",
      "  return values.filter((value) => value % 2 === 0);",
      "}"
    ]
  },
  {
    title: "membershipChecker.ts",
    lines: [
      "export function containsSeatValue(values:number[], target:number):boolean{",
      "  return values.includes(target);",
      "}"
    ]
  },
  {
    title: "routeSummary.ts",
    lines: [
      "export function createRouteSummary(startCity:string, endCity:string):string{",
      "  const arrowToken = ' -> ';",
      "  return startCity + arrowToken + endCity;",
      "}"
    ]
  },
  {
    title: "pricesReducer.ts",
    lines: [
      "export function reducePricesToTotal(prices:number[]):number{",
      "  return prices.reduce((sum, current) => sum + current, 0);",
      "}"
    ]
  }
];

function renderHumanSvg(variant) {
  return renderCodeEditorSvg({
    title: variant.title,
    bg: "#020713",
    panel: "#020713",
    topbar: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    text: "#8ec5ff",
    accent: "#3b82f6",
    lines: variant.lines
  });
}

function renderAiSvg(variant) {
  return renderCodeEditorSvg({
    title: variant.title,
    bg: "#020713",
    panel: "#020713",
    topbar: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    text: "#8ec5ff",
    accent: "#3b82f6",
    lines: variant.lines
  });
}

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
  const questions = [];
  const answerTypes = [0, 1, 2, 3];

  for (let i = 0; i < QUESTIONS_PER_GAME; i++) {
    const correct = answerTypes[i % answerTypes.length];

    if (correct === 0) {
      const [leftHuman] = pickDifferentPair(HUMAN_VARIANTS);
      const [rightAi] = pickDifferentPair(AI_VARIANTS);
      questions.push(
        createQuestion(
          0,
          "human",
          "ai",
          HUMAN_VARIANTS.indexOf(leftHuman),
          AI_VARIANTS.indexOf(rightAi)
        )
      );
    } else if (correct === 1) {
      const [leftAi] = pickDifferentPair(AI_VARIANTS);
      const [rightHuman] = pickDifferentPair(HUMAN_VARIANTS);
      questions.push(
        createQuestion(
          1,
          "ai",
          "human",
          AI_VARIANTS.indexOf(leftAi),
          HUMAN_VARIANTS.indexOf(rightHuman)
        )
      );
    } else if (correct === 2) {
      const [leftHuman, rightHuman] = pickDifferentPair(HUMAN_VARIANTS);
      questions.push(
        createQuestion(
          2,
          "human",
          "human",
          HUMAN_VARIANTS.indexOf(leftHuman),
          HUMAN_VARIANTS.indexOf(rightHuman)
        )
      );
    } else {
      const [leftAi, rightAi] = pickDifferentPair(AI_VARIANTS);
      questions.push(
        createQuestion(
          3,
          "ai",
          "ai",
          AI_VARIANTS.indexOf(leftAi),
          AI_VARIANTS.indexOf(rightAi)
        )
      );
    }
  }

  return shuffle(questions);
}

let currentQuestions = buildQuestionPool();

const game = {
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
    case 0:
      return "Лявата е от човек, дясната е ИИ";
    case 1:
      return "Дясната е от човек, лявата е ИИ";
    case 2:
      return "И двете са от човек";
    case 3:
      return "И двете са от ИИ";
    default:
      return "";
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
    state: game.state,
    currentQuestionIndex: game.currentQuestionIndex,
    totalQuestions: currentQuestions.length,
    question: q
      ? {
          id: q.id,
          leftCode: q.leftCode,
          rightCode: q.rightCode,
          leftTitle: q.leftTitle,
          rightTitle: q.rightTitle,
          correctChoice: q.correct,
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
        revealMessage = "Няма изпратен отговор";
      } else if (ans.correct) {
        revealMessage = "Вярно! +" + ans.points + " точки";
      } else {
        revealMessage = "Грешен отговор";
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

function moveToReveal() {
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
      remainingMs: Math.max(0, remaining),
      endsAt: game.questionEndsAt
    });

    if (remaining <= 0) {
      moveToReveal();
    }
  }, 500);
}

function startGame() {
  clearTimers();

  currentQuestions = buildQuestionPool();
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

  for (const p of playersByToken.values()) {
    p.score = 0;
    p.answers = {};
  }

  emitAll();
}

io.on("connection", (socket) => {
  socket.on("player:join", ({ token, name }) => {
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
      name: player.name
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
      name: player.name
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

    const playerToken = String(token);
    const player = playersByToken.get(playerToken);

    if (!player) return;

    if (player.socketId) {
      const kickedSocket = io.sockets.sockets.get(player.socketId);
      if (kickedSocket) {
        kickedSocket.emit("player:kicked", "Премахнат си от играта от хоста.");
      }
    }

    playersByToken.delete(playerToken);
    emitAll();
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("AI or Human quiz is running");
  console.log("Players: http://localhost:" + PORT);
  console.log("Host:    http://localhost:" + PORT + "/host.html");
  console.log("");
});