import { query, mutation, action } from "./_base";
import { v } from "convex/values";
import { v4 as uuidv4 } from "uuid";

const generateGameCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const getDefaultSettings = () => ({
  questionsCount: 20,
  questionTime: 15,
  pointsPerQuestion: 100,
  pauseBetweenQuestions: 5,
  timeBonus: true,
  shuffleQuestions: true,
});

export const createGame = mutation({
  args: { 
    userId: v.id("users"),
    settings: v.optional(v.object({
      questionsCount: v.number(),
      questionTime: v.number(),
      pointsPerQuestion: v.number(),
      pauseBetweenQuestions: v.number(),
      timeBonus: v.boolean(),
      shuffleQuestions: v.boolean(),
    })),
  },
  handler: async (ctx, { userId, settings }) => {
    let gameCode = generateGameCode();
    
    // Ensure unique code
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
      settings: settings || getDefaultSettings(),
      currentQuestionIndex: -1,
      questions: [],
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
    const playerId = await ctx.db.insert("gamePlayers", {
      gameId: game._id,
      name: playerName,
      token,
      score: 0,
      rank: 0,
      isConnected: true,
      joinedAt: Date.now(),
    });

    return { token, playerId };
  },
});

export const reconnectPlayer = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await ctx.db
      .query("gamePlayers")
      .withIndex("token", (q) => q.eq("token", token))
      .first();

    if (!player) {
      throw new Error("Играчът не съществува");
    }

    await ctx.db.patch(player._id, { isConnected: true });
    return { playerId: player._id, gameId: player.gameId };
  },
});

export const kickPlayer = mutation({
  args: { userId: v.id("users"), playerToken: v.string() },
  handler: async (ctx, { userId, playerToken }) => {
    const player = await ctx.db
      .query("gamePlayers")
      .withIndex("token", (q) => q.eq("token", playerToken))
      .first();

    if (!player) {
      return;
    }

    await ctx.db.delete(player._id);
    return { success: true };
  },
});

export const getGameState = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    
    if (!game) {
      return null;
    }

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const leaderboard = players
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ name: p.name, score: p.score }));

    let question = null;
    if (game.state === "question" && game.currentQuestionIndex >= 0) {
      const questionDoc = await ctx.db.get(game.questions[game.currentQuestionIndex]);
      if (questionDoc) {
        question = questionDoc;
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
    };
  },
});

export const getPlayerState = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await ctx.db
      .query("gamePlayers")
      .withIndex("token", (q) => q.eq("token", token))
      .first();

    if (!player) {
      return null;
    }

    const game = await ctx.db.get(player.gameId);
    
    return {
      playerId: player._id,
      gameId: player.gameId,
      name: player.name,
      score: player.score,
      rank: player.rank,
      lastAnswer: player.lastAnswer,
    };
  },
});

export const startGame = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп до тази игра");
    }

    if (game.state !== "lobby") {
      throw new Error("Играта вече е започнала");
    }

    // Get available questions
    let questions = await ctx.db
      .query("questions")
      .withIndex("isActive", (q) => q.eq("isActive", true))
      .collect();

    if (questions.length === 0) {
      throw new Error("Няма налични въпроси");
    }

    const settings = game.settings;
    
    // Shuffle if enabled
    if (settings.shuffleQuestions) {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    }

    // Take only needed questions
    const selectedQuestions = questions.slice(0, settings.questionsCount);

    await ctx.db.patch(gameId, {
      state: "ready",
      questions: selectedQuestions.map(q => q._id),
      totalQuestions: selectedQuestions.length,
      currentQuestionIndex: -1,
      startedAt: Date.now(),
    });

    return { success: true };
  },
});

export const startQuestion = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп до тази игра");
    }

    if (game.state !== "ready" && game.state !== "pause") {
      throw new Error("Не можете да започнете въпрос");
    }

    const nextIndex = game.currentQuestionIndex + 1;
    
    if (nextIndex >= game.totalQuestions) {
      await ctx.db.patch(gameId, {
        state: "finished",
        endedAt: Date.now(),
      });
      return { finished: true };
    }

    const questionEndsAt = Date.now() + game.settings.questionTime * 1000;

    await ctx.db.patch(gameId, {
      state: "question",
      currentQuestionIndex: nextIndex,
      questionEndsAt,
      answerCounts: [0, 0, 0, 0],
      revealedAnswer: undefined,
    });

    return { success: true, questionIndex: nextIndex };
  },
});

