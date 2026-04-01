const API_BASE = "";
const LS_TOKEN_KEY = "admin_token";
const LS_USER_KEY = "admin_user";

let token = localStorage.getItem(LS_TOKEN_KEY) || "";
let currentUser = localStorage.getItem(LS_USER_KEY) || "";
let questions = [];
let gameState = null;
let players = [];
let socket = null;
let timerInterval = null;
let currentTimerValue = 15;
let playersByToken = [];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function showNotification(message, type = "success") {
  const existing = document.querySelector(".notification");
  if (existing) existing.remove();

  const notif = document.createElement("div");
  notif.className = `notification ${type}`;
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => notif.remove(), 3000);
}

function connectSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on("admin:update", (state) => {
    gameState = state;
    updateGameUI();
    renderAdminPlayers(state.leaderboard || []);
  });

  socket.on("game:timer", (data) => {
    updateTimer(data.remainingMs);
  });

  socket.on("connect", () => {
    console.log("Admin socket connected");
  });

  socket.on("disconnect", () => {
    console.log("Admin socket disconnected");
  });
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimer(remainingMs) {
  const timerEl = $("hostTimer");
  const timerDisplay = $("timerDisplay");

  if (!timerEl || !timerDisplay) return;

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  currentTimerValue = seconds;

  if (gameState?.state === "question" && remainingMs > 0) {
    timerDisplay.style.display = "flex";
    timerEl.textContent = seconds;
    timerEl.classList.remove("warning", "danger");

    if (seconds <= 5) {
      timerEl.classList.add("danger");
    } else if (seconds <= 10) {
      timerEl.classList.add("warning");
    }
  } else {
    timerDisplay.style.display = "none";
  }
}

async function apiRequest(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || " грешка");
  }

  return data;
}

