const socket = io();

const isHostPage = location.pathname.endsWith("/host.html");

const LS_TOKEN_KEY = "ai_human_token";
const LS_NAME_KEY = "ai_human_name";
const LS_THEME_KEY = "ai_human_theme";
const LS_SOUND_KEY = "ai_human_sound";

let myToken = localStorage.getItem(LS_TOKEN_KEY) || "";
let myName = localStorage.getItem(LS_NAME_KEY) || "";
let currentState = null;
let myScore = 0;
let myRank = 0;
let myStreak = 0;
let answeredCurrent = false;
let wasKicked = false;
let reconnectAttempts = 0;
let lastQuestionId = null;
let lastTimerValue = 15;
let waitingForOthers = false;
let soundEnabled = localStorage.getItem(LS_SOUND_KEY) !== "false";
let kickedFromCurrentQuestion = false;
let musicManager = null;

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
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
  if (el) {
    el.classList.remove("hidden");
    el.style.display = "";
    el.style.visibility = "visible";
    el.style.opacity = "1";
  }
}

function hide(id) {
  const el = $(id);
  if (el) {
    el.classList.add("hidden");
    el.style.display = "none";
    el.style.visibility = "hidden";
    el.style.opacity = "0";
  }
}

function getRemainingSeconds(endsAt, nowMs = Date.now()) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
}

function getAvatarColor(name) {
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const adjectives = [
  "Бърз", "Умен", "Смел", "Ловък", "Таен", "Ярък", "Див", "Спокоен",
  "Елегантен", "Дързък", "Гениален", "Легендарен", "Мистериозен", "Революционен",
  "Невероятен", "Феноменален", "Епичен", "Леко", "Тъп", "Мек", "Топъл",
  "Студен", "Горещ", "Блестящ", "Тъмeн", "Светъл", "Тих", "Гръмовен",
  "Космически", "Атомен", "Квантов", "Цифров", "Виртуален", "Реален",
  "Кралски", "Принцов", "Рицарски", "Магически", "Драконов", "Феникс"
];

const nouns = [
  "Кодер", "Хакер", "Програмист", "Разработчик", "Инженер", "Архитект",
  "Магьосник", "Робот", "Агент", "Воин", "Шпионин", "Детектив",
  "Пират", "Капитан", "Адмирал", "Генерал", "Снайперист", "Нинджа",
  "Самурай", "Викинг", "Бард", "Маг", "Странник", "Пътешественик",
  "Изследовател", "Откривател", "Пионер", "Визионер", "Легенда",
  "Фантом", "Призрак", "Дух", "Сянка", "Мъгла", "Буря", "Мълния",
  "Комета", "Метеор", "Сателит", "Космос", "Вселена", "Галактика"
];

function generateRandomNickname() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 99) + 1;
  return `${adj}${noun}${number}`;
}

function getCleanNickname(name) {
  if (typeof ProfanityFilter !== "undefined" && ProfanityFilter.isProfane) {
    return ProfanityFilter.clean(name);
  }
  return name.replace(/[^a-zA-Zа-яА-Я0-9\u0400-\u04FF\s]/g, "").trim();
}

function updateConnectionStatus(status) {
  const dot = $("connectionDot");
  const text = $("connectionText");
  if (!dot || !text) return;

  dot.classList.remove("disconnected", "reconnecting");
  
  switch (status) {
    case "connected":
      dot.classList.add("connected");
      text.textContent = LanguageManager.t("connected");
      reconnectAttempts = 0;
      break;
    case "disconnected":
      dot.classList.add("disconnected");
      text.textContent = LanguageManager.t("disconnected");
      break;
    case "reconnecting":
      dot.classList.add("reconnecting");
      text.textContent = `${LanguageManager.t("reconnecting")} (${reconnectAttempts})`;
      break;
  }
}

let pauseCountdownInterval = null;

function showPauseOverlay(seconds, leaderboard, correctAnswer) {
  let remaining = seconds;
  
  const overlay = $("pauseOverlay");
  if (!overlay) return;
  
  overlay.classList.remove("hidden");
  
  const countdown = $("pauseCountdown");
  if (countdown) countdown.textContent = remaining;
  
  const leaderboardEl = $("pauseLeaderboard");
  if (leaderboardEl && leaderboard) {
    leaderboardEl.innerHTML = leaderboard.slice(0, 10).map((p, i) => {
      const isMe = p.token === myToken;
      const rankClass = i === 0 ? "top-1" : i === 1 ? "top-2" : i === 2 ? "top-3" : "";
      const initial = p.name ? p.name.charAt(0).toUpperCase() : "?";
      return `
        <div class="pause-leaderboard-item${isMe ? " is-me" : ""}">
          <span class="pause-rank ${rankClass}">${i + 1}</span>
          <span class="pause-avatar">${initial}</span>
          <span class="pause-name">${escapeHtml(p.name)}</span>
          <span class="pause-score">${p.score} т.</span>
        </div>
      `;
    }).join("");
  }
  
  const answerReveal = $("pauseAnswerReveal");
  const answerText = $("revealAnswerText");
  if (answerReveal && answerText && correctAnswer) {
    answerReveal.classList.remove("hidden");
    answerText.textContent = correctAnswer;
  } else if (answerReveal) {
    answerReveal.classList.add("hidden");
  }
  
  if (pauseCountdownInterval) clearInterval(pauseCountdownInterval);
  pauseCountdownInterval = setInterval(() => {
    remaining--;
    if (countdown) countdown.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(pauseCountdownInterval);
      pauseCountdownInterval = null;
    }
  }, 1000);
}

function updatePauseCountdown(seconds) {
  const countdown = $("pauseCountdown");
  if (countdown) countdown.textContent = seconds;
}

function hidePauseOverlay() {
  const overlay = $("pauseOverlay");
  if (overlay) overlay.classList.add("hidden");
  if (pauseCountdownInterval) {
    clearInterval(pauseCountdownInterval);
    pauseCountdownInterval = null;
  }
}

function triggerAnimation(element, animationClass, duration = 500) {
  if (!element) return;
  
  element.classList.remove(animationClass);
  void element.offsetWidth;
  element.classList.add(animationClass);
  
  setTimeout(() => {
    element.classList.remove(animationClass);
  }, duration);
}

function animateQuestionAppear() {
  const imagesWrap = $("imagesWrap");
  const answersGrid = $("answersGrid");
  
  if (imagesWrap) {
    imagesWrap.classList.remove("animate-in");
    void imagesWrap.offsetWidth;
    imagesWrap.classList.add("animate-in");
  }
  
  if (answersGrid) {
    triggerAnimation(answersGrid, "slide-up", 500);
  }
}

function createRipple(event, button) {
  if (!button) return;
  
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  
  ripple.style.width = ripple.style.height = size + "px";
  ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
  ripple.style.top = (event.clientY - rect.top - size / 2) + "px";
  
  button.appendChild(ripple);
  
  setTimeout(() => {
    if (ripple.parentNode) {
      ripple.parentNode.removeChild(ripple);
    }
  }, 600);
}

