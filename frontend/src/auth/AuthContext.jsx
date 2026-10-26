import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

// Holds the logged-in user for the whole app.
// user: undefined = still asking the server, null = logged out, object = logged in
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  // On page load, ask the server who we are (the cookie may still be valid)
  useEffect(() => {
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    setUser(data.user);
  }, []);

  const register = useCallback(async (username, password) => {
    const data = await api('/auth/register', { method: 'POST', body: { username, password } });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      // even if the request fails, the app shouldn't stay "logged in"
      setUser(null);
    }
  }, []);

  // The session ended somewhere else (logout in another tab, expired token):
  // the server already knows, so only the app's state needs to change.
  const sessionEnded = useCallback(() => setUser(null), []);

  const value = useMemo(
    () => ({
      user, login, register, logout, sessionEnded,
    }),
    [user, login, register, logout, sessionEnded],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
