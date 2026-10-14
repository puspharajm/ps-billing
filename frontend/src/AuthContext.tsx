import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { API_URL } from './api';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  license_number?: string | null;
  licensee_company_name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (username: string, password: string, panelId?: number) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [isLoading, setIsLoading] = useState(true);

  // Authenticated fetch helper — automatically adds Bearer token
  // If a 401 is returned, clears the session so the user is sent to login
  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const currentToken = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }
    const response = await fetch(url, { ...options, headers });
    // Auto-logout on expired/invalid session (but not on login attempt itself)
    if (response.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
    }
    return response;
  }, [setToken, setUser]);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const savedToken = localStorage.getItem('auth_token');
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${savedToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setToken(savedToken);
        } else {
          // Token expired or invalid
          localStorage.removeItem('auth_token');
          setToken(null);
          setUser(null);
        }
      } catch {
        // Backend unavailable, clear session
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const login = async (username: string, password: string, panelId?: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...(panelId ? { panel_id: panelId } : {}) }),
      });

      if (!res.ok) {
        const errData = await res.json();
        return { success: false, error: errData.error || 'Login failed' };
      }

      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: 'Cannot connect to server' };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const isSuperAdmin = user?.role === 'admin' && user.username.toLowerCase() === 'puspharaj.m2003@gmail.com';

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!user,
      isAdmin: isSuperAdmin,
      isLoading,
      login,
      logout,
      authFetch,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