function updateTimerProgress(remainingSeconds, totalSeconds = 15) {
  const progress = (remainingSeconds / totalSeconds) * 100;
  const timerCircle = $("timerCircle");
  const timerProgress = $("timerProgress");
  
  if (timerCircle) {
    timerCircle.style.setProperty("--progress", progress);
    
    if (remainingSeconds <= 3 && remainingSeconds > 0) {
      timerCircle.classList.add("warning");
    } else {
      timerCircle.classList.remove("warning");
    }
  }
  
  if (timerProgress) {
    timerProgress.style.setProperty("--progress", progress);
  }
  
  if (remainingSeconds <= 3 && remainingSeconds > 0 && remainingSeconds !== lastTimerValue) {
    if (soundEnabled) SoundManager.playCountdownBeep();
  }
  
  if (remainingSeconds === 0 && lastTimerValue > 0) {
    if (soundEnabled) SoundManager.playTimeUpSound();
  }
  
  lastTimerValue = remainingSeconds;
}

function clearCorrectBlink() {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.classList.remove("correct-blink", "correct", "wrong", "submitted");
    btn.style.opacity = "";
    btn.style.transform = "";
    btn.style.border = "";
    btn.style.boxShadow = "";
    btn.disabled = false;
  });
}

function highlightCorrectAnswer(correctChoice) {
  clearCorrectBlink();

  if (typeof correctChoice !== "number") return;

  const btns = document.querySelectorAll(".answer-btn");
  btns.forEach(btn => {
    const choice = Number(btn.getAttribute("data-choice"));
    if (choice === correctChoice) {
      btn.classList.add("correct");
      triggerAnimation(btn, "glow", 1500);
    } else {
      btn.classList.add("wrong");
    }
  });
}

function disableAnswerButtons(disabled) {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.disabled = disabled;
  });
}

function getMedalHtml(rank) {
  switch (rank) {
    case 1: return '<span class="medal">🥇</span>';
    case 2: return '<span class="medal">🥈</span>';
    case 3: return '<span class="medal">🥉</span>';
    default: return '';
  }
}

function getRankBadgeHtml(rank) {
  if (rank > 3) return '';
  
  const className = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
  return `<span class="rank-badge ${className}">${rank}</span>`;
}

function getAvatarHtml(name, size = 32) {
  const color = getAvatarColor(name);
  const initials = name.slice(0, 2).toUpperCase();
  return `<span class="avatar" style="background:${color};width:${size}px;height:${size}px;font-size:${size * 0.4}px;">${initials}</span>`;
}

function getStreakHtml(streak) {
  if (streak <= 1) return '';
  return `<span class="streak-badge" title="Серия">🔥 ${streak}</span>`;
}

function renderMiniLeaderboard(rows, targetId) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = rows
    .slice(0, 5)
    .map(
      (p, i) => {
        const isMe = p.token === myToken;
        const rank = i + 1;
        return `
          <div class="lb-row ${isMe ? 'highlight' : ''}" role="listitem">
            ${getAvatarHtml(p.name, 24)}
            ${getMedalHtml(rank)}
            <span>${escapeHtml(p.name)}</span>
            ${getStreakHtml(p.streak || 0)}
            <strong>${p.score}</strong>
          </div>
        `;
      }
    )
    .join("");

  updateYourRankIndicator();
  updateAnsweredCount();
}

function updateAnsweredCount() {
  const answeredEl = $("answeredCount");
  if (answeredEl && currentState) {
    const answered = currentState.answeredPlayers || 0;
    const total = currentState.totalPlayers || 0;
    answeredEl.textContent = `${answered}/${total} отговориха`;
  }
}

function updateYourRankIndicator() {
  const indicator = $("yourRankIndicator");
  if (!indicator || myRank <= 0) {
    if (indicator) indicator.innerHTML = '';
    return;
  }

  if (myRank <= 3) {
    indicator.innerHTML = `${getMedalHtml(myRank)} <span class="rank-badge ${myRank === 1 ? 'gold' : myRank === 2 ? 'silver' : 'bronze'}">${myRank}</span>`;
  } else {
    indicator.innerHTML = `<span style="color: var(--blue);">↑ ${myRank}</span>`;
  }
}

function updateStreakIndicator() {
  const streakEl = $("streakIndicator");
  if (streakEl) {
    if (myStreak > 1) {
      const flames = myStreak >= 5 ? "🔥🔥🔥" : myStreak >= 3 ? "🔥🔥" : "🔥";
      streakEl.innerHTML = `${flames} Серия: ${myStreak}`;
      streakEl.className = "streak-indicator";
      if (myStreak >= 3) {
        streakEl.classList.add("streak-hot");
        triggerAnimation(streakEl, "streak-pulse", 600);
      } else {
        triggerAnimation(streakEl, "pulse", 500);
      }
    } else {
      streakEl.innerHTML = '';
      streakEl.className = "streak-indicator";
    }
  }
}

function renderFullLeaderboard(rows, targetId) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = rows
    .map(
      (p, i) => {
        const isMe = p.token === myToken;
        const rank = i + 1;
        const isTop3 = rank <= 3;
        return `
          <div class="rank-row ${isMe ? 'current-player' : ''} ${isTop3 ? 'top-' + rank : ''}" role="listitem">
            <span>
              ${getAvatarHtml(p.name, 28)}
              ${getRankBadgeHtml(rank)}
              ${getMedalHtml(rank)}
              ${escapeHtml(p.name)}
              ${getStreakHtml(p.streak || 0)}
            </span>
            <strong>${p.score} т.</strong>
          </div>
        `;
      }
    )
    .join("");
}

function setStatus(text, type = "") {
  const el = $("statusBox");
  if (el) {
    el.textContent = text;
    el.className = "status-box";
    if (type) el.classList.add(type);
  }
}

function resetToJoinScreen(message) {
  answeredCurrent = false;
  currentState = null;
  myToken = "";
  myScore = 0;
  myRank = 0;
  myStreak = 0;
  wasKicked = true;
  waitingForOthers = false;
  tabSwitchCount = 0;
  fullscreenExitCount = 0;
  devToolsOpenCount = 0;

  localStorage.removeItem(LS_TOKEN_KEY);

  setText("playerScore", "0");
  setText("playerRank", "-");
  setText("finalMyScore", "0");
  setText("joinError", message || LanguageManager.t("removedFromGame"));
  setStatus("");
  clearCorrectBlink();
  disableAnswerButtons(true);
  updateStreakIndicator();

  show("joinScreen");
  hide("gameScreen");
  hide("podiumScreen");
}

let isFullscreenRequired = false;
let fullscreenWarningShown = false;

function requestFullscreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen().catch(() => {});
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

function handleFullscreenChange() {
  if (isFullscreenRequired && !isFullscreen()) {
    if (gameState && (gameState.state === "question" || gameState.state === "reveal")) {
      socket.emit("player:exitFullscreen", {});
      showFullscreenExitWarning();
    }
  }
}

function showFullscreenExitWarning() {
  if (fullscreenWarningShown) return;
  fullscreenWarningShown = true;
  
  Notifications.warning("Напуснахте fullscreen! Няма да можете да продължите.");
  
  const warning = document.createElement("div");
  warning.className = "fullscreen-warning";
  warning.innerHTML = `
    <div class="fullscreen-warning-content">
      <h2>Напуснахте играта!</h2>
      <p>Напускането на fullscreen по време на играта не е позволено.</p>
      <p>Вашият отговор е анулиран.</p>
    </div>
  `;
  document.body.appendChild(warning);
}

function setCode(id, value) {
  const el = $(id);
  if (!el) return;

  const lines = String(value || "").split("\n");
  el.innerHTML = lines
    .map(
      (line, index) => `
        <div class="code-line">
          <span class="line-number">${index + 1}</span>
          <span class="line-content">${escapeHtml(line)}</span>
        </div>
      `
    )
    .join("");
}

