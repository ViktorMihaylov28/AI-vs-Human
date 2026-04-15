import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "./_generated/values";
import { v4 as uuidv4 } from "uuid";

function generateGameCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const DEFAULT_SETTINGS = {
  questionsCount: 20,
  questionTime: 15,
  pointsPerQuestion: 100,
  pauseBetweenQuestions: 5,
  timeBonus: true,
  shuffleQuestions: true,
};

// Auth mutations
export const login = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", username))
      .first();

    if (!user) {
      throw new Error("Невалидно потребителско име или парола");
    }

    if (!user.isActive) {
      throw new Error("Акаунтът е деактивиран");
    }

    if (user.passwordHash !== password) {
      await ctx.db.patch(user._id, {
        loginAttempts: user.loginAttempts + 1,
        lockedUntil: user.loginAttempts >= 4 ? Date.now() + 15 * 60 * 1000 : undefined,
      });
      throw new Error("Невалидно потребителско име или парола");
    }

    const sessionToken = uuidv4();
    await ctx.db.patch(user._id, {
      sessionToken,
      lastLogin: Date.now(),
      loginAttempts: 0,
    });

    return { sessionToken, role: user.role, displayName: user.displayName };
  },
});

export const verifySession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("sessionToken", (q) => q.eq("sessionToken", sessionToken))
      .first();

    if (!user) return null;
    return { userId: user._id, role: user.role, displayName: user.displayName };
  },
});

// Game mutations
export const createGame = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    let gameCode = generateGameCode();
    
    let existing = await ctx.db
      .query("games")
      .withIndex("gameCode", (q) => q.eq("gameCode", gameCode))
      .first();
    
    while (existing) {
      gameCode = generateGameCode();
      existing = await ctx.db
        .query("games")
        .withIndex("gameCode", (q) => q.eq("gameCode", gameCode))
        .first();
    }

    const gameId = await ctx.db.insert("games", {
      gameCode,
      state: "lobby",
      settings: DEFAULT_SETTINGS,
      currentQuestionIndex: -1,
      questionIds: [],
      totalQuestions: 0,
      createdBy: userId,
      createdAt: Date.now(),
    });

    return { gameId, gameCode };
  },
});

export const joinGame = mutation({
  args: { gameCode: v.string(), playerName: v.string() },
  handler: async (ctx, { gameCode, playerName }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("gameCode", (q) => q.eq("gameCode", gameCode))
      .first();

    if (!game) {
      throw new Error("Играта не съществува");
    }

    if (game.state !== "lobby" && game.state !== "ready") {
      throw new Error("Играта вече е започнала");
    }

    const token = uuidv4();
    await ctx.db.insert("players", {
      gameId: game._id,
      name: playerName,
      token,
      score: 0,
      rank: 0,
      isConnected: true,
      joinedAt: Date.now(),
    });

    return { token };
  },
});

export const reconnectPlayer = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("token", (q) => q.eq("token", token))
      .first();

    if (!player) {
      throw new Error("Играчът не е намерен");
    }

    await ctx.db.patch(player._id, { isConnected: true });
    return { playerId: player._id, gameId: player.gameId };
  },
});

export const kickPlayer = mutation({
  args: { userId: v.id("users"), playerToken: v.string() },
  handler: async (ctx, { userId, playerToken }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("token", (q) => q.eq("token", playerToken))
      .first();

    if (!player) return { success: true };

    const game = await ctx.db.get(player.gameId);
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп");
    }

    await ctx.db.delete(player._id);
    return { success: true };
  },
});

// Game queries
export const getGameState = query({
  args: { gameCode: v.string() },
  handler: async (ctx, { gameCode }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("gameCode", (q) => q.eq("gameCode", gameCode))
      .first();

    if (!game) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("gameId", (q) => q.eq("gameId", game._id))
      .collect();

    const leaderboard = [...players]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((p, i) => ({ name: p.name, score: p.score, rank: i + 1 }));

    let question = null;
    if (game.state === "question" && game.currentQuestionIndex >= 0) {
      const qId = game.questionIds[game.currentQuestionIndex];
      if (qId) {
        question = await ctx.db.get(qId);
      }
    }

    return {
      _id: game._id,
      gameCode: game.gameCode,
      state: game.state,
      currentQuestionIndex: game.currentQuestionIndex,
      totalQuestions: game.totalQuestions,
      questionEndsAt: game.questionEndsAt,
      pauseEndsAt: game.pauseEndsAt,
      revealedAnswer: game.revealedAnswer,
      answerCounts: game.answerCounts,
      question,
      playersCount: players.length,
      leaderboard,
      settings: game.settings,
    };
  },
});

export const getPlayerState = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("token", (q) => q.eq("token", token))
      .first();

    if (!player) return null;

    return {
      playerId: player._id,
      gameId: player.gameId,
      name: player.name,
      score: player.score,
      rank: player.rank,
      lastAnswer: player.lastAnswerChoice,
    };
  },
});

