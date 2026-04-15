import { query, mutation } from "./_base";
import { v } from "convex/values";
import { v4 as uuidv4 } from "uuid";

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

    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      throw new Error(`Акаунтът е заключен до ${new Date(user.lockedUntil).toLocaleTimeString()}`);
    }

    // Simple password check (In production, use proper bcrypt comparison)
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
      lockedUntil: undefined,
    });

    return { sessionToken, role: user.role, displayName: user.displayName };
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("sessionToken", (q) => q.eq("sessionToken", sessionToken))
      .first();

    if (user) {
      await ctx.db.patch(user._id, { sessionToken: undefined });
    }
  },
});

export const verifySession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("sessionToken", (q) => q.eq("sessionToken", sessionToken))
      .first();

    if (!user) {
      return null;
    }

    return { userId: user._id, role: user.role, displayName: user.displayName };
  },
});

export const register = mutation({
  args: {
    username: v.string(),
    password: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, { username, password, displayName }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", username))
      .first();

    if (existing) {
      throw new Error("Потребителското име е заето");
    }

    const sessionToken = uuidv4();
    const userId = await ctx.db.insert("users", {
      username,
      passwordHash: password,
      role: "teacher",
      displayName,
      createdAt: Date.now(),
      isActive: true,
      loginAttempts: 0,
      sessionToken,
    });

    return { sessionToken, displayName };
  },
});