function joinGame() {
  const gameCode = $("gameCodeInput")?.value.trim().toUpperCase() || "";
  const name = $("nameInput").value.trim();

  if (!gameCode) {
    setText("joinError", LanguageManager.t("enterCode"));
    Notifications.error(LanguageManager.t("enterCode"));
    return;
  }

  if (!name) {
    setText("joinError", LanguageManager.t("enterName"));
    Notifications.error(LanguageManager.t("enterName"));
    return;
  }

  myName = name;
  wasKicked = false;
  localStorage.setItem(LS_NAME_KEY, myName);

  if (!socket.connected) {
    socket.connect();
  }

  socket.emit("player:join", {
    token: myToken,
    name: myName,
    gameCode: gameCode
  });

  SoundManager.playButtonClickSound();
}

function tryReconnect() {
  if (isHostPage) return;
  if (!myToken || !myName) return;

  socket.emit("player:reconnect", {
    token: myToken
  });
}

function handleAnswerSubmit(choice, button) {
  if (answeredCurrent || currentState?.state !== "question") return;
  
  if (kickedFromCurrentQuestion) {
    Notifications.warning("Бяхте премахнат от този въпрос. Изчакайте следващия.");
    return;
  }

  answeredCurrent = true;
  waitingForOthers = true;
  if (button) button.classList.add("submitted");
  
  if (soundEnabled) SoundManager.playButtonClickSound();
  
  socket.emit("player:answer", { choice });
  
  setStatus(LanguageManager.t("waitingOthers"));
}

function renderMultipleChoiceOptions(opts) {
  const container = $("mcOptionsContainer");
  if (!container) return;
  
  const options = opts.options || [];
  container.innerHTML = options.map((opt, i) => `
    <button class="answer-btn mc-answer-btn" data-choice="${i}" style="display: block; width: 100%; margin-bottom: 8px;">
      ${escapeHtml(opt)}
    </button>
  `).join("");
  
  container.querySelectorAll(".mc-answer-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      createRipple(e, btn);
      const choice = Number(btn.getAttribute("data-choice"));
      handleAnswerSubmit(choice, btn);
    });
  });
}

function submitTypeAnswer() {
  const input = $("typeAnswerInput");
  if (!input) return;
  const answer = input.value.trim();
  if (!answer) {
    Notifications.warning("Моля, въведете вашия отговор.");
    return;
  }
  handleAnswerSubmit(answer, null);
}

function updateSliderDisplay(value) {
  const display = $("sliderValueDisplay");
  if (display) display.textContent = value;
}

function submitSliderAnswer() {
  const slider = $("answerSlider");
  if (!slider) return;
  handleAnswerSubmit(parseFloat(slider.value), null);
}

function submitTrueFalseAnswer(value) {
  handleAnswerSubmit(value, null);
}

function submitNumericAnswer() {
  const input = $("numericAnswerInput");
  if (!input) return;
  const answer = parseFloat(input.value);
  if (isNaN(answer)) {
    Notifications.warning("Моля, въведете валидно число.");
    return;
  }
  handleAnswerSubmit(answer, null);
}

function renderFillBlankInputs(opts) {
  const container = $("fillBlankInputs");
  if (!container) return;
  
  const text = opts.text || opts.questionText || "";
  const answers = opts.answers || [];
  const blanksCount = answers.length || (text.match(/___/g) || []).length || 1;
  
  const parts = text.split(/(___)/);
  let blankIndex = 0;
  
  container.innerHTML = parts.map(part => {
    if (part === "___") {
      const idx = blankIndex++;
      return `<input type="text" class="form-input fill-blank-input" data-index="${idx}" placeholder="Попълни..." style="display: inline-block; width: auto; min-width: 150px; margin: 0 4px;" />`;
    }
    return escapeHtml(part);
  }).join("") + `<button id="submitFillBlankBtn" class="primary-btn" style="margin-top: 16px; width: 100%;">Потвърди</button>`;
  
  const submitBtn = $("submitFillBlankBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitFillBlankAnswer);
  }
  
  container.querySelectorAll(".fill-blank-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        submitFillBlankAnswer();
      }
    });
  });
}

function submitFillBlankAnswer() {
  const container = $("fillBlankInputs");
  if (!container) return;
  
  const inputs = container.querySelectorAll(".fill-blank-input");
  const answers = [];
  inputs.forEach((input) => answers.push(input.value.trim()));
  
  if (answers.some(a => !a)) {
    Notifications.warning("Моля, попълнете всички полета.");
    return;
  }
  
  handleAnswerSubmit(answers, null);
}

function renderMatchingGame(opts) {
  const container = $("matchingContainer");
  if (!container) return;
  
  const matches = opts.matches || [];
  const leftItems = matches.map(m => m.left);
  const rightItems = [...matches.map(m => m.right)].sort(() => Math.random() - 0.5);
  
  container.innerHTML = `
    <p style="text-align: center; color: #94a3b8; margin-bottom: 16px;">Съедини правилните двойки</p>
    <div class="matching-grid">
      <div class="matching-left">
        ${leftItems.map((item, i) => `
          <div class="matching-item" data-index="${i}" data-value="${escapeHtml(item)}">${escapeHtml(item)}</div>
        `).join("")}
      </div>
      <div class="matching-right">
        ${rightItems.map((item, i) => `
          <div class="matching-drop-zone" data-value="${escapeHtml(item)}">${escapeHtml(item)}</div>
        `).join("")}
      </div>
    </div>
    <button id="submitMatchingBtn" class="primary-btn" style="margin-top: 20px; width: 100%;">Потвърди</button>
  `;
  
  let selectedItem = null;
  let currentMatches = {};
  
  container.querySelectorAll(".matching-item").forEach((item) => {
    item.addEventListener("click", () => {
      container.querySelectorAll(".matching-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      selectedItem = item;
    });
  });
  
  container.querySelectorAll(".matching-drop-zone").forEach((zone) => {
    zone.addEventListener("click", () => {
      if (selectedItem) {
        const leftValue = selectedItem.dataset.value;
        const rightValue = zone.dataset.value;
        currentMatches[leftValue] = rightValue;
        zone.classList.add("filled");
        selectedItem.classList.add("matched");
        selectedItem.classList.remove("selected");
        selectedItem = null;
      }
    });
  });
  
  const submitBtn = $("submitMatchingBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      handleAnswerSubmit(currentMatches, null);
    });
  }
}

function renderDragDropGame(opts) {
  const container = $("dragdropContainer");
  if (!container) return;
  
  const items = opts.items || [];
  
  container.innerHTML = `
    <div class="dragdrop-source" id="dragdropSource">
      ${items.map((item, i) => `
        <div class="dragdrop-item" draggable="true" data-index="${i}">${escapeHtml(item)}</div>
      `).join("")}
    </div>
    <div class="dragdrop-target" id="dragdropTarget">
      <div class="dragdrop-placeholder">Пуснете елементите тук</div>
    </div>
    <button id="submitDragdropBtn" class="primary-btn" style="margin-top: 20px; width: 100%;">Потвърди</button>
  `;
  
  let droppedOrder = [];
  const source = $("dragdropSource");
  const target = $("dragdropTarget");
  
  if (source) {
    source.querySelectorAll(".dragdrop-item").forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.dataset.index);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
      });
    });
  }
  
  if (target) {
    target.addEventListener("dragover", (e) => {
      e.preventDefault();
      target.classList.add("dragover");
    });
    target.addEventListener("dragleave", () => {
      target.classList.remove("dragover");
    });
    target.addEventListener("drop", (e) => {
      e.preventDefault();
      target.classList.remove("dragover");
      const index = e.dataTransfer.getData("text/plain");
      const item = source.querySelector(`[data-index="${index}"]`);
      if (item) {
        const clone = item.cloneNode(true);
        clone.classList.add("dropped");
        target.appendChild(clone);
        droppedOrder.push(index);
      }
    });
  }
  
  const submitBtn = $("submitDragdropBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      if (droppedOrder.length === 0) {
        Notifications.warning("Моля, подредете елементите.");
        return;
      }
      handleAnswerSubmit(droppedOrder, null);
    });
  }
}

