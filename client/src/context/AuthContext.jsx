import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { authApi } from "../api.js";

const STORAGE_KEY = "ehr_auth";

const AuthContext = createContext(null);

const readStorage = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { token: "", user: null };
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      token: parsed.token || "",
      user: parsed.user || null
    };
  } catch {
    return { token: "", user: null };
  }
};

const writeStorage = (token, user) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
};

const clearStorage = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState(() => readStorage());

  const setSession = useCallback((token, user) => {
    writeStorage(token, user);
    setState({ token, user });
  }, []);

  const clearSession = useCallback(() => {
    clearStorage();
    setState({ token: "", user: null });
  }, []);

  const login = useCallback(
    async (credentials) => {
      const response = await authApi.login(credentials);
      setSession(response.token, response.user);
      return response.user;
    },
    [setSession]
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const refreshProfile = useCallback(async () => {
    if (!state.token) {
      return null;
    }

    const response = await authApi.me(state.token);
    setSession(state.token, response.user);
    return response.user;
  }, [setSession, state.token]);

  const value = useMemo(
    () => ({
      token: state.token,
      user: state.user,
      isAuthenticated: Boolean(state.token && state.user),
      login,
      logout,
      refreshProfile
    }),
    [state, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
