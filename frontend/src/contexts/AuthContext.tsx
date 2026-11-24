import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { Role } from '../roles';

// Ré-export pour compatibilité (les composants qui importent User depuis AuthContext)
export type { User };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isRespStock: boolean;
  isRespChantier: boolean;
  isMagasinier: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updateUser: User) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

interface AuthProviderProps { children: ReactNode; }

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const getApiBaseUrl = (): string => {
    if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
    const { hostname } = window.location;
    return `http://${hostname}:5880/api`;
  };

  const API_BASE_URL = getApiBaseUrl();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch (error) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Échec de la connexion');
      if (!data.token || !data.user) throw new Error('Réponse serveur invalide');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user as User);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error(`Impossible de contacter le serveur à l'adresse ${API_BASE_URL}. Vérifiez que le backend est lancé sur le port 5880.`);
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Timeout de connexion.');
      }
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isRespStock: user?.role === 'RespStock',
        isRespChantier: user?.role === 'RespChantier',
        isMagasinier: user?.role === 'magasinier',
        login,
        logout,
        updateUser,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;