function disableAnswerButtons(disabled) {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.disabled = disabled;
    if (disabled) {
      btn.classList.add("disabled");
    } else {
      btn.classList.remove("disabled");
    }
  });
  
  const tfTrueBtn = $("tfTrueBtn");
  if (tfTrueBtn) {
    tfTrueBtn.disabled = disabled;
    if (disabled) tfTrueBtn.classList.add("disabled");
    else tfTrueBtn.classList.remove("disabled");
  }
  const tfFalseBtn = $("tfFalseBtn");
  if (tfFalseBtn) {
    tfFalseBtn.disabled = disabled;
    if (disabled) tfFalseBtn.classList.add("disabled");
    else tfFalseBtn.classList.remove("disabled");
  }
  
  const taInput = $("typeAnswerInput");
  if (taInput) taInput.disabled = disabled;
  const taBtn = $("submitTypeAnswerBtn");
  if (taBtn) taBtn.disabled = disabled;
  const slider = $("answerSlider");
  if (slider) slider.disabled = disabled;
  const sliderBtn = $("submitSliderBtn");
  if (sliderBtn) sliderBtn.disabled = disabled;
}

function renderPlayerState(state) {
  const previousState = currentState?.state;
  currentState = state;
  if (!state) return;

  if (!musicManager && typeof MusicManager !== "undefined") {
    musicManager = new MusicManager();
    musicManager.init();
  }

  if (previousState === "lobby" && state.state === "question") {
    isFullscreenRequired = true;
    fullscreenWarningShown = false;
    requestFullscreen();
    if (musicManager) musicManager.playQuestion();
  }

  if (previousState === "ready" && state.state === "question") {
    isFullscreenRequired = true;
    fullscreenWarningShown = false;
    requestFullscreen();
    if (musicManager) musicManager.playQuestion();
  }

  if (previousState === "question" && state.state === "lobby") {
    if (musicManager) musicManager.playLobby();
  }

  if (state.state === "ready") {
    hidePauseOverlay();
    show("gameScreen");
    hide("joinScreen");
    hide("podiumScreen");
    setStatus("Изчакайте началото на играта...");
    disableAnswerButtons(true);
    isFullscreenRequired = true;
    fullscreenWarningShown = false;
    requestFullscreen();
    
    hide("codePanels");
    hide("questionTextPanel");
    hide("typeAnswerPanel");
    hide("sliderPanel");
    hide("trueFalsePanel");
    hide("multipleChoicePanel");
    hide("fillBlankPanel");
    hide("matchingPanel");
    hide("numericPanel");
    hide("hotspotPanel");
    hide("dragdropPanel");
    
    setText("questionNumber", 0);
    setText("questionTotal", state.totalQuestions);
    
    const timerCircle = $("timerCircle");
    if (timerCircle) timerCircle.style.display = "none";
    return;
  }

  if (previousState === "lobby" && state.state === "question") {
    isFullscreenRequired = true;
    fullscreenWarningShown = false;
    requestFullscreen();
  }

  if (previousState === "ready" && state.state === "question") {
    isFullscreenRequired = true;
    fullscreenWarningShown = false;
    requestFullscreen();
  }

  if (previousState === "question" && (state.state === "reveal" || state.state === "pause" || state.state === "lobby")) {
    isFullscreenRequired = true;
  }

  if (state.state === "pause") {
    hide("codePanels");
    hide("questionTextPanel");
    hide("typeAnswerPanel");
    hide("sliderPanel");
    hide("trueFalsePanel");
    hide("multipleChoicePanel");
    hide("fillBlankPanel");
    hide("matchingPanel");
    hide("numericPanel");
    hide("hotspotPanel");
    hide("dragdropPanel");
    hide("answersGrid");
    disableAnswerButtons(true);
    
    const timerCircle = $("timerCircle");
    if (timerCircle) timerCircle.style.display = "none";
    
    const pauseSeconds = state.pauseEndsAt ? Math.ceil((state.pauseEndsAt - Date.now()) / 1000) : 5;
    const correctAnswer = state.question ? state.question.correctText : null;
    showPauseOverlay(Math.max(1, pauseSeconds), state.leaderboard, correctAnswer);
    return;
  }

  if (state.state === "finished" || state.state === "lobby") {
    isFullscreenRequired = false;
    const warning = document.querySelector(".fullscreen-warning");
    if (warning) warning.remove();
  }

  if (state.state === "finished") {
    hide("gameScreen");
    hide("joinScreen");
    show("podiumScreen");

    setText("finalMyScore", myScore);
    clearCorrectBlink();

    if (soundEnabled) SoundManager.playGameEndSound();
    if (musicManager) {
      musicManager.stop();
      const myPosition = state.leaderboard.findIndex(p => p.token === myToken) + 1;
      musicManager.playVictory(myPosition);
    }

    const confettiContainer = $("confettiContainer");
    if (confettiContainer) {
      Confetti.winnerCelebration(confettiContainer);
    }

    const podiumGrid = $("podiumGrid");
    if (podiumGrid) {
      const top3 = state.leaderboard.slice(0, 3);
      const classes = ["second", "first", "third"];
      const myPosition = state.leaderboard.findIndex(p => p.token === myToken) + 1;
      const isTop3 = myPosition > 0 && myPosition <= 3;

      if (isTop3) {
        Confetti.burst(confettiContainer, 150);
      }

      podiumGrid.innerHTML = top3
        .map(
          (p, i) => `
            <div class="podium-place ${classes[i]}" role="listitem">
              ${i === 1 ? '<div class="podium-crown">👑</div>' : ''}
              ${getAvatarHtml(p.name, 48)}
              <div class="place-rank">${i + 1}</div>
              <div class="place-name">${escapeHtml(p.name)}</div>
              <div class="place-score">${p.score} т.</div>
            </div>
          `
        )
        .join("");
    }

    renderFullLeaderboard(state.leaderboard, "finalLeaderboard");
    
    if (typeof AccessibilityManager !== 'undefined') {
      AccessibilityManager.announce(LanguageManager.t("gameEnded") + " " + LanguageManager.t("youScored") + " " + myScore + " " + LanguageManager.t("points") + ".");
    }
    return;
  }

  hide("podiumScreen");
  hide("joinScreen");
  hidePauseOverlay();
  show("gameScreen");

  setText(
    "questionNumber",
    state.currentQuestionIndex >= 0 ? state.currentQuestionIndex + 1 : 0
  );
  setText("questionTotal", state.totalQuestions);

  const isNewQuestion = state.question && state.question.id !== lastQuestionId;
  lastQuestionId = state.question?.id;

  const qType = state.question?.questionType || "code";

  if (state.question) {
    hide("codePanels");
    hide("questionTextPanel");
    hide("typeAnswerPanel");
    hide("sliderPanel");
    hide("trueFalsePanel");
    hide("multipleChoicePanel");
    hide("fillBlankPanel");
    hide("matchingPanel");
    hide("numericPanel");
    hide("hotspotPanel");
    hide("dragdropPanel");
    
    if (qType === "code") {
      show("codePanels");
      const leftCode = state.question.leftCode || "";
      const rightCode = state.question.rightCode || "";
      
      if (!leftCode) {
        setCode("leftCode", "Няма код за показване");
      } else {
        setCode("leftCode", leftCode);
      }
      
      if (!rightCode) {
        setCode("rightCode", "Няма код за показване");
      } else {
        setCode("rightCode", rightCode);
      }
      
      setText("leftCodeTitle", state.question.leftTitle || "Ляв код");
      setText("rightCodeTitle", state.question.rightTitle || "Десен код");
    } else if (qType === "multiple_choice") {
      show("multipleChoicePanel");
      setText("mcQuestionText", state.question.questionText || "");
      renderMultipleChoiceOptions(state.question.questionOptions || {});
    } else if (qType === "true_false") {
      show("trueFalsePanel");
      setText("tfQuestionText", state.question.questionText || "");
    } else if (qType === "type_answer") {
      show("typeAnswerPanel");
      setText("taQuestionText", state.question.questionText || "");
      const taInput = $("typeAnswerInput");
      if (taInput) taInput.value = "";
    } else if (qType === "slider") {
      show("sliderPanel");
      setText("sliderQuestionText", state.question.questionText || "");
      const opts = state.question.questionOptions || {};
      const sliderEl = $("answerSlider");
      if (sliderEl) {
        sliderEl.min = opts.min || 0;
        sliderEl.max = opts.max || 100;
        sliderEl.value = opts.default || 50;
        updateSliderDisplay(opts.default || 50);
      }
    } else if (qType === "fill_blank") {
      show("fillBlankPanel");
      setText("fillBlankText", state.question.questionText || "");
      renderFillBlankInputs(state.question.questionOptions || {});
    } else if (qType === "matching") {
      show("matchingPanel");
      setText("matchingQuestionText", state.question.questionText || "");
      renderMatchingGame(state.question.questionOptions || {});
    } else if (qType === "numeric") {
      show("numericPanel");
      setText("numericQuestionText", state.question.questionText || "");
      const numericInput = $("numericAnswerInput");
      if (numericInput) numericInput.value = "";
    } else if (qType === "hotspot") {
      show("hotspotPanel");
      setText("hotspotQuestionText", state.question.questionText || "");
      const hotspotImg = $("hotspotImage");
      if (hotspotImg) hotspotImg.src = state.question.questionOptions?.imageUrl || "";
    } else if (qType === "dragdrop") {
      show("dragdropPanel");
      setText("dragdropQuestionText", state.question.questionText || "");
      renderDragDropGame(state.question.questionOptions || {});
    } else {
      show("codePanels");
      const leftCode = state.question.leftCode || "";
      const rightCode = state.question.rightCode || "";
      
      if (!leftCode) {
        setCode("leftCode", "Няма код за показване");
      } else {
        setCode("leftCode", leftCode);
      }
      
      if (!rightCode) {
        setCode("rightCode", "Няма код за показване");
      } else {
        setCode("rightCode", rightCode);
      }
      
      setText("leftCodeTitle", state.question.leftTitle || "Ляв код");
      setText("rightCodeTitle", state.question.rightTitle || "Десен код");
    }

    if (isNewQuestion) {
      clearCorrectBlink();
      animateQuestionAppear();
      if (previousState !== "question") {
        if (soundEnabled) SoundManager.playQuestionStartSound();
        answeredCurrent = false;
        waitingForOthers = false;
        kickedFromCurrentQuestion = false;
      }
    }
  } else {
    hide("codePanels");
    hide("questionTextPanel");
    hide("typeAnswerPanel");
    hide("sliderPanel");
    hide("trueFalsePanel");
    hide("multipleChoicePanel");
    hide("fillBlankPanel");
    hide("matchingPanel");
    hide("numericPanel");
    hide("hotspotPanel");
    hide("dragdropPanel");
  }

  if (state.state === "lobby") {
    setStatus(LanguageManager.t("waitingHost"));
    disableAnswerButtons(true);
    setText("timerValue", "15");
    clearCorrectBlink();
    lastTimerValue = 15;
    updateTimerProgress(15);
    waitingForOthers = false;
  } else if (state.state === "question") {
    const timerCircle = $("timerCircle");
    if (timerCircle) timerCircle.style.display = "grid";
    
    if (isNewQuestion) {
      clearCorrectBlink();
      disableAnswerButtons(false);
    }
    if (kickedFromCurrentQuestion) {
      disableAnswerButtons(true);
      setStatus(LanguageManager.t("kickedFromQuestion") || "Бяхте премахнат. Изчакайте следващия въпрос.");
    } else if (!answeredCurrent && !waitingForOthers) {
      setStatus(LanguageManager.t("selectAnswer"));
    } else {
      disableAnswerButtons(true);
    }
    const seconds = getRemainingSeconds(state.questionEndsAt, state.now || Date.now());
    setText("timerValue", seconds);
    updateTimerProgress(seconds);
  } else if (state.state === "reveal") {
    disableAnswerButtons(true);
    setText("timerValue", "0");
    updateTimerProgress(0);
    highlightCorrectAnswer(state.question?.correctChoice);
    waitingForOthers = false;
  }

  renderMiniLeaderboard(state.leaderboard, "leaderboardMini");
  updateAnsweredCount();
}

