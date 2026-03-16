const socket = io();

const isHostPage = location.pathname.endsWith("/host.html");

const LS_TOKEN_KEY = "ai_human_token";
const LS_NAME_KEY = "ai_human_name";

let myToken = localStorage.getItem(LS_TOKEN_KEY) || "";
let myName = localStorage.getItem(LS_NAME_KEY) || "";
let currentState = null;
let myScore = 0;
let answeredCurrent = false;
let wasKicked = false;

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

function getRemainingSeconds(endsAt, nowMs = Date.now()) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
}

function clearCorrectBlink() {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.classList.remove("correct-blink");
  });
}

function highlightCorrectAnswer(correctChoice) {
  clearCorrectBlink();

  if (typeof correctChoice !== "number") return;

  const btn = document.querySelector(`.answer-btn[data-choice="${correctChoice}"]`);
  if (btn) {
    btn.classList.add("correct-blink");
  }
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

function resetToJoinScreen(message) {
  answeredCurrent = false;
  currentState = null;
  myToken = "";
  myScore = 0;
  wasKicked = true;

  localStorage.removeItem(LS_TOKEN_KEY);

  setText("playerScore", "0");
  setText("playerRank", "-");
  setText("finalMyScore", "0");
  setText("joinError", message || "Премахнат си от играта.");
  setStatus("");
  clearCorrectBlink();

  show("joinScreen");
  hide("gameScreen");
  hide("podiumScreen");
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
}

function tryReconnect() {
  if (isHostPage) return;
  if (!myToken || !myName) return;

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
    clearCorrectBlink();

    const podiumGrid = $("podiumGrid");
    if (podiumGrid) {
      const top3 = state.leaderboard.slice(0, 3);
      const classes = ["first", "second", "third"];
      const medals = ["1", "2", "3"];

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

  setText(
    "questionNumber",
    state.currentQuestionIndex >= 0 ? state.currentQuestionIndex + 1 : 0
  );
  setText("questionTotal", state.totalQuestions);

  if (state.question) {
    setCode("leftCode", state.question.leftCode);
    setCode("rightCode", state.question.rightCode);
    setText("leftCodeTitle", state.question.leftTitle || "Ляв код");
    setText("rightCodeTitle", state.question.rightTitle || "Десен код");
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
  } else if (state.state === "question") {
    if (!answeredCurrent) {
      setStatus("Избери отговор");
    }
    disableAnswerButtons(answeredCurrent);
    setText("timerValue", getRemainingSeconds(state.questionEndsAt, state.now || Date.now()));
    clearCorrectBlink();
  } else if (state.state === "reveal") {
    disableAnswerButtons(true);
    setText("timerValue", "0");
    highlightCorrectAnswer(state.question?.correctChoice);
  }

  renderMiniLeaderboard(state.leaderboard, "leaderboardMini");
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
  setText("hostUnanswered", state.unansweredPlayers ?? 0);

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
    setText("hostTimer", getRemainingSeconds(state.questionEndsAt, state.now || Date.now()));
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
      nextBtn.textContent = "Прекрати въпроса";
    } else if (state.state === "reveal") {
      nextBtn.textContent = "Следващ въпрос";
    } else {
      nextBtn.textContent = "Next / Skip";
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
              <strong>${escapeHtml(p.name)}</strong><br />
              <small>${p.score} т. | ${p.correctCount} верни</small>
            </div>
            <button class="kick-btn" data-kick="${p.token}">Премахни</button>
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
      setText("playerRank", rows.findIndex((x) => x.token === myToken) + 1 || "-");
    }
  }
}

socket.on("connect", () => {
  if (!isHostPage) {
    tryReconnect();
  }
});

socket.on("player:joined", ({ token, name }) => {
  myToken = token;
  myName = name;
  wasKicked = false;

  localStorage.setItem(LS_TOKEN_KEY, myToken);
  localStorage.setItem(LS_NAME_KEY, myName);

  setText("playerName", myName);
  setText("joinError", "");
  hide("joinScreen");
  show("gameScreen");
});

socket.on("player:error", (message) => {
  setText("joinError", message || "Грешка при влизане.");
});

socket.on("player:kicked", (message) => {
  if (isHostPage) return;
  resetToJoinScreen(message || "Премахнат си от играта от хоста.");
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
    setText("playerRank", data.rank || "-");
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
  setStatus("Отговорът е изпратен");
});

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