/**
 * AuthContext - VERSION CORRIGÉE
 * Suppression de `credentials: 'include'` (JWT dans header, pas cookie)
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Role } from '../roles';

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  full_name: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isRespStock: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updateUser: User) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  const getApiBaseUrl = (): string => {
    if (process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL;
    }
    
    if (process.env.NODE_ENV === 'development') {
      const { hostname } = window.location;
      return hostname === 'localhost' || hostname === '127.0.0.1'
        ? 'http://localhost:5880/api'
        : `http://${hostname}:5880/api`;
    }
    
    return '/api';
  };

  const API_BASE_URL = getApiBaseUrl();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    try {
      console.log('[AUTH] Tentative de connexion pour:', username);
      console.log('[AUTH] URL API complète:', `${API_BASE_URL}/auth/login`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // ⚠️ PAS de credentials: 'include' ici — on utilise un JWT dans le header
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[AUTH] Statut de la réponse:', response.status);

      const data = await response.json();
      console.log('[AUTH] Réponse du serveur:', data);

      if (!response.ok) {
        console.error('[AUTH] Erreur de connexion:', data);
        let errorMessage = 'Échec de la connexion';
        if (data.error) errorMessage = data.error;
        throw new Error(errorMessage);
      }

      if (!data.token || !data.user) {
        console.error('[AUTH] Réponse invalide - token ou user manquant');
        throw new Error('Réponse serveur invalide');
      }
      
      console.log('[AUTH] Connexion réussie pour:', data.user.username);
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setUser(data.user);
      
    } catch (error) {
      console.error('[AUTH] Erreur complète:', error);
      
      if (error instanceof TypeError) {
        if (error.message.includes('Failed to fetch')) {
          throw new Error(`Impossible de se connecter au serveur à l'adresse: ${API_BASE_URL}. Vérifiez:\n1. Que le backend est démarré sur le serveur\n2. Que le port 5880 est accessible\n3. Les extensions navigateur (AdBlock)\n4. La connexion réseau`);
        }
        if (error.message.includes('blocked')) {
          throw new Error('Requête bloquée par le navigateur. Désactivez AdBlock ou utilisez le mode navigation privée.');
        }
      }
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Timeout de connexion - Le serveur met trop de temps à répondre');
      }
      
      throw error;
    }
  };

  const logout = () => {
    console.log('[AUTH] Déconnexion');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isRespStock: user?.role === 'RespStock',
    login,
    logout,
    updateUser,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;