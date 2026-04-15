import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("teacher"), v.literal("admin")),
    displayName: v.string(),
    createdAt: v.number(),
    lastLogin: v.optional(v.number()),
    isActive: v.boolean(),
    loginAttempts: v.number(),
    lockedUntil: v.optional(v.number()),
    sessionToken: v.optional(v.string()),
  }).index("username", ["username"])
    .index("sessionToken", ["sessionToken"]),

  questions: defineTable({
    questionType: v.union(v.literal("code"), v.literal("multiple_choice")),
    questionText: v.optional(v.string()),
    leftCode: v.optional(v.string()),
    rightCode: v.optional(v.string()),
    leftTitle: v.optional(v.string()),
    rightTitle: v.optional(v.string()),
    correctChoice: v.number(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    isActive: v.boolean(),
  }).index("createdBy", ["createdBy"])
    .index("isActive", ["isActive"]),

  games: defineTable({
    gameCode: v.string(),
    state: v.union(
      v.literal("lobby"),
      v.literal("ready"),
      v.literal("question"),
      v.literal("pause"),
      v.literal("reveal"),
      v.literal("finished")
    ),
    settings: v.object({
      questionsCount: v.number(),
      questionTime: v.number(),
      pointsPerQuestion: v.number(),
      pauseBetweenQuestions: v.number(),
      timeBonus: v.boolean(),
      shuffleQuestions: v.boolean(),
    }),
    currentQuestionIndex: v.number(),
    questionIds: v.array(v.id("questions")),
    questionEndsAt: v.optional(v.number()),
    pauseEndsAt: v.optional(v.number()),
    totalQuestions: v.number(),
    answerCounts: v.optional(v.array(v.number())),
    revealedAnswer: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  }).index("gameCode", ["gameCode"])
    .index("createdBy", ["createdBy"]),

  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    token: v.string(),
    score: v.number(),
    rank: v.number(),
    isConnected: v.boolean(),
    joinedAt: v.number(),
    lastAnswerChoice: v.optional(v.number()),
    lastAnswerAt: v.optional(v.number()),
  }).index("gameId", ["gameId"])
    .index("token", ["token"])
    .index("gameId_score", ["gameId", "score"]),
});