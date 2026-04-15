"use client";

import { useState, useEffect, useCallback } from "react";

export function useGame(gameCode) {
  const [gameState, setGameState] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  // Poll for game state updates
  useEffect(() => {
    if (!gameCode) return;

    const fetchGameState = async () => {
      try {
        const response = await fetch(`/api/game/${gameCode}`);
        if (response.ok) {
          const data = await response.json();
          setGameState(data);
          setIsConnected(true);
        }
      } catch (err) {
        setError(err.message);
      }
    };

    fetchGameState();
    const interval = setInterval(fetchGameState, 1000);
    return () => clearInterval(interval);
  }, [gameCode]);

  // Poll for player state
  useEffect(() => {
    const token = localStorage.getItem("ai_human_token");
    if (!token) return;

    const fetchPlayerState = async () => {
      try {
        const response = await fetch(`/api/player/${token}`);
        if (response.ok) {
          const data = await response.json();
          setPlayerState(data);
        }
      } catch (err) {
        // Ignore errors
      }
    };

    fetchPlayerState();
    const interval = setInterval(fetchPlayerState, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = useCallback(async (playerName) => {
    setError(null);
    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameCode, playerName }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Грешка при свързване");
      }
      localStorage.setItem("ai_human_token", result.token);
      localStorage.setItem("ai_human_name", playerName);
      setPlayerState(result);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [gameCode]);

  const handleAnswer = useCallback(async (choice) => {
    const token = localStorage.getItem("ai_human_token");
    if (!token) return;

    try {
      await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, choice }),
      });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleReconnect = useCallback(async () => {
    const token = localStorage.getItem("ai_human_token");
    if (!token) return null;

    try {
      const response = await fetch("/api/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (response.ok) {
        setIsConnected(true);
        return result;
      }
    } catch (err) {
      localStorage.removeItem("ai_human_token");
    }
    return null;
  }, []);

  return {
    game: gameState,
    player: playerState,
    isConnected,
    error,
    joinGame: handleJoin,
    submitAnswer: handleAnswer,
    reconnect: handleReconnect,
  };
}

export function useAdmin(authToken) {
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    if (!authToken) return;

    const fetchAdminState = async () => {
      try {
        const response = await fetch("/api/admin/state", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          setGameState(data.game);
          setPlayers(data.players);
        }
      } catch (err) {
        // Ignore
      }
    };

    fetchAdminState();
    const interval = setInterval(fetchAdminState, 1000);
    return () => clearInterval(interval);
  }, [authToken]);

  const createGame = useCallback(async () => {
    const response = await fetch("/api/admin/game/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return response.json();
  }, [authToken]);

  const startGame = useCallback(async () => {
    const response = await fetch("/api/admin/game/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return response.json();
  }, [authToken]);

  const nextQuestion = useCallback(async () => {
    const response = await fetch("/api/admin/game/next", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return response.json();
  }, [authToken]);

  const endGame = useCallback(async () => {
    const response = await fetch("/api/admin/game/end", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return response.json();
  }, [authToken]);

  const kickPlayer = useCallback(async (playerToken) => {
    const response = await fetch("/api/admin/game/kick", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}` 
      },
      body: JSON.stringify({ playerToken }),
    });
    return response.json();
  }, [authToken]);

  return {
    game: gameState,
    players,
    createGame,
    startGame,
    nextQuestion,
    endGame,
    kickPlayer,
  };
}