function checkAuth() {
  if (token) {
    showAdminPanel();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  hide("adminPanel");
  show("loginScreen");
  disconnectSocket();
}

function showAdminPanel() {
  hide("loginScreen");
  show("adminPanel");
  $("userName").textContent = currentUser;
  loadQuestions();
  loadGameState();
  loadPlayers();
  connectSocket();
}

async function login() {
  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  if (!username || !password) {
    $("loginError").textContent = "Моля, попълнете всички полета";
    return;
  }

  try {
    const data = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    token = data.token;
    currentUser = data.username;

    localStorage.setItem(LS_TOKEN_KEY, token);
    localStorage.setItem(LS_USER_KEY, currentUser);

    $("loginUsername").value = "";
    $("loginPassword").value = "";
    $("loginError").textContent = "";

    showAdminPanel();
    showNotification(`Добре дошъл, ${currentUser}!`);
  } catch (err) {
    $("loginError").textContent = err.message;
  }
}

function logout() {
  token = "";
  currentUser = "";
  localStorage.removeItem(LS_TOKEN_KEY);
  localStorage.removeItem(LS_USER_KEY);
  showLoginScreen();
  showNotification("Излязохте от системата");
}

async function loadQuestions() {
  try {
    questions = await apiRequest("/api/admin/questions");
    renderQuestions();
    renderReorderList();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

function renderQuestions() {
  const container = $("questionsList");

  if (questions.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--muted);">Няма добавени въпроси. Използват се генерирани въпроси.</p>';
    return;
  }

  container.innerHTML = questions
    .map(
      (q, i) => `
      <div class="question-item" data-id="${escapeHtml(q.id)}">
        <div class="question-item-header">
          <span class="question-item-title">#${i + 1}</span>
          <div class="question-item-actions">
            <button class="btn btn-secondary btn-small edit-btn" data-id="${escapeHtml(q.id)}">Редактирай</button>
            <button class="btn btn-danger btn-small delete-btn" data-id="${escapeHtml(q.id)}">Изтрий</button>
          </div>
        </div>
        <div class="question-preview">
          <div class="question-preview-box">
            <strong>${escapeHtml(q.leftTitle || "Ляв код")}</strong><br/>
            ${escapeHtml((q.leftCode || "").substring(0, 100))}...
          </div>
          <div class="question-preview-box">
            <strong>${escapeHtml(q.rightTitle || "Десен код")}</strong><br/>
            ${escapeHtml((q.rightCode || "").substring(0, 100))}...
          </div>
        </div>
        <span class="correct-badge correct-${q.correct}">${getCorrectText(q.correct)}</span>
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.id));
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteQuestion(btn.dataset.id));
  });
}

function getCorrectText(correct) {
  const texts = [
    "0 - Лявата е от човек",
    "1 - Дясната е от човек",
    "2 - И двете са от човек",
    "3 - И двете са от ИИ"
  ];
  return texts[correct] || "?";
}

function renderReorderList() {
  const container = $("reorderList");

  if (questions.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--muted);">Няма въпроси за подреждане.</p>';
    return;
  }

  container.innerHTML = questions
    .map(
      (q, i) => `
      <div class="question-item" data-id="${escapeHtml(q.id)}" style="cursor: grab;">
        <div class="question-item-header">
          <span class="question-item-title">
            <input type="number" min="1" max="${questions.length}" value="${i + 1}" 
              class="order-input" data-id="${escapeHtml(q.id)}" 
              style="width: 50px; padding: 4px 8px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; color: white; text-align: center;" />
            - ${escapeHtml(q.leftTitle || "Ляв код")} vs ${escapeHtml(q.rightTitle || "Десен код")}
          </span>
          <button class="btn btn-secondary btn-small move-up-btn" data-id="${escapeHtml(q.id)}" ${i === 0 ? "disabled" : ""}>▲</button>
          <button class="btn btn-secondary btn-small move-down-btn" data-id="${escapeHtml(q.id)}" ${i === questions.length - 1 ? "disabled" : ""}>▼</button>
        </div>
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".move-up-btn").forEach((btn) => {
    btn.addEventListener("click", () => moveQuestion(btn.dataset.id, -1));
  });

  container.querySelectorAll(".move-down-btn").forEach((btn) => {
    btn.addEventListener("click", () => moveQuestion(btn.dataset.id, 1));
  });
}

function moveQuestion(id, direction) {
  const index = questions.findIndex((q) => q.id === id);
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= questions.length) return;

  const [item] = questions.splice(index, 1);
  questions.splice(newIndex, 0, item);

  renderReorderList();
}

async function saveOrder() {
  try {
    const questionIds = questions.map((q) => q.id);
    await apiRequest("/api/admin/questions/reorder", {
      method: "POST",
      body: JSON.stringify({ questionIds })
    });
    showNotification("Редът е запазен!");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

function openEditModal(id) {
  const q = questions.find((q) => q.id === id);
  if (!q) return;

  $("editQuestionId").value = q.id;
  $("editLeftCode").value = q.leftCode || "";
  $("editRightCode").value = q.rightCode || "";
  $("editLeftTitle").value = q.leftTitle || "";
  $("editRightTitle").value = q.rightTitle || "";

  const btnTexts = q.buttonTexts || [
    "Лявата е от човек, дясната е ИИ",
    "Дясната е от човек, лявата е ИИ",
    "И двете са от човек",
    "И двете са от ИИ"
  ];
  $("editBtn0").value = btnTexts[0] || "";
  $("editBtn1").value = btnTexts[1] || "";
  $("editBtn2").value = btnTexts[2] || "";
  $("editBtn3").value = btnTexts[3] || "";
  $("editCorrect").value = q.correct;

  show("editModal");
}

function closeEditModal() {
  hide("editModal");
  $("editQuestionId").value = "";
}

async function saveEdit() {
  const id = $("editQuestionId").value;

  try {
    await apiRequest(`/api/admin/questions/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        leftCode: $("editLeftCode").value,
        rightCode: $("editRightCode").value,
        leftTitle: $("editLeftTitle").value,
        rightTitle: $("editRightTitle").value,
        buttonTexts: [
          $("editBtn0").value,
          $("editBtn1").value,
          $("editBtn2").value,
          $("editBtn3").value
        ],
        correct: parseInt($("editCorrect").value)
      })
    });

    closeEditModal();
    await loadQuestions();
    showNotification("Въпросът е редактиран!");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function deleteQuestion(id) {
  if (!confirm("Сигурни ли сте, че искате да изтриете този въпрос?")) return;

  try {
    await apiRequest(`/api/admin/questions/${id}`, {
      method: "DELETE"
    });

    await loadQuestions();
    showNotification("Въпросът е изтрит!");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function addQuestion() {
  const leftCode = $("newLeftCode").value.trim();
  const rightCode = $("newRightCode").value.trim();
  const leftTitle = $("newLeftTitle").value.trim();
  const rightTitle = $("newRightTitle").value.trim();
  const correct = parseInt($("newCorrect").value);

  if (!leftCode || !rightCode) {
    showNotification("Моля, попълнете кодовете за двата панела", "error");
    return;
  }

  try {
    await apiRequest("/api/admin/questions", {
      method: "POST",
      body: JSON.stringify({
        leftCode,
        rightCode,
        leftTitle: leftTitle || "left_code.py",
        rightTitle: rightTitle || "right_code.py",
        buttonTexts: [
          $("newBtn0").value,
          $("newBtn1").value,
          $("newBtn2").value,
          $("newBtn3").value
        ],
        correct
      })
    });

    $("newLeftCode").value = "";
    $("newRightCode").value = "";
    $("newLeftTitle").value = "left_code.py";
    $("newRightTitle").value = "right_code.py";
    $("newBtn0").value = "Лявата е от човек, дясната е ИИ";
    $("newBtn1").value = "Дясната е от човек, лявата е ИИ";
    $("newBtn2").value = "И двете са от човек";
    $("newBtn3").value = "И двете са от ИИ";
    $("newCorrect").value = "0";

    await loadQuestions();
    showNotification("Въпросът е добавен!");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

function clearForm() {
  $("newLeftCode").value = "";
  $("newRightCode").value = "";
  $("newLeftTitle").value = "left_code.py";
  $("newRightTitle").value = "right_code.py";
  $("newBtn0").value = "Лявата е от човек, дясната е ИИ";
  $("newBtn1").value = "Дясната е от човек, лявата е ИИ";
  $("newBtn2").value = "И двете са от човек";
  $("newBtn3").value = "И двете са от ИИ";
  $("newCorrect").value = "0";
}

async function loadGameState() {
  try {
    gameState = await apiRequest("/api/admin/game/state");
    updateGameUI();
  } catch (err) {
    console.error("Error loading game state:", err);
  }
}

function updateGameUI() {
  if (!gameState) return;

  $("gameState").textContent = gameState.state;
  $("playersCount").textContent = gameState.playersCount;
  $("questionNum").textContent = `${(gameState.currentQuestionIndex >= 0 ? gameState.currentQuestionIndex + 1 : 0)}/${gameState.totalQuestions}`;
  $("answeredCount").textContent = gameState.answeredPlayers;

  updateQuestionPreview();
  renderAdminPlayers(gameState.leaderboard || []);
}

function updateQuestionPreview() {
  if (!gameState) return;

  const q = gameState.question;
  const leftCodeEl = $("hostLeftCode");
  const rightCodeEl = $("hostRightCode");
  const leftTitleEl = $("hostLeftCodeTitle");
  const rightTitleEl = $("hostRightCodeTitle");
  const correctBox = $("correctAnswerBox");
  const correctText = $("correctAnswerText");

  if (q) {
    leftCodeEl.textContent = q.leftCode || "";
    rightCodeEl.textContent = q.rightCode || "";
    leftTitleEl.textContent = q.leftTitle || "Ляв код";
    rightTitleEl.textContent = q.rightTitle || "Десен код";

    if (gameState.state === "reveal" || gameState.state === "finished") {
      correctBox.style.display = "block";
      correctText.textContent = q.correctText || "-";
    } else {
      correctBox.style.display = "none";
    }
  } else {
    leftCodeEl.textContent = "";
    rightCodeEl.textContent = "";
    leftTitleEl.textContent = "Ляв код";
    rightTitleEl.textContent = "Десен код";
    correctBox.style.display = "none";
  }
}

function renderAdminPlayers(leaderboard) {
  const playersList = $("adminPlayersList");
  const leaderboardEl = $("adminLeaderboard");

  if (playersByToken && playersByToken.length > 0) {
    playersList.innerHTML = playersByToken
      .map((p) => `
        <div class="player-row">
          <span class="player-name">${escapeHtml(p.name)}</span>
          <span class="player-score">${p.score} т.</span>
        </div>
      `)
      .join("");
  } else {
    playersList.innerHTML = '<p style="color: var(--muted); text-align: center;">Няма играчи</p>';
  }

  if (leaderboard && leaderboard.length > 0) {
    leaderboardEl.innerHTML = leaderboard
      .slice(0, 10)
      .map((p, i) => {
        const rankClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-default";
        return `
          <div class="leaderboard-row">
            <div class="leaderboard-rank ${rankClass}">${i + 1}</div>
            <span class="leaderboard-name">${escapeHtml(p.name)}</span>
            <span class="leaderboard-score">${p.score} т.</span>
          </div>
        `;
      })
      .join("");
  } else {
    leaderboardEl.innerHTML = '<p style="color: var(--muted); text-align: center;">Няма класиране</p>';
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

function renderPlayers() {
  const tbody = $("playersBody");
  const noMsg = $("noPlayersMsg");

  if (players.length === 0) {
    tbody.innerHTML = "";
    show("noPlayersMsg");
    return;
  }

  hide("noPlayersMsg");
  tbody.innerHTML = players
    .map(
      (p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.score}</td>
        <td>${p.correctCount}/${p.answeredCount}</td>
        <td>
          <button class="btn btn-danger btn-small kick-player-btn" data-token="${escapeHtml(p.token)}">Премахни</button>
        </td>
      </tr>
    `
    )
    .join("");

  tbody.querySelectorAll(".kick-player-btn").forEach((btn) => {
    btn.addEventListener("click", () => kickPlayer(btn.dataset.token));
  });
}

async function startGame() {
  try {
    await apiRequest("/api/admin/game/start", { method: "POST" });
    await loadGameState();
    await loadPlayers();
    showNotification("Играта е стартирана!");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function nextQuestion() {
  try {
    await apiRequest("/api/admin/game/next", { method: "POST" });
    await loadGameState();
    await loadPlayers();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function resetGame() {
  if (!confirm("Сигурни ли сте, че искате да нулирате играта?")) return;

  try {
    await apiRequest("/api/admin/game/reset", { method: "POST" });
    await loadGameState();
    await loadPlayers();
    showNotification("Играта е нулирана!");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

async function kickPlayer(playerToken) {
  if (!confirm("Сигурни ли сте, че искате да премахнете този играч?")) return;

  try {
    await apiRequest("/api/admin/game/kick", {
      method: "POST",
      body: JSON.stringify({ playerToken })
    });
    await loadPlayers();
    await loadGameState();
    showNotification("Играчът е премахнат!");
  } catch (err) {
    showNotification(err.message, "error");
  }
}

function exportQuestions() {
  const dataStr = JSON.stringify(questions, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "questions.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification("Въпросите са изтеглени!");
}

function importQuestions(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedQuestions = JSON.parse(e.target.result);
      
      if (!Array.isArray(importedQuestions)) {
        throw new Error("Невалиден формат на файла");
      }

      const result = await apiRequest("/api/admin/questions/import", {
        method: "POST",
        body: JSON.stringify({ questions: importedQuestions })
      });

      await loadQuestions();
      showNotification(`Импортирани ${importedQuestions.length} въпроса!`);
    } catch (err) {
      showNotification(err.message, "error");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function switchSection(section) {
  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === section);
  });

  document.querySelectorAll(".admin-section").forEach((sec) => {
    sec.classList.toggle("hidden", sec.id !== `section-${section}`);
  });

  if (section === "game") {
    loadGameState();
    loadPlayers();
  } else if (section === "players") {
    loadPlayers();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("loginBtn").addEventListener("click", login);
  $("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  $("loginUsername").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  $("logoutBtn").addEventListener("click", logout);

  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });

  $("addQuestionBtn").addEventListener("click", addQuestion);
  $("clearFormBtn").addEventListener("click", clearForm);

  $("saveEditBtn").addEventListener("click", saveEdit);
  $("cancelEditBtn").addEventListener("click", closeEditModal);

  $("startGameBtn").addEventListener("click", startGame);
  $("nextGameBtn").addEventListener("click", nextQuestion);
  $("resetGameBtn").addEventListener("click", resetGame);

  $("exportBtn").addEventListener("click", exportQuestions);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", importQuestions);

  $("saveOrderBtn").addEventListener("click", saveOrder);

  $("editModal").addEventListener("click", (e) => {
    if (e.target.id === "editModal") closeEditModal();
  });

  checkAuth();
});
