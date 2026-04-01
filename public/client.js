const socket = io();

const isHostPage = location.pathname.endsWith("/host.html");

const LS_TOKEN_KEY = "ai_human_token";
const LS_NAME_KEY = "ai_human_name";
const LS_THEME_KEY = "ai_human_theme";

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
    el.style.visibility = "visible";
    el.style.opacity = "1";
  }
}

function hide(id) {
  const el = $(id);
  if (el) {
    el.classList.add("hidden");
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

function updateConnectionStatus(status) {
  const dot = $("connectionDot");
  const text = $("connectionText");
  if (!dot || !text) return;

  dot.classList.remove("disconnected", "reconnecting");
  
  switch (status) {
    case "connected":
      dot.classList.add("connected");
      text.textContent = "Свързан";
      reconnectAttempts = 0;
      break;
    case "disconnected":
      dot.classList.add("disconnected");
      text.textContent = "Изключен";
      break;
    case "reconnecting":
      dot.classList.add("reconnecting");
      text.textContent = `Свързване... (${reconnectAttempts})`;
      break;
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
    SoundManager.playCountdownBeep();
  }
  
  if (remainingSeconds === 0 && lastTimerValue > 0) {
    SoundManager.playTimeUpSound();
  }
  
  lastTimerValue = remainingSeconds;
}

function clearCorrectBlink() {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.classList.remove("correct-blink", "correct", "wrong", "submitted");
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
      streakEl.innerHTML = `🔥 Серия: ${myStreak}`;
      triggerAnimation(streakEl, "pulse", 500);
    } else {
      streakEl.innerHTML = '';
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

  localStorage.removeItem(LS_TOKEN_KEY);

  setText("playerScore", "0");
  setText("playerRank", "-");
  setText("finalMyScore", "0");
  setText("joinError", message || "Премахнат си от играта.");
  setStatus("");
  clearCorrectBlink();
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
  const name = $("nameInput").value.trim();

  if (!name) {
    setText("joinError", "Моля, въведи nickname.");
    Notifications.error("Моля, въведи nickname.");
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
    name: myName
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

  answeredCurrent = true;
  waitingForOthers = true;
  button.classList.add("submitted");
  
  SoundManager.playButtonClickSound();
  
  socket.emit("player:answer", { choice });
  
  setStatus("Изчаквам другите играчи...");
}

function renderPlayerState(state) {
  const previousState = currentState?.state;
  currentState = state;
  if (!state) return;

  if (previousState === "lobby" && state.state === "question") {
    isFullscreenRequired = true;
    fullscreenWarningShown = false;
    requestFullscreen();
  }

  if (previousState !== "question" && state.state !== "question" && state.state !== "reveal") {
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

    SoundManager.playGameEndSound();

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
      AccessibilityManager.announce("Играта приключи! Вие събрахте " + myScore + " точки.");
    }
    return;
  }

  hide("podiumScreen");
  hide("joinScreen");
  show("gameScreen");

  setText(
    "questionNumber",
    state.currentQuestionIndex >= 0 ? state.currentQuestionIndex + 1 : 0
  );
  setText("questionTotal", state.totalQuestions);

  const isNewQuestion = state.question && state.question.id !== lastQuestionId;
  lastQuestionId = state.question?.id;

  if (state.question) {
    setCode("leftCode", state.question.leftCode);
    setCode("rightCode", state.question.rightCode);
    setText("leftCodeTitle", state.question.leftTitle || "Ляв код");
    setText("rightCodeTitle", state.question.rightTitle || "Десен код");

    if (isNewQuestion && previousState !== "question") {
      animateQuestionAppear();
      SoundManager.playQuestionStartSound();
      answeredCurrent = false;
      waitingForOthers = false;
    }
  } else {
    setCode("leftCode", "");
    setCode("rightCode", "");
    setText("leftCodeTitle", "Ляв код");
    setText("rightCodeTitle", "Десен код");
  }

  if (state.state === "lobby") {
    setStatus("Изчакай хостът да стартира играта...");
    disableAnswerButtons(true);
    setText("timerValue", "15");
    clearCorrectBlink();
    lastTimerValue = 15;
    updateTimerProgress(15);
    waitingForOthers = false;
  } else if (state.state === "question") {
    if (!answeredCurrent && !waitingForOthers) {
      setStatus("Избери отговор");
    }
    disableAnswerButtons(answeredCurrent);
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
});

socket.on("player:error", (message) => {
  setText("joinError", message || "Грешка при влизане.");
  Notifications.error(message || "Грешка при влизане.");
});

socket.on("player:kicked", (message) => {
  if (isHostPage) return;
  resetToJoinScreen(message || "Премахнат си от играта от хоста.");
  Notifications.warning("Премахнат си от играта!");
});

socket.on("player:disqualified", (data) => {
  if (isHostPage) return;
  
  isFullscreenRequired = false;
  disableAnswerButtons(true);
  setStatus(data.reason || "Бяхте дисквалифициран!", "error");
  
  Notifications.error(data.reason || "Бяхте дисквалифициран!");
  
  exitFullscreen();
});

socket.on("player:banned", (data) => {
  resetToJoinScreen(`Забранен си: ${data.reason || 'Неизвестна причина'}`);
  Notifications.error("Достъпът ви е забранен!");
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

  if (!isHostPage && currentState) {
    disableAnswerButtons(answeredCurrent || currentState.state !== "question");
  }

  if (data.revealMessage && !isHostPage && currentState?.state === "reveal") {
    const isCorrect = data.revealMessage.includes("Вярно");
    setStatus(data.revealMessage, isCorrect ? "success" : "error");
    
    if (isCorrect) {
      SoundManager.playSuccessSound();
      Notifications.success(data.revealMessage);
      const streakMatch = data.revealMessage.match(/Серия: (\d+)/);
      if (streakMatch && parseInt(streakMatch[1]) >= 3) {
        Notifications.streak(parseInt(streakMatch[1]));
      }
    } else {
      SoundManager.playErrorSound();
      Notifications.error("Грешен отговор!");
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
  }
});

socket.on("player:answer:ack", (data) => {
  answeredCurrent = true;
  waitingForOthers = true;
  disableAnswerButtons(true);
  
  if (data.waiting) {
    setStatus("Изчаквам другите играчи...");
  }
  
  Notifications.answerSubmitted();
});
});

socket.on("player:answer:ack", (data) => {
  answeredCurrent = true;
  waitingForOthers = true;
  disableAnswerButtons(true);
  
  if (data.waiting) {
    setStatus("Изчаквам другите играчи...");
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
}

function setupKeyboardControls() {
  document.addEventListener("keydown", (e) => {
    if (isHostPage) return;
    
    if (!$("gameScreen") || $("gameScreen").classList.contains("hidden")) return;
    
    if (currentState?.state !== "question" || answeredCurrent) return;

    const keyMap = {
      "1": 0, "2": 1, "3": 2, "4": 3,
      "ArrowLeft": 0, "ArrowRight": 1,
      "a": 0, "d": 1
    };

    if (keyMap.hasOwnProperty(e.key)) {
      e.preventDefault();
      const choice = keyMap[e.key];
      const btn = document.querySelector(`.answer-btn[data-choice="${choice}"]`);
      if (btn && !btn.disabled) {
        handleAnswerSubmit(choice, btn);
      }
    }
  });
}

function showKeyboardShortcuts() {
  const shortcuts = {
    "1-4": "Избор на отговор",
    "A/D": "Ляв/Десен отговор",
    "←/→": "Ляв/Десен отговор",
    "Enter": "Потвърждаване"
  };
  
  let html = '<div class="keyboard-shortcuts"><h3>Клавишни команди</h3><ul>';
  for (const [key, desc] of Object.entries(shortcuts)) {
    html += `<li><kbd>${key}</kbd> - ${desc}</li>`;
  }
  html += '</ul></div>';
  
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `<div class="modal-content">${html}<button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Затвори</button></div>`;
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

if (!isHostPage) {
  document.addEventListener("DOMContentLoaded", () => {
    if (myName && $("nameInput")) $("nameInput").value = myName;

    const joinBtn = $("joinBtn");
    if (joinBtn) joinBtn.addEventListener("click", joinGame);

    const nameInput = $("nameInput");
    if (nameInput) {
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") joinGame();
      });
    }

    const playAgainBtn = $("playAgainBtn");
    if (playAgainBtn) {
      playAgainBtn.addEventListener("click", () => {
        const confettiContainer = $("confettiContainer");
        if (confettiContainer) Confetti.clear(confettiContainer);
        myScore = 0;
        myRank = 0;
        myStreak = 0;
        socket.emit("player:join", { token: myToken, name: myName });
      });
    }

    const shortcutsBtn = $("shortcutsBtn");
    if (shortcutsBtn) {
      shortcutsBtn.addEventListener("click", showKeyboardShortcuts);
    }

    setupAnswerButtons();
    setupKeyboardControls();
    setupFullscreenHandlers();

    setText("playerName", myName || "Играч");
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