export const getAllPlayers = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const players = await ctx.db
      .query("players")
      .withIndex("gameId", (q) => q.eq("gameId", gameId))
      .collect();

    return players.map(p => ({
      token: p.token,
      name: p.name,
      score: p.score,
      rank: p.rank,
    }));
  },
});

// Game actions
export const startGame = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп");
    }

    if (game.state !== "lobby") {
      throw new Error("Играта вече е започнала");
    }

    let questions = await ctx.db
      .query("questions")
      .withIndex("isActive", (q) => q.eq("isActive", true))
      .collect();

    if (questions.length === 0) {
      throw new Error("Няма налични въпроси");
    }

    if (game.settings.shuffleQuestions) {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    }

    const selected = questions.slice(0, game.settings.questionsCount);

    await ctx.db.patch(gameId, {
      state: "ready",
      questionIds: selected.map(q => q._id),
      totalQuestions: selected.length,
      currentQuestionIndex: -1,
      startedAt: Date.now(),
    });

    return { success: true };
  },
});

export const nextQuestion = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп");
    }

    if (game.state !== "ready" && game.state !== "pause" && game.state !== "reveal") {
      return { state: game.state };
    }

    const nextIndex = game.currentQuestionIndex + 1;
    
    if (nextIndex >= game.totalQuestions) {
      await ctx.db.patch(gameId, { state: "finished", endedAt: Date.now() });
      return { finished: true };
    }

    await ctx.db.patch(gameId, {
      state: "question",
      currentQuestionIndex: nextIndex,
      questionEndsAt: Date.now() + game.settings.questionTime * 1000,
      answerCounts: [0, 0, 0, 0],
    });

    return { questionIndex: nextIndex };
  },
});

export const submitAnswer = mutation({
  args: { token: v.string(), choice: v.number() },
  handler: async (ctx, { token, choice }) => {
    const player = await ctx.db
      .query("players")
      .withIndex("token", (q) => q.eq("token", token))
      .first();

    if (!player) throw new Error("Играчът не е намерен");

    const game = await ctx.db.get(player.gameId);
    if (!game || game.state !== "question") {
      return { alreadyAnswered: true };
    }

    if (player.lastAnswerChoice !== undefined) {
      return { alreadyAnswered: true };
    }

    if (game.questionEndsAt && Date.now() > game.questionEndsAt) {
      return { timeExpired: true };
    }

    const newCounts = [...(game.answerCounts || [0, 0, 0, 0])];
    newCounts[choice] = (newCounts[choice] || 0) + 1;

    await ctx.db.patch(player._id, {
      lastAnswerChoice: choice,
      lastAnswerAt: Date.now(),
    });

    await ctx.db.patch(game._id, { answerCounts: newCounts });

    return { success: true };
  },
});

export const revealAnswer = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп");
    }

    if (game.state !== "question") {
      return { state: game.state };
    }

    const question = await ctx.db.get(game.questionIds[game.currentQuestionIndex]);
    const correctChoice = question?.correctChoice ?? 0;

    const players = await ctx.db
      .query("players")
      .withIndex("gameId", (q) => q.eq("gameId", gameId))
      .collect();

    for (const player of players) {
      if (player.lastAnswerChoice === correctChoice) {
        let points = game.settings.pointsPerQuestion;
        
        if (game.settings.timeBonus && player.lastAnswerAt) {
          const timeLeft = game.questionEndsAt - player.lastAnswerAt;
          const timeBonus = Math.floor((timeLeft / (game.settings.questionTime * 1000)) * 50);
          points += Math.max(0, timeBonus);
        }

        await ctx.db.patch(player._id, { score: player.score + points });
      }
    }

    const allPlayers = await ctx.db
      .query("players")
      .withIndex("gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
    for (let i = 0; i < sorted.length; i++) {
      await ctx.db.patch(sorted[i]._id, { rank: i + 1 });
    }

    const pauseEndsAt = Date.now() + game.settings.pauseBetweenQuestions * 1000;

    await ctx.db.patch(gameId, {
      state: "reveal",
      revealedAnswer: correctChoice,
      pauseEndsAt,
    });

    return { revealedAnswer: correctChoice };
  },
});

export const nextPhase = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("gameId", (q) => q.eq("gameId", gameId))
      .collect();

    for (const player of players) {
      if (player.lastAnswerChoice !== undefined) {
        await ctx.db.patch(player._id, { lastAnswerChoice: undefined, lastAnswerAt: undefined });
      }
    }

    if (game.currentQuestionIndex >= game.totalQuestions - 1) {
      await ctx.db.patch(gameId, { state: "finished", endedAt: Date.now() });
      return { finished: true };
    }

    await ctx.db.patch(gameId, { state: "ready" });
    return { success: true };
  },
});

export const endGame = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп");
    }

    await ctx.db.patch(gameId, { state: "finished", endedAt: Date.now() });
    return { success: true };
  },
});