function renderHostState(state) {
  currentState = state;
  if (!state) return;

  setText("hostState", state.state);
  setText("hostPlayersCount", state.playersCount);
  setText(
    "hostQuestionInfo",
    `${state.currentQuestionIndex >= 0 ? state.currentQuestionIndex + 1 : 0}/${state.totalQuestions}`
  );
  setText("hostAnswered", state.answeredPlayers ?? 0);
  setText("hostUnanswered", (state.totalPlayers ?? 0) - (state.answeredPlayers ?? 0));

  const progressPercent = state.playersCount > 0 
    ? Math.round(((state.answeredPlayers ?? 0) / state.playersCount) * 100) 
    : 0;
  
  const answeredProgress = $("answeredProgress");
  if (answeredProgress) {
    const progressFill = answeredProgress.querySelector(".progress-bar-fill");
    if (progressFill) {
      progressFill.style.width = progressPercent + "%";
    }
  }

  if (state.question) {
    setCode("hostLeftCode", state.question.leftCode);
    setCode("hostRightCode", state.question.rightCode);
    setText("hostLeftCodeTitle", state.question.leftTitle || "Ляв код");
    setText("hostRightCodeTitle", state.question.rightTitle || "Десен код");
    setText("correctAnswerText", state.question.correctText);
  } else {
    setCode("hostLeftCode", "");
    setCode("hostRightCode", "");
    setText("hostLeftCodeTitle", "Ляв код");
    setText("hostRightCodeTitle", "Десен код");
    setText("correctAnswerText", "-");
  }

  if (state.state === "question") {
    const seconds = getRemainingSeconds(state.questionEndsAt, state.now || Date.now());
    setText("hostTimer", seconds);
  } else if (state.state === "reveal") {
    setText("hostTimer", "0");
  } else if (state.state === "lobby") {
    setText("hostTimer", "15");
  } else {
    setText("hostTimer", "0");
  }

  const lb = $("leaderboardHost");
  if (lb) {
    lb.innerHTML = state.leaderboard
      .map(
        (p, i) => {
          const rank = i + 1;
          return `
            <div class="player-row">
              <span>
                ${getAvatarHtml(p.name, 24)}
                ${getRankBadgeHtml(rank)}
                ${escapeHtml(p.name)}
                ${getStreakHtml(p.streak || 0)}
              </span>
              <strong>${p.score}</strong>
            </div>
          `;
        }
      )
      .join("");
  }

  const nextBtn = $("nextBtn");
  if (nextBtn) {
    if (state.state === "question") {
      nextBtn.textContent = "Прекрати въпроса";
    } else if (state.state === "reveal") {
      nextBtn.textContent = "Следващ въпрос";
    } else {
      nextBtn.textContent = "Следващ";
    }
  }
}