export const submitAnswer = mutation({
  args: { token: v.string(), choice: v.number() },
  handler: async (ctx, { token, choice }) => {
    const player = await ctx.db
      .query("gamePlayers")
      .withIndex("token", (q) => q.eq("token", token))
      .first();

    if (!player) {
      throw new Error("Играчът не е намерен");
    }

    const game = await ctx.db.get(player.gameId);
    
    if (!game || game.state !== "question") {
      return { alreadyAnswered: true };
    }

    if (player.lastAnswer) {
      return { alreadyAnswered: true };
    }

    // Check if time expired
    if (game.questionEndsAt && Date.now() > game.questionEndsAt) {
      return { timeExpired: true };
    }

    const choiceInt = Number(choice);
    const newCounts = [...(game.answerCounts || [0, 0, 0, 0])];
    newCounts[choiceInt] = (newCounts[choiceInt] || 0) + 1;

    await ctx.db.patch(player._id, {
      lastAnswer: {
        choice: choiceInt,
        answeredAt: Date.now(),
      },
    });

    await ctx.db.patch(game._id, {
      answerCounts: newCounts,
    });

    return { success: true };
  },
});

export const revealAnswer = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп до тази игра");
    }

    if (game.state !== "question") {
      return { state: game.state };
    }

    // Get the question to find correct answer
    const question = await ctx.db.get(game.questions[game.currentQuestionIndex]);
    const correctChoice = question?.correctChoice ?? 0;

    // Calculate scores
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("gameId", (q) => q.eq("gameId", gameId))
      .collect();

    let answeredCount = 0;
    const newPlayers = [];

    for (const player of players) {
      if (player.lastAnswer) {
        answeredCount++;
        
        if (player.lastAnswer.choice === correctChoice) {
          let points = game.settings.pointsPerQuestion;
          
          // Time bonus
          if (game.settings.timeBonus && player.lastAnswer.answeredAt) {
            const timeLeft = game.questionEndsAt - player.lastAnswer.answeredAt;
            const timeBonus = Math.floor((timeLeft / (game.settings.questionTime * 1000)) * 50);
            points += Math.max(0, timeBonus);
          }

          newPlayers.push({
            id: player._id,
            score: player.score + points,
          });
        }
      }
    }

    // Update all player scores
    for (const update of newPlayers) {
      await ctx.db.patch(update.id, { score: update.score });
    }

    // Compute ranks
    const allPlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("gameId_score", (q) => q.eq("gameId", gameId))
      .collect();

    const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].rank !== i + 1) {
        await ctx.db.patch(sorted[i]._id, { rank: i + 1 });
      }
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
      throw new Error("Нямате достъп до тази игра");
    }

    // Clear last answers for next question
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("gameId", (q) => q.eq("gameId", gameId))
      .collect();

    for (const player of players) {
      if (player.lastAnswer) {
        await ctx.db.patch(player._id, { lastAnswer: undefined });
      }
    }

    // Check if game is finished
    if (game.currentQuestionIndex >= game.totalQuestions - 1) {
      await ctx.db.patch(gameId, {
        state: "finished",
        endedAt: Date.now(),
      });
      return { finished: true };
    }

    await ctx.db.patch(gameId, {
      state: "ready",
    });

    return { success: true };
  },
});

export const endGame = mutation({
  args: { userId: v.id("users"), gameId: v.id("games") },
  handler: async (ctx, { userId, gameId }) => {
    const game = await ctx.db.get(gameId);
    
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп до тази игра");
    }

    await ctx.db.patch(gameId, {
      state: "finished",
      endedAt: Date.now(),
    });

    return { success: true };
  },
});

export const getLeaderboard = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("gameId_score", (q) => q.eq("gameId", gameId))
      .collect();

    return players
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        rank: i + 1,
        name: p.name,
        score: p.score,
      }));
  },
});

export const getAllPlayers = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const players = await ctx.db
      .query("gamePlayers")
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

export const updateSettings = mutation({
  args: { 
    userId: v.id("users"), 
    gameId: v.id("games"),
    settings: v.object({
      questionsCount: v.number(),
      questionTime: v.number(),
      pointsPerQuestion: v.number(),
      pauseBetweenQuestions: v.number(),
      timeBonus: v.boolean(),
      shuffleQuestions: v.boolean(),
    }),
  },
  handler: async (ctx, { userId, gameId, settings }) => {
    const game = await ctx.db.get(gameId);
    
    if (!game || game.createdBy !== userId) {
      throw new Error("Нямате достъп до тази игра");
    }

    if (game.state !== "lobby") {
      throw new Error("Не можете да променяте настройките след стартиране на играта");
    }

    await ctx.db.patch(gameId, { settings });

    return { success: true };
  },
});