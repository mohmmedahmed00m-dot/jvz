import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, setAccessToken, setOnAuthFailure, ApiError } from './api';

interface AuthState {
  isAuthenticated: boolean;
  licenseStatus: string; // active | none | revoked | refunded
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  activateLicense: (key: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthed] = useState(false);
  const [licenseStatus, setLicense] = useState<string>('none');
  const [loading, setLoading] = useState(true);

  const handleFailure = useCallback(() => {
    setAuthed(false);
    setAccessToken(null);
    setLicense('none');
  }, []);

  useEffect(() => {
    setOnAuthFailure(handleFailure);
    // Attempt silent refresh on load (Section 6.4: restore session via refresh cookie).
    (async () => {
      try {
        const { access_token } = await api.refresh();
        setAccessToken(access_token);
        setAuthed(true);
        // Probe license status via a protected call.
        try {
          await api.listCampaigns({ page: 1, limit: 1 });
          setLicense('active');
        } catch (e) {
          if (e instanceof ApiError && e.status === 403) setLicense('none');
          else setLicense('active');
        }
      } catch {
        setAuthed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [handleFailure]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    setAccessToken(r.access_token);
    setAuthed(true);
    setLicense(r.license_status);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const r = await api.register(email, password);
    setAccessToken(r.access_token);
    setAuthed(true);
    setLicense('none');
  }, []);

  const activateLicense = useCallback(async (key: string) => {
    const r = await api.activateLicense(key);
    setLicense(r.status);
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setAccessToken(null);
    setAuthed(false);
    setLicense('none');
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, licenseStatus, loading, login, register, activateLicense, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