function renderPlayersList(rows) {
  if (isHostPage) {
    const target = $("playersList");
    if (!target) return;

    target.innerHTML = rows
      .map(
        (p, i) => {
          const rank = i + 1;
          return `
            <div class="player-row">
              <div>
                ${getAvatarHtml(p.name, 32)}
                ${getRankBadgeHtml(rank)}
                <strong>${escapeHtml(p.name)}</strong>
                ${getStreakHtml(p.streak || 0)}<br />
                <small>${p.score} т. | ${p.correctCount} верни | ${p.answeredCount}/${currentState?.totalQuestions || '?'} отг.</small>
              </div>
              <button class="kick-btn" data-kick="${p.token}" aria-label="Премахни ${p.name}">✕</button>
            </div>
          `
        }
      )
      .join("");

    target.querySelectorAll("[data-kick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const token = btn.getAttribute("data-kick");
        socket.emit("host:kickPlayer", { token });
      });
    });
  } else {
    renderMiniLeaderboard(rows, "leaderboardMini");

    const me = rows.find((p) => p.token === myToken);
    if (me) {
      myScore = me.score;
      myRank = rows.findIndex((x) => x.token === myToken) + 1;
      myStreak = me.streak || 0;
      setText("playerScore", myScore);
      setText("playerRank", myRank || "-");
      updateYourRankIndicator();
      updateStreakIndicator();
    }
  }
}

socket.on("connect", () => {
  updateConnectionStatus("connected");
  if (!isHostPage) {
    tryReconnect();
  }
});

socket.on("disconnect", () => {
  updateConnectionStatus("disconnected");
});

socket.on("reconnect_attempt", () => {
  reconnectAttempts++;
  updateConnectionStatus("reconnecting");
  Notifications.reconnecting(reconnectAttempts);
});

socket.on("reconnect", () => {
  updateConnectionStatus("connected");
  Notifications.reconnected();
});

socket.on("reconnect_failed", () => {
  updateConnectionStatus("disconnected");
  Notifications.connectionError();
});

socket.on("player:joined", ({ token, name }) => {
  myToken = token;
  myName = name;
  wasKicked = false;

  localStorage.setItem(LS_TOKEN_KEY, myToken);
  localStorage.setItem(LS_NAME_KEY, myName);

  setText("playerName", myName);
  setText("joinError", "");
  
  show("gameScreen");
  hide("joinScreen");
  
  SoundManager.init();
  if (musicManager) musicManager.playLobby();
  initProctoring();
});

socket.on("player:error", (message) => {
  setText("joinError", message || LanguageManager.t("connectionError"));
  Notifications.error(message || LanguageManager.t("connectionError"));
});

socket.on("player:kicked", (message) => {
  if (isHostPage) return;
  resetToJoinScreen(message || LanguageManager.t("kicked"));
  Notifications.warning(LanguageManager.t("kicked"));
});

socket.on("player:disqualified", (data) => {
  if (isHostPage) return;
  
  isFullscreenRequired = false;
  disableAnswerButtons(true);
  setStatus(data.reason || LanguageManager.t("disqualified"), "error");
  
  Notifications.error(data.reason || LanguageManager.t("disqualified"));
  
  exitFullscreen();
});

socket.on("player:banned", (data) => {
  resetToJoinScreen(`${LanguageManager.t("banned")}: ${data.reason || LanguageManager.t("unknownReason")}`);
  Notifications.error(LanguageManager.t("accessDenied"));
});

socket.on("game:state", (state) => {
  if (!isHostPage && !myToken) return;

  if (isHostPage) {
    renderHostState(state);
  } else {
    renderPlayerState(state);
  }
});

socket.on("players:update", (players) => {
  renderPlayersList(players);
});

socket.on("player:private", (data) => {
  if (typeof data.score === "number") {
    myScore = data.score;
    setText("playerScore", myScore);
  }

  if (typeof data.rank !== "undefined") {
    myRank = data.rank;
    setText("playerRank", myRank || "-");
    updateYourRankIndicator();
  }

  if (typeof data.streak !== "undefined") {
    myStreak = data.streak;
    updateStreakIndicator();
  }

  answeredCurrent = !!data.answeredCurrent;
  
  if (typeof data.kickedFromCurrentQuestion !== "undefined") {
    kickedFromCurrentQuestion = !!data.kickedFromCurrentQuestion;
  }

  if (!isHostPage && currentState) {
    const canAnswer = !answeredCurrent && currentState.state === "question" && !kickedFromCurrentQuestion;
    disableAnswerButtons(!canAnswer);
    if (kickedFromCurrentQuestion && currentState.state === "question") {
      setStatus(LanguageManager.t("kickedFromQuestion") || "Бяхте премахнат. Изчакайте следващия въпрос.");
    }
  }

  if (data.revealMessage && !isHostPage && currentState?.state === "reveal") {
    const isCorrect = data.revealMessage.includes("Вярно");
    setStatus(data.revealMessage, isCorrect ? "success" : "error");
    
    if (isCorrect) {
      if (soundEnabled) SoundManager.playSuccessSound();
      Notifications.success(data.revealMessage);
      const streakMatch = data.revealMessage.match(/Серия: (\d+)/);
      if (streakMatch && parseInt(streakMatch[1]) >= 3) {
        Notifications.streak(parseInt(streakMatch[1]));
      }
    } else {
      if (soundEnabled) SoundManager.playErrorSound();
      Notifications.error(LanguageManager.t("wrong"));
    }
  }
});

socket.on("game:timer", ({ remainingMs }) => {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (isHostPage) {
    setText("hostTimer", seconds);
  } else {
    setText("timerValue", seconds);
    updateTimerProgress(seconds);
    
    if (typeof AccessibilityManager !== "undefined" && seconds <= 5 && seconds > 0) {
      AccessibilityManager.announce(`${seconds} секунди`);
    }
  }
});

socket.on("game:pause", ({ remainingMs }) => {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  showPauseOverlay(seconds);
});

socket.on("game:pauseTimer", ({ remainingMs }) => {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  updatePauseCountdown(seconds);
});

socket.on("player:answer:ack", (data) => {
  answeredCurrent = true;
  waitingForOthers = true;
  disableAnswerButtons(true);
  
  if (data.waiting) {
    setStatus(LanguageManager.t("waitingOthers"));
  }
  
  Notifications.answerSubmitted();
});

function setupCopyButtons() {
  document.querySelectorAll(".copy-code-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      copyCodeToClipboard(targetId);
    });
  });
}

