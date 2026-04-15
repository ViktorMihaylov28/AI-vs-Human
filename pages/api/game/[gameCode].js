import { NextResponse } from "next/server";
import { internalMutation, internalQuery } from "@/convex/_generated/server";

const gameStateCache = new Map();

export async function GET(request, { params }) {
  const { gameCode } = params;
  
  try {
    const game = gameStateCache.get(gameCode);
    if (!game) {
      return NextResponse.json({ error: "Играта не съществува" }, { status: 404 });
    }
    return NextResponse.json(game);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  return GET(request, { params });
}