const socket = io();

const isHostPage = location.pathname.endsWith("/host.html");

const LS_TOKEN_KEY = "ai_human_token";
const LS_NAME_KEY = "ai_human_name";
const LS_PIN_KEY = "ai_human_pin";

let myToken = localStorage.getItem(LS_TOKEN_KEY) || "";
let myName = localStorage.getItem(LS_NAME_KEY) || "";
let myPin = localStorage.getItem(LS_PIN_KEY) || "";
let currentState = null;
let myScore = 0;
let answeredCurrent = false;

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
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function getRemainingSeconds(endsAt) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function disableAnswerButtons(disabled) {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.disabled = disabled;
  });
}

function renderMiniLeaderboard(rows, targetId) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = rows
    .slice(0, 5)
    .map(
      (p, i) => `
        <div class="lb-row">
          <span>${i + 1}. ${escapeHtml(p.name)}</span>
          <strong>${p.score}</strong>
        </div>
      `
    )
    .join("");
}

function renderFullLeaderboard(rows, targetId) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = rows
    .map(
      (p, i) => `
        <div class="rank-row">
          <span>${i + 1}. ${escapeHtml(p.name)}</span>
          <strong>${p.score} т.</strong>
        </div>
      `
    )
    .join("");
}

function setStatus(text) {
  setText("statusBox", text);
}

function joinGame() {
  const name = $("nameInput").value.trim();
  const pin = $("pinInput").value.trim();

  if (!name) {
    setText("joinError", "Моля, въведи nickname.");
    return;
  }

  if (!pin) {
    setText("joinError", "Моля, въведи Game PIN.");
    return;
  }

  myName = name;
  myPin = pin;

  localStorage.setItem(LS_NAME_KEY, myName);
  localStorage.setItem(LS_PIN_KEY, myPin);

  socket.emit("player:join", {
    token: myToken,
    name: myName,
    pin: myPin
  });
}

function tryReconnect() {
  if (isHostPage) return;
  if (!myToken || !myName || !myPin) return;

  socket.emit("player:reconnect", {
    token: myToken
  });
}

function renderPlayerState(state) {
  currentState = state;
  if (!state) return;

  if (state.state === "finished") {
    hide("gameScreen");
    hide("joinScreen");
    show("podiumScreen");

    setText("finalMyScore", myScore);

    const podiumGrid = $("podiumGrid");
    if (podiumGrid) {
      const top3 = state.leaderboard.slice(0, 3);
      const classes = ["first", "second", "third"];
      const medals = ["🥇", "🥈", "🥉"];

      podiumGrid.innerHTML = top3
        .map(
          (p, i) => `
            <div class="podium-place ${classes[i]}">
              <div class="place-rank">${medals[i]}</div>
              <div class="place-name">${escapeHtml(p.name)}</div>
              <div class="place-score">${p.score} т.</div>
            </div>
          `
        )
        .join("");
    }

    renderFullLeaderboard(state.leaderboard, "finalLeaderboard");
    return;
  }

  hide("podiumScreen");
  hide("joinScreen");
  show("gameScreen");

  setText("pinSmall", state.pin);
  setText("questionNumber", state.currentQuestionIndex >= 0 ? state.currentQuestionIndex + 1 : 0);
  setText("questionTotal", state.totalQuestions);

  if (state.question) {
    const left = $("leftImage");
    const right = $("rightImage");
    if (left) left.src = state.question.left;
    if (right) right.src = state.question.right;
  }

  if (state.state === "lobby") {
    setStatus("⌛ Изчакай водещия да стартира играта...");
    disableAnswerButtons(true);
  } else if (state.state === "question") {
    if (!answeredCurrent) {
      setStatus("Избери отговор");
    }
    disableAnswerButtons(answeredCurrent);
    setText("timerValue", getRemainingSeconds(state.questionEndsAt));
  } else if (state.state === "reveal") {
    disableAnswerButtons(true);
    setText("timerValue", "✓");
  }

  renderMiniLeaderboard(state.leaderboard, "leaderboardMini");
}