function setupAnswerButtons() {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      createRipple(e, btn);
      const choice = Number(btn.getAttribute("data-choice"));
      handleAnswerSubmit(choice, btn);
    });

    btn.addEventListener("touchstart", (e) => {
      createRipple(e, btn);
    }, { passive: true });
  });

  const tfTrueBtn = $("tfTrueBtn");
  if (tfTrueBtn) {
    tfTrueBtn.addEventListener("click", () => {
      handleAnswerSubmit(true, tfTrueBtn);
    });
  }

  const tfFalseBtn = $("tfFalseBtn");
  if (tfFalseBtn) {
    tfFalseBtn.addEventListener("click", () => {
      handleAnswerSubmit(false, tfFalseBtn);
    });
  }

  const submitTypeAnswerBtn = $("submitTypeAnswerBtn");
  if (submitTypeAnswerBtn) {
    submitTypeAnswerBtn.addEventListener("click", submitTypeAnswer);
  }

  const typeAnswerInput = $("typeAnswerInput");
  if (typeAnswerInput) {
    typeAnswerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitTypeAnswer();
      }
    });
  }

  const answerSlider = $("answerSlider");
  if (answerSlider) {
    answerSlider.addEventListener("input", () => {
      updateSliderDisplay(answerSlider.value);
    });
  }

  const submitSliderBtn = $("submitSliderBtn");
  if (submitSliderBtn) {
    submitSliderBtn.addEventListener("click", submitSliderAnswer);
  }
}

function setupKeyboardControls() {
  document.addEventListener("keydown", (e) => {
    if (isHostPage) return;
    
    if (!$("gameScreen") || $("gameScreen").classList.contains("hidden")) return;
    
    if (currentState?.state !== "question" || answeredCurrent) return;

    const keyMap = {
      "1": 0, "2": 1, "3": 2, "4": 3,
      "ArrowLeft": 0, "ArrowRight": 1,
      "a": 0, "d": 1, "A": 0, "D": 1,
      "q": 0, "e": 1, "Q": 0, "E": 1
    };

    if (keyMap.hasOwnProperty(e.key)) {
      e.preventDefault();
      const choice = keyMap[e.key];
      const btn = document.querySelector(`.answer-btn[data-choice="${choice}"]`);
      if (btn && !btn.disabled) {
        createRipple({ clientX: btn.getBoundingClientRect().left + btn.offsetWidth/2, clientY: btn.getBoundingClientRect().top + btn.offsetHeight/2 }, btn);
        handleAnswerSubmit(choice, btn);
      }
    }
  });
}

function showKeyboardShortcuts() {
  const shortcuts = [
    { key: "1-4", desc: "Избор на отговор" },
    { key: "A/D", desc: "Ляв/Десен отговор" },
    { key: "←/→", desc: "Ляв/Десен отговор" },
    { key: "Q/E", desc: "Ляв/Десен отговор" },
    { key: "Space", desc: "Пълнекран" },
    { key: "Esc", desc: "Настройки" }
  ];
  
  let html = '<div class="keyboard-shortcuts"><h3>Клавишни команди</h3><ul>';
  for (const { key, desc } of shortcuts) {
    html += `<li><kbd>${key}</kbd> <span>${desc}</span></li>`;
  }
  html += '</ul></div>';
  
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `<div class="modal-content keyboard-modal">${html}<button class="btn-primary modal-close-btn">Затвори</button></div>`;
  modal.querySelector('.modal-close-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function setupFullscreenHandlers() {
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("msfullscreenchange", handleFullscreenChange);
}

function initSettingsModal() {
  const settingsToggle = $("settingsToggle");
  const settingsModal = $("settingsModal");
  const settingsClose = $("settingsClose");
  const languageSelect = $("languageSelect");
  const soundToggleBtn = $("soundToggleBtn");
  const soundStatus = $("soundStatus");

  if (languageSelect) {
    languageSelect.value = LanguageManager.currentLang;
    languageSelect.addEventListener("change", (e) => {
      LanguageManager.setLang(e.target.value);
      updateAllTranslations();
    });
  }

  if (soundToggleBtn && soundStatus) {
    updateSoundToggleUI();
    
    soundToggleBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem(LS_SOUND_KEY, soundEnabled);
      updateSoundToggleUI();
    });
  }

  if (settingsToggle && settingsModal) {
    settingsToggle.addEventListener("click", () => {
      settingsModal.classList.remove("hidden");
    });

    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.add("hidden");
      }
    });
  }

  if (settingsClose) {
    settingsClose.addEventListener("click", () => {
      settingsModal.classList.add("hidden");
    });
  }
}

function updateSoundToggleUI() {
  const soundToggleBtn = $("soundToggleBtn");
  const soundStatus = $("soundStatus");
  
  if (soundToggleBtn) {
    if (soundEnabled) {
      soundToggleBtn.classList.add("active");
    } else {
      soundToggleBtn.classList.remove("active");
    }
  }
  
  if (soundStatus) {
    soundStatus.textContent = LanguageManager.t(soundEnabled ? "soundOn" : "soundOff");
  }
}

function updateAllTranslations() {
  LanguageManager.applyTranslations();
  
  setText("playerName", myName || LanguageManager.t("player"));
  
  if (currentState) {
    if (currentState.state === "lobby") {
      setStatus(LanguageManager.t("waitingHost"));
    } else if (currentState.state === "question" && !answeredCurrent && !kickedFromCurrentQuestion) {
      setStatus(LanguageManager.t("selectAnswer"));
    } else if (kickedFromCurrentQuestion) {
      setStatus(LanguageManager.t("kickedFromQuestion") || "Бяхте премахнат. Изчакайте следващия въпрос.");
    }
  }
  
  updateSoundToggleUI();
  updateConnectionStatus(socket.connected ? "connected" : "disconnected");
}

if (!isHostPage) {
  document.addEventListener("DOMContentLoaded", () => {
    LanguageManager.applyTranslations();
    initSettingsModal();
    
    if (myName && $("nameInput")) $("nameInput").value = myName;

    let audioInitialized = false;
    document.addEventListener("click", function initAudio() {
      if (!audioInitialized && musicManager) {
        musicManager.init();
        audioInitialized = true;
      }
    }, { once: true });

    const joinBtn = $("joinBtn");
    if (joinBtn) joinBtn.addEventListener("click", joinGame);

    const nameInput = $("nameInput");
    if (nameInput) {
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") joinGame();
      });
    }

    const randomNameBtn = $("randomNameBtn");
    if (randomNameBtn) {
      randomNameBtn.addEventListener("click", () => {
        const input = $("nameInput");
        if (input) {
          let nickname = generateRandomNickname();
          nickname = getCleanNickname(nickname);
          if (nickname.length < 3) {
            nickname = "Играч" + Math.floor(Math.random() * 9999);
          }
          input.value = nickname;
          input.focus();
          triggerAnimation(input.parentElement, "shake", 400);
        }
      });
    }

    const backToLobbyBtn = $("backToLobbyBtn");
    if (backToLobbyBtn) {
      backToLobbyBtn.addEventListener("click", () => {
        const confettiContainer = $("confettiContainer");
        if (confettiContainer) Confetti.clear(confettiContainer);
        
        myToken = "";
        myScore = 0;
        myRank = 0;
        myStreak = 0;
        currentState = null;
        answeredCurrent = false;
        waitingForOthers = false;
        kickedFromCurrentQuestion = false;
        
        localStorage.removeItem(LS_TOKEN_KEY);
        
        const nameInputEl = $("nameInput");
        const gameCodeInputEl = $("gameCodeInput");
        if (nameInputEl) nameInputEl.value = "";
        if (gameCodeInputEl) gameCodeInputEl.value = "";
        
        setText("joinError", "");
        setText("playerScore", "0");
        setText("playerRank", "-");
        
        hide("podiumScreen");
        hide("gameScreen");
        show("joinScreen");
        
        if (isFullscreen()) {
          exitFullscreen();
        }
      });
    }

    const shortcutsBtn = $("shortcutsBtn");
    if (shortcutsBtn) {
      shortcutsBtn.addEventListener("click", showKeyboardShortcuts);
    }

    setupAnswerButtons();
    setupKeyboardControls();
    setupFullscreenHandlers();

    setText("playerName", myName || LanguageManager.t("player"));
    updateConnectionStatus(socket.connected ? "connected" : "disconnected");

    if (typeof AccessibilityManager !== 'undefined') {
      AccessibilityManager.init();
    }
  });
} else {
  document.addEventListener("DOMContentLoaded", () => {
    const startBtn = $("startBtn");
    const nextBtn = $("nextBtn");
    const resetBtn = $("resetBtn");

    if (startBtn) startBtn.addEventListener("click", () => socket.emit("host:start"));
    if (nextBtn) nextBtn.addEventListener("click", () => socket.emit("host:next"));
    if (resetBtn) resetBtn.addEventListener("click", () => socket.emit("host:reset"));

    updateConnectionStatus(socket.connected ? "connected" : "disconnected");
  });
}

