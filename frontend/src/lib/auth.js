import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from './api';

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('mo_token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setVendor(data);
    } catch (e) {
      localStorage.removeItem('mo_token');
      setVendor(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('mo_token', data.token);
    setVendor(data.vendor);
    return data.vendor;
  };

  const signup = async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    localStorage.setItem('mo_token', data.token);
    setVendor(data.vendor);
    return data.vendor;
  };

  const logout = () => {
    localStorage.removeItem('mo_token');
    setVendor(null);
  };

  const upgrade = async () => {
    const { data } = await api.post('/auth/me/upgrade');
    setVendor(data);
  };
  const downgrade = async () => {
    const { data } = await api.post('/auth/me/downgrade');
    setVendor(data);
  };

  return (
    <AuthCtx.Provider value={{ vendor, loading, login, signup, logout, refresh, upgrade, downgrade, setVendor }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);
