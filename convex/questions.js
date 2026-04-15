import { query, mutation } from "./_base";
import { v } from "convex/values";

export const getQuestions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("createdBy", (q) => q.eq("createdBy", userId))
      .collect();

    return questions;
  },
});

export const createQuestion = mutation({
  args: {
    userId: v.id("users"),
    question: v.object({
      questionType: v.union(v.literal("code"), v.literal("multiple_choice")),
      questionText: v.optional(v.string()),
      leftCode: v.optional(v.string()),
      rightCode: v.optional(v.string()),
      leftTitle: v.optional(v.string()),
      rightTitle: v.optional(v.string()),
      correctChoice: v.number(),
    }),
  },
  handler: async (ctx, { userId, question }) => {
    const questionId = await ctx.db.insert("questions", {
      ...question,
      createdBy: userId,
      createdAt: Date.now(),
      isActive: true,
    });

    return { questionId };
  },
});

export const updateQuestion = mutation({
  args: {
    userId: v.id("users"),
    questionId: v.id("questions"),
    updates: v.object({
      questionType: v.optional(v.union(v.literal("code"), v.literal("multiple_choice"))),
      questionText: v.optional(v.string()),
      leftCode: v.optional(v.string()),
      rightCode: v.optional(v.string()),
      leftTitle: v.optional(v.string()),
      rightTitle: v.optional(v.string()),
      correctChoice: v.optional(v.number()),
      isActive: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { userId, questionId, updates }) => {
    const question = await ctx.db.get(questionId);
    
    if (!question || question.createdBy !== userId) {
      throw new Error("Нямате достъп до този въпрос");
    }

    await ctx.db.patch(questionId, updates);

    return { success: true };
  },
});

export const deleteQuestion = mutation({
  args: { userId: v.id("users"), questionId: v.id("questions") },
  handler: async (ctx, { userId, questionId }) => {
    const question = await ctx.db.get(questionId);
    
    if (!question || question.createdBy !== userId) {
      throw new Error("Нямате достъп до този въпрос");
    }

    await ctx.db.delete(questionId);

    return { success: true };
  },
});

export const getQuestion = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, { questionId }) => {
    return await ctx.db.get(questionId);
  },
});