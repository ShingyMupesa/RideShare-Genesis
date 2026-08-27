import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../services/api.js';
import { disconnectSocket } from '../services/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await api.me();
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const { token, user: loggedInUser } = await api.login({ email, password });
    setToken(token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: newUser } = await api.register(payload);
    setToken(token);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, updateUser }),
    [user, loading, login, register, logout, refresh, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
