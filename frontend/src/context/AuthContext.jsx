import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearTokens, getTokens, onAuthChange, setTokens } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(Boolean(getTokens()));

  const refreshIdentity = useCallback(async () => {
    if (!getTokens()?.accessToken) {
      setUser(null);
      setPermissions([]);
      setLoading(false);
      return null;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data?.user || null);
      setPermissions(data?.permissions || []);
      return data?.user || null;
    } catch {
      clearTokens();
      setUser(null);
      setPermissions([]);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshIdentity();
    return onAuthChange(() => {
      if (!getTokens()) {
        setUser(null);
        setPermissions([]);
        setLoading(false);
      }
    });
  }, [refreshIdentity]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password }, { auth: false });
    setTokens(data.tokens);
    setUser(data.user);
    setLoading(false);
    await refreshIdentity();
    return data.user;
  }, [refreshIdentity]);

  const register = useCallback(async (role, input) => {
    const path = role === 'owner' ? '/auth/register/owner' : '/auth/register/customer';
    const { data } = await api.post(path, input, { auth: false });
    setTokens(data.tokens);
    setUser(data.user);
    setLoading(false);
    await refreshIdentity();
    return data.user;
  }, [refreshIdentity]);

  const logout = useCallback(async () => {
    try {
      if (getTokens()) await api.post('/auth/logout');
    } catch {
      // Local logout still succeeds if the session is already invalid.
    }
    clearTokens();
    setUser(null);
    setPermissions([]);
  }, []);

  const value = useMemo(() => ({
    user,
    permissions,
    loading,
    isAuthenticated: Boolean(user),
    roles: user?.roles || (user?.role ? [user.role] : []),
    hasRole: (role) => Boolean(user?.roles?.includes(role) || user?.role === role),
    hasPermission: (permission) => permissions.includes(permission),
    login,
    register,
    logout,
    refreshIdentity
  }), [user, permissions, loading, login, register, logout, refreshIdentity]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