function renderHostState(state) {
  currentState = state;
  if (!state) return;

  setText("hostPin", state.pin);
  setText("hostState", state.state);
  setText("hostPlayersCount", state.playersCount);
  setText("hostQuestionInfo", `${state.currentQuestionIndex >= 0 ? state.currentQuestionIndex + 1 : 0}/${state.totalQuestions}`);
  setText("hostAnswered", state.answeredPlayers ?? 0);
  setText("hostUnanswered", state.unansweredPlayers ?? 0);

  if (state.question) {
    const left = $("hostLeftImage");
    const right = $("hostRightImage");
    if (left) left.src = state.question.left;
    if (right) right.src = state.question.right;
    setText("correctAnswerText", state.question.correctText);
  } else {
    setText("correctAnswerText", "—");
  }

  if (state.state === "question") {
    setText("hostTimer", getRemainingSeconds(state.questionEndsAt));
  } else if (state.state === "reveal") {
    setText("hostTimer", "✓");
  } else {
    setText("hostTimer", "—");
  }

  const lb = $("leaderboardHost");
  if (lb) {
    lb.innerHTML = state.leaderboard
      .map(
        (p, i) => `
          <div class="player-row">
            <span>${i + 1}. ${escapeHtml(p.name)}</span>
            <strong>${p.score}</strong>
          </div>
        `
      )
      .join("");
  }

  const nextBtn = $("nextBtn");
  if (nextBtn) {
    if (state.state === "question") {
      nextBtn.textContent = "⏭ Прекрати въпроса";
    } else if (state.state === "reveal") {
      nextBtn.textContent = "➡ Следващ въпрос";
    } else {
      nextBtn.textContent = "⏭ Next / Skip";
    }
  }
}

function renderPlayersList(rows) {
  if (isHostPage) {
    const target = $("playersList");
    if (!target) return;

    target.innerHTML = rows
      .map(
        (p) => `
          <div class="player-row">
            <div>
              <strong>${escapeHtml(p.name)}</strong><br>
              <small>${p.score} т. | ${p.correctCount} верни</small>
            </div>
            <button class="kick-btn" data-kick="${p.token}">Махни</button>
          </div>
        `
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
      setText("playerScore", myScore);
      setText("playerRank", rows.findIndex((x) => x.token === myToken) + 1 || "—");
    }
  }
}

socket.on("connect", () => {
  if (!isHostPage) {
    tryReconnect();
  }
});

socket.on("player:joined", ({ token, name, pin }) => {
  myToken = token;
  myName = name;
  myPin = pin;

  localStorage.setItem(LS_TOKEN_KEY, myToken);
  localStorage.setItem(LS_NAME_KEY, myName);
  localStorage.setItem(LS_PIN_KEY, myPin);

  setText("playerName", myName);
  setText("joinError", "");
  hide("joinScreen");
  show("gameScreen");
});

socket.on("player:error", (message) => {
  setText("joinError", message || "Грешка при влизане.");
});

socket.on("game:state", (state) => {
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
    setText("playerRank", data.rank || "—");
  }

  answeredCurrent = !!data.answeredCurrent;

  if (!isHostPage && currentState) {
    disableAnswerButtons(answeredCurrent || currentState.state !== "question");
  }

  if (data.revealMessage && !isHostPage) {
    setStatus(data.revealMessage);
  }
});

socket.on("game:timer", ({ remainingMs }) => {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (isHostPage) {
    setText("hostTimer", seconds);
  } else {
    setText("timerValue", seconds);
  }
});

socket.on("player:answer:ack", () => {
  answeredCurrent = true;
  disableAnswerButtons(true);
  setStatus("✅ Избрано");
});

if (!isHostPage) {
  document.addEventListener("DOMContentLoaded", () => {
    if (myName && $("nameInput")) $("nameInput").value = myName;
    if (myPin && $("pinInput")) $("pinInput").value = myPin;

    const joinBtn = $("joinBtn");
    if (joinBtn) joinBtn.addEventListener("click", joinGame);

    const nameInput = $("nameInput");
    if (nameInput) {
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") joinGame();
      });
    }

    const pinInput = $("pinInput");
    if (pinInput) {
      pinInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") joinGame();
      });
    }

    document.querySelectorAll(".answer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = Number(btn.getAttribute("data-choice"));
        socket.emit("player:answer", { choice });
      });
    });

    setText("playerName", myName || "Играч");
  });
} else {
  document.addEventListener("DOMContentLoaded", () => {
    const startBtn = $("startBtn");
    const nextBtn = $("nextBtn");
    const resetBtn = $("resetBtn");

    if (startBtn) startBtn.addEventListener("click", () => socket.emit("host:start"));
    if (nextBtn) nextBtn.addEventListener("click", () => socket.emit("host:next"));
    if (resetBtn) resetBtn.addEventListener("click", () => socket.emit("host:reset"));
  });
}