// ============ PROCTORING FUNCTIONS ============

let tabSwitchCount = 0;
let fullscreenExitCount = 0;
let devToolsOpenCount = 0;
let lastVisibilityState = document.visibilityState;
let fingerprint = null;
let fullscreenCheckInterval = null;

function initTabSwitchDetection() {
  document.addEventListener('visibilitychange', () => {
    const gameStatesRequiringFullscreen = ['question', 'ready', 'reveal', 'pause'];
    if (gameStatesRequiringFullscreen.includes(currentState?.state) && document.hidden) {
      tabSwitchCount++;
      socket.emit('player:tabSwitch', { count: tabSwitchCount, timestamp: Date.now() });
      Notifications.warning(`Внимание! Превключването между раздели не е позволено! (${tabSwitchCount}/3)`);
      
      if (tabSwitchCount >= 3) {
        socket.emit('player:disqualify', { reason: 'Твърде много превключвания между раздели' });
      }
    }
  });
}

function initFullscreenEnforcement() {
  document.addEventListener('fullscreenchange', () => {
    const isFullscreenNow = !!document.fullscreenElement;
    const gameStatesRequiringFullscreen = ['question', 'ready', 'reveal', 'pause'];
    
    if (gameStatesRequiringFullscreen.includes(currentState?.state) && !isFullscreenNow && isFullscreenRequired) {
      fullscreenExitCount++;
      socket.emit('player:fullscreenExit', { count: fullscreenExitCount, timestamp: Date.now() });
      
      if (fullscreenExitCount >= 3) {
        socket.emit('player:kick', { reason: 'Напуснахте fullscreen режим 3 пъти' });
        Notifications.error('Извъертен сте от играта!');
        resetToJoinScreen('Напуснахте fullscreen режим 3 пъти');
      } else if (fullscreenExitCount >= 1) {
        socket.emit('player:disqualifyQuestion', { timestamp: Date.now() });
        Notifications.error(`Дисквалификация за този въпрос! (${fullscreenExitCount}/3)`);
      }
      
      forceFullscreen();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullscreenRequired) {
      const gameStatesRequiringFullscreen = ['question', 'ready', 'reveal', 'pause'];
      if (gameStatesRequiringFullscreen.includes(currentState?.state)) {
        e.preventDefault();
        forceFullscreen();
      }
    }
  });
  
  document.addEventListener('webkitfullscreenchange', () => {
    const isFullscreenNow = !!document.webkitFullscreenElement;
    const gameStatesRequiringFullscreen = ['question', 'ready', 'reveal', 'pause'];
    
    if (gameStatesRequiringFullscreen.includes(currentState?.state) && !isFullscreenNow && isFullscreenRequired) {
      forceFullscreen();
    }
  });
}

function forceFullscreen() {
  const elem = document.documentElement;
  const tryRequest = () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(() => setTimeout(tryRequest, 100));
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      } catch (err) {
        setTimeout(tryRequest, 100);
      }
    }
  };
  tryRequest();
}

function startFullscreenCheck() {
  if (fullscreenCheckInterval) return;
  
  fullscreenCheckInterval = setInterval(() => {
    const gameStatesRequiringFullscreen = ['question', 'ready', 'reveal', 'pause'];
    if (gameStatesRequiringFullscreen.includes(currentState?.state) && isFullscreenRequired) {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        forceFullscreen();
      }
    }
  }, 500);
}

function stopFullscreenCheck() {
  if (fullscreenCheckInterval) {
    clearInterval(fullscreenCheckInterval);
    fullscreenCheckInterval = null;
  }
}

function initDevToolsDetection() {
  const devToolsDetector = () => {
    const start = performance.now();
    debugger;
    const end = performance.now();
    
    if (end - start > 100) {
      devToolsOpenCount++;
      socket.emit('player:devTools', { count: devToolsOpenCount, timestamp: Date.now() });
      Notifications.warning('Инструментите за разработка са забранени!');
      
      if (devToolsOpenCount >= 2) {
        socket.emit('player:disqualify', { reason: 'Използване на инструменти за разработка' });
      }
    }
  };
  
  setInterval(devToolsDetector, 1000);
}

function initCopyPastePrevention() {
  document.addEventListener('copy', (e) => {
    if (currentState?.state === 'question') {
      e.preventDefault();
      Notifications.warning('Копирането не е позволено!');
      socket.emit('player:copyAttempt', { timestamp: Date.now() });
    }
  });
  
  document.addEventListener('paste', (e) => {
    if (currentState?.state === 'question') {
      e.preventDefault();
      Notifications.warning('Поставянето не е позволено!');
    }
  });
  
  document.addEventListener('cut', (e) => {
    if (currentState?.state === 'question') {
      e.preventDefault();
    }
  });
  
  document.addEventListener('contextmenu', (e) => {
    if (currentState?.state === 'question') {
      e.preventDefault();
    }
  });
}

function initKeyboardBlocking() {
  window.addEventListener('keydown', (e) => {
    if (currentState?.state === 'question') {
      if (e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
          (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S'))) {
        e.preventDefault();
        Notifications.warning('Този клавиш е забранен!');
      }
    }
  });
}

async function initDeviceFingerprinting() {
  try {
    if (typeof FingerprintJS !== 'undefined') {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      fingerprint = result.visitorId;
    } else {
      fingerprint = navigator.userAgent + screen.width + screen.height + screen.colorDepth;
    }
    
    socket.emit('player:fingerprint', { fingerprint, timestamp: Date.now() });
  } catch (err) {
    console.warn('Fingerprint failed:', err);
    fingerprint = navigator.userAgent + screen.width + screen.height + screen.colorDepth;
    socket.emit('player:fingerprint', { fingerprint, timestamp: Date.now() });
  }
}

function initProctoring() {
  if (isHostPage) return;
  
  initTabSwitchDetection();
  initFullscreenEnforcement();
  initDevToolsDetection();
  initCopyPastePrevention();
  initKeyboardBlocking();
  initDeviceFingerprinting();
  startFullscreenCheck();
}
