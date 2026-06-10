import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api/client.js";

const ThemeContext = createContext(null);

const STORAGE_KEY = "sv_theme";

function applyClass(theme) {
  const html = document.documentElement;
  if (theme === "light") {
    html.classList.add("light");
    html.classList.remove("dark");
  } else {
    html.classList.add("dark");
    html.classList.remove("light");
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem(STORAGE_KEY) || "dark"; // dark by default
  });

  useEffect(() => {
    applyClass(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyClass(next);
    // Best-effort write-through to the server for cross-device persistence.
    if (localStorage.getItem("sv_token")) {
      api.put("/settings", { preferences: { theme: next } }).catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // If the server reports a different stored preference (e.g. set on another
  // device), honor it once on mount when logged in.
  const syncFromServer = useCallback((serverTheme) => {
    if (serverTheme && (serverTheme === "dark" || serverTheme === "light")) {
      const local = localStorage.getItem(STORAGE_KEY);
      if (!local) {
        setThemeState(serverTheme);
        localStorage.setItem(STORAGE_KEY, serverTheme);
        applyClass(serverTheme);
      }
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, syncFromServer }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
