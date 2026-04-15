"use client";

import { createContext, useContext, useState, useEffect } from "react";

const ConvexContext = createContext(null);

export function ConvexProvider({ children }) {
  // In production, this would be provided by Convex
  // For now, we use REST API with polling
  const convex = {
    query: async () => {},
    mutate: async () => {},
  };
  
  return (
    <ConvexContext.Provider value={convex}>
      {children}
    </ConvexContext.Provider>
  );
}

export function useConvex() {
  return useContext(ConvexContext);
}