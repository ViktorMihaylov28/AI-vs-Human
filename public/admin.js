const API_BASE = "";
const LS_TOKEN_KEY = "admin_token";
const LS_USER_KEY = "admin_user";

let token = localStorage.getItem(LS_TOKEN_KEY) || "";
let currentUser = localStorage.getItem(LS_USER_KEY) || "";
let questions = [];
let gameState = null;
let players = [];
let socket = null;
let playersByToken = [];
let gameSettings = {
  questionsCount: 20,
  questionTime: 15,
  pointsPerQuestion: 100,
  timeBonus: true,
  shuffleQuestions: true,
  pauseBetweenQuestions: 5,
  gameMode: "classic"
};

function $(id) { return document.getElementById(id); }

let qrCodeInstance = null;

function updateQRCode(gameCode) {
  const container = $("qrCodeContainer");
  if (!container) return;
  container.innerHTML = "";
  if (!gameCode) return;
  
  const baseUrl = window.location.origin;
  const joinUrl = `${baseUrl}?code=${gameCode}`;
  
  if (typeof QRCode !== "undefined") {
    qrCodeInstance = new QRCode(container, {
      text: joinUrl,
      width: 180,
      height: 180,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }
}

function $(id) { return document.getElementById(id); }

async function apiRequest(endpoint, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Грешка");
  return data;
}

function showNotification(message, type = "info") {
  const colors = { success: "#22c55e", error: "#ef4444", info: "#3b82f6", warning: "#f59e0b" };
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 9999;
    padding: 16px 24px; border-radius: 12px; font-weight: 600;
    background: ${colors[type] || colors.info}; color: #fff;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3); animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => { notification.style.opacity = "0"; setTimeout(() => notification.remove(), 300); }, 3000);
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
  $(`tab-${tabName}`).classList.add("active");
  $(`tab-${tabName}`).classList.remove("hidden");
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function connectSocket() {
  if (socket) socket.disconnect();
  socket = io();

  socket.on("connect", () => console.log("Admin connected"));

  socket.on("admin:update", (state) => {
    gameState = state;
    updateGameUI();
  });

  socket.on("players:update", (players) => {
    playersByToken = players;
    renderPlayers();
    renderAdminPlayers(players);
  });

  socket.on("game:timer", ({ remainingMs }) => {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const timer = $("hostTimer");
    if (timer) {
      timer.textContent = seconds;
      timer.classList.toggle("danger", seconds <= 5);
    }
    $("timerDisplay").classList.add("hidden");
  });

  socket.on("game:pauseTimer", ({ remainingMs }) => {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    $("timerDisplay").classList.remove("hidden");
    $("pauseCountdown").textContent = seconds;
    $("hostTimer").textContent = seconds;
  });
}

function updateGameUI() {
  if (!gameState) return;

  $("playersCount").textContent = gameState.playersCount || 0;
  $("questionNum").textContent = `${(gameState.currentQuestionIndex >= 0 ? gameState.currentQuestionIndex + 1 : 0)}/${gameState.totalQuestions || 0}`;
  $("answeredCount").textContent = gameState.answeredPlayers || 0;
  $("totalPlayersCount").textContent = gameState.totalPlayers || 0;

  $("gameCodeDisplay").textContent = gameState.gameCode || "------";

  const state = gameState.state;

  if (state === "lobby" || state === "ready") {
    if (state === "ready" && gameState.gameCode) {
      $("waitingState").style.display = "none";
      $("lobbyReady").style.display = "block";
      $("startGameBtn").style.display = "inline-block";
      $("lobbyGameCode").textContent = gameState.gameCode;
      $("lobbyPlayers").textContent = gameState.playersCount || 0;
      $("lobbyQuestions").textContent = gameSettings.questionsCount;
      $("lobbyTime").textContent = `${gameSettings.questionTime}с`;
      updateQRCode(gameState.gameCode);
    } else {
      $("waitingState").style.display = "block";
      $("lobbyReady").style.display = "none";
    }
    switchTab("lobby");
  } else if (state === "question" || state === "pause" || state === "reveal") {
    $("nextGameBtn").textContent = state === "pause" ? "⏭️ Покажи отговора" : "⏭️ Следващ";
    updateQuestionPreview();
    updateResponseChart(gameState);
    
    const pauseBtn = $("pauseGameBtn");
    const resumeBtn = $("resumeGameBtn");
    if (state === "question" && !gameState.paused) {
      pauseBtn.classList.remove("hidden");
      resumeBtn.classList.add("hidden");
    } else {
      pauseBtn.classList.add("hidden");
      resumeBtn.classList.remove("hidden");
    }
    
    switchTab("game");
  } else if (state === "finished") {
    switchTab("players");
  }
}

function updateQuestionPreview() {
  if (!gameState?.question) {
    $("hostLeftCode").textContent = "";
    $("hostRightCode").textContent = "";
    return;
  }

  const q = gameState.question;
  $("leftCodeTitle").textContent = q.leftTitle || "Ляв код";
  $("rightCodeTitle").textContent = q.rightTitle || "Десен код";
  $("hostLeftCode").textContent = q.leftCode || "Няма код";
  $("hostRightCode").textContent = q.rightCode || "Няма код";

  const correctBox = $("correctAnswerBox");
  if (gameState.state === "reveal" || gameState.state === "pause") {
    correctBox.classList.remove("hidden");
    $("correctAnswerText").textContent = q.correctText || "-";
  } else {
    correctBox.classList.add("hidden");
  }
}

function updateResponseChart(state) {
  const answerCounts = state.answerCounts || [0, 0, 0, 0];
  const total = state.answeredPlayers || 0;

  for (let i = 0; i < 4; i++) {
    const bar = $(`bar${i}`);
    const count = $(`count${i}`);
    if (bar && count) {
      count.textContent = answerCounts[i];
      const pct = total > 0 ? (answerCounts[i] / total) * 100 : 0;
      bar.style.width = `${Math.max(pct, 0)}%`;
    }
  }
}

function renderAdminPlayers(leaderboard) {
  const container = $("adminLeaderboard");
  if (!container) return;

  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Няма играчи</p>';
    return;
  }

  container.innerHTML = leaderboard.slice(0, 10).map((p, i) => `
    <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--dark); border-radius: 10px; margin-bottom: 8px;">
      <div class="player-rank ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : ''}">${i + 1}</div>
      <div style="flex: 1;">
        <div style="font-weight: 600;">${escapeHtml(p.name)}</div>
        <div style="font-size: 12px; color: #64748b;">Ранг #${i + 1}</div>
      </div>
      <div style="font-weight: 700; color: var(--primary);">${p.score} т.</div>
    </div>
  `).join("");
}

function renderPlayers() {
  const tbody = $("playersBody");
  if (!tbody) return;

  if (!playersByToken || playersByToken.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b;">Няма играчи</td></tr>';
    return;
  }

  tbody.innerHTML = playersByToken.map((p, i) => `
    <tr>
      <td><span class="player-rank" style="width: 28px; height: 28px; font-size: 12px;">${i + 1}</span></td>
      <td>${escapeHtml(p.name)}</td>
      <td style="font-weight: 700;">${p.score} т.</td>
      <td>${p.correctAnswers || 0}</td>
      <td><button class="action-btn kick" onclick="kickPlayer('${p.token}')">Изгони</button></td>
    </tr>
  `).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function kickPlayer(playerToken) {
  if (!confirm("Сигурни ли сте?")) return;
  try {
    await apiRequest("/api/admin/game/kick", { method: "POST", body: JSON.stringify({ playerToken }) });
    showNotification("Играчът е изгонен!", "success");
    await loadPlayers();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function loadQuestions() {
  try {
    questions = await apiRequest("/api/admin/questions");
    renderQuestionsList();
    $("questionsCount").textContent = questions.length;
  } catch (err) {
    console.error("Error loading questions:", err);
  }
}

function renderQuestionsList() {
  const container = $("questionsList");
  if (!container) return;

  if (!questions || questions.length === 0) {
    container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Няма въпроси. Добави първия!</p>';
    return;
  }

  container.innerHTML = questions.map((q, i) => `
    <div class="question-card">
      <div style="display: flex; align-items: center;">
        <div class="question-num">${i + 1}</div>
        <div>
          <div style="font-weight: 600;">${q.question_type || "code"}</div>
          <div style="font-size: 12px; color: #64748b;">${(q.leftCode || "").slice(0, 50)}...</div>
        </div>
      </div>
      <div class="question-actions">
        <button class="btn btn-danger btn-small" onclick="deleteQuestion(${q.id})">🗑️</button>
      </div>
    </div>
  `).join("");
}

async function deleteQuestion(id) {
  if (!confirm("Изтрий този въпрос?")) return;
  try {
    await apiRequest(`/api/admin/questions/${id}`, { method: "DELETE" });
    showNotification("Въпросът е изтрит!", "success");
    await loadQuestions();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

function updateQuestionForm() {
  const type = $("newQuestionType").value;
  const container = $("questionTypeFields");
  
  let html = "";
  
  if (type === "code") {
    html = `
      <div class="grid-2">
        <div class="form-group">
          <label>🖥️ Ляв код</label>
          <textarea id="newLeftCode" class="form-input" style="min-height: 150px; font-family: monospace;" placeholder="Код за левия панел..."></textarea>
        </div>
        <div class="form-group">
          <label>🖥️ Десен код</label>
          <textarea id="newRightCode" class="form-input" style="min-height: 150px; font-family: monospace;" placeholder="Код за десния панел..."></textarea>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>Заглавие ляв</label>
          <input type="text" id="newLeftTitle" class="form-input" value="left_code.py" />
        </div>
        <div class="form-group">
          <label>Заглавие десен</label>
          <input type="text" id="newRightTitle" class="form-input" value="right_code.py" />
        </div>
      </div>
      <div class="form-group">
        <label>✅ Верен отговор</label>
        <select id="newCorrect" class="form-input">
          <option value="0">0 - Лявата е от човек, дясната е ИИ</option>
          <option value="1">1 - Дясната е от човек, лявата е ИИ</option>
          <option value="2">2 - И двете са от човек</option>
          <option value="3">3 - И двете са от ИИ</option>
        </select>
      </div>
    `;
  } else if (type === "fill_blank") {
    html = `
      <div class="form-group">
        <label>📝 Текст с празни места (използвай ___ за празно място)</label>
        <textarea id="newQuestionText" class="form-input" style="min-height: 120px;" placeholder="Това е пример с ___ място за попълване."></textarea>
      </div>
      <div class="form-group">
        <label>✅ Верни отговори (по един на ред, всички варианти)</label>
        <textarea id="newAcceptableAnswers" class="form-input" style="min-height: 150px; font-family: monospace;" placeholder="Пример за думата 'дом':
Дом
дом
дОм
доМ
ДОМ
домът
домат"></textarea>
      </div>
      <div class="form-group">
        <label style="color: #94a3b8; font-size: 13px;">Всички отговори се приемат без значение на главни/малки букви</label>
      </div>
    `;
  } else if (type === "matching") {
    html = `
      <div class="form-group">
        <label>📝 Инструкция</label>
        <input type="text" id="newQuestionText" class="form-input" placeholder="Съедини правилните двойки" />
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>🔗 Лява колона (по един на ред)</label>
          <textarea id="newMatchingLeft" class="form-input" style="min-height: 150px; font-family: monospace;" placeholder="Apple
Banana
Cherry"></textarea>
        </div>
        <div class="form-group">
          <label>🔗 Дясна колона (в правилния ред, по един на ред)</label>
          <textarea id="newMatchingRight" class="form-input" style="min-height: 150px; font-family: monospace;" placeholder="ябълка
банан
череша"></textarea>
        </div>
      </div>
    `;
  } else if (type === "numeric") {
    html = `
      <div class="form-group">
        <label>📝 Текст на въпроса</label>
        <textarea id="newQuestionText" class="form-input" style="min-height: 80px;" placeholder="Колко е 2 + 2?"></textarea>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>🔢 Верен отговор</label>
          <input type="number" id="newCorrect" class="form-input" placeholder="4" />
        </div>
        <div class="form-group">
          <label>📊 Толеранс (±)</label>
          <input type="number" id="newNumericTolerance" class="form-input" value="0" placeholder="0" />
        </div>
      </div>
    `;
  } else {
    html = `
      <div class="form-group">
        <label>📝 Текст на въпроса</label>
        <textarea id="newQuestionText" class="form-input" style="min-height: 100px;" placeholder="Въпросът..."></textarea>
      </div>
    `;
    
    if (type === "multiple_choice") {
      html += `
        <div class="form-group">
          <label>📝 Варианти (по един на ред, първия е верен)</label>
          <textarea id="newMcOptions" class="form-input" style="min-height: 100px;" placeholder="Верен отговор
Грешен 1
Грешен 2
Грешен 3"></textarea>
        </div>
      `;
    } else if (type === "true_false") {
      html += `
        <div class="form-group">
          <label>✅ Верен отговор</label>
          <select id="newCorrect" class="form-input">
            <option value="true">Вярно</option>
            <option value="false">Невярно</option>
          </select>
        </div>
      `;
    } else {
      html += `
        <div class="form-group">
          <label>✅ Верен отговор</label>
          <input type="text" id="newCorrect" class="form-input" placeholder="Верен отговор" />
        </div>
      `;
    }
  }
  
  container.innerHTML = html;
}

async function saveQuestion() {
  const type = $("newQuestionType").value;
  let question = { question_type: type };
  let hasError = false;

  if (type === "code") {
    question.leftCode = $("newLeftCode")?.value || "";
    question.rightCode = $("newRightCode")?.value || "";
    question.leftTitle = $("newLeftTitle")?.value || "left_code.py";
    question.rightTitle = $("newRightTitle")?.value || "right_code.py";
    question.correct = parseInt($("newCorrect")?.value || "0");
    
    if (!question.leftCode || !question.rightCode) {
      showNotification("Моля, попълни кодовете!", "error");
      return;
    }
  } else if (type === "fill_blank") {
    const text = $("newQuestionText")?.value || "";
    const answersText = $("newAcceptableAnswers")?.value || "";
    
    if (!text) {
      showNotification("Моля, попълни текста!", "error");
      return;
    }
    if (!answersText) {
      showNotification("Моля, попълни верните отговори!", "error");
      return;
    }
    
    question.questionText = text;
    const answers = answersText.split("\n").map(a => a.trim()).filter(a => a);
    question.correct = answers[0];
    question.acceptedAnswers = answers;
    question.questionOptions = { answers, caseInsensitive: true };
  } else if (type === "matching") {
    const instruction = $("newQuestionText")?.value || "";
    const leftText = $("newMatchingLeft")?.value || "";
    const rightText = $("newMatchingRight")?.value || "";
    
    if (!instruction || !leftText || !rightText) {
      showNotification("Моля, попълни всички полета!", "error");
      return;
    }
    
    const leftItems = leftText.split("\n").map(l => l.trim()).filter(l => l);
    const rightItems = rightText.split("\n").map(r => r.trim()).filter(r => r);
    
    if (leftItems.length !== rightItems.length) {
      showNotification("Броят на елементите в двете колони трябва да е еднакъв!", "error");
      return;
    }
    
    question.questionText = instruction;
    const matches = leftItems.map((left, i) => ({ left, right: rightItems[i] }));
    question.questionOptions = { matches };
    question.correct = matches;
  } else if (type === "numeric") {
    question.questionText = $("newQuestionText")?.value || "";
    question.correct = parseFloat($("newCorrect")?.value) || 0;
    const tolerance = parseFloat($("newNumericTolerance")?.value) || 0;
    question.questionOptions = { tolerance };
    
    if (!question.questionText) {
      showNotification("Моля, попълни текста!", "error");
      return;
    }
  } else if (type === "multiple_choice") {
    question.questionText = $("newQuestionText")?.value || "";
    const optionsText = $("newMcOptions")?.value || "";
    
    if (!question.questionText || !optionsText) {
      showNotification("Моля, попълни текста и вариантите!", "error");
      return;
    }
    
    const options = optionsText.split("\n").map(o => o.trim()).filter(o => o);
    question.questionOptions = { options };
    question.correct = options[0];
  } else {
    question.questionText = $("newQuestionText")?.value || "";
    question.correct = $("newCorrect")?.value || "";
    
    if (!question.questionText || !question.correct) {
      showNotification("Моля, попълни текста и верния отговор!", "error");
      return;
    }
  }

  try {
    await apiRequest("/api/admin/questions", { method: "POST", body: JSON.stringify(question) });
    showNotification("Въпросът е запазен!", "success");
    await loadQuestions();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function saveQuestion() {
  const type = $("newQuestionType").value;
  let question = { question_type: type };

  if (type === "code") {
    question.leftCode = $("newLeftCode")?.value || "";
    question.rightCode = $("newRightCode")?.value || "";
    question.leftTitle = $("newLeftTitle")?.value || "left_code.py";
    question.rightTitle = $("newRightTitle")?.value || "right_code.py";
    question.correct = parseInt($("newCorrect")?.value || "0");
  } else {
    question.questionText = $("newQuestionText")?.value || "";
    question.correct = $("newCorrect")?.value || "";
  }

  try {
    await apiRequest("/api/admin/questions", { method: "POST", body: JSON.stringify(question) });
    showNotification("Въпросът е запазен!", "success");
    await loadQuestions();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function createGame() {
  try {
    await apiRequest("/api/admin/game/create", { method: "POST" });
    gameState = { state: "ready" };
    updateGameUI();
    showNotification("Играта е създадена!", "success");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function startGame() {
  try {
    await apiRequest("/api/admin/game/start", { method: "POST" });
    showNotification("Играта започна!", "success");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function nextQuestion() {
  try {
    await apiRequest("/api/admin/game/next", { method: "POST" });
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function pauseGame() {
  try {
    await apiRequest("/api/admin/game/pause", { method: "POST" });
    showNotification("Играта е на пауза", "info");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function resumeGame() {
  try {
    await apiRequest("/api/admin/game/resume", { method: "POST" });
    showNotification("Играта продължава!", "success");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function endGame() {
  if (!confirm("Край на играта?")) return;
  try {
    await apiRequest("/api/admin/game/end", { method: "POST" });
    showNotification("Играта приключи!", "info");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function loadSettings() {
  try {
    const data = await apiRequest("/api/admin/game/settings");
    gameSettings = data.settings || gameSettings;
    applySettingsToUI();
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

function applySettingsToUI() {
  $("settingQuestionsCount").value = gameSettings.questionsCount || 20;
  $("settingQuestionTime").value = gameSettings.questionTime || 15;
  $("settingPointsPerQuestion").value = gameSettings.pointsPerQuestion || 100;
  $("settingPauseBetween").value = gameSettings.pauseBetweenQuestions || 5;
  $("settingGameMode").value = gameSettings.gameMode || "classic";
  $("settingTimeBonus").checked = gameSettings.timeBonus !== false;
  $("settingShuffleQuestions").checked = gameSettings.shuffleQuestions !== false;
}

async function saveSettings() {
  const settings = {
    questionsCount: parseInt($("settingQuestionsCount").value) || 20,
    questionTime: parseInt($("settingQuestionTime").value) || 15,
    pointsPerQuestion: parseInt($("settingPointsPerQuestion").value) || 100,
    pauseBetweenQuestions: parseInt($("settingPauseBetween").value) || 5,
    gameMode: $("settingGameMode").value,
    timeBonus: $("settingTimeBonus").checked,
    shuffleQuestions: $("settingShuffleQuestions").checked
  };

  try {
    await apiRequest("/api/admin/game/settings", { method: "POST", body: JSON.stringify(settings) });
    gameSettings = settings;
    $("settingsModal").classList.add("hidden");
    showNotification("Настройките са запазени!", "success");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function loadPlayers() {
  try {
    players = await apiRequest("/api/admin/players");
    playersByToken = players;
    renderPlayers();
    renderAdminPlayers(players);
  } catch (err) {
    console.error("Error loading players:", err);
  }
}

async function loadProctoringLogs() {
  try {
    const logs = await apiRequest("/api/admin/proctoring/logs");
    const container = $("proctoringLogs");
    
    if (!logs || logs.length === 0) {
      container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 40px;">Няма логове</p>';
      return;
    }

    container.innerHTML = logs.map(log => `
      <div class="proctoring-log">
        <span class="time">${new Date(log.created_at).toLocaleString("bg")}</span> - 
        <span class="player">${escapeHtml(log.player_name || "Непознат")}</span> - 
        <span class="type">${log.event_type}</span>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading proctoring logs:", err);
  }
}

function exportQuestions() {
  const data = JSON.stringify(questions, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "questions.json";
  a.click();
  URL.revokeObjectURL(url);
  showNotification("Въпросите са изтеглени!", "success");
}

async function importQuestions(file) {
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    for (const q of imported) {
      await apiRequest("/api/admin/questions", { method: "POST", body: JSON.stringify(q) });
    }
    showNotification(`Импортирани ${imported.length} въпроса!`, "success");
    await loadQuestions();
  } catch (err) {
    showNotification("Грешка при импорта: " + err.message, "error");
  }
}

async function login(username, password) {
  try {
    const data = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    token = data.token;
    currentUser = username;
    localStorage.setItem(LS_TOKEN_KEY, token);
    localStorage.setItem(LS_USER_KEY, currentUser);
    showMainPanel();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function register(username, password) {
  try {
    await apiRequest("/api/admin/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    showNotification("Регистрацията е успешна! Впишете се.", "success");
    $("registerCard").classList.add("hidden");
    $("loginScreen").querySelector(".login-card").classList.remove("hidden");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

function logout() {
  token = "";
  currentUser = "";
  localStorage.removeItem(LS_TOKEN_KEY);
  localStorage.removeItem(LS_USER_KEY);
  if (socket) socket.disconnect();
  $("loginScreen").style.display = "grid";
  $("adminContainer").style.display = "none";
}

function showMainPanel() {
  $("loginScreen").style.display = "none";
  $("adminContainer").style.display = "block";
  connectSocket();
  loadQuestions();
  loadSettings();
  loadPlayers();
  loadProctoringLogs();
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();

  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = $("loginUsername").value;
    const password = $("loginPassword").value;
    if (username && password) login(username, password);
  });

  $("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = $("regUsername").value;
    const password = $("regPassword").value;
    const confirm = $("regPasswordConfirm").value;
    if (password !== confirm) {
      showNotification("Паролите не съвпадат!", "error");
      return;
    }
    if (username && password) register(username, password);
  });

  $("showRegister").addEventListener("click", (e) => {
    e.preventDefault();
    $("loginScreen").querySelector(".login-card").classList.add("hidden");
    $("registerCard").classList.remove("hidden");
  });

  $("showLogin").addEventListener("click", (e) => {
    e.preventDefault();
    $("registerCard").classList.add("hidden");
    $("loginScreen").querySelector(".login-card").classList.remove("hidden");
  });

  $("createGameBtn").addEventListener("click", createGame);
  $("startGameBtn").addEventListener("click", startGame);
  $("nextGameBtn").addEventListener("click", nextQuestion);
  $("pauseGameBtn").addEventListener("click", pauseGame);
  $("resumeGameBtn").addEventListener("click", resumeGame);
  $("endGameBtn").addEventListener("click", endGame);
  $("logoutBtn").addEventListener("click", logout);

  $("settingsBtn").addEventListener("click", () => {
    applySettingsToUI();
    $("settingsModal").classList.remove("hidden");
  });

  $("closeSettingsBtn").addEventListener("click", () => {
    $("settingsModal").classList.add("hidden");
  });

  $("saveSettingsBtn").addEventListener("click", saveSettings);
  $("newQuestionType").addEventListener("change", updateQuestionForm);
  $("saveQuestionBtn").addEventListener("click", saveQuestion);
  $("exportBtn").addEventListener("click", exportQuestions);
  $("importFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importQuestions(e.target.files[0]);
  });
  $("refreshProctoringBtn").addEventListener("click", loadProctoringLogs);

  updateQuestionForm();

  if (token) {
    showMainPanel();
  }
});
